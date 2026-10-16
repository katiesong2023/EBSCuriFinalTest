const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture, loadModule } = require('./verified-save-check');
const { findCandidates } = require('./candidate-retrieval');
const { contentVersion, evaluateVerification, reconcileVerifiedAssets } = require('./data-quality');
const cases = [];
const check = async (name, run) => { await run(); cases.push({ name, passed: true }); };
function scopedFixture(courseId, subject) {
  const store = fixture(), source = store.contents[0];
  const prefix = courseId === 'elementary34' ? '4' : '9';
  const standard = structuredClone(store.curriculumStandards[0]);
  standard.curiId = 'new-standard'; standard.metadata = { ...standard.metadata, subject, courseId,
    gradeBand: courseId === 'elementary34' ? '3~4학년군' : '1~3학년군', schoolLevel: courseId === 'elementary34' ? '초등학교' : '중학교',
    achievementStandardId: subject === '사회' && prefix === '9' ? '9사(지리)01-01' : `${prefix}${subject === '사회' ? '사' : '과'}01-01`,
    achievementStandard: '우리 지역의 산맥과 하천 지형의 특징과 분포를 관찰하고 주변 환경과 생활의 관계를 설명한다.' };
  standard.sourceIdentity.sourceStandardId = standard.metadata.achievementStandardId;
  if (courseId === 'middle1') standard.placement = { status: 'REFERENCE_MAPPED', version: 'synthetic-placement-v1', schoolPlacementConfirmed: false };
  store.curriculumStandards.push(standard);
  for (const item of store.curriculumStandards) item.metadata.subject = subject;
  source.metadata.subjectSeed = subject;
  source.metadata.synopsis = '우리 지역의 산맥과 하천 지형의 특징과 분포를 관찰한다. 주변 환경과 사람들의 생활이 어떻게 연결되는지 살펴보고 다양한 지형의 차이를 자세하게 소개한다.';
  store.mappingRuns = []; store.contentCurriculumMaps = []; store.verifiedAssets = []; store.verifiedAssetHistory = []; store.searchProjection = [];
  return store;
}
async function harness(initialStore) {
  const state = { store: structuredClone(initialStore), modelCalls: 0 };
  const data = { readDataStore: async () => structuredClone(state.store), writeDataStore: async (store) => { state.store = structuredClone(store); } };
  const mapping = await loadModule('./curimap-mapping', {
    './data-store': data,
    './candidate-retrieval': { retrieveCandidates: async (input) => { state.candidates = findCandidates(input, state.store); return state.candidates; } },
    './keychain': { KeychainApiKeyError: class extends Error {}, getOpenAiApiKey: async () => 'synthetic-key-never-sent' }
  }, { process: { env: { CURI_ALLOW_PAID_API: 'true' } }, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (_url, request) => {
      state.modelCalls++;
      const body = JSON.parse(request.body); assert.ok(!JSON.stringify(body).includes('synthetic-key-never-sent'));
      const output = { status: 'DRAFT', selectedStandardIds: [state.candidates.candidates[0].achievementStandardId], coreConcepts: ['산맥', '하천'], rationale: '지형과 생활의 관계를 탐색한다.', teachingUse: '주변 지형을 관찰하는 수업에서 활용한다.', confidence: 0.7, holdReason: '' };
      return { ok: true, status: 200, json: async () => ({ status: 'completed', usage: {}, output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }) };
    } });
  const reviews = await loadModule('./review-actions', { './data-store': data });
  const verified = await loadModule('./verified-save', { './data-store': data });
  return { state, mapping, reviews, verified };
}
async function runCourse(courseId, subject) {
  const h = await harness(scopedFixture(courseId, subject)), source = h.state.store.contents[0], grade = courseId === 'elementary34' ? '초등 4학년' : '중학교 1학년';
  const seedBefore = source.metadata.gradeBandSeed;
  const draft = await h.mapping.createCuriMapDraft({ contentCuriId: source.curiId, curriculumSubject: subject, gradeBand: grade, publicText: source.metadata.synopsis, publicTextSourceUrl: source.source.sourceUrl });
  assert.equal(draft.status, 'DRAFT'); assert.equal(draft.content.gradeBand, seedBefore); assert.equal(draft.content.curriculumGradeBand, grade);
  const options = await h.reviews.getReviewOptions(source.curiId); assert.equal(options.standards.length, 1); assert.equal(options.standards[0].metadata.courseId, courseId);
  const request = { contentCuriId: source.curiId, mappingRunId: draft.mappingRunId, decision: 'approve', confirmed: true, expectedReviewId: null, contentVersion: contentVersion(source) };
  const before = JSON.stringify(h.state.store);
  await assert.rejects(h.reviews.saveReviewDecision({ ...request, decision: 'edit', curriculumCuriIds: ['standard-1'], coreConcepts: ['원문'], rationale: '근거', teachingUse: '활용', note: '다른 과정 선택 시도' }), /공식 목록/);
  assert.equal(JSON.stringify(h.state.store), before);
  const review = (await h.reviews.saveReviewDecision(request)).review;
  assert.equal(review.curriculumGradeBand, grade); assert.equal(evaluateVerification(h.state.store, source.curiId).eligible, true);
  const saved = await h.verified.saveVerifiedAssets({ contentCuriId: source.curiId, mappingRunId: draft.mappingRunId, reviewId: review.reviewId, contentVersion: review.contentVersion });
  assert.equal(saved.saved, true); assert.equal(saved.assets.length, 1); assert.equal(h.state.store.verifiedAssets[0].standard.metadata.courseId, courseId); assert.equal(h.state.store.contents[0].metadata.gradeBandSeed, seedBefore);
  for (const mutate of [
    (store) => { store.mappingRuns[0].input.curriculumGradeBand = '초등 5학년'; },
    (store) => { store.mappingRuns[0].result.content.curriculumGradeBand = '초등 5학년'; },
    (store) => { store.mappingRuns[0].reviewHistory[0].curriculumGradeBand = '초등 5학년'; },
    (store) => { store.mappingRuns[0].input.officialCandidateIds = ['6사01-01']; },
    (store) => { store.contents[0].metadata.gradeBandSeed = grade; }
  ]) {
    const modified = structuredClone(h.state.store); mutate(modified);
    assert.equal(evaluateVerification(modified, source.curiId).eligible, false);
    assert.equal(reconcileVerifiedAssets(modified).verifiedAssets.length, 0);
  }
  const edited = (await h.reviews.saveReviewDecision({ ...request, expectedReviewId: review.reviewId, decision: 'edit', curriculumCuriIds: ['new-standard'], coreConcepts: ['하천'], rationale: '현재 과정의 관계 설명을 수정한다.', teachingUse: '하천 관찰에 활용한다.', note: '합성 원문 대조 수정 시험' })).review;
  assert.equal(evaluateVerification(h.state.store, source.curiId).eligible, true);
  const updated = await h.verified.saveVerifiedAssets({ contentCuriId: source.curiId, mappingRunId: draft.mappingRunId, reviewId: edited.reviewId, contentVersion: edited.contentVersion });
  assert.equal(updated.saved, true); assert.equal(updated.assets[0].version, 2); assert.equal(h.state.store.verifiedAssetHistory.length, 1);
  await h.reviews.saveReviewDecision({ ...request, expectedReviewId: edited.reviewId, decision: 'exclude', note: '합성 제외 시험' });
  assert.equal(reconcileVerifiedAssets(h.state.store).verifiedAssets.length, 0);
  assert.equal(h.state.store.contents[0].metadata.gradeBandSeed, seedBefore);
  assert.equal(h.state.modelCalls, 1);
}
(async () => {
  for (const courseId of ['elementary34', 'middle1']) for (const subject of ['사회','과학']) await check(`${courseId} ${subject}: 원래 초등5 seed 유지→실제 후보→모의 초안→격리 사람결정→승인자산 저장·다른 과정 거절·변경 무효화`, () => runCourse(courseId, subject));
  await check('기존 legacy 초등5~6 Gate와 저장 payload 호환', () => { const store = fixture(); assert.equal(evaluateVerification(store, 'content-1').eligible, true); });
  fs.writeFileSync('docs/r09-01-legacy-review-check.json', JSON.stringify({ checkedAt: new Date().toISOString(), cases, actualExternalApiCalls: 0, actualHumanDecisions: 0, scope: '메모리 합성 저장소·가짜 모델 응답으로 실제 CuriMap 후보/초안·legacy 검토·Gate·저장 구현을 연결한 기능 검사. 실제 사람 검토 및 실제 교육과정 평가가 아님.' }, null, 2) + '\n');
  console.log(`R09-01 legacy 과정 검토·저장 계약 ${cases.length}개 통과`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
