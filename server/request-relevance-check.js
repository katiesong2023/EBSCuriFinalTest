const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { requestRelevance } = require('./request-relevance');
const { sourceSentences, explainRequest } = require('./source-explanation');
const { discoverContents } = require('./discovery-search');
const { prepareReviewBatch, applyCandidateReview } = require('./candidate-review');
const { expressionState } = require('./request-search-plan');
const cases = [];
const check = async (name, run) => { await run(); cases.push(name); };
const evaluate = (item, request) => requestRelevance(item, request, sourceSentences(item.summary));
(async () => {
  const request = { positiveQuery: '공원', naturalLanguage: { original: '공원의 역할을 알려주세요' }, terms: ['공원'], concepts: [] };
  const direct = { id: 'direct', title: '공원의 역할', summary: '공원은 주민들이 쉬고 산책할 공간을 제공합니다.' };
  const incidental = { id: 'incidental', title: '어느 수학자의 삶', summary: '수학자는 공원에서 수학 문제를 떠올렸다. 그의 정리는 새로운 증명 방법을 제공합니다.' };
  await check('같은 주제 문장의 역할 단서가 별개 문장의 기능 표현보다 우선', () => {
    assert.ok(evaluate(direct, request).score > evaluate(incidental, request).score);
    assert.equal(evaluate(incidental, request).details[0].status, 'UNKNOWN');
    assert.equal(evaluate(incidental, request).score, 0);
    assert.equal(evaluate(direct, request).details[0].status, 'RELATION_WORDING_CUE');
  });
  await check('도입의 단순 언급보다 뒤의 변화 설명을 먼저 인용·원문 위치 보존', () => {
    const item = { title: '마을 이야기', summary: '마을에서 하루를 시작합니다. 사람들의 만남이 이어집니다. 마을은 예전의 골목이 사라지고 새 주택이 생겨 모습이 바뀌었습니다.' };
    const query = { positiveQuery: '마을', naturalLanguage: { original: '마을의 바뀐 모습을 보여주세요' }, terms: ['마을'] };
    const relevanceEvidence = evaluate(item, query);
    assert.ok(relevanceEvidence.topicEvidence[0].quote.includes('바뀌었습니다'));
    const explanation = explainRequest({ ...item, relevanceEvidence }, query);
    for (const quote of explanation.topicEvidence) assert.equal(item.summary.slice(quote.start, quote.end), quote.quote);
    assert.ok(explanation.unconfirmed.some(note => note.includes('관계·장면 충족은 미확인')));
  });
  await check('제목 반복을 내용 설명 근거로 가산하지 않음', () => {
    const result = evaluate({ title: '공원의 역할', summary: '공원의 역할' }, request);
    assert.equal(result.topicEvidence.length, 0);
    assert.equal(result.details[0].status, 'UNKNOWN');
  });
  await check('더빙·수어·자막 뒤 제목 반복은 내용 근거와 가점 없음', () => {
    for (const prefix of ['더빙', '수어', '자막']) {
      const result = evaluate({ title: '공원의 역할', summary: prefix + '공원의 역할' }, request);
      assert.equal(result.topicEvidence.length, 0);
      assert.equal(result.score, 0);
    }
  });
  await check('검색 없는 전체 목록의 관련도 가점 없음', () => assert.equal(evaluate(direct, {}).score, 0));
  await check('OR 두 분기의 자료 보존·역할 인용과 순위', async () => {
    const resources = [direct, incidental, { id: 'office', title: '우체국', summary: '우체국은 편지를 전달하는 서비스를 제공합니다.' }].map(item => ({ ...item, program: '검사', kind: 'episode', sourceUrl: 'https://www.ebs.co.kr/' + item.id }));
    const catalog = { version: 'relevance-check', resources, concepts: [], stats: {} };
    const result = await discoverContents({ q: '공원이나 우체국 중 한 곳의 역할을 소개하는 자료면 돼요' }, catalog, { useSemantic: false });
    assert.equal(result.total, 3);
    assert.ok(result.results.findIndex(item => item.id === 'direct') < result.results.findIndex(item => item.id === 'incidental'));
    assert.ok(result.results.some(item => item.id === 'office'));
  });
  const plan = { version: 'curi-request-v1', originalQuery: '마을 변화', clauses: [], expression: { op: 'ref', clauseId: 'topic' } };
  const item = { id: 'late', title: '마을', summary: '안내 '.repeat(250) + '마을의 골목이 사라지고 모습이 달라졌다.', sourceUrl: 'https://www.ebs.co.kr/late', score: 10,
    requestRequirements: { items: [{ clauseId: 'topic', kind: 'topic', mode: 'required', status: 'UNKNOWN' }] } };
  await check('API 검토의 600자 뒤 핵심 원문 전달·인용 채택', () => {
    const batch = prepareReviewBatch([item], plan), start = item.summary.indexOf('마을');
    assert.ok(start > 600);
    assert.equal(batch.candidates[0].summary, item.summary);
    assert.equal(batch.candidates[0].summaryTruncated, false);
    const response = { version: 'curi-candidate-review-v1', requestFingerprint: batch.requestFingerprint, reviews: [{ candidateId: item.id, sourceFingerprint: batch.candidates[0].sourceFingerprint, judgment: 'SUITABLE', selectionReason: '마을 변화의 원문 설명', requirements: [{ clauseId: 'topic', status: 'MATCH', quotes: [{ field: 'summary', start, end: item.summary.length, quote: item.summary.slice(start) }] }] }] };
    assert.equal(applyCandidateReview([item], batch, response, expressionState).execution.adopted, true);
  });
  await check('API 전송량 한도·이모지 중간 잘림 방지', () => {
    const batch = prepareReviewBatch([{ ...item, summary: '가'.repeat(5999) + '🌳마을' }], plan);
    assert.equal(batch.candidates[0].summary.length, 5999);
    assert.equal(batch.candidates[0].summaryTruncated, true);
  });
  await fs.writeFile('docs/r12-03-completeness-check.json', JSON.stringify({ cases, passed: cases.length, paidApiCalls: 0 }, null, 2) + '\n');
  console.log(cases.length, '검색 근거/내용 전달 검사 통과');
})().catch(error => { console.error(error); process.exitCode = 1; });
