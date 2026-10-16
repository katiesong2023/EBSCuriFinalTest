const fs=require('node:fs'),assert=require('node:assert/strict');
const ledger=()=>JSON.parse(fs.readFileSync('docs/r12-40-llm-dollar-ledger.json'));
const base='http://127.0.0.1:3000', checks=[],responses=[];
const get=async input=>{const r=await fetch(base+'/api/curi/discover?'+new URLSearchParams({workspace:'teacher',...input}),{signal:AbortSignal.timeout(120000)});assert.equal(r.status,200);return r.json();};
(async()=>{
 const runtime=await(await fetch(base+'/api/runtime')).json();assert.equal(runtime.teacherSearchModelEnabled,true);checks.push('기본 서버의 교사 모델 검색 활성 상태');
 let before=ledger();const q='지식채널e 인권 관련 편', cached=await get({q});assert.equal(cached.understanding.method,'LLM_SOURCE_CONDITIONS');assert(cached.total>0);assert.equal(cached.requestExecution.modelSearch.paidCalls,0);assert.equal(ledger().calls.length,before.calls.length);checks.push('370 검증과 같은 실제 응답 캐시·추가 유료 호출 없음');
 const facet=cached.filters.concept.find(f=>f.value!=='all'&&f.count>0);assert(facet);const selected=await get({q,concept:facet.value});assert.equal(selected.total,facet.count);assert.equal(selected.requestExecution.modelSearch.paidCalls,0);checks.push('검색 후 양수 개념 필터의 개수·실제 결과 일치·캐시 재사용');
 before=ledger();const head=await fetch(base+'/api/curi/discover?'+new URLSearchParams({workspace:'teacher',q}),{method:'HEAD',signal:AbortSignal.timeout(120000)});assert.equal(head.status,200);const blank=await get({});assert(!blank.requestExecution?.modelSearch);assert.equal(ledger().calls.length,before.calls.length);checks.push('HEAD·빈 질문의 유료 호출 없음');
 const capitalism=await get({q:'초등학생 자본주의 교육용 자료'});assert.equal(capitalism.understanding.method,'LLM_SOURCE_CONDITIONS');assert(capitalism.total>0);responses.push({query:'초등학생 자본주의 교육용 자료',total:capitalism.total,modelSearch:capitalism.requestExecution.modelSearch,titles:capitalism.results.map(r=>r.title)});checks.push('학교급·교육용 단어 없이 자본주의 실제 원문 자료 탐색');
 before=ledger();const repeat=await get({q:'초등학생 자본주의 교육용 자료'});assert.deepEqual(repeat.results.map(r=>r.id),capitalism.results.map(r=>r.id));assert.equal(repeat.requestExecution.modelSearch.paidCalls,0);assert.equal(ledger().calls.length,before.calls.length);checks.push('같은 자연어 반복 검색의 결과·순서 보존·추가 비용 없음');
 const end=ledger();assert(end.chargedUpperUsd<=2);assert.equal(end.pending.length,0);assert.equal(end.halted,false);
 const report={passed:checks.length,failed:0,checks,responses,scope:'localhost 실제 HTTP·자본주의 진단은370 분모에 추가하지 않음. 키/관리자 비밀 출력 없음.',totalConservativeUsd:end.chargedUpperUsd,remainingApprovedUsd:2-end.chargedUpperUsd};
 fs.writeFileSync('docs/r12-40-teacher-model-http-checks.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
