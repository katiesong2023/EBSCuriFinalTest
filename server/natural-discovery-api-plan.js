// 공식 단가와 실제 평가 입력/원문 분량으로 비호출 비교안을 만든다. API 클라이언트·키 조회는 없다.
const fs=require('node:fs/promises');
const {DatabaseSync}=require('node:sqlite');
const {indexFile}=require('./broadcast-semantic-index');
async function main(){
 const results=JSON.parse(await fs.readFile('docs/r07-19-local-results.json','utf8'));
 const prompts={A:'원래 교사 요청에서 핵심 주제, 원하는 관계, 필수 AND/OR/제외, 프로그램/형태, 선호, 수업 문맥, 확인 불가 조건을 추출한다. 각 항목은 원래 요청의 구절과 대응하며 알 수 없는 고유명을 유지한다. 요청을 완화하거나 교육과정/영상 적합성을 판정하지 않는다.',
 B:'주어진 후보 ID와 자기 회차의 원문만 이용해 요청 충족/부분 적합/부적합/원문 부족을 비교한다. 주제 언급과 요구한 관계 설명을 구분한다. 인용은 해당 후보 원문의 정확한 구절과 위치를 반환한다. 후보 밖 ID, 다른 회차 인용, 존재하지 않는 내용을 반환하지 않는다.'};
 const payloads=results.rows.map(row=>({id:row.id,split:row.split,A:{instruction:prompts.A,query:row.query},B:{instruction:prompts.B,query:row.query,candidates:row.top20.slice(0,10).map(item=>({id:item.id,title:item.title,summary:item.summary.slice(0,600),sourceUrl:item.evidenceUrl}))}}));
 const measure=key=>{const sizes=payloads.map(p=>Buffer.byteLength(JSON.stringify(p[key]),'utf8'));return {meanUtf8Bytes:Math.ceil(sizes.reduce((a,b)=>a+b,0)/sizes.length),maxUtf8Bytes:Math.max(...sizes),maxInputTokenBudget:Math.max(...sizes)+1024,maxOutputTokenBudget:key==='A'?1024:4096};};
 const sizes={A:measure('A'),B:measure('B')};
 const prices=[{model:'gpt-6-luna',inputPerMillion:0.10,outputPerMillion:0.50},{model:'gpt-6.1-sol',inputPerMillion:2,outputPerMillion:10}];
 const costs=prices.map(price=>({model:price.model,...Object.fromEntries(['A','B'].map(key=>{const size=sizes[key],one=(size.maxInputTokenBudget*price.inputPerMillion+size.maxOutputTokenBudget*price.outputPerMillion)/1e6;return [key,{perSearchUpperUsd:one,trial120UpperUsd:one*120,per1000UpperUsd:one*1000}];}))}));
 const db=new DatabaseSync(indexFile,{readOnly:true});let documentBytes;try{documentBytes=db.prepare('SELECT quote FROM passages').all().reduce((sum,row)=>sum+Buffer.byteLength(row.quote,'utf8')+1024,0);}finally{db.close();}
 const report={preparedAt:new Date().toISOString(),paidApiCalls:0,apiAdapterImplemented:false,pricesSource:'https://developers.openai.com/api/docs/pricing',embeddingPriceSource:'https://developers.openai.com/api/docs/models/text-embedding-3-small',pricingChecked:'2026-10-13',prices,
  tokenLimits:'실측은 UTF-8 바이트 수이며 API 토큰 미계측이다. byte-level 토크나이저의 보수적 입력 상한으로 바이트 수+1024를 가정한다. 출력 예산에는 추론 토큰을 포함하며 실제 공급자 카운터로 재확인한다. 호스팅/세금 별도.',
  payloadSizes:sizes,costs,C:{model:'text-embedding-3-small',inputPerMillionUsd:0.02,initialCorpusUpperTokens:documentBytes,initialCorpusUpperUsd:documentBytes*.02/1e6,perQueryUpperUsd:sizes.A.maxInputTokenBudget*.02/1e6,quality:'UNMEASURED'},
  comparisons:['LOCAL_ONLY','LOCAL_PLUS_A','LOCAL_PLUS_A_PLUS_B','LOCAL_PLUS_C'],
  proposedTrial:{requests:120,candidatesPerRequest:10,summaryCharacters:600,maxRetries:0,proposedBudgetUsd:{lunaAB:2,solAB:20,C:2},approved:false},
  latency:{local:results.latencyMs,external:'미실행·미측정. 시험 시 A/B 각각 p50/p95·실패·원문/조건 오류를 측정하고 합산한다.'},
  cache:'A는 질의/모델/해석 규칙 지문, B는 질의와 후보ID/원문 지문/모델 지문, C는 원문/모델/표현 버전으로 무효화. 절감률은 실측 전 미확정.',
  outputValidation:['원문 구절 없는 조건 추가/삭제 거절','허용 후보ID만 수용','인용 field/start/end/quote 원문 대조','필수/제외/프로그램/형태를 기존 로컬 판정으로 재검사','타임아웃/예산/검증 오류 시 로컬 검색 유지'],
  remaining:'후보 관계의 일반 의미 판정과 독립 사람 관련성 심사 미완료. API 지연/품질/실패 fallback은 설계만 있으며 실행 검증을 하지 않았다.',payloads};
 await fs.writeFile('docs/r07-19-api-comparison.json',JSON.stringify(report,null,2)+'\n');console.log(costs);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
