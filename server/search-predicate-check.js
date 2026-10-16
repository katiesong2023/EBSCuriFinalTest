// 의미 후보와 필수 조건의 경계를 검사한다. 합성 계약 검사를 실제 정확도 평가로 세지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const semantic = require('./broadcast-semantic-index');
const previous = semantic.semanticCandidates;
semantic.semanticCandidates = async catalog => ({ status:'CONTRACT_FIXTURE',elapsedMs:0,matches:new Map(catalog.resources.map(r=>[r.id,{similarity:r.similarity,evidence:{field:'summary',start:0,end:r.summary.length,quote:r.summary}}])) });
const { discoverContents } = require('./discovery-search');
const { isContentPredicate } = require('./request-predicates');
const resource = {id:'water',title:'물의 증발',summary:'물이 증발하여 기체인 수증기로 바뀐다.',program:'합성 계약',kind:'episode',sourceUrl:'https://www.ebs.co.kr/test',similarity:0.91};
const catalog = {resources:[resource],concepts:[]};
const search = (q, source = catalog) => discoverContents({q},source,{includeCandidates:true,diagnostics:true});
(async()=>{
  const result = await search('물이 마르는 과정');
  assert.equal(result.total,1);
  assert.equal(result.candidates[0].semanticRetrieval.predicateDetails[0].status,'UNCONFIRMED');
  assert.equal((await search('물이 마르는 은빛가상조약')).total,0);
  assert.equal((await search('물 그리고 마르는')).total,0);
  assert.equal((await search('물이 마르는 과정, 증발 제외')).total,0);
  assert.equal((await search('물이 마르는 애니메이션만')).total,0);
  assert.equal((await search('마르는')).total,0);
  assert.equal((await search('물이 마르는 과정',{resources:[{...resource,similarity:0.8}],concepts:[]})).total,1,'직접 원문 근거를 임베딩 점수로 버리지 않음');
  assert.equal((await discoverContents({q:'물이 마르는 과정'},catalog,{useSemantic:false})).total,1,'원문 의미 근거는 임베딩의 상위80개와 무관하게 유효함');
  assert.equal((await search('물이 마르는 과정',{resources:[{...resource,title:'물의 이용',summary:'물이 생활에 중요하며 물을 아껴 써야 한다.',similarity:0.99}],concepts:[]})).total,0,'유사도만 높고 동작 근거가 없는 자료 차단');
  assert.equal((await search('아이가 줄어들면 우리 동네는 어떻게 될까',{resources:[{...resource,title:'아이의 동네',summary:'아이들이 사는 동네 환경과 가족의 일상을 소개한다.',similarity:0.99}],concepts:[]})).total,0,'주제 단어만 같은 자료로 감소 관계를 대체하지 않음');
  const qualified = {resources:[{...resource,id:'global',title:'기업 브랜드',summary:'세계적인 기업의 글로벌 브랜드를 소개한다.'},
    {...resource,id:'regional',title:'마을의 브랜드',summary:'마을의 특산물을 지역 브랜드로 발전시킨 주민들의 이야기를 소개한다.'}],concepts:[]};
  const local = await search('지역 브랜드',qualified);
  assert.deepEqual(local.results.map(r=>r.id),['regional'],'지역이라는 수식 조건을 일반 기업 브랜드로 바꾸지 않음');
  const either = await search('지역 브랜드 또는 소금',{resources:[...qualified.resources,{...resource,id:'salt',title:'소금',summary:'바닷물에서 소금을 얻는 염전.'}],concepts:[]});
  assert.ok(either.results.some(r=>r.id==='salt'),'다른 OR 분기에 지역 수식 조건을 강제하지 않음');
  for (const noun of ['비행기','물고기','전기','공기','루미나규약','블루드래곤광석이']) assert.equal(isContentPredicate(noun),false);
  const report = {passed:19,failed:0,paidApiCalls:0,scope:'합성 의미 후보 계약. 주제·고유명·명시AND·OR·제외·장르·임계값·동작 근거·지역 수식·후보 없음 경계 검사.'};
  fs.writeFileSync('docs/r12-40-predicate-checks.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{semantic.semanticCandidates=previous;});
