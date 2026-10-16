const { automaticAssets } = require("./automatic-assets");

async function sendAutomaticAssetResponse(request, response, readJsonBody) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  try {
    const url = new URL(request.url, "http://localhost"), retry = url.pathname.endsWith("/search");
    let payload;
    if (!retry && ["GET", "HEAD"].includes(request.method)) {
      const runId = url.searchParams.get("runId");
      if ([...url.searchParams.keys()].some((key) => key !== "runId") || (runId !== null && !/^AUTO-RUN-[a-f0-9-]{36}$/.test(runId))) {
        const error = new Error("조회 실행 ID가 올바르지 않습니다."); error.statusCode = 400; throw error;
      }
      await automaticAssets.readLinks();
      payload = automaticAssets.history(runId);
    } else if (request.method === "POST") {
      const input = await readJsonBody(request);
      if (!retry && input?.standardId) await require("./automatic-evidence-service").loadEvidenceContext(input);
      if (retry && (!input || Object.keys(input).length !== 1 || !/^AUTO-RUN-[a-f0-9-]{36}$/.test(input.runId))) {
        const error = new Error("검색 준비를 재시도할 runId 하나를 지정하세요."); error.statusCode = 400; throw error;
      }
      payload = retry ? { runId: input.runId, searchPreparation: await automaticAssets.prepare(input.runId) } : await automaticAssets.process(input);
    } else {
      response.writeHead(405, { ...headers, Allow: retry ? "POST" : "GET, HEAD, POST" });
      response.end(JSON.stringify({ error: "지원하지 않는 요청입니다." })); return;
    }
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : JSON.stringify(payload));
  } catch (error) {
    const status = [400, 404, 409, 413].includes(error.statusCode) ? error.statusCode :
      error.code === "PAYLOAD_TOO_LARGE" ? 413 : error.code === "INVALID_JSON_BODY" || error instanceof SyntaxError ? 400 : 500;
    response.writeHead(status, headers);
    response.end(request.method === "HEAD" ? undefined : JSON.stringify({ error: status === 500 ? "자동 자산 저장소를 읽거나 처리하지 못했습니다." : error.message }));
  }
}
module.exports = { sendAutomaticAssetResponse };
