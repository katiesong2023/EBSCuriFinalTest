const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { discoverTeacherContents } = require('./teacher-discovery');
const { discoverContents } = require('./discovery-search');
const { buildCatalog } = require('./discovery-catalog');
const { groups, validDate } = require('./teacher-filters');
const { concepts } = require('./semantic-layer');
const { groupVariants } = require('./teacher-curation');
const protectedNames = ['curi-store.json', 'broadcast-catalog.sqlite', 'semantic-layer.sqlite', 'automatic-assets.sqlite'];
const hashes = async () => Object.fromEntries(await Promise.all(protectedNames.map(async name => [name, crypto.createHash('sha256').update(await fs.readFile(path.join(__dirname, 'data', name))).digest('hex')])));
const resource = (id, title, summary = '', date = null, extra = {}) => ({ id, title, summary, broadcastDate: date, kind: 'episode', program: '합성 A', sourceSystem: 'FIXTURE', sourceUrl: `https://www.ebs.co.kr/${id}`, evidenceLevel: summary ? 'SOURCE_DESCRIPTION' : 'TITLE_ONLY', navigation: { status: 'PUBLISHED', kind: 'EPISODE' }, ...extra });
const fixture = { concepts: [], stats: {}, resources: [
  ...Array.from({length: 20}, (_, i) => resource(`DATE-${i}`, `관측 기록 ${i}`, '관측 장비를 비교하는 작업을 소개한다.', `${2000+i}-03-02`, { program: i % 2 ? '합성 B' : '합성 A' })),
  resource('NONE', '날짜 없음'), resource('BAD', '잘못된 날짜', '', '2023-02-29'), resource('STAMP', '날짜 형식 미확인', '', '2020-01-02T00:00:00Z'),
  resource('SOCIAL', '민주주의와 시민 참여', '민주주의와 시민 참여를 설명한다.', '2024-02-29'),
  resource('SCIENCE', '꿀벌 생태계', '꿀벌과 식물의 생태계를 설명한다.', '2022-06-01'),
  resource('COMMON', '기후 변화와 인구', '기후 변화와 인구 문제를 다룬다.', '2022-06-02'),
  resource('UNKNOWN', '수선하는 장인', '오래된 가구를 손질하는 과정을 소개한다.'),
  resource('REPEAT', '면역', '면역'), resource('COLLECTION', '프로그램 목록', '', null, {kind:'collection', program:'목록 전용'}),
  resource('VAR-OLD', '화석 관찰', '지층에서 화석을 관찰한다.', '2010-01-01'), resource('VAR-NEW', '화석 관찰 (더빙)', '화석과 공룡을 관찰한다.', '2025-01-01'),
  resource('A-CLIP', '희귀소재', '', null, {kind:'clip'}), resource('Z-EPISODE', '희귀소재', '', null, {navigation:{status:'MATCHED',kind:'EPISODE'}})
] };
const store = { verifiedAssets: [] }, cases = [];
const search = (input = {}, catalog = fixture) => discoverTeacherContents(input, catalog, store);
const check = async (name, run) => { await run(); cases.push({ name, passed: true }); };
const all = async (input = {}, catalog = fixture) => { const first = await search(input, catalog), rows = [...first.results]; for(let page=2;page<=first.pages;page++) rows.push(...(await search({...input,page}, catalog)).results); return rows; };
async function main() {
  const before = await hashes();
  await check('대표 후보 없이 빈 검색 전체 목록·페이지 제공', async () => { const r=await search(); assert.equal(r.curation,undefined); assert.ok(r.total>9); assert.equal(r.results.length,9); assert.ok(r.filters.concept.some(option=>option.value==='unclassified')); });
  await check('관련순은 유형·링크 확인 가점 없이 원문 근거만 사용', async () => { const r=await search({q:'희귀소재'}); assert.deepEqual(r.results.map(item=>item.id),['A-CLIP','Z-EPISODE']); assert.equal(r.results[0].score,r.results[1].score); assert.match(r.results[0].relevanceReason,/제목에서/); });
  await check('날짜 정렬은 모든 페이지에 적용·동점 안정·미확인은 양방향 마지막', async () => {
    for(const sort of ['newest','oldest']) { const rows=await all({sort}); const dates=rows.map(item=>validDate(item.broadcastDate)); const known=dates.filter(Boolean); assert.deepEqual(known,[...known].sort((a,b)=>sort==='newest'?b.localeCompare(a):a.localeCompare(b))); assert.ok(dates.slice(dates.indexOf('')).every(date=>!date)); assert.equal(new Set(rows.map(item=>item.id)).size,rows.length); assert.deepEqual((await all({sort})).map(item=>item.id),rows.map(item=>item.id)); }
  });
  await check('연도·범위 경계·윤년·날짜 미확인과 수집일 분리', async () => { assert.equal((await search({year:'2024'})).total,1); assert.equal((await search({from:'2024-02-29',to:'2024-02-29'})).results[0].id,'SOCIAL'); const unknown=await all({year:'unknown'}); for(const id of ['NONE','BAD','STAMP']) assert.ok(unknown.some(item=>item.id===id)); assert.ok(unknown.every(item=>!validDate(item.broadcastDate))); });
  await check('필터 후 판본 묶음·선택 정렬에 해당하는 판본을 먼저 표시', async () => { assert.equal((await search({q:'화석',sort:'newest'})).results[0].id,'VAR-NEW'); assert.equal((await search({q:'화석',sort:'oldest'})).results[0].id,'VAR-OLD'); const r=await search({q:'화석',year:'2025'}); assert.equal(r.total,1); assert.equal(r.results[0].alternatives.length,0); assert.equal(r.results[0].id,'VAR-NEW'); });
  await check('원본 카탈로그의 같은 제목 다른 날짜도 기간 검색에 보존', async () => {
    const broadcasts=[resource('BCAST-OLD','같은 회차','', '2010-01-01'),resource('BCAST-NEW','같은 회차','', '2025-01-01')];
    const catalog=buildCatalog([], {contents:[],searchProjection:[]},{resources:[],concepts:[],version:'test'}, broadcasts);
    assert.equal(catalog.resources.length,1); assert.equal(catalog.searchVariants.length,1);
    const r=await search({year:'2025'},catalog); assert.equal(r.results[0].id,'BCAST-NEW');
    assert.throws(()=>buildCatalog([], {contents:[],searchProjection:[]},{resources:[],concepts:[],version:'test'},[broadcasts[0],{...broadcasts[1],sourceUrl:'https://invalid.example/video'}]),/출처/);
  });
  await check('등록된 60개 개념의 묶음·직접 언급 필터·추론은 제외', async () => { assert.ok(concepts.every(concept=>groups.some(group=>group.ids.includes(concept.id)))); const r=await search({conceptGroup:'biology',concept:'bee'}); assert.equal(r.results[0].id,'SCIENCE'); const onlyBee={...fixture,resources:[resource('B','꿀벌의 하루')]}; assert.equal((await search({concept:'ecosystem'},onlyBee)).total,0); });
  await check('어휘 밖 자료도 자유 검색·미분류 필터·핵심 태그 최대3개', async () => { const r=await search({q:'수선',concept:'unclassified'}); assert.equal(r.results[0].id,'UNKNOWN'); assert.deepEqual(r.results[0].coreTags,[]); for(const item of await all()) { assert.ok(item.coreTags.length<=3); for(const tag of item.coreTags) assert.equal(item[tag.evidence.field].slice(tag.evidence.start,tag.evidence.end),tag.evidence.quote); } });
  await check('교과 탐색은 원문 개념 분류·공통과 미분류 표시', async () => { assert.ok((await all({subject:'사회'})).every(item=>item.semanticTags.some(tag=>tag.subject==='사회'))); assert.deepEqual((await all({subject:'공통'})).map(item=>item.id),['COMMON']); assert.ok((await all({subject:'unclassified'})).every(item=>!item.semanticTags.length)); });
  await check('소개문 있음과 제목 반복 구분·페이지 확인 필터', async () => { assert.ok((await all({description:'title'})).some(item=>item.id==='REPEAT')); assert.ok(!(await all({description:'present'})).some(item=>item.id==='REPEAT')); assert.deepEqual((await all({access:'direct'})).map(item=>item.id),['Z-EPISODE']); });
  await check('프로그램 선택과 목록 전용 프로그램·개별 자료 구분', async () => { assert.ok((await all({program:'합성 B'})).every(item=>item.program==='합성 B')); assert.equal((await search({program:'목록 전용'})).total,0); assert.equal((await search({program:'목록 전용',kind:'collection'})).results[0].id,'COLLECTION'); const named=await search({q:'전용어'},{...fixture,resources:[resource('PROGRAM','독립된 제목','',null,{program:'전용어 방송'})]}); assert.match(named.results[0].relevanceReason,/프로그램명에서/); });
  await check('필터 건수는 자기 조건만 제외한 전체 결과·판본 기준', async () => {
    const input={program:'합성 A',year:'2022',description:'present'}; const r=await search(input);
    for(const key of ['kind','program','concept','subject','description','curriculum','access']) for(const option of r.filters[key]) assert.equal(option.count,(await search({...input,[key]:option.value})).total,`${key}:${option.value}`);
    for(const option of r.filters.year) assert.equal(option.count,(await search({...input,year:option.value})).total,`year:${option.value}`);
  });
  await check('일치 자료0에도 선택 조건·해제 가능한 필터 목록 보존', async () => { const r=await search({q:'수선',concept:'bee'}); assert.equal(r.total,0); assert.equal(r.concept,'bee'); assert.equal(r.filters.concept.find(item=>item.value==='unclassified').count,1); assert.match(r.emptyMessage,/해제/); });
  await check('알 수 없는 필터·역전 기간·불가능 날짜·중복 기간 입력 거절', async () => { for(const input of [{sort:'recommended'},{concept:'fake'},{subject:'초5'},{year:'어제'},{from:'2023-02-29'},{from:'2025-01-01',to:'2024-01-01'},{year:'2020',from:'2020-01-01'},{conceptGroup:'biology',concept:'democracy'},{program:'없음'}]) await assert.rejects(search(input)); });
  await check('기존 대표 보기 URL도 동일 단일 목록·목록 조건 보존', async () => { const before=await search({q:'관측',page:2,sort:'oldest'}), after=await search({q:'관측',page:2,sort:'oldest',view:'representatives',browse:'all'}); assert.deepEqual(after.results,before.results); assert.equal(after.page,2); });
  await check('기존 실제 저장소4개 불변·새 승인 없음', async () => { assert.deepEqual(await hashes(),before); });
  await fs.writeFile('docs/r07-01-filter-check.json',JSON.stringify({date:new Date().toISOString(),cases,protectedHashes:before,paidApiCalls:0,scope:'합성 자료 기능 검사. 교육과정 정확도/교사 효용 평가 아님'},null,2)+'\n');
  console.log(`R07-01 정렬·필터 계약 ${cases.length}개 통과`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
