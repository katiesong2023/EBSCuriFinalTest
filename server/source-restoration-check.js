const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {loadDiscoveryCatalog}=require('./discovery-catalog');
const {searchableSupplements}=require('./supplement-search');
const {auditResource}=require('./semantic-layer');
const {explainRequest}=require('./source-explanation');
async function main(){
 const catalog=await loadDiscoveryCatalog(),cases=[];
 const magnet=catalog.resources.find(item=>item.id==='BCAST-24cb7586692e2a707640');
 assert.equal(searchableSupplements(magnet).length,1);cases.push('공식 자막의 회차/판본/원문 해시 일치');
 const changed=structuredClone(magnet);changed.sourceSupplements[0].text+=' 가짜 근거';assert.equal(searchableSupplements(changed).length,0);cases.push('변조 자막 거절');
 assert.equal(searchableSupplements({...magnet,id:'other'}).length,0);assert.equal(searchableSupplements({...magnet,variant:'other'}).length,0);cases.push('다른 회차·판본의 자막 거절');
 const tagged=auditResource(magnet);const tag=tagged.supported.find(tag=>tag.conceptId==='magnet');assert.ok(tag);assert.equal(tag.evidence.field,'sourceSupplement');assert.equal(magnet.sourceSupplements[0].text.slice(tag.evidence.start,tag.evidence.end),tag.evidence.quote);cases.push('같은 문맥 규칙·보조 원문 위치에만 주제 태그');
 const explanation=explainRequest({...magnet,semanticTags:tagged.supported},{concepts:[{id:'magnet'}],terms:[]});assert.ok(explanation.supplementEvidence.length);assert.equal(explanation.topicEvidence.length,0);assert.match(explanation.text,/공식 보조 원문/);for(const quote of explanation.supplementEvidence)assert.equal(magnet.sourceSupplements.find(s=>s.id===quote.supplementId).text.slice(quote.start,quote.end),quote.quote);cases.push('소개문과 혼합하지 않는 요청별 인용');
 assert.ok(magnet.sourceSupplements[0].text.includes('안 붙'));assert.ok(magnet.sourceSupplements[0].text.includes('붙었'));assert.equal(magnet.playbackStatus,'NOT_CHECKED');cases.push('붙음/붙지 않음 텍스트 근거·영상 미확인 유지');
 const unrelated={...magnet,title:'합성 회차',summary:'',sourceSupplements:[]};assert.ok(!auditResource(unrelated).supported.some(tag=>tag.conceptId==='magnet'));cases.push('근거 없는 주제 승격 금지');
 await fs.writeFile('docs/r07-21-source-restoration-check.json',JSON.stringify({cases,paidApiCalls:0,playback:'NOT_CHECKED'},null,2)+'\n');console.log(cases.length,'restoration checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
