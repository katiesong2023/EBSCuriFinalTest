const assert = require('node:assert/strict');
const fs = require('node:fs');
const { bindRequestQuotes } = require('./request-quote-binding');
const { requestEnvelope } = require('./request-envelope');
function fixture(query) {
  return { version: 'curi-request-v1', originalQuery: query, status: 'READY', clauses: [
    { id: 'c1', kind: 'topic', mode: 'required', label: query, sourceSpans: [{ start: 0, end: 1, quote: query }] }
  ], expression: { op: 'ref', clauseId: 'c1' }, expansions: [], unresolved: [], grammarSpans: [] };
}
const cases = [];
const query = '갯벌', envelope = requestEnvelope({ q: query }, {}).envelope;
const result = bindRequestQuotes(fixture(query), envelope);
assert.equal(result.validation.accepted, true); assert.equal(result.changed, true);
assert.equal(result.interpretation.clauses[0].sourceSpans[0].end, 2); cases.push('유일한 정확 인용의 위치만 재계산');
assert.equal(bindRequestQuotes(result.interpretation, envelope).changed, false); cases.push('이미 유효한 해석 보존');
const absent = fixture(query); absent.clauses[0].sourceSpans[0].quote = '사막';
assert.equal(bindRequestQuotes(absent, envelope).validation.accepted, false); cases.push('원문에 없는 인용 거절');
const duplicate = fixture('갯벌 갯벌'); duplicate.clauses[0].sourceSpans[0].quote = '갯벌';
assert.equal(bindRequestQuotes(duplicate, requestEnvelope({ q: duplicate.originalQuery }, {}).envelope).validation.accepted, false); cases.push('반복 인용의 위치 추측 거절');
const changedTopic = fixture(query); changedTopic.clauses[0].label = '우주';
assert.equal(bindRequestQuotes(changedTopic, envelope).validation.accepted, false); cases.push('의미 바꾸기 거절');
const hidden = fixture('갯벌 현무암'); hidden.clauses[0].label = '갯벌'; hidden.clauses[0].sourceSpans = [{ start: 0, end: 2, quote: '갯벌' }];
assert.equal(bindRequestQuotes(hidden, requestEnvelope({ q: hidden.originalQuery }, {}).envelope).validation.accepted, false); cases.push('누락한 내용어를 문법으로 은폐하지 못함');
const logic = fixture(query); logic.expression = { op: 'ref', clauseId: 'c2' };
assert.equal(bindRequestQuotes(logic, envelope).validation.accepted, false); cases.push('논리 조건 오류 보정 금지');
assert.equal(bindRequestQuotes(null, envelope).validation.accepted, false); cases.push('해석 없는 응답 안전 거절');
const report = { passed: cases.length, failed: 0, cases, paidApiCalls: 0 };
fs.writeFileSync('docs/r12-40-llm-dollar-binding-checks.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
