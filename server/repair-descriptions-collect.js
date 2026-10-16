// 대상 전체의 공식 HTML 메타데이터만 대조한다. 영상·로그인·외부 스크립트를 실행하지 않는다.
const fs=require('node:fs/promises'),path=require('node:path');
const {openBroadcastStore,fingerprint}=require('./broadcast-store');
const {applyOfficialDetail,officialUrl,sameEpisode}=require('./source-enrichment');
function parseDetail(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const decode=value=>{const el=doc.createElement('textarea');el.innerHTML=String(value||'');const first=el.value;el.innerHTML=first;return el.value;};
 const videos=[];const visit=v=>{if(Array.isArray(v))return v.forEach(visit);if(!v||typeof v!=='object')return;if(v['@type']==='VideoObject'||v['@type']?.includes?.('VideoObject'))videos.push(v);if(v['@graph'])visit(v['@graph']);};
 for(const s of doc.querySelectorAll('script[type="application/ld+json"]'))try{visit(JSON.parse(s.textContent))}catch{}
 const video=videos[0],metadata=decode(video?.description||''),paragraph=doc.querySelector('.player_title_wrap > p');
 // 잘린 메타 설명보다 같은 플레이어에 공개된 긴 본문을 우선한다.
 const description=paragraph&&(paragraph.textContent||'').trim().length>metadata.replace(/<[^>]*>/g,'').trim().length?decode(paragraph.innerHTML):metadata||decode(paragraph?.innerHTML||'');
 return{title:decode(video?.name||doc.querySelector('meta[property="og:title"]')?.content),description,url:decode(video?.embedUrl||video?.contentUrl||doc.querySelector('meta[property="og:url"]')?.content),durationMetadata:video?.duration||null,pageError:Boolean(doc.querySelector('.error-message'))};
}
async function main(){
 const root=path.resolve(__dirname,'..'),file=path.join(root,'docs/r12-description-repair-inventory.json'),inventory=JSON.parse(await fs.readFile(file,'utf8'));
 const log=path.join(root,'docs/r12-description-repair-fetch.jsonl'),reportFile=path.join(root,'docs/r12-description-repair-fetch.json');
 let previous=[];try{previous=(await fs.readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)}catch(e){if(e.code!=='ENOENT')throw e;}
 const latest=[...new Map(previous.map(r=>[r.id,r])).values()];
 const internalFailure=r=>r.status==='FAILED'&&/context disposed|browser has been closed|context or browser has been closed/i.test(r.error||'');
 const internalHosts=new Set(previous.filter(internalFailure).map(r=>r.host));
 const deniedHosts=new Set(previous.filter(r=>r.status==='FAILED'&&/HTTP (?:401|403|429)/.test(r.error||'')).map(r=>r.host));
 const retryTransport=process.argv.includes('--retry-transport');
 const transportFailure=r=>r.status==='FAILED'&&/Timeout|ENOTFOUND|EADDRNOTAVAIL|ECONNRESET|ECONNREFUSED/.test(r.error||'');
 const transportHosts=new Set(previous.filter(transportFailure).map(r=>r.host));
 const retained=latest.filter(r=>r.status!=='INTERRUPTED'&&!internalFailure(r)&&
  !(r.status==='HOST_STOPPED'&&internalHosts.has(r.host)&&!deniedHosts.has(r.host))&&
  !(retryTransport&&!deniedHosts.has(r.host)&&(transportFailure(r)||r.status==='HOST_STOPPED'&&transportHosts.has(r.host))));
 const completed=new Set(retained.map(r=>r.id)),rows=[...retained],targets=inventory.rows.filter(r=>!completed.has(r.id));
 const db=openBroadcastStore();
 if(!previous.length)await fs.copyFile(path.join(root,'server/data/broadcast-catalog.sqlite'),'/private/tmp/curi-description-repair-before.sqlite');
 const {chromium}=require(process.env.CURI_PLAYWRIGHT_MODULE||'/Users/yunseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CURI_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext();
 let interrupted=false;process.once('SIGTERM',()=>{interrupted=true;});process.once('SIGINT',()=>{interrupted=true;});
 const groups=Map.groupBy(targets,r=>new URL(r.url).hostname);let requests=0;const startedAt=new Date().toISOString();
 async function record(result){rows.push(result);await fs.appendFile(log,JSON.stringify(result)+'\n');if(rows.length%50===0)console.log(JSON.stringify({done:rows.length,total:inventory.targets,updated:rows.filter(r=>r.status==='UPDATED').length,failed:rows.filter(r=>['FAILED','HOST_STOPPED','MISMATCH'].includes(r.status)).length}));}
 try{await Promise.all([...groups.entries()].map(async([host,items])=>{
  let cursor=0,nextAt=0,stopped=false,failures=0;
  await Promise.all(Array.from({length:retryTransport?2:6},async()=>{
  const parser=await context.newPage();
  try{while(cursor<items.length&&!interrupted){const item=items[cursor++];
   const checkedAt=new Date().toISOString();if(stopped){await record({id:item.id,status:'HOST_STOPPED',host,checkedAt});continue;}
   const row=db.prepare('SELECT * FROM episodes WHERE id=?').get(item.id);
   if(!row||row.title!==item.title||!officialUrl(row.url)){await record({id:item.id,status:'SOURCE_CHANGED_OR_UNSUPPORTED',checkedAt});continue;}
   try{
    const due=Math.max(Date.now(),nextAt);nextAt=due+300;
    await new Promise(r=>setTimeout(r,Math.max(0,due-Date.now())));
    if(stopped){await record({id:item.id,status:'HOST_STOPPED',host,checkedAt});continue;}
    requests++;
    const response=await context.request.get(row.url,{timeout:20000,maxRedirects:3});
    try{
     if([401,403,429].includes(response.status()))stopped=true;
     if(response.status()!==200)throw Error('HTTP '+response.status());
     const html=await response.text(),detail=await parser.evaluate(parseDetail,html);Object.assign(detail,{finalUrl:response.url(),responseHash:fingerprint(html)});
     // 일부 페이지는 JSON-LD URL에 이중 인코딩을 남긴다. 같은 회차인 URL만 선택한다.
     if(!sameEpisode(row.url,detail.url)){
      const candidate=await parser.evaluate(html=>{const d=new DOMParser().parseFromString(html,'text/html');for(const s of d.querySelectorAll('script[type="application/ld+json"]'))try{const v=JSON.parse(s.textContent);if(v['@type']==='VideoObject'){const el=d.createElement('textarea');el.innerHTML=v.embedUrl||v.contentUrl||'';el.innerHTML=el.value;return el.value;}}catch{}return '';},html);
      if(sameEpisode(row.url,candidate))detail.url=candidate;
     }
     const result=applyOfficialDetail(db,row.id,detail,{checkedAt,expectedHash:row.content_hash});
     await record({...result,requestedUrl:row.url,actualTitle:detail.title,descriptionLength:detail.description.length,sourceUrl:detail.finalUrl});failures=0;
    }finally{await response.dispose();}
   }catch(error){if(/context disposed|browser has been closed|context or browser has been closed/i.test(error.message)){interrupted=true;await record({id:item.id,status:'INTERRUPTED',host,checkedAt,error:error.message.split('\n')[0]});continue;}failures++;if(failures>=4)stopped=true;await record({id:item.id,status:'FAILED',host,checkedAt,error:error.message.split('\n')[0]});}
  }}finally{await parser.close();}
  }));
 }));}finally{
  await browser.close();db.close();const counts={};for(const row of rows)counts[row.status]=(counts[row.status]||0)+1;
  const report={date:'2026-10-15',startedAt,finishedAt:new Date().toISOString(),targets:inventory.targets,processed:rows.length,requestsThisRun:requests,counts,rows,paidApiCalls:0,mediaDownloads:0};await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined}));
 }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={parseDetail};
