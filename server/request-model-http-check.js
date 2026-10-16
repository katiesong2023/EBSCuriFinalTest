const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const {createAdminBrowserFixture}=require('./admin-browser-fixture');
async function main(){
 const fixture=await createAdminBrowserFixture();const cases=[];
 try{
  const sample=JSON.parse(await fs.readFile('docs/r07-19-request-contract-development-cases.json','utf8')).rows.find(r=>r.id==='Q01');
  const input={q:sample.query,kind:'lesson',program:'EBS 중학 국립공원',sort:'oldest'};
  const post=async body=>{const response=await fetch(fixture.base+'/api/curi/discover/model-preparation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const first=await post({input});assert.equal(first.status,200);assert.equal(first.data.requestExecution.status,'LOCAL_ONLY');assert.equal(first.data.requestExecution.preparationA.status,'PREPARED_NOT_CALLED');assert.equal(first.data.requestExecution.preparationB,undefined);cases.push('A 미호출 준비와 기본 로컬 경로');
  const second=await post({input,aResponse:sample.expected});assert.equal(second.status,200);assert.equal(second.data.requestExecution.status,'SUPPLIED_CONTRACT_APPLIED');assert.equal(second.data.program,input.program);const batch=JSON.parse(second.data.requestExecution.preparationB.payload.input[1].content);assert.equal(batch.candidates.length,1);assert.equal(batch.candidates[0].candidateId,'GEO-PARK-HALLA');cases.push('A 전달응답→선택조건을 유지한 B 후보 준비');
  const scoped=await post({input:{...input,standard:'6사08-01'},aResponse:sample.expected});assert.equal(scoped.status,200);assert.equal(scoped.data.total,0);assert.equal(scoped.data.requestExecution.preparationB.status,'SKIPPED_NO_CANDIDATES');cases.push('공식 기준 교집합 밖 후보는 B 요청에서도 제외');
  const hard=new Set(['geography','program','form','date','duration','curriculum','scene','subtitles']);
  const b={version:'curi-candidate-review-v1',requestFingerprint:batch.requestFingerprint,reviews:batch.candidates.map(c=>({candidateId:c.candidateId,sourceFingerprint:c.sourceFingerprint,judgment:'SUITABLE',selectionReason:'한라산 화산 지형의 지역 사례를 소개문에서 확인합니다.',requirements:c.systemRequirements.filter(r=>['required','excluded'].includes(r.mode)).map(r=>({clauseId:r.clauseId,status:hard.has(r.kind)?'UNKNOWN':'MATCH',quotes:hard.has(r.kind)?[]:[{field:'summary',start:0,end:c.summary.length,quote:c.summary}]}))}))};
  const third=await post({input,aResponse:sample.expected,bResponse:b});assert.equal(third.status,200);assert.equal(third.data.requestExecution.candidateReview.status,'SUPPLIED_REVIEW_APPLIED');assert.equal(third.data.results[0].candidateReview.selectionReason,b.reviews[0].selectionReason);assert.equal(third.data.program,input.program);assert.equal(third.data.sort,input.sort);cases.push('B 실제HTTP 원문검증·선택이유·정렬/필터 보존');
  const changed=structuredClone(b);changed.reviews[0].sourceFingerprint='old';const wrong=await post({input,aResponse:sample.expected,bResponse:changed});assert.equal(wrong.data.requestExecution.candidateReview.status,'FALLBACK_INVALID_REVIEW');assert.equal(wrong.data.results[0].candidateReview,undefined);cases.push('변경 원문/잘못된 B는 기존 후보로 복구');
  const v2=structuredClone(sample.expected);v2.version='curi-request-v2';const rejected=await post({input,aResponse:v2});assert.equal(rejected.data.requestExecution.status,'FALLBACK_INVALID');assert.equal(rejected.data.program,input.program);cases.push('제품v1 유지·v2 미채택');
  assert.equal((await post({input:{...input,lockedConditions:[]}})).status,400);assert.equal((await post({input,allowExternal:true})).status,400);assert.equal((await fetch(fixture.base+'/api/curi/discover/model-preparation')).status,405);assert.equal((await fetch(fixture.base+'/api/admin/workspace')).status,401);cases.push('외부실행/선택조건 주입 거절·관리 권한 보존');
  assert.equal(third.data.requestExecution.paidApiCalls,0);cases.push('외부 모델/유료 호출0');
  await fs.writeFile('docs/r07-19-model-preparation-http-check.json',JSON.stringify({date:'2026-10-14',passed:cases.length,cases,paidApiCalls:0,scope:'복제서버·수작성A/B응답·실제HTTP 경로. 실제모델/의미품질/브라우저시각검증 아님.'},null,2)+'\n');console.log(cases.length,'HTTP offline checks passed');
 }finally{await fixture.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
