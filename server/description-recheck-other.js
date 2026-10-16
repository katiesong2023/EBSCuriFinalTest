const fs=require('node:fs/promises');
const {openBroadcastStore,fingerprint}=require('./broadcast-store');
const {saveDescriptionPatch}=require('./source-description-patches');
function parseOther({html,url,item}){
 const doc=new DOMParser().parseFromString(html,'text/html'),clean=node=>(node?.textContent||'').replace(/\s+/gu,' ').trim(),key=v=>String(v||'').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase(),expected=key(item.title);
 const requested=new URL(item.sourceUrl),actual=new URL(url);
 if(['courseId','stepId'].some(k=>requested.searchParams.get(k)&&requested.searchParams.get(k)!==actual.searchParams.get(k)))return {titleMatched:false,status:'IDENTITY_MISMATCH'};
 // 목록의 같은 제목 블록만 사용한다. 사이트 공통 OG 소개·다른 회차 문장은 쓰지 않는다.
 for(const title of doc.querySelectorAll('.in_wrap .tit_info'))if(key(clean(title))===expected){const block=title.closest('.in_wrap'),description=clean(block.querySelector('.stit_info'));if(description)return {titleMatched:true,title:clean(title),description,sourceText:clean(block),sourceKind:'OFFICIAL_SERIES_DESCRIPTION'}}
 if(item.kind!=='collection')for(const node of doc.querySelectorAll('script[type="application/ld+json"]'))try{const v=JSON.parse(node.textContent);if(v['@type']==='VideoObject'&&key(v.name)===expected&&String(v.description||'').trim()){const src=new URL(v.embedUrl||v.contentUrl,url),dest=new URL(item.sourceUrl);if(['courseId','lectId'].every(k=>src.searchParams.get(k)&&src.searchParams.get(k)===dest.searchParams.get(k)))return {titleMatched:true,title:v.name,description:String(v.description).trim(),sourceText:String(v.description).trim(),sourceKind:'OFFICIAL_VIDEO_METADATA'}}}catch{}
 const clip=[...doc.querySelectorAll('.tit a')].find(n=>key(clean(n))===expected);
 return {titleMatched:Boolean(clip),status:clip?'METADATA_ONLY':'NO_VERIFIED_DESCRIPTION'};
}
async function main(){
 const inv=JSON.parse(await fs.readFile('docs/r12-description-recheck-inventory.json','utf8')),targets=inv.rows.filter(r=>!r.id.startsWith('BCAST-')),db=openBroadcastStore();
 const {chromium}=require('/Users/yunseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext(),times=new Map(),stopped=new Set(),cache=new Map(),rows=[];const groups=Map.groupBy(targets,r=>new URL(r.sourceUrl).hostname);
 try{await Promise.all([...groups.entries()].map(async([host,items])=>{let cursor=0;await Promise.all(Array.from({length:2},async()=>{const parser=await context.newPage();try{while(cursor<items.length){const item=items[cursor++];try{let html=cache.get(item.sourceUrl),url=item.sourceUrl;if(!html){if(stopped.has(host))throw Error('HOST_STOPPED');const due=Math.max(Date.now(),times.get(host)||0);times.set(host,due+400);await new Promise(r=>setTimeout(r,Math.max(0,due-Date.now())));const response=await context.request.get(url,{timeout:25000,maxRedirects:3});try{if([401,403,429].includes(response.status()))stopped.add(host);if(response.status()!==200)throw Error('HTTP '+response.status());html=await response.text();url=response.url();cache.set(item.sourceUrl,html)}finally{await response.dispose()}}
 const parsed=await parser.evaluate(parseOther,{html,url,item}),result=parsed.description?saveDescriptionPatch(db,item,{...parsed,sourceUrl:url,responseHash:fingerprint(html)}):{id:item.id,status:parsed.status};rows.push({...result,title:item.title,program:item.program,sourceUrl:url});
 }catch(e){rows.push({id:item.id,status:'UNAVAILABLE',error:e.message.split('\n')[0],sourceUrl:item.sourceUrl})}if(rows.length%100===0)console.log('other',rows.length,'/',targets.length)}}finally{await parser.close()}}));}));
 }finally{await browser.close();db.close();const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;const report={date:new Date().toISOString(),targets:targets.length,processed:rows.length,counts,rows,paidApiCalls:0};await fs.writeFile('docs/r12-description-recheck-other.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined}))}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});module.exports={parseOther};
