const { humanReview } = require("./human-review");
async function sendHumanReview(request, response, readJsonBody) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  try {
    const url = new URL(request.url, "http://localhost"), retry = url.pathname.endsWith("/search");
    let result;
    if (!retry && ["GET", "HEAD"].includes(request.method)) {
      const input = Object.fromEntries(url.searchParams);
      if (Object.keys(input).some((key) => !["resourceId", "contentCuriId", "subject", "gradeBand", "standardId"].includes(key))) { const error = new Error("조회 조건을 확인하세요."); error.statusCode = 400; throw error; }
      result = await humanReview.workspace(input);
    } else if (request.method === "POST") result = await humanReview[retry ? "retry" : "save"](await readJsonBody(request));
    else { response.writeHead(405, { ...headers, Allow: retry ? "POST" : "GET, HEAD, POST" }); response.end(); return; }
    response.writeHead(200, headers); response.end(request.method === "HEAD" ? undefined : JSON.stringify(result));
  } catch (error) {
    const status = [400, 404, 409, 413].includes(error.statusCode) ? error.statusCode : error.code === "INVALID_JSON_BODY" ? 400 : error.code === "PAYLOAD_TOO_LARGE" ? 413 : 500;
    response.writeHead(status, headers); response.end(request.method === "HEAD" ? undefined : JSON.stringify({ error: status === 500 ? "결정 저장 결과를 확인하지 못했습니다. 입력을 유지한 채 같은 요청으로 재시도하거나 현재 이력을 조회하세요." : error.message }));
  }
}
module.exports = { sendHumanReview };
