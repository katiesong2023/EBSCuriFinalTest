// 공식 HTML의 회차 선언·제목·자막 참조를 대조한 뒤 공개 SMI 텍스트만 읽는다.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fingerprint}=require('./broadcast-store');
const {officialUrl}=require('./source-enrichment');
const {chromium}=await import(process.env.CURI_PLAYWRIGHT_MODULE||'playwright');
const input=JSON.parse(await fs.readFile('docs/r07-20-source-gap-audit.json','utf8'));
const targets=input.rows.filter(row=>row.status==='IDENTITY_UNCONFIRMED');
const browser=await chromium.launch({headless:true,executablePath:process.env.CURI_BROWSER_EXECUTABLE});
const context=await browser.newContext(),parser=await context.newPage();const rows=[];
const normalize=value=>String(value).normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
try{
 for(const row of targets){
  const stored=row.stored,record={id:row.id,title:stored.title,caseId:row.caseId,sourceUrl:stored.url,checkedAt:new Date().toISOString()};
  try{
   await new Promise(resolve=>setTimeout(resolve,1100));
   const pageResponse=await context.request.get(stored.url,{timeout:20000,maxRedirects:0});if(pageResponse.status()!==200)throw new Error('상세 HTTP '+pageResponse.status());
   const html=await pageResponse.text();await pageResponse.dispose();
   const block=html.match(/var\s+vodCommonIDs\s*=\s*\{([^}]+)\}/)?.[1];
   const title=html.match(/\$\("#mpv-title-text"\)\.html\('([^']*)'\)/)?.[1];
   const program=html.match(/\$\("#mpv-program-text"\)\.html\('([^']*)'/)?.[1];
   const reference='/vodCommon/subtitles/'+stored.lect_id+'.smi';
   if(!block||normalize(title)!==normalize(stored.title)||normalize(program)!==normalize(stored.program)||!html.includes(reference)||!['course_id','step_id','lect_id'].every(key=>block.includes('"'+stored[key]+'"')))throw new Error('플레이어 회차/제목/프로그램/자막 참조 미일치');
   const url=new URL(reference,stored.url).href;if(!officialUrl(url))throw new Error('공식 자막 주소 아님');
   const response=await context.request.get(url,{timeout:20000,maxRedirects:0});record.httpStatus=response.status();if(response.status()!==200)throw new Error('자막 HTTP '+response.status());
   const raw=await response.text();await response.dispose();if(!/<SAMI[>\s]/i.test(raw))throw new Error('공개 SMI 형식 미확인');
   const cues=[];for(const match of raw.matchAll(/<SYNC\s+Start\s*=\s*["']?(\d+)["']?[^>]*>(.*?)(?=<SYNC|<\/BODY|$)/gis)){
    const text=await parser.evaluate(value=>{const doc=new DOMParser().parseFromString(value,'text/html');return (doc.body.textContent||'').replace(/\s+/g,' ').trim();},match[2]);if(text)cues.push({startMs:Number(match[1]),text});
   }
   if(!cues.length||cues.some((cue,i)=>i&&cue.startMs<cues[i-1].startMs))throw new Error('자막 시간 순서 오류');
   const terms=[...new Set(stored.title.match(/[가-힣]{2,}/g)||[])];let best=0,score=-1;
   for(let i=0;i<cues.length;i++){const part=cues.slice(i,i+55),text=part.map(c=>c.text).join('\n');const value=terms.reduce((n,term)=>n+(text.split(term).length-1),0);if(value>score){score=value;best=i;}}
   const selected=[];let size=0;for(const cue of cues.slice(best,best+55)){if(size+cue.text.length+1>3800)break;selected.push(cue);size+=cue.text.length+1;}
   const text=selected.map(c=>c.text).join('\n');
   record.status='VERIFIED_PUBLIC_CAPTION';record.captionUrl=url;record.identityReference={title,program,courseId:stored.course_id,stepId:stored.step_id,lectId:stored.lect_id};record.pageHash=fingerprint(html);record.captionHash=fingerprint(raw);record.cueCount=cues.length;record.excerpt={startMs:selected[0].startMs,endMs:selected.at(-1).startMs,text,cues:selected};record.playback='NOT_CHECKED';
   // 같은 공식 페이지의 실제 선언과 그 페이지가 참조한 자막을 각각 출처로 기록한다.
   record.document={type:'TRANSCRIPT',sourceUrl:stored.url,title:'EBS 공개 자막 · '+stored.title,publishedAt:'미확인 (회차 방송일은 identity에 별도 기록)',location:`공식 플레이어 회차 선언 및 공개 자막 ${url}, SYNC ${record.excerpt.startMs}~${record.excerpt.endMs}ms`,identity:{resourceId:stored.id,title:stored.title,program:stored.program,broadcastDate:stored.broadcast_date,variant:stored.variant,sourceUrl:stored.url},identityEvidence:[title,program,stored.lect_id],sourceText:[block,title,program,text].join('\n'),text,responseHash:fingerprint(JSON.stringify([record.pageHash,record.captionHash])),sourceDocuments:[{kind:'IDENTITY_PAGE',url:stored.url,hash:record.pageHash},{kind:'CAPTION',url,hash:record.captionHash}]};
  }catch(error){record.status='UNCONFIRMED';record.error=error.message.split('\n')[0];}
  rows.push(record);await fs.writeFile('docs/r07-21-official-caption-audit.json',JSON.stringify({rows,paidApiCalls:0,playback:'NOT_CHECKED'},null,2)+'\n');console.log(row.id,record.status);
 }
}finally{await browser.close();}
