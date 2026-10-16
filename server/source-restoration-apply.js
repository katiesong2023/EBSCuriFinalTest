// 공식 조사에서 회차 대조를 통과한 복구 후보만 기존 이력 저장 경로로 반영한다.
const fs=require('node:fs/promises');
const {openBroadcastStore,fingerprint}=require('./broadcast-store');
const {applyOfficialDetail}=require('./source-enrichment');
async function main(){
 const [,,inputFile,reportFile]=process.argv;if(!inputFile||!reportFile)throw new Error('조사 보고서·결과 경로 필요');
 const input=JSON.parse(await fs.readFile(inputFile,'utf8'));const selected=input.rows.filter(row=>row.status==='RECOVERABLE_COLLECTION_GAP'&&row.identityMatched);
 if(!selected.length||selected.length>30)throw new Error('검증된 복구 후보1~30개 필요');
 const protectedFiles=['server/data/curi-store.json','server/data/semantic-layer.sqlite','server/data/automatic-assets.sqlite'];
 const hashes=async()=>Object.fromEntries(await Promise.all(protectedFiles.map(async file=>[file,fingerprint(await fs.readFile(file))])));
 const protectedBefore=await hashes(),db=openBroadcastStore();
 const before=new Map(db.prepare('SELECT id,title,synopsis,url,content_hash,payload FROM episodes').all().map(row=>[row.id,JSON.stringify(row)]));
 const rows=[];
 try{
  // 대상 전부가 아직 조사 시점과 같을 때만 쓰기 시작한다.
  for(const row of selected)if(db.prepare('SELECT content_hash FROM episodes WHERE id=?').get(row.id)?.content_hash!==row.stored.content_hash)throw new Error('조사 이후 원문 변경 '+row.id);
  for(const row of selected)rows.push(applyOfficialDetail(db,row.id,row.detail,{checkedAt:row.checkedAt,expectedHash:row.stored.content_hash}));
  const changed=db.prepare('SELECT id,title,synopsis,url,content_hash,payload FROM episodes').all().filter(row=>before.get(row.id)!==JSON.stringify(row)).map(row=>row.id);
  if(changed.length!==selected.length||changed.some(id=>!selected.some(row=>row.id===id)))throw new Error('예상하지 않은 회차 변경');
  const protectedAfter=await hashes();if(JSON.stringify(protectedBefore)!==JSON.stringify(protectedAfter))throw new Error('보호3저장소 변경');
  await fs.writeFile(reportFile,JSON.stringify({generatedAt:new Date().toISOString(),rows,changedEpisodeIds:changed,episodeRows:before.size,protectedBefore,protectedAfter,paidApiCalls:0,playback:'NOT_CHECKED'},null,2)+'\n');console.log(rows.map(row=>({id:row.id,status:row.status,before:row.previousLength,after:row.currentLength})));
 }finally{db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
