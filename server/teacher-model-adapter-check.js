const assert = require('node:assert/strict'), fs = require('node:fs');
const { discoverTeacherContents } = require('./teacher-discovery');
const resources = [
 { id:'intro',title:'자본주의 기초',summary:'자본주의의 뜻과 시장 경쟁을 기초부터 설명한다.',presentation:'introductory' },
 { id:'general',title:'자본주의와 시장',summary:'자본주의의 생산과 시장 경쟁을 설명한다.',presentation:'general' }
].map(r=>({...r,program:'합성 경제',kind:'episode',sourceSystem:'FIXTURE',sourceUrl:'https://www.ebs.co.kr/'+r.id,navigation:{status:'PUBLISHED',kind:'EPISODE'},semanticConditionReview:{presentation:r.presentation}}));
const catalog={concepts:[],stats:{},resources},store={verifiedAssets:[]},cases=[];let calls=0;
const provider=async()=>{calls++;return {active:true,results:[...resources].reverse(),status:'ALL_CONDITIONS_SUPPORTED',paidCalls:0,cacheHits:2};};
const search=(input,modelSearch=provider)=>discoverTeacherContents(input,catalog,store,{allowModelSearch:true,modelSearch});
(async()=>{
 let r=await search({q:'초등학교 자본주의 교육용 자료'});
 assert.equal(r.understanding.method,'LLM_SOURCE_CONDITIONS');assert.equal(r.total,2);cases.push('교사 실제 경로에 검증된 모델 결과 연결');
 const plain=await search({q:'자본주의'});assert.deepEqual(new Set(r.results.map(i=>i.id)),new Set(plain.results.map(i=>i.id)));cases.push('학교급·활용 목적이 통과 집합을 줄이지 않음');
 assert(r.filters.kind.some(f=>f.value==='episode'&&f.count===2));const filtered=await search({q:'자본주의',kind:'episode'});assert.equal(filtered.total,2);cases.push('의미 결과의 필터 개수와 필터 적용 결과 일치');
 const unavailable=await search({q:'자본주의'},async()=>({active:true,results:[],status:'SEARCH_UNAVAILABLE',paidCalls:0,cacheHits:0}));assert.equal(unavailable.total,0);assert.equal(unavailable.emptyReason,'SEARCH_UNAVAILABLE');cases.push('모델 실패를 미보유로 처리하거나 미검증 로컬 결과로 채우지 않음');
 const before=calls;await search({});await search({q:'저런 힘은 왜 생길까'});assert.equal(calls,before);cases.push('빈 질문·가리키는 대상 누락은 모델 호출 없음');
 fs.writeFileSync('docs/r12-40-teacher-model-adapter-checks.json',JSON.stringify({passed:cases.length,failed:0,cases,paidCalls:0},null,2)+'\n');console.log(JSON.stringify({passed:cases.length,failed:0,paidCalls:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
