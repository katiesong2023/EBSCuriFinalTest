// 1회차로 식별된 공식 보도자료만 보조 설명으로 연결한다. 소개문은 덮어쓰지 않는다.
const fs=require('node:fs/promises');
const {openBroadcastStore}=require('./broadcast-store');
const {attachOfficialSupplement,identityFor,readSupplements}=require('./source-supplements');
const {cleanTitle}=require('./nature-description-collect');
function exactPhrase(source,value){
 const key=cleanTitle(value),characters=[],positions=[];
 for(let i=0;i<source.length;i++)if(/[\p{L}\p{N}]/u.test(source[i])){characters.push(source[i].normalize('NFKC').toLowerCase());positions.push(i)}
 const at=characters.join('').indexOf(key);
 return at<0?null:source.slice(positions[at],positions[at+key.length-1]+1);
}
function prepareSupplement(row,doc){
 const title=exactPhrase(doc.text,row.title),program=exactPhrase(doc.text,row.program.replace(/^EBS\s*/u,''));
 const days=(Date.parse(row.broadcast_date)-Date.parse(doc.publishedAt))/86400000;
 if(!title||!program||cleanTitle(row.title).length<6||!Number.isFinite(days)||days < -1||days>14)return null;
 let text=doc.text;
 if(text.length>4000){const end=[...text.slice(0,4000).matchAll(/[.!?。](?:\s|$)/gu)].at(-1);if(!end)return null;text=text.slice(0,end.index+1)}
 if(!doc.sourceText.includes(text)||!doc.sourceText.includes(doc.publishedAt))return null;
 return {type:'PRESS_RELEASE',sourceUrl:doc.url,title:doc.title,publishedAt:doc.publishedAt,
  identity:identityFor(row),identityEvidence:[title,program,doc.publishedAt],responseHash:doc.responseHash,
  sourceText:doc.sourceText,text,location:'.view_cont1 본문 시작~'+text.length+' UTF-16; 제목·프로그램 일치, 목록 방송일-게시일 '+days+'일 (게시 전후/시리즈 공지 최대14일 대조)'};
}
async function main(){
 const apply=process.argv.includes('--apply'),inventory=JSON.parse(await fs.readFile('docs/r12-nature-source-inventory.json','utf8'));
 const db=openBroadcastStore(),candidates=new Map(),skipped=[],rows=[];
 try{
  for(const result of inventory.results){
   // 여러 회차가 함께 공지된 문서는 장면/내용의 잘못된 전파를 막기 위해 보류한다.
   const identities=new Set(result.matches.map(r=>cleanTitle(r.title)));
   if(identities.size!==1){if(identities.size)skipped.push({url:result.url,reason:'MULTI_EPISODE_DOCUMENT'});continue;}
   const doc=JSON.parse(await fs.readFile('docs/nature-source-cache/'+result.cacheFile,'utf8'));
   for(const match of result.matches){const row=db.prepare('SELECT * FROM episodes WHERE id=?').get(match.id);
    if(!row||row.content_hash!==match.expectedHash){skipped.push({id:match.id,reason:'SOURCE_CHANGED'});continue;}
    const document=prepareSupplement(row,doc);
    if(!document){skipped.push({id:match.id,url:result.url,reason:'IDENTITY_OR_EXCERPT_NOT_CONFIRMED'});continue;}
    if(!candidates.has(row.id)||candidates.get(row.id).document.text.length<document.text.length)candidates.set(row.id,{row,document});
   }
  }
  for(const {row,document} of candidates.values()){
   const previous=readSupplements(row);
   const result=apply?attachOfficialSupplement(db,row.id,document,{expectedHash:row.content_hash}):{status:'READY'};
   rows.push({id:row.id,title:row.title,program:row.program,broadcastDate:row.broadcast_date,status:result.status,previousSummaryLength:row.synopsis.length,previousSupplementCount:previous.length,
    supplementId:result.supplement?.id,sourceUrl:document.sourceUrl,publishedAt:document.publishedAt,textLength:document.text.length,identityEvidence:document.identityEvidence});
  }
  const report={date:new Date().toISOString(),apply,scope:inventory.programs,targets:inventory.targets,attached:rows.filter(r=>r.status==='ATTACHED').length,ready:rows.length,skipped,rows,paidApiCalls:0};
  await fs.writeFile('docs/r12-nature-description-'+(apply?'applied':'ready')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined,skipped:skipped.length}));
 }finally{db.close()}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={exactPhrase,prepareSupplement};
