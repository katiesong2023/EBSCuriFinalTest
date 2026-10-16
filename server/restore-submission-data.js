"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { createGunzip } = require("node:zlib");

const databaseNames = new Set([
  "automatic-assets.sqlite", "broadcast-catalog.sqlite",
  "broadcast-semantic-search.sqlite", "semantic-layer.sqlite"
]);

async function fingerprint(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function restoreSubmissionData(dataDirectory = path.join(__dirname, "data")) {
  const seedDirectory = path.join(dataDirectory, "submission-seed");
  const manifest = JSON.parse(fs.readFileSync(path.join(seedDirectory, "manifest.json"), "utf8"));
  if (!Array.isArray(manifest.databases) || manifest.databases.length !== databaseNames.size ||
      new Set(manifest.databases.map(entry => entry.file)).size !== databaseNames.size) {
    throw new Error("제출용 데이터 목록이 올바르지 않습니다. ZIP을 다시 내려받아 주세요.");
  }
  const restored = [], preserved = [];
  for (const entry of manifest.databases) {
    if (!databaseNames.has(entry.file) || entry.compressedFile !== entry.file + ".gz" ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > 512 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) || !/^[a-f0-9]{64}$/.test(entry.compressedSha256)) {
      throw new Error("제출용 데이터 정보가 올바르지 않습니다.");
    }
    const destination = path.join(dataDirectory, entry.file);
    // 이미 사용하는 DB는 초기 데이터로 덮어쓰지 않는다.
    if (fs.existsSync(destination)) { preserved.push(entry.file); continue; }
    const compressed = path.join(seedDirectory, entry.compressedFile);
    if (fs.statSync(compressed).size !== entry.compressedBytes ||
        await fingerprint(compressed) !== entry.compressedSha256) {
      throw new Error(`${entry.compressedFile} 파일이 손상되었습니다. ZIP을 다시 내려받아 주세요.`);
    }
    const temporary = path.join(dataDirectory, `.${entry.file}.${crypto.randomUUID()}.tmp`);
    let bytes = 0;
    const hash = crypto.createHash("sha256");
    const verify = new Transform({ transform(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > entry.bytes) return done(new Error("데이터 크기가 목록과 다릅니다."));
      hash.update(chunk); done(null, chunk);
    } });
    try {
      await pipeline(fs.createReadStream(compressed), createGunzip(), verify,
        fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      if (bytes !== entry.bytes || hash.digest("hex") !== entry.sha256) {
        throw new Error(`${entry.file} 데이터 검증에 실패했습니다.`);
      }
      // 완성된 사본만 공개하며, 동시에 생긴 기존 파일도 덮어쓰지 않는다.
      try { fs.linkSync(temporary, destination); restored.push(entry.file); }
      catch (error) { if (error.code !== "EEXIST") throw error; preserved.push(entry.file); }
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  return { restored, preserved };
}

if (require.main === module) {
  restoreSubmissionData().then(({ restored }) => {
    console.log(restored.length ? `제출용 데이터 ${restored.length}개 복원 완료` : "기존 데이터로 시작합니다.");
  }).catch(error => {
    console.error(`데이터 준비 실패: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { restoreSubmissionData };
