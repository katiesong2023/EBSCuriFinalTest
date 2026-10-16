const assert=require('node:assert/strict'),fs=require('node:fs');
const {partialRecheckIndices,recheckPartialCandidates}=require('./condition-candidate-recheck');
const {packetFor}=require('./condition-source-packets');const {rankingContext}=require('./request-ranking-context');
const response=value=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
(async()=>{
const contract={accepted:true,unresolved:false,query:'생물의 관계',contentQuery:'생물의 관계',searchQuery:'생물 관계',context:rankingContext('생물의 관계'),segments:[{text:'생물의 관계',role:'content'}],requirements:[{anchors:[0],meaning:'생물 사이의 관계를 다룬다',kind:'content'}]};
const candidates=Array.from({length:5},(_,i)=>packetFor({id:'fixture-'+i,title:'관계 관찰 '+i,summary:'두 생물 사이의 관계를 실제 사례로 설명한다.',program:'합성 다큐',kind:'episode'},contract));
const review={accepted:true,results:[],assessments:candidates.map((_,i)=>({i,state:['partial'],evidence:[[0]],presentation:'general'}))};const cases=[];
assert.deepEqual(partialRecheckIndices(contract,candidates,review),[0,1,2]);cases.push('내용 부분 일치만 상위3개로 제한');
for(const state of ['unknown','contradicted'])assert.deepEqual(partialRecheckIndices(contract,candidates,{...review,assessments:[{i:0,state:[state]}]}),[]);
for(const kind of ['duration','scene','exclusion','format'])assert.deepEqual(partialRecheckIndices({...contract,requirements:[{...contract.requirements[0],kind}]},candidates,review),[]);cases.push('미확인·불일치·시간·장면·제외·형식 부분 판정은 승격 재검사하지 않음');
let calls=0;const result=await recheckPartialCandidates(contract,candidates,review,async prepared=>{calls++;const packet=JSON.parse(prepared.payload.input[1].content);assert.equal(packet.candidates.length,1);assert.equal(packet.candidates[0].i,0);assert(packet.candidates[0].facts.some(f=>f.text===candidates[calls-1].item.title));return response({assessments:[{i:0,state:['yes'],evidence:[[1]],presentation:'general'}],order:[0]});});assert.equal(calls,3);assert.equal(result.results.length,3);cases.push('각 후보 원문만 재검사·유효한 인용과 전체 조건 통과 필요');
const bad=await recheckPartialCandidates(contract,candidates,review,async()=>response({assessments:[{i:0,state:['yes'],evidence:[[999]],presentation:'general'}],order:[0]}));assert.equal(bad.results.length,0);cases.push('원문 없는 yes는 추가 안 함');
const existing={...review,results:[{id:'previously-verified'}]};const failed=await recheckPartialCandidates(contract,candidates,existing,async()=>{throw Error('offline');});assert.deepEqual(failed.results,existing.results);assert.equal(failed.rechecks.length,1);cases.push('추가 검사 실패에도 이미 검증한 결과 유지·반복 실패 중단');
fs.writeFileSync('docs/r12-40-parasitism-recheck-checks.json',JSON.stringify({passed:cases.length,failed:0,cases,paidCalls:0,whole370Test:'NOT_RUN_USER_INSTRUCTION'},null,2)+'\n');console.log(JSON.stringify({passed:cases.length,failed:0,paidCalls:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
