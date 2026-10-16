const path = require("node:path");
const { Worker } = require("node:worker_threads");

// 모델 다운로드·추론을 별도 스레드에서 실행해 서버 조회를 막지 않는다.
function createLocalEmbedder({ timeoutMs = 180000 } = {}) {
  let worker;
  return {
    embed(text) {
      worker ??= new Worker(path.join(__dirname, "local-embedding-worker.js"));
      const current = worker;
      return new Promise((resolve, reject) => {
        const finish = (error, result) => {
          clearTimeout(timer);
          current.removeListener("message", onMessage);
          current.removeListener("error", onError);
          current.removeListener("exit", onExit);
          if (error) reject(error); else resolve(result);
        };
        const onMessage = (result) => finish(result.error ? new Error(result.error) : null, result);
        const onError = () => finish(new Error("로컬 임베딩 실행에 실패했습니다. 설치 상태를 확인하고 재시도하세요."));
        const onExit = () => finish(new Error("로컬 임베딩 실행이 중단되었습니다. 재시도하세요."));
        const timer = setTimeout(() => {
          finish(new Error("검색 준비 제한 시간(3분)을 초과했습니다. 연결 상태를 확인하고 재시도하세요."));
          current.terminate();
          worker = null;
        }, timeoutMs);
        current.once("message", onMessage);
        current.once("error", onError);
        current.once("exit", onExit);
        current.postMessage({ text });
      });
    },
    async close() { if (worker) await worker.terminate(); worker = null; }
  };
}

module.exports = { createLocalEmbedder };
