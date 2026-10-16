const fs=require('node:fs/promises');
const {loadDiscoveryCatalog}=require('./discovery-catalog');
const {sourceQualityStats,assessSourceText}=require('./source-text-quality');
const {sourceSentences}=require('./source-explanation');
const {matchingExpressions}=require('./discovery-query-language');
async function main(){
 const [baseline,keyword,local,diagnosis,api]=await Promise.all(['baseline-results','keyword-results','local-results','development-diagnosis','api-comparison'].map(async name=>JSON.parse(await fs.readFile(`docs/r07-19-${name}.json`,'utf8'))));
 const splitSummary=split=>({split,requests:baseline.rows.filter(r=>r.split===split).length,baselineEmpty:baseline.rows.filter(r=>r.split===split&&!r.total).length,keywordEmpty:keyword.rows.filter(r=>r.split===split&&!r.total).length,hybridEmpty:local.rows.filter(r=>r.split===split&&!r.total).length,precisionAt5:null,knownAnswerRecallAt20:null});
 const samples=[];
 for(const row of diagnosis.rows){
  for(const item of row.first.slice(0,2)){
   const term=row.q==='연소'?'연소':row.q==='지구 자전'?'자전':row.q==='다문화'?'다문화':row.q.includes('연소')||row.q.includes('타려면')?'연소':row.q.includes('낮')?'자전':null;
   if(!term)continue;
   const evidence=sourceSentences(item.summary).filter(s=>matchingExpressions(term,s.quote).length>0).slice(0,2);
   samples.push({request:row.q,resourceId:item.id,title:item.title,judgment:['연소','지구 자전','다문화'].includes(row.q)&&evidence.length?'SUITABLE_TOPIC':evidence.length?'PARTIAL_TOPIC_ONLY':'INSUFFICIENT_SOURCE',evidence,sourceUrl:item.evidenceUrl,reviewer:'IMPLEMENTING_AGENT',independentHumanReview:false,note:'주제 후보의 원문 직접 대조. 조건·원인·관계 설명의 충족이나 실제 영상은 확정하지 않는다.'});
  }
 }
 const catalog=await loadDiscoveryCatalog(),all=[...catalog.resources,...catalog.searchVariants];
 const gaps=local.rows.filter(r=>!r.total).map(r=>({id:r.id,query:r.query,split:r.split,reason:/블루드래곤가상물질/.test(r.query)?'EXPLICIT_UNKNOWN_CONTENT_UNMATCHED':'SOURCE_OR_RETRIEVAL_UNRESOLVED',next:'선택 조건을 유지한 상태에서 공식 회차 제목/ID가 맞는 소개문·대본·학습자료 확보 가능성을 대조한다. 현재 결과만으로 자료 미보유를 단정하지 않는다.'}));
 const enrichmentCandidates=diagnosis.rows.filter(r=>/필요한 조건|타려면|낮과 밤|산소가 부족/.test(r.q)).flatMap(r=>r.first.slice(0,2).map(item=>({resourceId:item.id,title:item.title,sourceUrl:item.evidenceUrl,request:r.q,sourceQuality:assessSourceText(item.title,item.summary),remainingRequirement:/낮|밤/.test(r.q)?'낮과 밤이 생기는 원인 설명':'연소 필요 조건·산소 부족의 생성물/문제 설명',next:'이 회차의 공식 상세 소개문·공개 대본·학습자료만 대조한다. 다른 회차 텍스트를 연결하지 않는다.'})));
 const report={generatedAt:new Date().toISOString(),splits:['development','final'].map(splitSummary),sameInputs:baseline.inputsHash===local.inputsHash&&keyword.inputsHash===local.inputsHash,sameRepresentativeCatalog:baseline.catalogHash===local.catalogHash&&keyword.catalogHash===local.catalogHash,independentHumanReview:false,teacherRequests:0,
 keywordVersusHybrid:{candidateCountChanges:local.rows.filter((r,i)=>r.total!==keyword.rows[i].total).length,top20OrderChanges:local.rows.filter((r,i)=>JSON.stringify(r.top20.map(x=>x.id))!==JSON.stringify(keyword.rows[i].top20.map(x=>x.id))).length,conclusion:'이번 보조 표본에서 의미 검색의 추가 후보 발견 효과는 관측되지 않았다. 순위 변화의 의미 품질은 미검토다. 키워드 개선과 모델 효과를 구분한다.'},
 latencyMs:{baseline:baseline.latencyMs,keyword:keyword.latencyMs,hybrid:local.latencyMs,limit:'상위20개 조회 전체 시간. 첫 질의는 초기화 포함. 후속 비교 실행과 기능 검사가 일부 겹쳐 부하가 같지 않으며 모델 순수 지연/운영 SLA로 일반화하지 않는다.'},
 coverage:sourceQualityStats(all),samples,gaps,enrichmentCandidates,apiBudget:api.proposedTrial,
 qualityLimit:'개발80/최종40 입력을 구현 전 분리했으나 한국어 조사 일부가 어색한 에이전트 작성 보조 요청이다. 독립 사람 정답이 없으며 최종 평가 이후 민감어 판정 공유 누락을 기존 공통 계약대로 수정해 재실행했다. 깨끗한 독립 의미 검증이나 관련성/누락률 개선 완료로 보고하지 않는다.',paidApiCalls:0};
 await fs.writeFile('docs/r07-19-quality-comparison.json',JSON.stringify(report,null,2)+'\n');console.log(report.splits,report.keywordVersusHybrid);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
