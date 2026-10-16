const { discoverTeacherContents } = require('./teacher-discovery');
const { DiscoveryInputError } = require('./discovery-search');
const { decodeModelResponse } = require('./request-model-preparation');

async function sendModelPreparation(request, response, readJsonBody) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (request.method !== 'POST') { response.writeHead(405, { ...headers, Allow: 'POST' }); response.end(); return; }
  try {
    const body = await readJsonBody(request);
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !['input', 'aResponse', 'bResponse'].includes(key)) || !body.input || Array.isArray(body.input) || typeof body.input !== 'object') throw new DiscoveryInputError('input와 선택적인 aResponse/bResponse로 요청하세요.');
    if (body.input.workspace && body.input.workspace !== 'teacher') throw new DiscoveryInputError('교사 자료 검색만 지원합니다.');
    const decode = value => { try { return decodeModelResponse(value).value; } catch { return {}; } };
    const result = await discoverTeacherContents({ ...body.input, workspace: 'teacher' }, undefined, undefined, {
      prepareModels: true,
      interpretation: Object.hasOwn(body, 'aResponse') ? decode(body.aResponse) : undefined,
      candidateReview: Object.hasOwn(body, 'bResponse') ? decode(body.bResponse) : undefined
    });
    response.writeHead(200, headers); response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(error instanceof DiscoveryInputError || ['INVALID_JSON_BODY', 'PAYLOAD_TOO_LARGE'].includes(error.code) ? (error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400) : 503, headers);
    response.end(JSON.stringify({ error: error instanceof DiscoveryInputError ? error.message : '비호출 모델 연결 준비를 실행하지 못했습니다.' }));
  }
}
module.exports = { sendModelPreparation };
