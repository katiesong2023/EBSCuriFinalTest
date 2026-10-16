const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { discoverContents } = require('./discovery-search');
const { discoverTeacherContents } = require('./teacher-discovery');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { readDataStore } = require('./data-store');
const { parseDiscoveryIntent } = require('./discovery-intent');
const { genreEvidence } = require('./discovery-genre');
const { programFormMatcher } = require('./program-form-source');
const protectedNames = ['curi-store.json','broadcast-catalog.sqlite','semantic-layer.sqlite','automatic-assets.sqlite','broadcast-programs.json'];
const hashes = () => Object.fromEntries(protectedNames.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(`server/data/${name}`)).digest('hex')]));
const entry = { name:'공식 자연 프로그램', courseId:'c1', stepId:'s1', category:'자연·과학/다큐멘터리', sourceUrl:'https://www.ebs.co.kr/tv/search/programListNew',sourcePage:1,checkedAt:'2026-09-30' };
const classify = programFormMatcher({programs:[entry]});
const resource = (id, title, summary, program='검증 프로그램', extra={}) => ({id,title,summary,program,kind:'episode',sourceUrl:`https://www.ebs.co.kr/tv/show?courseId=c1&stepId=s1&lectId=${id}`,navigation:{status:'PUBLISHED',kind:'EPISODE'},...extra});
const topic = '우주의 태양계와 행성을 탐구한다. ';
const items = [
 resource('CATEGORY','우주 관찰',topic,'EBS 공식 자연 프로그램'),
 resource('INTERVIEW','우주 이야기',topic+'전문가와 인터뷰를 통해 탐사 방법을 알아본다.'),
 resource('DEMO','우주 관찰',topic+'실험을 진행하여 현상을 보여준다.'),
 resource('DOC_INTERVIEW','우주 이야기',topic+'전문가 인터뷰를 진행한다.','다큐 검증 프로그램'),
 resource('LECTURE','우주 강의',topic+'우주 강연입니다.'),
 resource('NEWS','우주 현장',topic+'우주 탐사 뉴스 프로그램입니다.'),
 resource('TOPIC','우주 이야기',topic+'인터뷰의 기술과 실험 장비의 역사를 설명한다.'),
 resource('NEGATIVE','우주 이야기',topic+'인터뷰를 진행하지 않는다. 실험을 하지 않는다.'),
 resource('UNKNOWN','우주 이야기',topic),
 resource('LESSON_DOC','우주 다큐멘터리 제작 강의',topic,'다큐 제작 강의',{kind:'lesson'})
];
for(const item of items){const value=classify(item);if(value)item.programClassification=value;}
const catalog={version:'broadcast-form-fixture-1',concepts:[],stats:{},resources:items};
async function main(){
 const before=hashes(),cases=[];
 const check=async(name,run)=>{await run();cases.push({name,passed:true});console.log('통과:',name);};
 const find=q=>discoverContents({q},catalog);
 const ids=async q=>(await find(q)).results.map(item=>item.id).sort();
 await check('공식 프로그램 이름/EBS 생략·course/step 일치와 원문 근거',async()=>{
  const r=items[0], value=classify(r);assert.deepEqual(value.forms,['다큐멘터리']);
  assert.equal(value.category,entry.category);assert.equal(value.sourceUrl,entry.sourceUrl);
  assert.equal(genreEvidence(r)[0].status,'OFFICIAL_PROGRAM_CATEGORY');
  assert.ok((await ids('우주 다큐멘터리')).includes('CATEGORY'));
 });
 await check('다른 프로그램/과정/시즌·충돌 분류·주제 분류 상속 방지',async()=>{
  const r=items[0];assert.equal(classify({...r,program:'다른 프로그램'}),null);
  assert.equal(classify({...r,sourceUrl:r.sourceUrl.replace('c1','c2')}),null);
  assert.equal(classify({...r,sourceUrl:r.sourceUrl.replace('s1','s2')}),null);
  assert.equal(programFormMatcher({programs:[entry,{...entry,category:'애니메이션'}]})(r),null);
  assert.equal(programFormMatcher({programs:[{...entry,category:'사회·시사/문화·예술'}]})(r),null);
 });
 await check('인터뷰 요청은 실제 전달 방식에 대응·기술/장비 주제나 부정은 제외',async()=>{
  assert.deepEqual(await ids('우주 인터뷰'),['DOC_INTERVIEW','INTERVIEW']);
  assert.deepEqual(await ids('우주 대담'),['DOC_INTERVIEW','INTERVIEW']);
  assert.ok(parseDiscoveryIntent('인터뷰의 기술').terms.includes('인터뷰'));
  assert.deepEqual(parseDiscoveryIntent('인터뷰의 기술').constraints.requiredGenres,[]);
  assert.ok(!genreEvidence(resource('WITHOUT','우주 인터뷰 없는 방송',topic)).some(cue=>cue.label==='대담·인터뷰'));
 });
 await check('실험·시연 요청·장비 언급/실험 부정과 구분',async()=>{
  assert.deepEqual(await ids('우주 실험'),['DEMO']);
  assert.deepEqual(await ids('우주 시연'),['DEMO']);
  assert.deepEqual(parseDiscoveryIntent('실험 장비').constraints.requiredGenres,[]);
 });
 await check('강의·뉴스 기본 한정·강의의 다큐 단어를 다큐로 분류하지 않음',async()=>{
  assert.deepEqual(await ids('우주 강의'),['LECTURE','LESSON_DOC']);
  assert.deepEqual(await ids('우주 뉴스'),['NEWS']);
  assert.ok(!(await ids('우주 다큐')).includes('LESSON_DOC'));
 });
 await check('다큐+인터뷰는 양쪽 근거를 모두 요구·형태 OR는 명시적 선택',async()=>{
  assert.deepEqual(await ids('우주 다큐 인터뷰'),['DOC_INTERVIEW']);
  const r=await find('우주 인터뷰 또는 실험');assert.equal(r.understanding.constraints.genreOperator,'OR');
  assert.deepEqual(r.results.map(item=>item.id).sort(),['DEMO','DOC_INTERVIEW','INTERVIEW']);
 });
 await check('단일 제외/선호 요청과 명시 주제의 보존',async()=>{
  const r=await find('우주 인터뷰 같은');assert.ok(r.results.some(item=>item.id==='UNKNOWN'));
  assert.ok(!(await ids('우주 인터뷰 말고')).includes('INTERVIEW'));
  assert.equal((await find('양자중력 인터뷰')).total,0);
  assert.ok((await ids('우주')).includes('TOPIC')); // 형태가 없는 검색에서는 그대로 탐색한다.
 });
 await check('회차 인용 오프셋·공식 분류 출처·강한 강의 형식 우선',async()=>{
  for(const item of items)for(const cue of genreEvidence(item)){
   if(cue.field==='programCategory')assert.equal(cue.quote,cue.sourceText);
   else if(cue.field!=='kind')assert.equal(item[cue.field].slice(cue.start,cue.end),cue.quote);
  }
  const lecture={...items[9],programClassification:classify({...items[0],title:'우주 강의',kind:'lesson'})};
  assert.ok(!genreEvidence(lecture).some(cue=>cue.label==='다큐멘터리'));
 });
 const store=await readDataStore();
 await check('인터뷰만 요청의 전체 목록 fallback 방지·선택 기준 교집합',async()=>{
  assert.deepEqual((await discoverTeacherContents({q:'인터뷰'},catalog,store)).results.map(item=>item.id).sort(),['DOC_INTERVIEW','INTERVIEW']);
  const c={...catalog,resources:[resource('ROTATE_INTERVIEW','지구 자전 인터뷰','지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다. 전문가 인터뷰를 진행한다.'),resource('ROTATE_OTHER','지구 자전','지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.')]};
  const r=await discoverTeacherContents({q:'지구 자전 인터뷰',standard:'6과12-02'},c,store);
  assert.deepEqual(r.results.map(item=>item.id),['ROTATE_INTERVIEW']);assert.equal(r.results[0].curriculumComparison.state,'PARTIAL_SUPPORTED');
 });
 const live=[];
 await check('실제 카탈로그의 공식 분류 대응/형태 검색과 근거 확인',async()=>{
  const c=await loadDiscoveryCatalog();
  const attached=[...c.resources,...c.searchVariants].filter(item=>item.programClassification);
  assert.ok(attached.length>0);
  const matcher=programFormMatcher(JSON.parse(fs.readFileSync('server/data/broadcast-programs.json','utf8')));
  for(const item of attached) {
   if(item.sourceSystem==='EBS_NEWS') {
    assert.deepEqual(item.programClassification.forms,['뉴스·보도']);
    assert.equal(item.programClassification.match,'NEWS_ARTICLE_AND_PAGE_ID');
    assert.match(item.programClassification.sourceUrl,/^https:\/\/news\.ebs\.co\.kr\/ebsnews\/menu1\/newsAllView\/\d+\/H$/);
   } else assert.deepEqual(item.programClassification,matcher(item));
  }
  for(const q of ['생태계 다큐멘터리','인체 강의','인권 인터뷰','전기 실험','우주 뉴스','생태계 애니메이션']){
   const r=await discoverTeacherContents({q},c,store);
   assert.ok(r.results.every(item=>r.understanding.constraints.requiredGenres.every(label=>item.genreEvidence.some(cue=>cue.label===label))));
   live.push({q,total:r.total,requiredForms:r.understanding.constraints.requiredGenres,top:r.results.slice(0,3).map(item=>({title:item.title,program:item.program,evidence:item.genreEvidence}))});
  }
  live.push({officialClassificationResources:attached.length,sourceCheckedAt:JSON.parse(fs.readFileSync('server/data/broadcast-programs.json','utf8')).checkedAt});
 });
 assert.deepEqual(hashes(),before);
 fs.writeFileSync('docs/r07-13-broadcast-form-check.json',JSON.stringify({date:new Date().toISOString(),cases,live,protectedHashes:before,paidApiCalls:0,scope:'기존 공식 프로그램 목록 스냅샷·회차 원문 표현·합성 계약. 실제 영상 형태/학년 적합성 전수 확정 아님.'},null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
