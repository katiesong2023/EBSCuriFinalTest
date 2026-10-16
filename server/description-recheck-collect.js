// 고정된 빈/오류 소개 전체를 공식 목록·상세와 대조한다. 미디어·로그인·페이지 스크립트를 실행하지 않는다.
const fs=require('node:fs/promises');
const {openBroadcastStore,fingerprint}=require('./broadcast-store');
const {applyOfficialListDescription,applyOfficialDetail,sameEpisode,sameTitle}=require('./source-enrichment');
const {parseDetail}=require('./repair-descriptions-collect');
const {cleanGuideText,guideIssues}=require('./broadcast-guide-text');
function parseList({html,url}){
 const doc=new DOMParser().parseFromString(html,'text/html'),clean=node=>(node?.textContent||'').replace(/\s+/gu,' ').trim();
 const items=[...doc.querySelectorAll('.suh_subwrap .item')].map(node=>({title:clean(node.querySelector('.vod_title')),description:clean(node.querySelector('.vod_disk')),itemUrl:new URL(node.querySelector('a.vodlink')?.getAttribute('href')||'',url).href,sourceText:clean(node)})).filter(x=>x.title);
 return {items,lastPage:Math.max(0,...[...doc.querySelectorAll('[onclick*="paginationAK"]')].map(n=>Number(n.getAttribute('onclick').match(/\d+/)?.[0])||0))};
}
async function main(){
 const inventory=JSON.parse(await fs.readFile('docs/r12-description-recheck-inventory.json','utf8')),db=openBroadcastStore(),targets=inventory.rows.filter(r=>r.id.startsWith('BCAST-')),log=process.argv.includes('--lists-only')?'docs/r12-description-recheck-lists.jsonl':'docs/r12-description-recheck-fetch.jsonl';
 let prior=[];try{prior=(await fs.readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)}catch(e){if(e.code!=='ENOENT')throw e}
 const latest=new Map(prior.map(r=>[r.id,r])),priorChecked=new Set(prior.filter(r=>!['FAILED','HOST_STOPPED'].includes(r.status)).map(r=>r.id)),completed=new Set(prior.filter(r=>['UPDATED','UNCHANGED'].includes(r.status)).map(r=>r.id));
 const {chromium}=require('/Users/yunseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext();const hostTimes=new Map(),stopped=new Set();let requests=0;const listReports=[];
 async function fetch(url){const host=new URL(url).hostname;if(stopped.has(host))throw Error('HOST_STOPPED');const due=Math.max(Date.now(),hostTimes.get(host)||0);hostTimes.set(host,due+300);await new Promise(r=>setTimeout(r,Math.max(0,due-Date.now())));requests++;const response=await context.request.get(url,{timeout:25000,maxRedirects:3});try{if([401,403,429].includes(response.status()))stopped.add(host);if(response.status()!==200)throw Error('HTTP '+response.status());return{html:await response.text(),url:response.url()}}finally{await response.dispose()}}
 async function record(row){latest.set(row.id,row);await fs.appendFile(log,JSON.stringify(row)+'\n');if(latest.size%250===0)console.log('checked',latest.size,'/',targets.length,'updated',[...latest.values()].filter(r=>r.status==='UPDATED').length)}
 const groups=new Map();for(const item of targets.filter(r=>!completed.has(r.id)&&new URL(r.sourceUrl).hostname==='anikids.ebs.co.kr')){const u=new URL(item.sourceUrl),key=u.searchParams.get('courseId')+':'+u.searchParams.get('stepId');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
 let groupCursor=0;const groupList=[...groups.values()];
 try{
  await Promise.all(Array.from({length:5},async()=>{const parser=await context.newPage();try{while(groupCursor<groupList.length){const group=groupList[groupCursor++],first=new URL(group[0].sourceUrl),wanted=new Map(group.map(r=>[new URL(r.sourceUrl).searchParams.get('lectId'),r]));let previous='';let pages=0,reason='TARGETS_EXHAUSTED',lastPage=Math.ceil(group.length/10)+10;const emptyPages=[];
   for(let page=1;page<=Math.min(1000,lastPage)&&wanted.size;page++){const url='https://anikids.ebs.co.kr/anikids/getVodListAjax?'+new URLSearchParams({courseId:first.searchParams.get('courseId'),stepId:first.searchParams.get('stepId'),pageNumber:String(page),orderby:'NEW'});try{const response=await fetch(url),result=await parser.evaluate(parseList,{html:response.html,url:response.url});pages++;if(result.lastPage)lastPage=Math.max(lastPage,result.lastPage);const signature=JSON.stringify(result.items.map(r=>r.itemUrl));if(!result.items.length||signature===previous){emptyPages.push(page);reason='PAGES_WITHOUT_ITEMS';continue;}previous=signature;
    for(const parsed of result.items){const id=new URL(parsed.itemUrl).searchParams.get('lectId'),target=wanted.get(id);if(!target)continue;const row=db.prepare('SELECT * FROM episodes WHERE id=?').get(target.id);const outcome=applyOfficialListDescription(db,row.id,{...parsed,sourceUrl:response.url,responseHash:fingerprint(response.html)},{expectedHash:row.content_hash});await record({...outcome,title:row.title,program:row.program,checkedAt:new Date().toISOString(),sourceUrl:response.url});wanted.delete(id);if(['UPDATED','UNCHANGED'].includes(outcome.status))completed.add(row.id);}
    if(page>=lastPage){reason=emptyPages.length?'PAGES_WITHOUT_ITEMS':'LAST_PAGE';break;}
   }catch(e){console.log('list stopped',group[0].program,e.message);reason=e.message;break;}}listReports.push({program:group[0].program,courseId:first.searchParams.get('courseId'),stepId:first.searchParams.get('stepId'),pages,emptyPages,remaining:wanted.size,reason});console.log(JSON.stringify(listReports.at(-1)));
  }}finally{await parser.close()}}));
  if(process.argv.includes('--lists-only'))return;
  // 목록에 없거나 목록 설명이 불충분한 회차도 자신의 상세 원문을 대조한다.
  const remaining=targets.filter(r=>!completed.has(r.id)&&!priorChecked.has(r.id));let cursor=0;const work=Map.groupBy(remaining,r=>new URL(r.sourceUrl).hostname);
  await Promise.all([...work.entries()].map(async([host,items])=>{let at=0,failures=0;await Promise.all(Array.from({length:3},async()=>{const parser=await context.newPage();try{while(at<items.length){const target=items[at++],checkedAt=new Date().toISOString();if(stopped.has(host)){await record({id:target.id,status:'HOST_STOPPED',checkedAt});continue;}try{const row=db.prepare('SELECT * FROM episodes WHERE id=?').get(target.id);const response=await fetch(row.url),detail=await parser.evaluate(parseDetail,response.html);Object.assign(detail,{finalUrl:response.url,responseHash:fingerprint(response.html)});
   const matched=sameEpisode(row.url,detail.url)&&sameEpisode(row.url,detail.finalUrl)&&sameTitle(row,detail.title);
   const useful=cleanGuideText(detail.description)&&!guideIssues(detail.description).length;
   const result=matched&&useful?applyOfficialDetail(db,row.id,detail,{expectedHash:row.content_hash}):{status:matched?'INSUFFICIENT':'MISMATCH'};
   await record({...result,id:row.id,title:row.title,program:row.program,checkedAt,actualTitle:detail.title,descriptionLength:detail.description.length,sourceUrl:response.url});failures=0;
  }catch(e){failures++;if(failures>=4)stopped.add(host);await record({id:target.id,status:'FAILED',error:e.message.split('\n')[0],checkedAt})}}}finally{await parser.close()}}));}));
 }finally{await browser.close();db.close();const rows=[...latest.values()],counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;const report={date:new Date().toISOString(),targets:targets.length,processed:rows.length,requestsThisRun:requests,counts,listReports,rows,paidApiCalls:0,mediaDownloads:0};await fs.writeFile(process.argv.includes('--lists-only')?'docs/r12-description-recheck-lists.json':'docs/r12-description-recheck-fetch.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined}))}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});module.exports={parseList};
