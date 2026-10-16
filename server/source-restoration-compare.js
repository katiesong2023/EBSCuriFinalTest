// 원문 보강 전후 같은 질문·검색 옵션을 비교한다. 후보 수를 적합성 점수로 해석하지 않는다.
const fs=require('node:fs/promises');
const {loadDiscoveryCatalog}=require('./discovery-catalog');
const {discoverTeacherContents}=require('./teacher-discovery');
const {assessSourceText}=require('./source-text-quality');
async function main(){
 const [, ,inputFile,destination]=process.argv;if(!inputFile||!destination)throw new Error('입력JSON·출력JSON 필요');
 const input=JSON.parse(await fs.readFile(inputFile,'utf8')),catalog=await loadDiscoveryCatalog();
 const items=new Map([...catalog.resources,...catalog.searchVariants].map(item=>[item.id,item]));
 const resources=input.ids.map(id=>{const item=items.get(id);if(!item)throw new Error('자료 없음 '+id);return {id,title:item.title,summary:item.summary,sourceUrl:item.sourceUrl,evidenceUrl:item.evidenceUrl,quality:assessSourceText(item.title,item.summary),durationSeconds:item.durationSeconds};});
 const queries=[];
 for(const sample of input.queries){const result=await discoverTeacherContents({q:sample.query},catalog,undefined,{useSemantic:true});queries.push({id:sample.id,query:sample.query,origin:sample.origin,total:result.total,semantic:result.understanding.semantic,results:result.results.slice(0,20).map(item=>({id:item.id,title:item.title,summary:item.summary,sourceQuality:item.sourceQuality,searchExplanation:item.searchExplanation,sourceUrl:item.sourceUrl,evidenceUrl:item.evidenceUrl}))});console.log(sample.id,result.total);}
 await fs.writeFile(destination,JSON.stringify({generatedAt:new Date().toISOString(),input,resources,queries,paidApiCalls:0,modelUnderstandingMeasured:false,scope:'로컬E5/기존 교사 검색의 데이터 보강 전후. 고정 개발 질문 및 복구 단서 probe; 독립 의미 정확도 측정 아님.'},null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
