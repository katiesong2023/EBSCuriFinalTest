const fs=require('node:fs/promises'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {loadDiscoveryCatalog}=require('./discovery-catalog');
const {discoverTeacherContents}=require('./teacher-discovery');
const {parseDiscoveryIntent}=require('./discovery-intent');
const {requestRelationEvidence}=require('./request-relation-evidence');
const {extractGeographicScope,geographicScopeEvidence}=require('./search-geographic-scope');
async function main(){
 const reference=JSON.parse(await fs.readFile('docs/r07-19-geography-review-inputs.json','utf8'));
 const c=await loadDiscoveryCatalog(),rows=[],cases=[];
 for(const previous of reference.rows){const response=await discoverTeacherContents({q:previous.query},c);const top=[];
  for(let page=1;page<=Math.min(3,response.pages);page++){const r=page===1?response:await discoverTeacherContents({q:previous.query,page:String(page)},c);top.push(...r.results);}
  assert.equal(response.retrieval.semantic,'LOCAL_E5');
  if(response.understanding.constraints.geographicScope?.required.includes('DOMESTIC'))assert.ok(top.every(x=>x.geographicEvidence.matches && x.geographicEvidence.evidence.some(e=>e.scope==='DOMESTIC')));
  rows.push({id:previous.id,query:previous.query,before:previous.total,after:response.total,retrieval:response.retrieval,understanding:response.understanding,
   knownRelevantCandidate:previous.knownRelevantCandidate?{...previous.knownRelevantCandidate,foundInTop20:top.slice(0,20).some(x=>x.id===previous.knownRelevantCandidate.id)}:null,
   top20:top.slice(0,20).map(x=>({id:x.id,title:x.title,summary:x.summary,sourceUrl:x.evidenceUrl,geographicEvidence:x.geographicEvidence,requestRelation:x.requestRelation,explanation:x.searchExplanation}))});
 }
 assert.ok(rows.find(r=>r.id==='V01').knownRelevantCandidate.foundInTop20);cases.push('확인된 한라산 후보 누락 복구');
 for(const id of ['V01','V02','V03','V06'])assert.ok(rows.find(r=>r.id===id).top20.some(x=>x.id==='GEO-PARK-HALLA'));cases.push('국내 요청4형식 후보 발견·국내 단서·불명 보류');
 assert.ok(rows.find(r=>r.id==='V02').top20.every(x=>!x.title.includes('과테말라')));cases.push('과테말라 국내 조건 위반 차단');
 const v4=rows.find(r=>r.id==='V04').top20;assert.equal(v4[0].id,'GEO-PARK-HALLA');assert.ok(v4[0].requestRelation.rank>v4.find(x=>x.title.includes('빗물')).requestRelation.rank);cases.push('지형 직접 언급과 주변 물 이용의 순위/확인 구분');
 const animal=parseDiscoveryIntent('낮과 밤에 활동하는 동물을 비교하는 영상');assert.ok(!animal.terms.includes('자전'));assert.ok(animal.expansions.every(x=>x.term!=='지구 자전'));cases.push('낮/밤 동물 활동을 자전으로 바꾸지 않음');
 assert.ok(parseDiscoveryIntent('화산지형에 해당하는 우리나라 지역 수업자료').terms.every(t=>!['해당하','수업자료'].includes(t)));cases.push('요청 문법·자료 복합어 분리');
 const request=parseDiscoveryIntent('화산 활동으로 만들어진 지형을 설명하는 영상');
 const trueItem={summary:'용암이 굳어 형성된 지형과 분화구의 모양을 설명합니다.'};
 const unrelated={summary:'파카야 화산에 오르고, 물과 바위의 상호작용으로 만들어진 카르스트 지형을 만난다.'};
 assert.equal(requestRelationEvidence(trueItem,request,[{id:'volcano'}]).status,'RELATION_TEXT_CUE');assert.notEqual(requestRelationEvidence(unrelated,request,[{id:'volcano'}]).status,'RELATION_TEXT_CUE');cases.push('화산 형성과 물/바위 카르스트 원인 혼동 차단');
 const domestic=extractGeographicScope('우리나라 화산 지형 해외 사례는 제외해줘');assert.deepEqual(domestic.required,['DOMESTIC']);assert.ok(!geographicScopeEvidence({title:'화산',summary:'장소를 확인하지 못했습니다.'},domestic).matches);assert.ok(!geographicScopeEvidence({title:'한라산과 과테말라',summary:''},domestic).matches);cases.push('해외 제외·국내 불명·국내/해외 혼합 보류');
 assert.equal((await discoverTeacherContents({q:'국내 화산 블루드래곤가상물질을 모두 설명하는 영상'},c)).total,0);cases.push('국내 조건과 미지 고유명/명시 AND 동시 보존');
 for(const [file,hash]of Object.entries(reference.beforeHashes))assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),hash);cases.push('원본4저장소 SHA 보존');
 await fs.writeFile('docs/r07-19-geography-regression.json',JSON.stringify({generatedAt:new Date().toISOString(),rows,cases,paidApiCalls:0,scope:'사용자 독립 검토10질문을 새 개발 회귀로 사용. 변경 후 원문 적합성 판단은 구현 에이전트 대조이며 새로운 독립 정답률 표본이 아니다.'},null,2)+'\n');console.log(rows.map(r=>({id:r.id,before:r.before,after:r.after,semantic:r.retrieval.semantic})));console.log(cases.length,'contracts passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
