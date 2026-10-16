const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {analyseLiteralText,literalSource,overlapsFigurative}=require('./source-literal');
const {discoverContents}=require('./discovery-search');
const {contentKeywords}=require('./content-keywords');
const {prepareReviewBatch,applyCandidateReview}=require('./candidate-review');
const {expressionState}=require('./request-search-plan');
const item=(id,title,summary)=>({id,title,summary,kind:'episode',program:'검사',sourceUrl:'https://www.ebs.co.kr/'+id});
const resources=[item('MILK','바다의 우유','굴을 수확하는 어민의 작업을 소개한다.'),item('REALMILK','우유 생산','우유를 생산하고 치즈를 만드는 과정을 설명한다.'),item('SEA','지식의 바다','지식의 바다라는 비유로 책과 독서를 소개한다.'),item('REALSEA','해양 탐사','바다의 해류와 해양 생물을 관찰한다.'),item('FLOOD','정보의 홍수','정보의 홍수가 넘치는 현대 사회의 미디어를 소개한다.'),item('REALFLOOD','홍수 피해','홍수가 강 주변의 마을에 미친 영향을 설명한다.'),item('MIXED','도시의 심장','도시의 심장은 시장이다. 심장의 구조와 혈액 순환을 설명한다.'),item('ECO','경제적 먹이사슬','경제적 먹이사슬을 통해 기업의 경쟁을 알아본다. 생물이라는 말도 등장한다.'),item('BIO','생물 먹이 관계','식물은 동물의 먹이가 되고 물고기는 작은 동물을 먹는다.'),item('NEW','모래시계','시간은 모래시계처럼 흐른다는 비유로 인생을 돌아본다.'),item('REALSAND','모래시계 제작','모래시계를 만들고 모래가 떨어지는 과정을 관찰한다.')];
const catalog={version:'figurative-check',concepts:[],stats:{},resources};
const cases=[];async function check(name,f){await f();cases.push(name)};
(async()=>{
 const ids=async q=>(await discoverContents({q},catalog,{useSemantic:false})).results.map(r=>r.id);
 await check('제목 은유의 우유를 일반 검색에 사용하지 않음',async()=>assert.deepEqual(await ids('우유'),['REALMILK']));
 await check('등록 개념의 지식 바다·실제 바다 구분',async()=>assert.deepEqual(await ids('바다'),['REALSEA']));
 await check('소개문 일반 어휘의 정보 홍수 제외·실제 홍수 보존',async()=>assert.deepEqual(await ids('홍수'),['REALFLOOD']));
 await check('미등록 어휘의 명시 비교를 공통 검사',async()=>assert.deepEqual(await ids('모래시계'),['REALSAND']));
 await check('같은 원문의 실제 심장 설명과 정확한 인용 보존',async()=>{const r=await discoverContents({q:'심장'},catalog,{useSemantic:false});assert.equal(r.results[0].id,'MIXED');const tag=r.results[0].semanticTags.find(t=>t.conceptId==='heart');assert.ok(tag.evidence.start>resources.find(t=>t.id==='MIXED').summary.indexOf('시장이다.'));assert.equal(r.results[0].summary.slice(tag.evidence.start,tag.evidence.end),tag.evidence.quote);});
 await check('경제 비유를 생물 관계로 승격하지 않음',async()=>assert.deepEqual(await ids('먹이 관계를 그리는 활동 전에 생물들이 먹고 먹히는 모습을 보여주고 싶어요'),['BIO']));
 await check('설명의 실제 대상과 비교에 빌린 명사를 구분',()=>{const r=analyseLiteralText('심장은 펌프처럼 혈액을 보낸다.');assert.ok(r.text.includes('심장'));assert.ok(!r.text.includes('펌프'));});
 await check('HTML·이모지·겹친 범위의 길이와 원문 위치 보존',()=>{const raw='🌊<b>지식의 바다</b>에서 꿈의 우주를 이야기한다.';const r=analyseLiteralText(raw);assert.equal(r.text.length,raw.length);for(const span of r.spans)assert.equal(raw.slice(span.start,span.end),span.quote);});
 await check('은유 후보 제거 후 OR의 실제 분기 유지',async()=>assert.deepEqual(new Set(await ids('우유 또는 홍수')),new Set(['REALMILK','REALFLOOD'])));
 await check('은유가 제외 조건을 오작동시키지 않음',async()=>{const r=await discoverContents({q:'독서 바다 제외하고'},catalog,{useSemantic:false});assert.ok(r.results.some(t=>t.id==='SEA'));});
 await check('표시 키워드에도 은유 표현이 포함되지 않음',()=>assert.ok(!contentKeywords(resources.find(t=>t.id==='SEA')).some(t=>t.label==='바다')));
 await check('기존 의미 구절의 은유 재유입을 범위 검사로 차단',()=>{const t=resources.find(t=>t.id==='FLOOD');assert.ok(overlapsFigurative(t,{field:'summary',start:0,end:t.summary.length}));assert.equal(overlapsFigurative(t,{field:'title',start:4,end:6}),true);});
 await check('원문 수정 없이 입력 변경 때 검색용 뷰 갱신',()=>{const t={title:'희망의 씨앗',summary:'희망의 씨앗을 뿌린다.'};assert.ok(!literalSource(t).title.includes('씨앗'));t.summary='씨앗이 발아하고 뿌리가 자란다.';assert.ok(literalSource(t).summary.includes('씨앗'));});
 await check('API 검토에 제외 구절 전달·은유를 문자 그대로 MATCH로 재승격 거절',()=>{
  const t={...resources.find(t=>t.id==='FLOOD'),score:1,requestRequirements:{items:[{clauseId:'c1',kind:'topic',mode:'required',label:'홍수',status:'UNKNOWN'}]}};
  const plan={version:'curi-request-v1',originalQuery:'홍수',clauses:[],expression:{op:'ref',clauseId:'c1'}};const batch=prepareReviewBatch([t],plan),source=batch.candidates[0];assert.ok(source.figurativeExpressions.length);
  const response={version:'curi-candidate-review-v1',requestFingerprint:batch.requestFingerprint,reviews:[{candidateId:t.id,sourceFingerprint:source.sourceFingerprint,judgment:'SUITABLE',selectionReason:'홍수',requirements:[{clauseId:'c1',status:'MATCH',quotes:[{field:'summary',start:0,end:t.summary.length,quote:t.summary}]}]}]};assert.equal(applyCandidateReview([t],batch,response,expressionState).execution.adopted,false);
 });
 await check('소개문으로 보류한 제목 은유도 API의 제목 인용으로 복구하지 못함',()=>{
  const t={...resources.find(t=>t.id==='NEW'),score:1,requestRequirements:{items:[{clauseId:'c1',kind:'entity',mode:'required',label:'모래시계',status:'UNKNOWN'}]}};
  const plan={version:'curi-request-v1',originalQuery:'모래시계',clauses:[],expression:{op:'ref',clauseId:'c1'}},batch=prepareReviewBatch([t],plan);
  const r={version:'curi-candidate-review-v1',requestFingerprint:batch.requestFingerprint,reviews:[{candidateId:t.id,sourceFingerprint:batch.candidates[0].sourceFingerprint,judgment:'SUITABLE',selectionReason:'제목 모래시계',requirements:[{clauseId:'c1',status:'MATCH',quotes:[{field:'title',start:0,end:t.title.length,quote:t.title}]}]}]};
  assert.equal(applyCandidateReview([t],batch,r,expressionState).execution.adopted,false);
 });
 await fs.writeFile('docs/r12-03-figurative-check.json',JSON.stringify({date:'2026-10-15',passed:cases.length,cases,paidApiCalls:0},null,2)+'\n');console.log(cases.length,'은유 검색 계약 통과');
})().catch(e=>{console.error(e);process.exitCode=1});
