const { loadEvidenceContext } = require("./automatic-evidence-service");
const { sourceSnapshot, checkRelation } = require("./automatic-evidence");

async function checkStoredSource(input) {
  const context = await loadEvidenceContext(input);
  const source = sourceSnapshot(context.resource);
  const result = checkRelation({ source }, { resource: context.resource, standards: context.standards, ...context.options });
  const checks = result.checks.filter((check) => ["SOURCE_IDENTITY_MATCH", "SOURCE_VERSION_MATCH", "SOURCE_LOCATION_AVAILABLE", "SOURCE_ACTIVE"].includes(check.code));
  return { source, checkedAt: result.checkedAt, checks, status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
    note: "저장된 원본 ID·판본·공식 URL·알려진 불일치·활성 상태 점검입니다. 외부 도착 페이지를 새로 대조하거나 사람 검토 기록을 만들지 않습니다." };
}
async function sendSourceCheck(request, response, readJsonBody) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (request.method !== "POST") { response.writeHead(405, { ...headers, Allow: "POST" }); response.end(); return; }
  try { const result = await checkStoredSource(await readJsonBody(request)); response.writeHead(200, headers); response.end(JSON.stringify(result)); }
  catch (error) {
    const status = error.statusCode || (error.code === "INVALID_JSON_BODY" ? 400 : error.code === "PAYLOAD_TOO_LARGE" ? 413 : 500);
    response.writeHead(status, headers); response.end(JSON.stringify({ error: status === 500 ? "저장 출처를 점검하지 못했습니다." : error.message }));
  }
}
module.exports = { checkStoredSource, sendSourceCheck };
