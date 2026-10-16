// 보조 자료가 없는 짧은 자연·과학 다큐 설명을 공식 상세 메타데이터로 재대조한다.
const fs=require('node:fs/promises');
const {openBroadcastStore,fingerprint}=require('./broadcast-store');
const {readSupplements}=require('./source-supplements');
const {assessSourceText}=require('./source-text-quality');
const {applyOfficialDetail,sameEpisode,sameTitle}=require('./source-enrichment');
const {parseDetail}=require('./repair-descriptions-collect');
const {programs}=require('./nature-description-collect');
async function main(){
 const db=openBroadcastStore(),apply=process.argv.includes('--apply');const targets=db.prepare('SELECT * FROM episodes').all().filter(row=>programs.includes(row.program)&&['none','short','repeated'].includes(assessSourceText(row.title,row.synopsis).category)&&!readSupplements(row).length);
 const {chromium}=require('/Users/yunseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext();let cursor=0,nextAt=0,requests=0;const rows=[],stopped=new Set();
 const log='docs/r12-nature-detail-fetch.jsonl';let prior=[];try{prior=(await fs.readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)}catch(e){if(e.code!=='ENOENT')throw e}const completed=new Set(prior.map(r=>r.id));rows.push(...prior);
 async function save(record){rows.push(record);await fs.appendFile(log,JSON.stringify(record)+'\n');if(rows.length%50===0)console.log('detail',rows.length,'/',targets.length)}
 try{await Promise.all(Array.from({length:4},async()=>{const parser=await context.newPage();try{while(cursor<targets.length){const row=targets[cursor++];if(completed.has(row.id))continue;const host=new URL(row.url).hostname;if(stopped.has(host)){await save({id:row.id,status:'HOST_STOPPED'});continue;}
  const checkedAt=new Date().toISOString();try{const due=Math.max(Date.now(),nextAt);nextAt=due+350;await new Promise(r=>setTimeout(r,Math.max(0,due-Date.now())));requests++;const response=await context.request.get(row.url,{timeout:20000,maxRedirects:3});try{if([401,403,429].includes(response.status()))stopped.add(host);if(response.status()!==200)throw Error('HTTP '+response.status());const html=await response.text(),detail=await parser.evaluate(parseDetail,html);Object.assign(detail,{finalUrl:response.url(),responseHash:fingerprint(html)});
   const matched=sameEpisode(row.url,detail.url)&&sameEpisode(row.url,detail.finalUrl)&&sameTitle(row,detail.title);
   const result=matched&&apply?applyOfficialDetail(db,row.id,detail,{checkedAt,expectedHash:row.content_hash}):{status:matched?'READY':'MISMATCH',previousLength:row.synopsis.length,currentLength:row.synopsis.length};await save({...result,id:row.id,title:row.title,program:row.program,checkedAt,actualTitle:detail.title,descriptionLength:detail.description.length,sourceUrl:detail.finalUrl,responseHash:detail.responseHash});
  }finally{await response.dispose()}}catch(e){await save({id:row.id,status:'FAILED',error:e.message.split('\n')[0],checkedAt})}}
 }finally{await parser.close()}}));
 }finally{await browser.close();db.close();const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;const report={date:new Date().toISOString(),apply,targets:targets.length,processed:rows.length,requestsThisRun:requests,counts,rows,paidApiCalls:0};await fs.writeFile('docs/r12-nature-detail-fetch.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined}))}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
