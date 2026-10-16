const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { discoverContents } = require('./discovery-search');
const { discoverTeacherContents } = require('./teacher-discovery');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { readDataStore } = require('./data-store');
const { parseDiscoveryIntent } = require('./discovery-intent');
const names = ['curi-store.json', 'broadcast-catalog.sqlite', 'semantic-layer.sqlite', 'automatic-assets.sqlite'];
const hashes = () => Object.fromEntries(names.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(`server/data/${name}`)).digest('hex')]));
const resource = (id, program, summary, title = '우주 탐사', kind = 'episode') => ({ id, program, title, summary, kind,
  sourceUrl: `https://www.ebs.co.kr/${id}`, evidenceUrl: `https://www.ebs.co.kr/${id}`, navigation: { status: 'PUBLISHED', kind: 'EPISODE' }, curriculumStatus: 'NOT_ASSESSED' });
const summary = '우주의 태양계와 행성을 관찰하는 탐사 과정을 설명한다.';
const catalog = { version: 'program-genre-fixture-1', concepts: [], stats: {}, resources: [
  resource('DOC', 'EBS 다큐프라임', summary), resource('UNKNOWN', '다른 방송', summary),
  resource('SUMMARY', '별 이야기', `${summary} 우주 다큐멘터리다.`),
  resource('DRAMA', '우주 드라마', summary), resource('ANIMATION', '우주 애니메이션', summary),
  resource('REFER', '다른 프로그램', `${summary} EBS 다큐프라임의 이름을 언급한다.`),
  resource('WORLD', '세계테마기행', '사막의 기후와 사람들의 삶을 소개한다.', '사막의 사람들'),
  resource('NO_TOPIC', 'EBS 다큐프라임', '낡은 가구를 수선하는 과정을 소개한다.', '수선하는 하루')
] };
const programs = [...new Set(catalog.resources.map(item => item.program))];
async function main() {
  const before = hashes(), cases = [];
  const check = async (name, run) => { await run(); cases.push({ name, passed: true }); console.log('통과:', name); };
  const find = q => discoverContents({ q }, catalog);
  const ids = async q => (await find(q)).results.map(item => item.id).sort();
  await check('프로그램 전체 이름·EBS 생략·주제 앞뒤·조사·띄어쓰기', async () => {
    for (const q of ['우주 다큐프라임', '다큐프라임 우주', 'EBS 다큐프라임 우주', 'EBS다큐프라임의 우주', '다큐프라임에서 우주']) {
      assert.deepEqual(await ids(q), ['DOC']);
      assert.deepEqual((await find(q)).understanding.requiredPrograms, ['EBS 다큐프라임']);
    }
  });
  await check('다른 프로그램의 제목/소개문에 이름이 언급돼도 필수 프로그램 조건 불충족', async () => {
    assert.equal((await find('다큐프라임 우주')).results.some(item => item.id === 'REFER'), false);
    assert.deepEqual(await ids('세계테마기행 사막'), ['WORLD']);
  });
  await check('프로그램만 요청·다른 상세 프로그램 필터와 교집합', async () => {
    assert.deepEqual(await ids('다큐프라임'), ['DOC', 'NO_TOPIC']);
    assert.equal((await discoverContents({ q: '다큐프라임 우주', program: '다른 방송' }, catalog)).total, 0);
  });
  await check('프로그램 같은/유사한은 선호이고 다른 주제 후보를 제외하지 않음', async () => {
    const r = await find('다큐프라임 같은 우주');
    assert.deepEqual(r.understanding.requiredPrograms, []); assert.deepEqual(r.understanding.preferences.programs, ['EBS 다큐프라임']);
    assert.equal(r.results[0].id, 'DOC'); assert.ok(r.results.some(item => item.id === 'UNKNOWN'));
    const noTopic = await find('세계테마기행 같은 여행 다큐');
    assert.deepEqual(noTopic.results.map(item => item.id), ['WORLD']);
  });
  await check('장르 선호는 같은 주제 후보의 관련순에 반영·주제 조건 유지', async () => {
    const r = await find('우주 다큐멘터리 같은');
    assert.deepEqual(r.understanding.preferences.genres, ['다큐멘터리']);
    assert.ok(['DOC', 'SUMMARY'].includes(r.results[0].id));
    assert.ok(r.results.some(item => item.id === 'UNKNOWN')); assert.ok(!r.results.some(item => item.id === 'NO_TOPIC'));
    const candidates = (await discoverContents({ q: '우주 다큐멘터리 같은' }, catalog, { includeCandidates: true })).candidates;
    const doc = candidates.find(item => item.id === 'DOC'), unknown = candidates.find(item => item.id === 'UNKNOWN');
    assert.ok(doc.score > unknown.score);
  });
  await check('다큐/다큐멘터리 기본 검색과 명시 한정은 다른 형식·미확인 제외', async () => {
    for (const q of ['우주 다큐', '우주 다큐멘터리', '다큐멘터리 우주', '우주 다큐멘터리를 찾아줘', '우주 다큐만', '다큐멘터리로만 우주', '우주 다큐 중에서']) assert.deepEqual(await ids(q), ['DOC', 'SUMMARY']);
    assert.deepEqual(await ids('다큐만'), ['DOC', 'NO_TOPIC', 'SUMMARY']);
    assert.deepEqual(await ids('다큐멘터리'), ['DOC', 'NO_TOPIC', 'SUMMARY']);
    assert.deepEqual((await find('우주 다큐멘터리')).understanding.preferences.genres, []);
  });
  await check('애니메이션·드라마 한정과 장르 제외·제외만 요청', async () => {
    assert.deepEqual(await ids('우주 애니만'), ['ANIMATION']);
    assert.deepEqual(await ids('우주 드라마만'), ['DRAMA']);
    const excluded = await ids('우주 다큐 말고'); assert.ok(!excluded.includes('DOC') && !excluded.includes('SUMMARY') && excluded.includes('UNKNOWN'));
    assert.ok(!(await ids('다큐 제외')).includes('NO_TOPIC'));
  });
  await check('프로그램 제외는 프로그램 필드만 적용·긍정 주제 유지', async () => {
    const r = await find('우주 다큐프라임 말고'); assert.ok(!r.results.some(item => item.program === 'EBS 다큐프라임'));
    assert.ok(r.results.some(item => item.id === 'REFER'));
    assert.ok(!(await find('다큐프라임 제외')).results.some(item => item.program === 'EBS 다큐프라임'));
  });
  await check('알 수 없는 프로그램/장르와 이름의 부분 문자열은 내용어로 보존', async () => {
    assert.ok(parseDiscoveryIntent('우주 뮤지컬', { programNames: programs }).terms.includes('뮤지컬'));
    const r = parseDiscoveryIntent('우주 다큐프라임제작사', { programNames: programs });
    assert.deepEqual(r.requiredPrograms, []); assert.ok(r.terms.includes('다큐프라임제작사'));
    assert.deepEqual(parseDiscoveryIntent('다큐프라임의회 우주', { programNames: programs }).requiredPrograms, []);
  });
  await check('장르 표현 위치·근거 목적·장르 미확인 안내', async () => {
    const r = await find('우주 다큐만');
    for (const item of r.results) for (const cue of item.genreEvidence) {
      if (cue.field !== 'kind') assert.equal(item[cue.field].slice(cue.start, cue.end), cue.quote);
      assert.ok(['FORMAT_DESCRIPTION', 'RESOURCE_TYPE', 'OFFICIAL_PROGRAM_CATEGORY'].includes(cue.status));
    }
    assert.ok(r.understanding.warnings.some(text => text.includes('실제 영상 형식과 다를')));
  });
  const store = await readDataStore();
  await check('교사 검색 장르만 요청의 전체 목록 fallback 방지·선택 기준 교집합', async () => {
    const genre = await discoverTeacherContents({ q: '다큐만' }, catalog, store);
    assert.deepEqual(genre.results.map(item => item.id).sort(), ['DOC', 'NO_TOPIC', 'SUMMARY']);
    const rotation = { ...catalog, resources: [resource('ROTATE_DOC', 'EBS 다큐프라임', '지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.', '지구 자전'), resource('ROTATE_UNKNOWN', '다른 방송', '지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.', '지구 자전')] };
    for (const q of ['지구 자전 다큐멘터리', '지구 자전 다큐만']) {
      const r = await discoverTeacherContents({ q, standard: '6과12-02' }, rotation, store);
      assert.deepEqual(r.results.map(item => item.id), ['ROTATE_DOC']); assert.equal(r.searchMode, 'COMBINED');
      assert.equal(r.results[0].curriculumComparison.state, 'PARTIAL_SUPPORTED');
    }
  });
  const liveCatalog = await loadDiscoveryCatalog(), live = [];
  await check('실제 카탈로그 프로그램·장르 요청·선택 기준·원문 확인', async () => {
    for (const input of [{ q: '생태계' }, { q: '생태계 다큐멘터리' }, { q: '생태계 다큐만' }, { q: '생태계 다큐프라임' }, { q: '다큐프라임 생태계' }, { q: '세계테마기행 사막' }, { q: '세계테마기행 볼리비아' }, { q: '지구 자전 다큐프라임', standard: '6과12-02' }]) {
      const r = await discoverTeacherContents(input, liveCatalog, store);
      if (r.understanding.requiredPrograms.length) assert.ok(r.results.every(item => r.understanding.requiredPrograms.includes(item.program)));
      if (r.understanding.constraints.requiredGenres.length) assert.ok(r.results.every(item => item.genreEvidence.some(cue => r.understanding.constraints.requiredGenres.includes(cue.label))));
      live.push({ input, total: r.total, programs: r.understanding.requiredPrograms, genrePreferences: r.understanding.preferences.genres, requiredGenres: r.understanding.constraints.requiredGenres,
        top: r.results.slice(0, 3).map(item => ({ title: item.title, program: item.program, genreEvidence: item.genreEvidence })) });
    }
    assert.ok(live.find(row => row.input.q === '세계테마기행 볼리비아').total > 0);
    assert.ok(live.find(row => row.input.q === '생태계 다큐프라임').total > 0);
  });
  assert.deepEqual(hashes(), before);
  fs.writeFileSync('docs/r07-12-program-genre-check.json', JSON.stringify({ date: new Date().toISOString(), cases, live, protectedHashes: before, paidApiCalls: 0,
    scope: '고정 합성 자료의 검색 계약·현재 카탈로그 공개 텍스트. 영상 장르/교육적 적합성 전수 판정 아님.' }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
