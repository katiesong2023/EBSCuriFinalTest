// 고정 자료·승인 사본에서 추천 경계와 조건 보존을 검사한다. 실제 저장소·네트워크는 변경하지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const net = require('node:net');
const { gunzipSync } = require('node:zlib');
const { discoverContents } = require('./discovery-search');
const { discoverTeacherContents } = require('./teacher-discovery');
const { teacherCatalog } = require('./teacher-approvals');
const { groupVariants, hasRecommendationEvidence } = require('./teacher-curation');
const { readDataStore } = require('./data-store');
const { reconcileVerifiedAssets } = require('./data-quality');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
async function main() {
  let networkAttempts = 0;
  const blocked = () => { networkAttempts++; throw new Error('오프라인 검사'); };
  global.fetch = blocked; net.Socket.prototype.connect = blocked;
  const protectedFiles = ['server/data/curi-store.json', 'server/data/broadcast-catalog.sqlite'];
  const before = Object.fromEntries(protectedFiles.map((p) => [p, hash(fs.readFileSync(p))]));
  const bytes = gunzipSync(fs.readFileSync('server/data/quality-catalog-20260930.json.gz'));
  const catalog = JSON.parse(bytes);
  const store = await readDataStore();
  const cases = [], examples = [];
  async function check(name, run) { await run(); cases.push({ name, passed: true }); }
  const search = (input, c = catalog, s = store) => discoverTeacherContents(input, c, s);
  await check('주제 미정도 단일 목록·주제 필터 제공, 대표 후보 제거', async () => {
    const r = await search({ q: '수업 주제를 추천해줘' });
    assert.ok(r.total > 1000); assert.equal(r.curation, undefined);
    assert.ok(r.filters.conceptGroup.some((group) => group.label.startsWith('사회')));
    assert.ok(r.filters.conceptGroup.some((group) => group.label.startsWith('과학')));
  });
  await check('우주 단일 목록의 천문 근거와 이전 세부 주제 주소 호환', async () => {
    const r = await search({ q: '우주 관련 수업을 하고 싶어 주제를 선정해줘' });
    assert.ok(r.total > 0); assert.equal(r.curation, undefined);
    assert.ok(r.results.every((i) => hasRecommendationEvidence(i, ['space'])));
    assert.ok(r.results.every((i) => !/꿀벌|심해탐사|번개보석|아기별|나도 잘할/.test(i.title)));
    const selected = await search({ q: r.query, topic: 'space-explore' });
    assert.ok(selected.results.every((i) => /탐사|우주선|망원경/.test(i.title + i.summary)));
    examples.push({ query: r.query, results: r.results.map(({ id, title, program, relevanceReason }) => ({ id, title, program, relevanceReason })) });
  });
  await check('같은 고정 자료에서 AND·OR·제외·프로그램·유형·링크 조건 보존', async () => {
    for (const input of [{ q: '우주와 인체' }, { q: '설악산 또는 김제' }, { q: '우주 환경 제외' }, { q: '민주주의', program: '지식채널e' }, { q: '날씨', kind: 'clip' }, { q: '우주', access: 'direct' }]) {
      const raw = await discoverContents(input, catalog, { includeCandidates: true });
      const expected = new Set(raw.candidates.map((i) => i.id));
      const r = await search(input);
      for (const item of r.results.flatMap((i) => [i, ...(i.alternatives || [])])) assert.ok(expected.has(item.id), input.q);
      assert.equal(r.total, groupVariants(raw.candidates.filter((item) => !item.matchedConceptGroups.length || item.matchedConceptGroups.some((ids) => ids.every((id) => hasRecommendationEvidence(item, [id]))))).length);
    }
  });
  await check('시간·학년·장면은 경고 유지, 빈 결과·주제 오류·승인 필터 검증', async () => {
    const r = await search({ q: '우주 5분 이내 자막 포함 5학년' });
    for (const word of ['재생시간', '학년', '자막']) assert.ok(r.understanding.warnings.some((s) => s.includes(word)));
    assert.equal((await search({ q: '양자중력' })).total, 0);
    assert.equal((await search({ q: '우주', curriculum: 'approved' })).total, 0);
    await assert.rejects(search({ q: '우주', topic: 'unknown' }));
    await assert.rejects(search({ curriculum: 'yes' }));
  });
  await check('같은 제목 판본만 묶고 다른 회차·프로그램을 보존', () => {
    const items = ['우주 1부', '우주 1부(더빙)', '우주 1부 (수어)', '우주 1부 (재방송)', '우주 2부'].map((title, i) => ({ id: String(i), title, program: '과학 다큐' }));
    items.push({ id: 'other', title: '우주 1부', program: '다른 다큐' });
    items.push({ id: 'clip', title: '우주 1부', program: '과학 다큐', kind: 'clip' });
    const grouped = groupVariants(items);
    assert.equal(grouped.length, 4); assert.equal(grouped[0].alternatives.length, 3);
  });
  await check('기후 단일 목록의 비유·극 배경과 꿀벌 방향의 수분 동음이의어 제외', async () => {
    const make = (id, title, summary) => ({ id, title, summary, program: '가상 검사', kind: 'episode', sourceUrl: 'https://www.ebs.co.kr/test' });
    const fixture = { resources: [
      make('DESERT', '사막의 카라반', '사막의 유목민이 생계를 이어가는 모습'),
      make('SEA', '수산 자원', '바다 사막화로 바다속은 사막처럼 변하고 어민의 생계가 달라진다'),
      make('CARTOON', '사막 대모험', '구조대와 함께 마법의 사막으로 떠난다'),
      make('TUNDRA', '툰드라 기후', '북극 영구 동토의 기후 변화'),
      make('MOISTURE', '잡초 생태계', '잡초가 땅 속 수분을 유지한다'),
      make('BEE', '꿀벌 생태계', '꿀벌과 꽃가루받이의 관계'),
      make('CITIZEN', '민주주의와 시민', '시민의 생활을 돕는 조례'),
      make('PARTICIPATION', '민주주의와 선거', '시민 참여의 방식')
    ], concepts: [], stats: {} };
    const climate = await search({ q: '사막 또는 툰드라' }, fixture, { verifiedAssets: [] });
    assert.deepEqual(new Set(climate.results.map((item) => item.id)), new Set(['DESERT', 'TUNDRA']));
    assert.ok(!climate.results.some((item) => item.id === 'SEA'));
    assert.ok((await search({ q: '수산' }, fixture, { verifiedAssets: [] })).results.some((item) => item.id === 'SEA'));
    const bees = await search({ q: '생태계', topic: 'ecosystem-bees' }, fixture, { verifiedAssets: [] });
    assert.deepEqual(bees.results.map((item) => item.id), ['BEE']);
    const participation = await search({ q: '민주주의', topic: 'democracy-participation' }, fixture, { verifiedAssets: [] });
    assert.deepEqual(participation.results.map((item) => item.id), ['PARTICIPATION']);
  });
  await check('현재 승인 지문 적용과 원문 변경 후 표시·필터 무효화', async () => {
    const current = await teacherCatalog(catalog, store);
    const approved = current.resources.filter((i) => i.curriculumStatus === 'APPROVED');
    assert.ok(approved.length > 0);
    assert.ok((await search({ q: '날씨', curriculum: 'approved' })).results.every((i) => i.approvedLinks.length));
    const changed = structuredClone(store);
    for (const item of changed.contents) item.metadata.title += ' 원문 변경';
    reconcileVerifiedAssets(changed);
    assert.equal((await search({ browse: 'all', curriculum: 'approved' }, catalog, changed)).total, 0);
    assert.equal((await teacherCatalog(catalog, changed)).resources.filter((i) => i.curriculumStatus === 'APPROVED').length, 0);
  });
  await check('후보 부족 시 채우지 않음, 과학 비유와 극 배경을 해당 주제 검색에서 제외', async () => {
    const make = (id, title, summary = '') => ({ id, title, summary, program: '가상 검사', kind: 'episode', sourceUrl: 'https://www.ebs.co.kr/test', evidenceLevel: 'SOURCE_DESCRIPTION' });
    const fixture = { resources: [make('ONE', '우주 탐사선', '행성 관측'), make('METAPHOR', '우리 마음의 우주'), make('DRAMA', '우주 행성', '마법과 악당의 이야기'), make('WEATHER', '날씨'), make('BODY', '인체의 소화 작용')], concepts: [], stats: {} };
    const r = await search({ q: '우주 관련 수업을 하고 싶어 주제를 선정해줘' }, fixture, { verifiedAssets: [] });
    assert.deepEqual(r.results.map((i) => i.id), ['ONE']);
    const alternative = await search({ q: '우주 또는 인체' }, fixture, { verifiedAssets: [] });
    assert.ok(alternative.results.some((i) => i.id === 'BODY'));
  });
  await check('필터별 개수·페이지·판본 수와 명시적 전체 목록', async () => {
    const all = await search({ browse: 'all' }); assert.ok(all.total > 1000);
    const first = await search({ q: '민주주의' });
    const ids = new Set();
    for (let page = 1; page <= first.pages; page++) for (const item of (await search({ q: first.query, page })).results) { assert.ok(!ids.has(item.id)); ids.add(item.id); }
    assert.equal(ids.size, first.total);
    const clip = await search({ q: '동고서저', kind: 'clip' });
    assert.equal(clip.facets.clip, clip.total); assert.ok(clip.facets.episode > 0);
  });
  for (const file of protectedFiles) assert.equal(hash(fs.readFileSync(file)), before[file]);
  assert.equal(networkAttempts, 0);
  fs.writeFileSync(process.env.CURI_REPORT_PATH || 'docs/r07-workspace-check.json', JSON.stringify({ generatedAt: new Date().toISOString(), snapshotSha256: hash(bytes), cases, examples, protectedHashes: before, storesUnchanged: true, networkAttempts, paidApiCalls: 0, limits: '개발용 기능·근거 경계 검사이며 실제 교사 평가·최종 검색 품질 검증이 아니다.' }, null, 2) + '\n');
  console.log(`R07 고정 자료 계약 ${cases.length}개 통과 · 승인/방송 저장소 불변 · 외부 접속 0`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
