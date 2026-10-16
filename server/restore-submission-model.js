"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { createGunzip } = require("node:zlib");
const { embeddingSpec } = require("./search-index-contract");
const modelFiles = ["config.json", "tokenizer_config.json", "tokenizer.json", "onnx/model_quantized.onnx"];

async function fingerprint(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function restoreSubmissionModel(dataDirectory = path.join(__dirname, "data")) {
  const seed = path.join(dataDirectory, "submission-model");
  const manifest = JSON.parse(fs.readFileSync(path.join(seed, "manifest.json"), "utf8"));
  if (manifest.model !== embeddingSpec.model || manifest.revision !== embeddingSpec.revision ||
      !Array.isArray(manifest.files) || manifest.files.length !== modelFiles.length ||
      new Set(manifest.files.map(item => item.file)).size !== modelFiles.length) {
    throw new Error("검색 모델 목록이 올바르지 않습니다. ZIP을 다시 내려받으세요.");
  }
  const destination = path.join(dataDirectory, ".model-cache", embeddingSpec.model, embeddingSpec.revision);
  const restored = [], preserved = [];
  for (const item of manifest.files) {
    if (!modelFiles.includes(item.file) || !Number.isSafeInteger(item.bytes) || item.bytes < 1 ||
        item.bytes > 256 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(item.sha256) ||
        !Array.isArray(item.parts) || item.parts.length < 1 || item.parts.length > 8) {
      throw new Error("검색 모델 정보가 올바르지 않습니다.");
    }
    for (const part of item.parts) {
      if (!/^[a-z0-9_-]+\.gz\.part[0-9]{3}$/.test(part.file) ||
          !Number.isSafeInteger(part.bytes) || part.bytes < 1 || part.bytes > 70 * 1024 * 1024 ||
          !/^[a-f0-9]{64}$/.test(part.sha256)) throw new Error("모델 조각 정보가 올바르지 않습니다.");
      const source = path.join(seed, part.file);
      if (fs.statSync(source).size !== part.bytes || await fingerprint(source) !== part.sha256) {
        throw new Error(`모델 파일 손상: ${part.file}. ZIP을 다시 내려받으세요.`);
      }
    }
    const target = path.join(destination, item.file);
    if (fs.existsSync(target) && fs.statSync(target).size === item.bytes &&
        await fingerprint(target) === item.sha256) { preserved.push(item.file); continue; }
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = target + "." + crypto.randomUUID() + ".tmp";
    const hash = crypto.createHash("sha256");
    let bytes = 0;
    // 분할 압축을 순서대로 읽어 메모리 전체 적재 없이 복원한다.
    async function* chunks() {
      for (const part of item.parts) {
        for await (const chunk of fs.createReadStream(path.join(seed, part.file))) yield chunk;
      }
    }
    const verify = new Transform({ transform(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > item.bytes) return done(new Error("모델 크기가 목록과 다릅니다."));
      hash.update(chunk); done(null, chunk);
    } });
    try {
      await pipeline(Readable.from(chunks()), createGunzip(), verify,
        fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      if (bytes !== item.bytes || hash.digest("hex") !== item.sha256) throw new Error("복원한 모델 검증 실패");
      await fs.promises.rename(temporary, target);
      restored.push(item.file);
    } finally { await fs.promises.rm(temporary, { force: true }); }
  }
  return { restored, preserved };
}

if (require.main === module) restoreSubmissionModel().then(result => {
  console.log(`검색 모델 준비 완료 (복원 ${result.restored.length}개, 확인 ${result.preserved.length}개)`);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { restoreSubmissionModel };
