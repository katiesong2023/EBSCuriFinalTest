const assert=require('node:assert/strict'),fs=require('node:fs');
const root=require('node:path').resolve(__dirname,'..');
const {topics,topicGroups,resourceTopics}=require(root+'/server/curriculum-topics');
const {getEligibleStandards}=require(root+'/server/data-quality');
const {discoverTeacherContents}=require(root+'/server/teacher-discovery');
const standards=getEligibleStandards(require(root+'/server/data/curi-store.json').curriculumStandards);
const rows=standards.map(s=>({id:s.metadata.achievementStandardId,course:s.metadata.courseId||'elementary56',topics:topics.filter(t=>t.units.includes(s.metadata.achievementStandardId.replace(/-\d+$/,''))).map(t=>t.id)}));
assert.deepEqual(Object.fromEntries(['elementary34','elementary56','middle1'].map(course=>[course,rows.filter(s=>s.course===course).length])),{elementary34:73,elementary56:78,middle1:63});
assert.ok(topics.flatMap(t=>t.units).every(unit=>standards.some(s=>s.metadata.achievementStandardId.startsWith(unit+'-'))));
assert.equal(rows.length,214);assert.ok(rows.every(s=>s.topics.length));assert.equal(new Set(topics.flatMap(t=>t.units)).size,73);assert.equal(topics.length,38);assert.equal(topicGroups.length,11);
const cases=['214개 기준·73단원 대응·38주제·11묶음'];
const resource=(id,title,summary,extra={})=>({id,title,summary,kind:'episode',program:'합성 검사',sourceUrl:'https://www.ebs.co.kr/'+id,...extra});
for(const [topic,title,summary] of [
 ['sound','소리 관찰','소리의 높낮이와 진동을 관찰한다.'],['heat','열의 이동','온도에 따라 열팽창하는 물체를 관찰한다.'],
 ['states','물의 변화','얼음이 녹아 액체가 되고 증발하는 상태 변화를 관찰한다.'],['gas','기체의 성질','압력에 따라 기체의 부피가 달라지는 현상을 설명한다.'],
 ['rights-law','법과 생활','헌법과 기본권, 재판의 절차를 소개한다.'],['culture','함께 사는 가족','다문화 가족과 이주민의 생활을 소개한다.'],
 ['asia','아시아 탐방','아시아 여러 나라의 생활을 살펴본다.'],['inquiry','과학자의 일','과학자의 과학적 탐구 과정을 소개한다.']]) {
 assert.ok(resourceTopics(resource(topic,title,summary)).includes('curriculum-'+topic),topic);cases.push(topic+' 실제 내용 분류');
}
for(const [title,summary,absent] of [['희망의 빛','희망의 빛이라는 비유로 미래를 말한다.','light'],['도시의 심장','도시의 심장은 번화가를 뜻하는 비유이다.','health'],['해녀의 물질','해녀가 전복을 잡는 물질을 소개한다.','states'],['빛을 다루지 않는다','빛을 다루지 않는 내용이다.','light']]) {
 assert.ok(!resourceTopics(resource('negative',title,summary)).includes('curriculum-'+absent),title);cases.push(title+' 제외');
}
(async()=>{
 const catalog={concepts:[],stats:{},resources:[resource('SOUND','소리 관찰','소리와 진동을 설명한다.'),resource('MAGNET','자석 관찰','자석은 철을 끌어당긴다. 자기장과 극을 관찰한다.'),resource('OTHER','수선 장인','가구를 손질한다.') ]};
 const search=input=>discoverTeacherContents(input,catalog,{verifiedAssets:[]});const all=await search({});
 for(const group of all.filters.topicChoices){assert.equal(group.count,(await search({conceptGroup:group.value})).total);for(const topic of group.concepts)assert.equal(topic.count,(await search({concept:topic.value})).total);}
 cases.push('새 주제/묶음 전부 표시 건수와 실제 검색 일치');
 assert.deepEqual((await search({concept:'curriculum-sound'})).results.map(x=>x.id),['SOUND']);assert.equal((await search({concept:'magnet'})).results[0].id,'MAGNET');assert.equal((await search({conceptGroup:'matter',concept:'magnet'})).results[0].id,'MAGNET');cases.push('새 주제 적용·기존 개념/묶음 주소 호환');
 assert.equal((await search({concept:'unclassified'})).results[0].id,'OTHER');cases.push('목록 밖 내용 자유 검색·기타 분류 유지');
 assert.ok(all.filters.topicChoices.every(g=>g.concepts.every(t=>t.curriculumUnits.length)));assert.equal(all.results.find(r=>r.id==='SOUND').curriculumStatus,'NOT_ASSESSED');cases.push('단원 대응과 영상 연계 승인 분리');
 fs.writeFileSync(root+'/docs/r12-curriculum-topics-check.json',JSON.stringify({generatedAt:new Date().toISOString(),cases,groups:topicGroups,topics:topics.map(({patterns,...t})=>t),standardMapping:rows,paidApiCalls:0},null,2)+'\n');console.log(cases.length+' curriculum topic checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
