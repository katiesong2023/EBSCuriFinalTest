// 공식 자연·과학 다큐 보도자료를 수집한다. HTML 파싱만 하며 스크립트·영상은 실행하지 않는다.
const fs=require('node:fs/promises'),path=require('node:path');
const root=process.env.CURI_ROOT||process.cwd();
const {openBroadcastStore,fingerprint}=require(path.join(root,'server/broadcast-store'));
const programs=['하나뿐인 지구','이것이 야생이다','EBS 다큐프라임','과학 다큐 비욘드','경이로운 자연의 세계','자연 다큐','다큐 오늘'];
const cleanTitle=value=>String(value||'').normalize('NFKC').replace(/^자막\s*/u,'').replace(/\((?:수어방송|수어|재|HD|더빙|자막)\)\s*$/u,'').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
function parseHtml({html,url}){
 const doc=new DOMParser().parseFromString(html,'text/html');
 for(const el of doc.querySelectorAll('script,style'))el.remove();
 const text=el=>(el?.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
 const body=doc.querySelector('.view_cont1'),table=doc.querySelector('#board_table');
 return {links:[...doc.querySelectorAll('td.title a[href*="postId="]')].map(a=>({title:text(a),url:new URL(a.getAttribute('href'),url).href,date:text(a.closest('tr')).match(/20\d{2}-\d{2}-\d{2}/)?.[0]})),
 title:text(table?.querySelector('thead tr:first-child span')),publishedAt:text(table?.querySelector('thead')).match(/20\d{2}-\d{2}-\d{2}/)?.[0],text:text(body),sourceText:text(table),paragraphs:body?[...body.querySelectorAll('p')].map(text).filter(Boolean):[]};
}
async function main(){
 const db=openBroadcastStore(),all=db.prepare('SELECT * FROM episodes').all();db.close();
 const {assessSourceText}=require(path.join(root,'server/source-text-quality'));
 const targets=all.filter(r=>programs.includes(r.program)&&assessSourceText(r.title,r.synopsis).category!=='detailed');
 const dir=path.join(root,'docs/nature-source-cache');await fs.mkdir(dir,{recursive:true});
 const {chromium}=require('/Users/yunseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext();
 const pages=await Promise.all(Array.from({length:3},()=>context.newPage()));let cursor=0,requests=0,nextAt=0,stopped=false;const failures=[],lists=[],documents=new Map();
 async function fetchDoc(url,parser){
  const file=path.join(dir,fingerprint(url)+'.json');try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
  if(stopped)throw Error('HOST_STOPPED');const due=Math.max(Date.now(),nextAt);nextAt=due+350;await new Promise(r=>setTimeout(r,Math.max(0,due-Date.now())));requests++;
  const response=await context.request.get(url,{timeout:25000,maxRedirects:3});try{if([401,403,429].includes(response.status()))stopped=true;if(response.status()!==200)throw Error('HTTP '+response.status());const html=await response.text();const parsed=await parser.evaluate(parseHtml,{html,url:response.url()});const record={...parsed,url:response.url(),responseHash:fingerprint(html),checkedAt:new Date().toISOString()};await fs.writeFile(file,JSON.stringify(record,null,2)+'\n');return record}finally{await response.dispose()}
 }
 try{
  // 공식 프로그램별 목록을 끝까지 탐색한다. 비정상 반복·상한은 보고서에 남긴다.
  for(const program of programs){const query=program.replace(/^EBS\s*/u,'');let seen=new Set(),count=0,status='END';for(let pageNo=1;pageNo<=100;pageNo++){
   const url='https://global.ebs.co.kr/board/bbs?boardId=31&boardTypeId=1&cmd=list&pageNo='+pageNo+'&searchCondition=title&searchKeyword='+encodeURIComponent(query);
   try{const doc=await fetchDoc(url,pages[0]);if(!doc.links.length)break;const fresh=doc.links.filter(l=>!seen.has(new URL(l.url).searchParams.get('postId')));if(!fresh.length){status='REPEATED_PAGE';break}for(const link of fresh){const id=new URL(link.url).searchParams.get('postId');seen.add(id);const canonical='https://global.ebs.co.kr/board/bbs?boardId=31&boardTypeId=1&cmd=view&postId='+id;
    const possible=targets.filter(r=>r.program===program&&cleanTitle(r.title).length>=6&&cleanTitle(link.title).includes(cleanTitle(r.title).slice(0,Math.min(8,cleanTitle(r.title).length)))&&(!link.date||Math.abs(Date.parse(r.broadcast_date)-Date.parse(link.date))<=14*86400000));if(possible.length)documents.set(canonical,{url:canonical,targets:possible.map(r=>r.id)});count++}
    if(doc.links.length<15)break;if(pageNo===100)status='PAGE_LIMIT';
   }catch(e){failures.push({url,error:e.message});status='FAILED';break}
  }lists.push({program,listed:count,status});console.log(JSON.stringify(lists.at(-1)));}
  const work=[...documents.values()],results=[];await Promise.all(pages.map(async parser=>{while(cursor<work.length){const item=work[cursor++];try{const doc=await fetchDoc(item.url,parser);const matches=targets.filter(r=>cleanTitle(r.title).length>=6&&cleanTitle(doc.text).includes(cleanTitle(r.title))&&cleanTitle(doc.title+' '+doc.text.slice(0,300)).includes(cleanTitle(r.program.replace(/^EBS\s*/u,'')))&&Math.abs(Date.parse(r.broadcast_date)-Date.parse(doc.publishedAt))<=14*86400000);results.push({url:item.url,cacheFile:fingerprint(item.url)+'.json',matches:matches.map(r=>({id:r.id,title:r.title,program:r.program,broadcastDate:r.broadcast_date,expectedHash:r.content_hash}))});}catch(e){failures.push({url:item.url,error:e.message})}if(cursor%20===0)console.log('press',cursor,'/',work.length)}}));
  const report={date:new Date().toISOString(),programs,targets:targets.length,lists,requestedDocuments:work.length,requests,failures,results};await fs.writeFile(path.join(root,'docs/r12-nature-source-inventory.json'),JSON.stringify(report,null,2)+'\n');console.log('SAVED',targets.length,'targets',results.length,'documents',results.reduce((n,r)=>n+r.matches.length,0),'matches');
 }finally{await browser.close()}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={parseHtml,cleanTitle,programs};
