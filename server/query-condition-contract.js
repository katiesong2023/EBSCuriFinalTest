const crypto = require('node:crypto');
const { decodeModelResponse } = require('./request-model-preparation');
const { rankingContext } = require('./request-ranking-context');
const instructions = `방송을 찾는 교사의 질문만 보고 검색의 필수 조건을 추출한다. 후보 자료는 제공하지 않는다.
segments는 query를 글자 하나도 바꾸지 않고 순서대로 나눈 연속 조각이며 모두 이어 붙이면 query와 정확히 같다. 각 조각의 role은 content(자료에 있어야 할 내용/실제 장면/형식/길이/제외), context(시청 대상·학교급·학년·교과 수업 단원명·교실 활동 목적), preference(가능하면/재미/난이도 선호), syntax(요청 문법)이다. 초등학생·초등학교·학년과 교육용·도입용·쉽게·눈높이는 반드시 context/preference이며 필수가 아니다. 어린이 인권·개구리 겨울잠처럼 실제 내용의 대상은 content이다.
requirements는 content 조각 번호를 anchor로 연결한 최소한의 필수 조건이다. 각 meaning은 해당 질문에 실제로 있는 요구만 뜻으로 풀어 쓴다. 질문에 없는 지역·시대·형식·수치·부가 원리·비교 대상·교훈을 절대로 추가하지 않는다. 내용은 나열되면 모두 필요하되 '또는/둘 중 하나/예를 들어' 대안은 OR 조건 하나로 묶는다. 비교·원인·변화·과정·동시 설명 등 요청 관계를 보존한다. 단원명이 수업 맥락일 뿐인 경우 실제 찾는 내용을 추가로 요구하지 않는다. 형식·실제 장면·시간·지역·제외가 명시적이면 별도 조건이다. 모순이나 문맥 없는 지시어/다의어로 의도를 정할 수 없으면 unresolved=true이며 임의 뜻을 고르지 않는다. searchQuery는 실제 내용만 담은 짧은 자연어 검색 표현이다. 오타는 명백할 때 의미를 복원하되 모호하면 unresolved다.`;
const schema = { type: 'object', additionalProperties: false, required: ['segments', 'requirements', 'searchQuery', 'unresolved'], properties: {
  segments: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'role'], properties: { text: { type: 'string' }, role: { type: 'string', enum: ['content', 'context', 'preference', 'syntax'] } } } },
  requirements: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['anchors', 'meaning', 'kind'], properties: { anchors: { type: 'array', items: { type: 'integer' } }, meaning: { type: 'string' }, kind: { type: 'string', enum: ['content', 'format', 'duration', 'scene', 'exclusion'] } } } },
  searchQuery: { type: 'string' }, unresolved: { type: 'boolean' }
} };
const profile = crypto.createHash('sha256').update(JSON.stringify([instructions, schema])).digest('hex');
const repairInstructions = instructions + '\n재검토: 앞선 해석은 원문 분할/역할 일관성 검사에서 실패했거나 미해결이었다. 후보 자료나 정답을 보지 않고 다시 읽는다. 지역을 특정하지 않은 요청은 일반 지역 사례의 범주로 해석하고 지명을 추측하거나 특정 지명 요구를 추가하지 않는다. 이전 화면·대화의 구체적인 대상이 필요한 지시어와 이를 구별한다. 요구로 연결한 조각은 content여야 하며, content로 남긴 조각은 반드시 요구에 연결한다. 공백을 제외한 모든 원문 글자를 빠뜨리지 않는다.';
const repairProfile = crypto.createHash('sha256').update(JSON.stringify([repairInstructions, schema])).digest('hex');
const strongInstructions = repairInstructions + '\n미해결은 질문 자체가 어떤 대상/뜻인지 알 수 없거나 필수 요구가 서로 모순일 때만 참이다. 자료의 존재·학년 적합성·보기 쉬움·학생 공감 여부를 아직 확인하지 못한 것은 질문의 미해결이 아니다. 질문이 완전하면 요구를 확정하고 unresolved=false로 둔다. 자료/영상이라는 일반 요청 문법만 별도 형식 필수로 만들지 않는다. 실제 내용을 수업 맥락으로 숨기지 않는다.';
const strongProfile = crypto.createHash('sha256').update(JSON.stringify([strongInstructions, schema])).digest('hex');
function prepareQueryContract(query, { repair = false, strong = false } = {}) {
  // 학년 표현은 호스트에서 순위 문맥으로 고정하고 필수 조건 생성에 전달하지 않는다.
  const context = rankingContext(query), projected = context.contentQuery;
  return { stage: 'BLIND_QUERY_CONTRACT', payload: { store: false, service_tier: 'default', reasoning: { effort: 'low' },
    input: [{ role: 'developer', content: strong ? strongInstructions : repair ? repairInstructions : instructions }, { role: 'user', content: JSON.stringify({ query: projected }) }],
    text: { format: { type: 'json_schema', name: 'curi_query_conditions', strict: true, schema } } }, context, query: projected, profile: strong ? strongProfile : repair ? repairProfile : profile };
}
function applyQueryContract(prepared, response) {
  let value; try { value = decodeModelResponse(response).value; } catch { return { accepted: false, reason: 'INVALID_QUERY_RESPONSE' }; }
  const compact = text => text.replace(/\s/gu, '');
  if (!Array.isArray(value?.segments) || value.segments.length > 80 || value.segments.some(s => typeof s.text !== 'string' || !s.text || !['content', 'context', 'preference', 'syntax'].includes(s.role)) || compact(value.segments.map(s => s.text).join('')) !== compact(prepared.query)) return { accepted: false, reason: 'QUERY_PARTITION_CHANGED' };
  if (!Array.isArray(value.requirements) || value.requirements.length > 16 || typeof value.searchQuery !== 'string' || value.searchQuery.length > 300 || typeof value.unresolved !== 'boolean') return { accepted: false, reason: 'INVALID_QUERY_CONTRACT' };
  const covered = new Set();
  for (const r of value.requirements) {
    if (!Array.isArray(r.anchors) || !r.anchors.length || !r.anchors.every(i => Number.isInteger(i) && value.segments[i]?.role === 'content') || typeof r.meaning !== 'string' || !r.meaning.trim() || r.meaning.length > 300) return { accepted: false, reason: 'UNANCHORED_REQUIREMENT' };
    for (const i of r.anchors) covered.add(i);
  }
  if (value.segments.some((s, i) => s.role === 'content' && !covered.has(i))) return { accepted: false, reason: 'CONTENT_OMITTED' };
  if (!value.unresolved && !value.requirements.length) return { accepted: false, reason: 'TOPIC_REQUIRED' };
  if (!value.unresolved && !value.searchQuery.trim()) return { accepted: false, reason: 'TOPIC_REQUIRED' };
  return { accepted: true, query: prepared.context.originalQuery, contentQuery: prepared.query, context: prepared.context,
    ...value, profile: prepared.profile || profile, normalization: value.segments.map(s => s.text).join('') === prepared.query ? 'EXACT' : 'WHITESPACE_ONLY', fingerprint: crypto.createHash('sha256').update(JSON.stringify([prepared.query, value])).digest('hex') };
}
module.exports = { prepareQueryContract, applyQueryContract, profile, repairProfile, strongProfile };
