const assert = require('node:assert/strict'), fs = require('node:fs');
const { rankingContext, contextRank } = require('./request-ranking-context');
const { projectRequestContext } = require('./request-context-roles');
const { prepareQueryContract, applyQueryContract } = require('./query-condition-contract');
const { packetFor } = require('./condition-source-packets');
const { prepareConditionReview, applyConditionReview } = require('./condition-source-review');
const response = value => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const cases = [], check = (name, run) => { run(); cases.push(name); };
const prepared = prepareQueryContract('초등학생 자본주의 교육용 자료');
const projected = prepared.query;
const at = projected.indexOf('자본주의');
const value = { segments: [{ text: projected.slice(0, at), role: 'syntax' }, { text: '자본주의', role: 'content' }, { text: projected.slice(at + 4), role: 'syntax' }], requirements: [{ anchors: [1], meaning: '자본주의를 설명한다', kind: 'content' }], searchQuery: '자본주의', unresolved: false };
const contract = applyQueryContract(prepared, response(value));
check('학년·학교급·활용 표현은 호스트에서 내용 투영 제외', () => { assert(!prepared.query.includes('초등학생')); assert(!prepared.query.includes('교육용')); assert.equal(prepared.query.length, prepared.context.originalQuery.length); });
check('질문 전체 분할·조건 원문 연결', () => assert.equal(contract.accepted, true));
check('모델이 원문 질문 글자를 바꾸면 거절', () => assert.equal(applyQueryContract(prepared, response({ ...value, segments: [{ text: '다른 질문', role: 'content' }] })).accepted, false));
check('문맥 조각을 필수 조건으로 승격하면 거절', () => assert.equal(applyQueryContract(prepared, response({ ...value, requirements: [{ ...value.requirements[0], anchors: [0] }] })).accepted, false));
check('내용 조각을 조건에서 빼면 거절', () => assert.equal(applyQueryContract(prepared, response({ ...value, requirements: [] })).accepted, false));
check('초등학교·숫자 학년·짧은 학년 표기 공통 처리', () => { for (const q of ['초등학교 자본주의', '3학년 자본주의', '초3 자본주의']) assert.equal(rankingContext(q).contentQuery.trim(), '자본주의'); });
check('교육용 로봇·어린이 인권·실제 비교·실험은 내용 보존', () => { for (const q of ['교육용 로봇', '어린이 인권', '두 자석의 극 비교 실험', '얼음이 쉽게 녹는 이유']) assert.equal(rankingContext(q).contentQuery, q); });
check('선호 처리와 공통 로컬 투영 일치', () => assert(!projectRequestContext('초등학교 자본주의').contentQuery.includes('초등학교')));
const item = { id: 'source', title: '자본주의', summary: '생산 수단의 사유와 시장 경쟁을 통해 자본주의를 설명합니다.', program: '설명', sourceSupplements: [] };
const candidate = packetFor(item, contract);
const fact = candidate.facts.find(f => f.field === 'summary').id;
const matrix = { assessments: [{ i: 0, state: ['yes'], evidence: [[fact]], presentation: 'introductory' }], order: [0] };
check('서버가 부여한 원문 번호로 직접 근거 연결', () => { const r = applyConditionReview(contract, [candidate], response(matrix)); assert.equal(r.results.length, 1); assert.equal(r.results[0].semanticConditionReview.conditions[0].evidence[0].quote, item.summary); });
check('부분 일치는 결과에서 제외', () => assert.equal(applyConditionReview(contract, [candidate], response({ ...matrix, assessments: [{ ...matrix.assessments[0], state: ['partial'] }] })).results.length, 0));
check('미확인·명시 불일치도 제외', () => { for (const state of ['unknown', 'contradicted']) assert.equal(applyConditionReview(contract, [candidate], response({ ...matrix, assessments: [{ ...matrix.assessments[0], state: [state] }] })).results.length, 0); });
check('없는 원문 번호·빈 yes 근거 차단', () => { assert.equal(applyConditionReview(contract, [candidate], response({ ...matrix, assessments: [{ ...matrix.assessments[0], evidence: [[999]] }] })).accepted, false); assert.equal(applyConditionReview(contract, [candidate], response({ ...matrix, assessments: [{ ...matrix.assessments[0], evidence: [[]] }] })).results.length, 0); });
check('기존 원문 변경 차단', () => { candidate.item.summary += '!'; assert.equal(applyConditionReview(contract, [candidate], response(matrix)).reason, 'SOURCE_CHANGED'); candidate.item.summary = item.summary.slice(0, -1); });
check('학년 선호가 내용 통과 집합을 바꾸지 않음', () => { const a = packetFor({ ...item, id: 'a' }, contract), b = packetFor({ ...item, id: 'b' }, contract); const v = { assessments: [{ i: 0, state: ['yes'], evidence: [[fact]], presentation: 'specialist' }, { i: 1, state: ['yes'], evidence: [[fact]], presentation: 'introductory' }], order: [0, 1] }; const plain = applyConditionReview({ ...contract, context: rankingContext('자본주의') }, [a, b], response(v)); const grade = applyConditionReview(contract, [a, b], response(v)); assert.deepEqual(new Set(plain.results.map(r => r.id)), new Set(grade.results.map(r => r.id))); assert.equal(grade.results[0].id, 'b'); assert.equal(contextRank(grade.results[0], contract.context), 2); });
check('원문 전달에는 판단 라벨·정답·키가 없음', () => { const s = JSON.stringify(prepareConditionReview(contract, [candidate])); assert(!s.includes('OPENAI_API_KEY')); assert(!s.includes('score')); });
check('활용·과목 수업·학기·난이도는 필수 단어에서 제외', () => {
  for (const q of ['초등학교 3학년 2학기 사회 수업 도입용 자본주의', '교사용 자본주의 교육용 자료', '자본주의 쉽게 설명']) {
    const c = rankingContext(q); assert(c.contentQuery.includes('자본주의')); assert(c.spans.length > 0);
    assert(!/초등|학년|학기|사회 수업|교사용|교육용|도입용|쉽게/u.test(c.contentQuery));
  }
});
check('필수 시간·지역·제외·활동 내용은 보존', () => {
  for (const q of ['5분 이내 서울의 과거와 현재 비교', '자막 있는 갯벌 영상', '애니메이션 제외', '실험으로 보여주는 증발', '교육용 자료의 문제점']) assert.equal(rankingContext(q).contentQuery, q);
});
check('지시 대상 없는 질문·빈 내용 질의는 후보로 채우지 않음', () => {
  assert.equal(applyConditionReview({ ...contract, query: '저런 힘은 왜 생길까' }, [candidate], response(matrix)).reason, 'MISSING_REFERENCE_CONTEXT');
  assert.equal(applyConditionReview({ ...contract, searchQuery: '' }, [candidate], response(matrix)).reason, 'NO_CONTENT_QUERY');
});
check('한 후보의 잘못된 근거가 다른 정상 후보를 없애지 않음', () => {
  const a = packetFor({ ...item, id: 'valid' }, contract), b = packetFor({ ...item, id: 'invalid' }, contract);
  const r = applyConditionReview(contract, [a, b], response({ assessments: [{ ...matrix.assessments[0] }, { ...matrix.assessments[0], i: 1, evidence: [[999]] }], order: [1, 0] }));
  assert.deepEqual(r.results.map(i => i.id), ['valid']);
});
check('프로그램 메타데이터만으로 내용·장면을 증명하지 못함', () => {
  const programFact = candidate.facts.find(f => f.field === 'catalogProgram').id;
  const r = applyConditionReview(contract, [candidate], response({ ...matrix, assessments: [{ ...matrix.assessments[0], evidence: [[programFact]] }] }));
  assert.equal(r.results.length, 0);
});
fs.writeFileSync('docs/r12-40-anchored-checks.json', JSON.stringify({ passed: cases.length, failed: 0, cases, paidCalls: 0 }, null, 2) + '\n');
console.log(JSON.stringify({ passed: cases.length, failed: 0, paidCalls: 0 }));
