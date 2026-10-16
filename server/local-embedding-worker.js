const path = require("node:path");
const fs = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const { Readable } = require("node:stream");
const { pipeline: copyStream } = require("node:stream/promises");
const { parentPort } = require("node:worker_threads");
const { embeddingSpec } = require("./search-index-contract");
let extractor;

async function prepareModelFiles() {
  const directory = path.resolve("server/data/.model-cache", embeddingSpec.model, embeddingSpec.revision);
  for (const file of ["config.json", "tokenizer_config.json", "tokenizer.json", "onnx/model_quantized.onnx"]) {
    const target = path.join(directory, file);
    try { if ((await fs.stat(target)).size > 0) continue; } catch (error) { if (error.code !== "ENOENT") throw error; }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const response = await fetch(`https://huggingface.co/${embeddingSpec.model}/resolve/${embeddingSpec.revision}/${file}`);
    if (!response.ok || !response.body) throw new Error("모델 다운로드 실패");
    const temporary = `${target}.download`;
    try {
      await copyStream(Readable.fromWeb(response.body), createWriteStream(temporary));
      await fs.rename(temporary, target);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  return directory;
}

parentPort.on("message", async ({ text }) => {
  try {
    if (!extractor) {
      const { AutoTokenizer, AutoModel, FeatureExtractionPipeline, env } = await import("@huggingface/transformers");
      const modelDirectory = await prepareModelFiles();
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      const options = {
        local_files_only: true, dtype: embeddingSpec.dtype, device: "cpu"
      };
      // pipeline()의 사전 파일 조회 대신 고정 revision으로 구성요소를 직접 로드한다.
      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(modelDirectory, options),
        AutoModel.from_pretrained(modelDirectory, options)
      ]);
      extractor = new FeatureExtractionPipeline({ task: "feature-extraction", tokenizer, model });
    }
    const tokens = await extractor.tokenizer(text, { truncation: false, padding: false });
    const tokenCount = tokens.input_ids.size;
    const output = await extractor(text, { pooling: embeddingSpec.pooling, normalize: true,
      truncation: true, max_length: embeddingSpec.maxTokens });
    parentPort.postMessage({ vector: Array.from(output.data),
      inputTokens: Math.min(tokenCount, embeddingSpec.maxTokens), truncated: tokenCount > embeddingSpec.maxTokens });
  } catch {
    parentPort.postMessage({ error: "로컬 모델 준비에 실패했습니다. 패키지 설치와 최초 모델 다운로드를 위한 인터넷 연결을 확인하고 재시도하세요." });
  }
});
