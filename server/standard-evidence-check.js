const assert = require('node:assert/strict');
const { readDataStore } = require('./data-store');
const { discoverCurriculum } = require('./curriculum-discovery');
const { comparisonFor, selectedLinks, candidateStates } = require('./curriculum-evidence');
const { requirementPlan } = require('./curriculum-requirements');
const { assessRelation } = require('./automatic-relation-rules');
const { assessSourceText } = require('./source-text-quality');
const { loadEvidenceContext } = require('./automatic-evidence-service');

async function run() {
  const store = await readDataStore(), cases = [];
  const check = async (name, fn) => { await fn(); cases.push({ name, passed: true }); };
  const item = (id, title, summary) => ({ id, title, summary, kind: 'episode', sourceSystem: 'EBS_BROADCAST', variant: 'ORIGINAL',
    program: '격리된 개발 검사', sourceUrl: 'https://www.ebs.co.kr/test', evidenceUrl: 'https://www.ebs.co.kr/test', navigation: { status: 'PUBLISHED' } });
  const resources = [item('TITLE', '선거와 시민', ''), item('MENTION', '민주주의 선거 참여', '시민과 민주주의, 선거와 주권이라는 단어가 등장하고 도시의 풍경을 소개한다.'),
    item('PARTIAL', '선거의 역할', '시민은 투표로 대표를 선출한다. 시민은 선거 참여를 통해 주권을 행사한다.'),
    item('OLD-CONFLICT', '선거의 다른 역할', '시민은 투표로 대표를 선출한다. 선거는 폭력을 사용하지 않고도 분쟁을 해결하는 방법이다.'),
    item('UNSUPPORTED-LOW', '산지와 하천', ''), item('UNSUPPORTED-TEXT', '산지와 하천의 위치', '산지와 하천의 위치를 지도에서 확인하고 다양한 지역의 지형 분포를 설명한다.')];
  const catalog = { resources, stats: {} }, find = input => discoverCurriculum({ grade: 'elementary56', ...input }, catalog, store);
  await check('선택 기준 없는 다른 기준·교과·과정 확인은 배지 배열에서 제외', () => {
    const plan = requirementPlan(store.curriculumStandards.find(s => s.metadata.achievementStandardId === '6사08-01'));
    const selected = { standardId: plan.standardId, subject: '사회', courseId: 'elementary56' };
    const other = { standardId: '6사04-01', subject: '사회', courseId: 'elementary56' };
    const wrongCourse = { ...selected, courseId: 'middle1' };
    const result = selectedLinks({ approvedLinks: [other], automaticLinks: [selected, wrongCourse] }, plan);
    assert.equal(result.approvedLinks.length, 0); assert.deepEqual(result.automaticLinks, [selected]);
    assert.equal(result.otherStandardLinks.approvedLinks.length, 1); assert.equal(result.otherStandardLinks.automaticLinks.length, 1);
  });
  await check('미지원과 소개문 부족은 동시에 남고 각각의 필터에 노출', async () => {
    const all = await find({ standard: '6사01-01' });
    const low = all.results.find(r => r.id === 'UNSUPPORTED-LOW');
    assert.equal(low.curriculumComparison.ruleSupport.supported, false);
    assert.deepEqual(low.candidateStates, ['UNSUPPORTED', 'TITLE_ONLY', 'DESCRIPTION_LOW']);
    assert.ok((await find({ standard: '6사01-01', state: 'UNSUPPORTED' })).results.some(r => r.id === low.id));
    assert.ok((await find({ standard: '6사01-01', state: 'DESCRIPTION_LOW' })).results.some(r => r.id === low.id));
    const enough = all.results.find(r => r.id === 'UNSUPPORTED-TEXT');
    assert.equal(enough.curriculumComparison.semanticState, 'UNSUPPORTED');
    assert.equal(enough.curriculumComparison.requirementComparisons[0].status, 'UNSUPPORTED');
    assert.deepEqual(enough.curriculumComparison.requirementComparisons[0].quotes, []);
  });
  await check('개념 표현과 요구의 직접 인용을 서로 구분', async () => {
    const result = await find({ standard: '6사08-01' });
    const mention = result.results.find(r => r.id === 'MENTION'), partial = result.results.find(r => r.id === 'PARTIAL');
    assert.equal(mention.candidateState, 'CONCEPT_ONLY');
    assert.ok(mention.curriculumComparison.discoveryEvidence.length); assert.ok(mention.curriculumComparison.requirementComparisons.every(r => !r.quotes.length));
    assert.equal(partial.candidateState, 'PARTIAL_SUPPORTED'); assert.equal(partial.teachingContext.standardId, '6사08-01');
    for (const requirement of partial.curriculumComparison.requirementComparisons) {
      assert.equal(requirement.status, 'SUPPORTED'); assert.equal(requirement.quotes.length, 1);
      for (const quote of requirement.quotes) {
        assert.equal(partial.summary.slice(quote.start, quote.end), quote.quote); assert.equal(quote.sourceContentId, partial.id);
        assert.equal(quote.offsetUnit, 'UTF16_CODE_UNIT'); assert.ok(quote.contentHash); assert.ok(quote.sourceVersion); assert.ok(quote.sourceUrl);
      }
    }
  });
  await check('구 CONFLICT는 명시적 요구별 상충 입증 없이 상충으로 승격하지 않음', () => {
    const states = candidateStates({ semantic: { status: 'CONFLICT', supportedRequirements: [] }, sourceQuality: { detailedMappingAllowed: true, category: 'detailed' } });
    assert.deepEqual(states, ['INTERPRETATION_HELD']);
  });
  await check('농경문 원문은 유물·농경 문양 두 요구와 별개 고조선·생활 전반·학생 추론 경계', async () => {
    const { resource } = await loadEvidenceContext({ resourceId: 'BCAST-edc5b3f9fd8742c0b2f0', standardId: '6사04-01' }, store);
    const standard = store.curriculumStandards.find(s => s.metadata.achievementStandardId === '6사04-01'), plan = requirementPlan(standard);
    const source = { ...item(resource.sourceContentId, resource.title, resource.synopsis), matchedTerms: ['유물'],
      semantic: assessRelation(resource, standard), sourceQuality: assessSourceText(resource.title, resource.synopsis) };
    source.candidateStates = candidateStates(source); source.candidateState = source.candidateStates[0];
    const comparison = comparisonFor(source, plan, standard);
    assert.equal(comparison.requirementComparisons.filter(r => r.status === 'SUPPORTED').length, 2);
    assert.ok(comparison.unconfirmedParts.some(s => /고조선/.test(s))); assert.match(comparison.activityNote, /교사가 연결할 학생 활동/);
    for (const requirement of comparison.requirementComparisons) for (const q of requirement.quotes) assert.equal(resource.synopsis.slice(q.start, q.end), q.quote);
  });
  await check('같은 제목 다른 판본은 필터 이후 묶어서 일치 판본을 숨기지 않음', async () => {
    const variants = { resources: [item('VARIANT-LOW', '선거의 역할', ''), item('VARIANT-TEXT', '선거의 역할', resources.find(r => r.id === 'PARTIAL').summary)], stats: {} };
    const result = await discoverCurriculum({ grade: 'elementary56', standard: '6사08-01', state: 'TITLE_ONLY' }, variants, store);
    assert.equal(result.results.length, 1); assert.equal(result.results[0].id, 'VARIANT-LOW');
  });
  await check('미지원 기준은 지원 관계 없음 분모에서 제외·원문 부족과 겹침 안내', async () => {
    const result = await find({});
    assert.equal(result.summary.ruleSupported, 4); assert.equal(result.summary.ruleUnsupported, 74);
    assert.ok(result.summary.withoutSupportedRelation <= 4); assert.match(result.summary.countNote, /중복/);
  });
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), passed: cases.length, cases, paidApiCalls: 0 }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });
