// 명시적 운영 실행만 외부 EBS 페이지를 읽는다. 스크립트·영상·로그인은 실행하지 않는다.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {openBroadcastStore,broadcastPath,fingerprint}=require('./broadcast-store');
const {applyOfficialDetail,officialUrl}=require('./source-enrichment');
const args=new Map(process.argv.slice(2).map(v=>{const at=v.indexOf('=');return at<0?[v.slice(2),true]:[v.slice(2,at),v.slice(at+1)]}));
const ids=String(args.get('ids')||'').split(',').filter(Boolean);
if(!ids.length||ids.length>30||ids.some(id=>!/^BCAST-[a-f0-9]{20}$/.test(id)))throw new Error('--ids에 방송 ID 1~30개 필요');
const reportPath=String(args.get('report')||'docs/source-enrichment-run.json');
const {chromium}=await import(process.env.CURI_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CURI_BROWSER_EXECUTABLE?{executablePath:process.env.CURI_BROWSER_EXECUTABLE}:{})});
const context=await browser.newContext();const parser=await context.newPage();
const db=openBroadcastStore();const rows=[],startedAt=new Date().toISOString();
const archive=JSON.parse(await fs.readFile(new URL('../docs/r4-source-samples.json',import.meta.url),'utf8'));
const stopped=new Set();
try{
 for(const id of ids){
  const row=db.prepare('SELECT * FROM episodes WHERE id=?').get(id);const checkedAt=new Date().toISOString();
  try{
   if(!row||!officialUrl(row.url))throw new Error('공식 원본 회차 주소 없음');
   const host=new URL(row.url).hostname;if(stopped.has(host))throw new Error('접근 제한으로 호스트 중단');
   await new Promise(r=>setTimeout(r,1100));
   const response=await context.request.get(row.url,{timeout:20000,maxRedirects:0});
   if([401,403,429].includes(response.status()))stopped.add(host);
   if(response.status()!==200)throw new Error(`HTTP ${response.status()}`);
   const html=await response.text(),finalUrl=response.url();await response.dispose();
   const detail=await parser.evaluate(html=>{
    const doc=new DOMParser().parseFromString(html,'text/html');
    const decode=value=>{const el=doc.createElement('textarea');el.innerHTML=value||'';const first=el.value;el.innerHTML=first;return el.value;};
    let video;for(const script of doc.querySelectorAll('script[type="application/ld+json"]')){try{const value=JSON.parse(script.textContent);if(value['@type']==='VideoObject')video=value;}catch{}}
    return {title:decode(video?.name||doc.querySelector('meta[property="og:title"]')?.content||''),description:decode(video?.description||doc.querySelector('.player_title_wrap > p')?.textContent||'').trim(),url:doc.querySelector('meta[property="og:url"]')?.content||video?.embedUrl||'',durationMetadata:video?.duration||null};
   },html);
   Object.assign(detail,{responseHash:fingerprint(html),finalUrl});
   const saved=archive.rows.find(r=>r.id===id);const archiveCompared=saved?{checkedAt:saved.checkedAt,sameTitle:detail.title===saved.detail.title,sameDescription:detail.description===saved.detail.description}:null;
   const result=args.has('apply')?applyOfficialDetail(db,id,detail,{checkedAt,expectedHash:row.content_hash,archiveCompared}):{id,status:'PREVIEW',detail,archiveCompared};
   rows.push(result);console.log(JSON.stringify(result));
  }catch(e){rows.push({id,status:'FAILED',checkedAt,error:e.message.split('\n')[0]});console.log(JSON.stringify(rows.at(-1)));}
  await fs.writeFile(reportPath,JSON.stringify({startedAt,checkedAt:new Date().toISOString(),applied:args.has('apply'),rows,paidApiCalls:0,playback:'NOT_CHECKED'},null,2)+'\n');
 }
}finally{db.close();await browser.close();}
