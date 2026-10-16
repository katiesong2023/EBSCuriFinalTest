const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseGradeRequest, courseForGrade } = require('../public/grade-context');
const { parseDiscoveryIntent } = require('./discovery-intent');
const { parseSearchInput } = require('./search-conditions');
const { discoverTeacherContents } = require('./teacher-discovery');
const { createNaturalSearch } = require('./natural-search');
const { documentForAsset, embeddingKey, embeddingSpec } = require('./search-index-contract');
const cases = [];
const check = async (name, run) => { await run(); cases.push({ name, passed: true }); };
const resources = [
  { id: 'GRADE34', title: '민주주의와 시민 참여', broadcastDate: '2020-01-01' },
  { id: 'GRADE56', title: '민주주의와 시민 참여 (더빙)', broadcastDate: '2025-01-01' },
  { id: 'MIDDLE', title: '민주주의와 시민 참여 (자막)', broadcastDate: '2026-01-01' },
  { id: 'GENERAL', title: '민주주의 수업 자료', broadcastDate: '2024-01-01' }
].map((item) => ({ ...item, summary: '시민이 선거와 투표에 참여하여 대표를 뽑고 민주주의를 실현하는 과정을 설명한다.', kind: 'episode', program: '학년 계약 시험', sourceUrl: `https://www.ebs.co.kr/${item.id}`, sourceSystem: 'FIXTURE', navigation: { status: 'PUBLISHED', kind: 'EPISODE' } }));
const courseIds = ['elementary34', 'elementary56', 'middle1'];
const bands = ['초등 3~4학년군', '초등 5~6학년군', '중학교 1~3학년군'];
const store = { verifiedAssets: resources.slice(0, 3).map((item, index) => ({
  verifiedAssetId: `asset-${index}`, version: 1, contentCuriId: item.id, curriculumCuriId: `standard-${index}`, curiMapId: `map-${index}`,
  publicText: { text: item.summary }, evidenceFingerprint: `fingerprint-${index}`, contentVersion: `version-${index}`,
  content: { sourceIdentity: { sourceContentId: item.id }, sourceUrl: item.sourceUrl, metadata: { title: item.title, synopsis: item.summary, programName: item.program, broadcastDate: item.broadcastDate } },
  standard: { metadata: { achievementStandardId: `${index === 0 ? '4' : index === 1 ? '6' : '9'}사01-01`, achievementStandard: '시민이 참여하는 민주주의를 이해한다.', subject: '사회', gradeBand: bands[index], schoolLevel: index === 2 ? '중학교' : '초등학교', courseId: courseIds[index] } },
  review: { result: { rationale: '시민 참여의 원문 근거', teachingUse: '투표의 역할', coreConcepts: ['민주주의'] } }
})), searchProjection: [] };
const vector = [1, ...Array(383).fill(0)];
store.searchProjection = store.verifiedAssets.map((asset) => ({ embeddingKey: embeddingKey(documentForAsset(asset)), spec: embeddingSpec, vector, inputTokens: 1, truncated: false, verifiedAssetId: asset.verifiedAssetId, version: asset.version, contentCuriId: asset.contentCuriId, curiMapId: asset.curiMapId, curriculumCuriId: asset.curriculumCuriId, contentVersion: asset.contentVersion, evidenceFingerprint: asset.evidenceFingerprint }));
const catalog = { resources, concepts: [], stats: {}, version: 'grade-contract-fixture' };
async function main() {
  await check('단일·학년군·중1 문법, 모호·미지원 학교급과 충돌', () => {
    for (const [q, expected] of [['초등 3학년','elementary34'],['4학년','elementary34'],['3~4학년군','elementary34'],['5학년','elementary56'],['6학년','elementary56'],['5~6학년군','elementary56'],['중1','middle1'],['중학교 1학년','middle1']]) {
      assert.deepEqual(parseGradeRequest(q).courses, [expected]);
      assert.equal(parseSearchInput({ query: `${q} 사회 민주주의` }).needsClarification, false);
    }
    for (const q of ['1학년','초1','중2','고등학교 1학년']) assert.equal(parseGradeRequest(q).needsClarification, true, q);
    const conflict = parseGradeRequest('중1 과학', '초등 4학년');
    assert.deepEqual(conflict.courses, ['elementary34']); assert.ok(conflict.warnings.length);
  });
  await check('학년 OR는 주제 OR가 아니며 실제 주제 OR는 보존', () => {
    assert.deepEqual(parseGradeRequest('초4 또는 중1').courses, ['elementary34','middle1']);
    assert.equal(parseDiscoveryIntent('초4 또는 중1 사회 민주주의').positiveQuery, '사회 민주주의');
    assert.match(parseDiscoveryIntent('중1 민주주의 또는 생태계').positiveQuery, /또는/);
  });
  await check('방송 학년 미지정 일반 후보 보존·과정별 사람 관계 필터 후 판본 묶음', async () => {
    for (const [grade, course] of [['초등 3학년','elementary34'],['초등 6학년','elementary56'],['중학교 1학년','middle1']]) {
      const all = await discoverTeacherContents({ q: '민주주의', grade }, catalog, store);
      assert.equal(all.total, 2); assert.ok(all.results.some((item) => item.id === 'GENERAL'));
      const approved = await discoverTeacherContents({ q: '민주주의', grade, curriculum: 'approved', sort: 'newest' }, catalog, store);
      assert.equal(approved.total, 1); assert.equal(approved.results[0].approvedLinks[0].courseId, course);
      assert.equal(approved.results[0].alternatives.length, 0);
      assert.equal(all.filters.curriculum.find((entry) => entry.value === 'approved').count, 1);
    }
    const unresolved = await discoverTeacherContents({ q: '1학년 민주주의', curriculum: 'approved' }, catalog, store);
    assert.equal(unresolved.total, 0);
    const multiple = await discoverTeacherContents({ q: '초4 또는 중1 민주주의', curriculum: 'approved' }, catalog, store);
    assert.deepEqual(new Set([multiple.results[0], ...multiple.results[0].alternatives].flatMap((item) => item.approvedLinks.map((link) => link.courseId))), new Set(['elementary34','middle1']));
  });
  await check('여러 교과 주제가 있는 자료도 명시 교과의 승인 관계만 표시', async () => {
    const item = { ...resources[2], title: '민주주의와 생태계', summary: '시민의 민주주의 참여와 다양한 생물이 살아가는 생태계를 함께 소개한다.' };
    const mixedStore = structuredClone(store), asset = mixedStore.verifiedAssets[2];
    asset.content.metadata.title = item.title; asset.content.metadata.synopsis = item.summary;
    const science = structuredClone(asset); science.verifiedAssetId = 'science-approval'; science.standard.metadata.subject = '과학'; science.standard.metadata.achievementStandardId = '9과02-01';
    mixedStore.verifiedAssets = [asset, science];
    for (const grade of ['all', '중학교 1학년']) {
      const result = await discoverTeacherContents({ grade, subject: '과학', curriculum: 'approved' }, { ...catalog, resources: [item] }, mixedStore);
      assert.equal(result.total, 1); assert.equal(result.results[0].approvedLinks.length, 1); assert.equal(result.results[0].approvedLinks[0].subject, '과학');
      assert.equal(result.results[0].teachingContext.subject, '과학');
      assert.equal(result.filters.subject.find((option) => option.value === '사회').count, (await discoverTeacherContents({ grade, subject: '사회', curriculum: 'approved' }, { ...catalog, resources: [item] }, mixedStore)).total);
    }
  });
  await check('기존 승인 검색도 같은 과정 관계만 반환·복수 과정 OR·미지원 비공개', async () => {
    const search = createNaturalSearch({ readStore: async () => store, getThreshold: () => 0.82, createEmbedder: () => ({ embed: async () => ({ vector }), close: async () => {} }) });
    for (const grade of ['초등 3학년','초등 6학년','중학교 1학년']) {
      const result = await search({ query: '민주주의', grade });
      assert.equal(result.total, 1); assert.equal(result.results[0].relations[0].courseId, courseForGrade(grade));
    }
    assert.equal((await search({ query: '초4 또는 중1 민주주의' })).total, 2);
    assert.equal((await search({ query: '1학년 민주주의' })).state, 'NEEDS_CLARIFICATION');
  });
  await check('폴더·모음의 학년/선택기준 보존, 옛 폴더 미추정, 재조회와 내보내기의 관계 구분', async () => {
    const saved = new Map(); const context = { window: {}, URL, URLSearchParams, AbortSignal, setTimeout, localStorage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) } };
    context.globalThis = context; vm.createContext(context);
    for (const file of ['grade-context.js','teacher-storage.js']) vm.runInContext(fs.readFileSync(`public/${file}`, 'utf8'), context);
    context.CuriTeacher = context.window.CuriTeacher; context.window.GradeContext = context.GradeContext;
    for (const file of ['lesson-folders.js','teacher-guidance.js', 'teacher-evidence.js']) vm.runInContext(fs.readFileSync(`public/${file}`, 'utf8'), context);
    const teacher = context.CuriTeacher, resource = { ...resources[0], teachingContext: { grade: '중학교 1학년', courses: ['middle1'], standardId: '9과01-01' } };
    const library = teacher.readFolders(); library.folders.push({ id: 'old', title: '6학년 이름이지만 학년 미지정', note: '보존', items: [{ resource, note: '장면 메모' }] }, { id: 'new', title: '중1 과학', targetGrade: '중학교 1학년', items: [{ resource, note: '힘의 변화' }] });
    assert.equal(teacher.saveFolders(library), true); const reopened = teacher.readFolders();
    assert.equal(reopened.folders[0].targetGrade, ''); assert.equal(reopened.folders[1].targetGrade, '중학교 1학년'); assert.equal(reopened.folders[1].items[0].resource.teachingContext.standardId, '9과01-01');
    context.fetch = async () => ({ ok: true, json: async () => ({ resources: [{ ...resource, teachingContext: null, curriculumStatus: 'APPROVED', evidenceRefresh: 'CURRENT', approvedLinks: [{ grade: '초등 5~6학년군', courseId: 'elementary56' }, { grade: '중학교 1학년', courseId: 'middle1', standardId: '9과01-01', standard: '힘을 이해한다.' }], automaticLinks: [{ courseId: 'elementary34' }, { courseId: 'middle1', standardId: '9과01-01', connectedParts: [], unconfirmedParts: [] }] }] }) });
    const [latest] = await teacher.refreshResources([resource]); assert.equal(latest.approvedLinks.length, 1); assert.equal(latest.automaticLinks.length, 1); assert.equal(latest.teachingContext.standardId, '9과01-01');
    assert.match(teacher.evidenceMarkdown(latest, String).join('\n'), /중학교 1학년/); assert.match(teacher.evidenceMarkdown(latest, String).join('\n'), /선택한 기준/);
    const scoped = teacher.withTeachingContext({ ...latest, automaticLinks: [{ courseId: 'middle1', subject: '사회' }, { courseId: 'middle1', standardId: '9과01-01', subject: '과학', grade: '중학교 1~3학년군', connectedParts: [], unconfirmedParts: [] }] }, { ...latest.teachingContext, subject: '과학' });
    assert.equal(scoped.automaticLinks.length, 1); assert.match(teacher.evidenceMarkdown(scoped, String).join('\n'), /공식 학년군: 중학교 1~3학년군/);
    assert.match(teacher.evidenceMarkdown(scoped, String).join('\n'), /자동 부분 연계 후보: 중학교 1학년/);
  });
  fs.writeFileSync(process.env.CURI_REPORT_PATH || 'docs/r09-01-grade-search-check.json', JSON.stringify({ checkedAt: new Date().toISOString(), cases, scope: '격리 합성 자료 기능 검사·브라우저 저장 모듈 VM 검사. 실제 사람 판단·브라우저 UI 동작 검사가 아님.', paidApiCalls: 0 }, null, 2) + '\n');
  console.log(`R09-01 검색·폴더 계약 ${cases.length}개 통과`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
