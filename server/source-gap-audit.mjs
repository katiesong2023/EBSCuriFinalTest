// R07-20: 공식 회차의 공개 텍스트만 대조한다. 원본 DB·웹 스크립트·영상은 실행/변경하지 않는다.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {DatabaseSync}=require('node:sqlite');
const {fingerprint}=require('./broadcast-store');
const {officialUrl,sameEpisode}=require('./source-enrichment');
const {assessSourceText}=require('./source-text-quality');
const normalize=value=>String(value||'').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const args=new Map(process.argv.slice(2).map(value=>{const i=value.indexOf('=');return [value.slice(2,i),value.slice(i+1)];}));
const input=args.get('input');
if(!input)throw new Error('--input=검토JSON 필요');
const reviews=JSON.parse(await fs.readFile(input,'utf8')).reviews.filter(r=>r.judgment==='원문부족'&&(!args.get('only')||args.get('only').split(',').includes(r.candidateId)));
if(!reviews.length||reviews.length>30)throw new Error('원문 부족 검토1~30개 필요');
const database='server/data/broadcast-catalog.sqlite';
const db=new DatabaseSync(database,{readOnly:true});
const rows=reviews.map(review=>({review,stored:db.prepare('SELECT * FROM episodes WHERE id=?').get(review.candidateId)}));db.close();
const protectedFiles=['server/data/curi-store.json',database,'server/data/semantic-layer.sqlite','server/data/automatic-assets.sqlite'];
const digests=async()=>Object.fromEntries(await Promise.all(protectedFiles.map(async file=>[file,fingerprint(await fs.readFile(file))])));
const before=await digests();
const {chromium}=await import(process.env.CURI_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CURI_BROWSER_EXECUTABLE?{executablePath:process.env.CURI_BROWSER_EXECUTABLE}:{})});
const context=await browser.newContext(),parser=await context.newPage();
const reportPath=args.get('report')||'docs/r07-20-source-gap-audit.json';
const report={startedAt:new Date().toISOString(),rows:[],paidApiCalls:0,applied:false,playback:'NOT_CHECKED',supplements:'SEARCH_LEADS_ONLY',protectedStoreBefore:before};
const stopped=new Set();
try{
 for(const {review,stored} of rows){
  const record={caseId:review.caseId,id:review.candidateId,reviewOrigin:review.judgmentOrigin,initialJudgment:review.judgment,checkedAt:new Date().toISOString(),stored};
  try{
   if(!stored||!officialUrl(stored.url))throw new Error('공식 원본 회차 없음');
   const host=new URL(stored.url).hostname;if(stopped.has(host))throw new Error('접근 제한으로 호스트 중단');
   await new Promise(resolve=>setTimeout(resolve,1100));
   const target=args.get('surface')==='tv'?new URL('https://www.ebs.co.kr/tv/show'):new URL(stored.url);
   if(args.get('surface')==='tv')for(const [key,value] of Object.entries({courseId:stored.course_id,stepId:stored.step_id,lectId:stored.lect_id}))target.searchParams.set(key,value);
   if(args.get('surface')==='prod'){const prodId=new URL(stored.source_url).searchParams.get('prodId');if(prodId)target.searchParams.set('prodId',prodId);}
   record.fetchedUrl=target.href;
   const response=await context.request.get(target.href,{timeout:20000,maxRedirects:0});
   record.httpStatus=response.status();record.finalUrl=response.url();record.redirectUrl=response.headers().location||null;
   if([401,403,429].includes(record.httpStatus))stopped.add(host);
   const html=await response.text();await response.dispose();record.responseHash=fingerprint(html);
   if(record.httpStatus!==200)throw new Error('HTTP '+record.httpStatus);
   record.detail=await parser.evaluate(html=>{
    const doc=new DOMParser().parseFromString(html,'text/html');
    const decode=value=>{const el=doc.createElement('textarea');el.innerHTML=value||'';const first=el.value;el.innerHTML=first;return el.value;};
    let video;for(const script of doc.querySelectorAll('script[type="application/ld+json"]')){try{const data=JSON.parse(script.textContent);if(data['@type']==='VideoObject')video=data;}catch{}}
    return {title:decode(video?.name||doc.querySelector('meta[property="og:title"]')?.content||''),description:decode(video?.description||doc.querySelector('.player_title_wrap > p')?.textContent||'').trim(),url:doc.querySelector('meta[property="og:url"]')?.content||video?.embedUrl||'',durationMetadata:video?.duration||null};
   },html);
   record.identityMatched=sameEpisode(stored.url,record.detail.url)&&sameEpisode(stored.url,record.finalUrl)&&normalize(stored.title)===normalize(record.detail.title);
   record.beforeQuality=assessSourceText(stored.title,stored.synopsis);record.afterQuality=assessSourceText(stored.title,record.detail.description);
   record.status=!record.identityMatched?'IDENTITY_UNCONFIRMED':record.afterQuality.detailedMappingAllowed&&!record.beforeQuality.detailedMappingAllowed?'RECOVERABLE_COLLECTION_GAP':record.detail.description===stored.synopsis?'DETAIL_UNCHANGED_INSUFFICIENT':'DETAIL_TEXT_STILL_INSUFFICIENT';
   record.nextAction=record.status==='RECOVERABLE_COLLECTION_GAP'?'R07-21: 기존 공식 상세 복구 경로로 적용·전후 비교':record.identityMatched?'R07-21: 공식 보조자료 조사; 없으면 R07-22 영상 확인':'대체 공식 주소/식별 대조 필요; 텍스트 부재로 확정 금지';
  }catch(error){record.status='ACCESS_OR_IDENTITY_UNCONFIRMED';record.error=error.message.split('\n')[0];record.nextAction='접근/식별 재확인; 공식 텍스트 없음으로 확정하지 않음';}
  report.rows.push(record);await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(record.id,record.status);
 }
 report.protectedStoreAfter=await digests();report.protectedStoresUnchanged=JSON.stringify(before)===JSON.stringify(report.protectedStoreAfter);if(!report.protectedStoresUnchanged)throw new Error('원본 동시 변경 발견');
 report.completedAt=new Date().toISOString();report.counts=Object.fromEntries([...new Set(report.rows.map(r=>r.status))].map(status=>[status,report.rows.filter(r=>r.status===status).length]));
 await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();}
