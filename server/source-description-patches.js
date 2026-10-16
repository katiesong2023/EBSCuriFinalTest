// 방송 테이블 밖의 목록/클립은 별도 원문 보충에 저장한다. 기존 승인·개인 자료는 수정하지 않는다.
const {DatabaseSync}=require('node:sqlite');
const {broadcastPath,fingerprint}=require('./broadcast-store');
const {officialUrl}=require('./source-enrichment');
const identity=item=>({id:item.id,title:item.title,program:item.program,sourceUrl:item.sourceUrl,summary:item.summary||''});
function applyDescriptionPatches(catalog,filename=broadcastPath){
 const db=new DatabaseSync(filename,{readOnly:true});
 try{if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='source_description_patches'").get())return catalog;
  const records=new Map(db.prepare('SELECT * FROM source_description_patches').all().map(row=>[row.resource_id,JSON.parse(row.record)]));
  const apply=item=>{const record=records.get(item.id);if(!record||record.identityHash!==fingerprint(JSON.stringify(identity(item)))||!officialUrl(record.sourceUrl)||!record.sourceText?.includes(record.description)||(record.sourceKind==='OFFICIAL_DESCRIPTION_EXCERPT'&&record.sourceText.slice(record.excerptStart,record.excerptEnd)!==record.description)||record.contentHash!==fingerprint(JSON.stringify([record.identityHash,record.description,record.sourceUrl,record.sourceKind])))return item;
   return {...item,summary:record.description,evidenceUrl:record.sourceUrl,evidenceLevel:'SOURCE_DESCRIPTION',evidenceLabel:'확인한 공식 소개문',descriptionCheckedAt:record.checkedAt,
    descriptionPatch:{sourceKind:record.sourceKind,contentHash:record.contentHash,originalSummary:item.summary||'',responseHash:record.responseHash,
      ...(record.sourceKind==='OFFICIAL_DESCRIPTION_EXCERPT'?{originalSourceDescription:record.sourceText,excerptStart:record.excerptStart,excerptEnd:record.excerptEnd}:{})}};};
  const resources=catalog.resources.map(apply),searchVariants=catalog.searchVariants.map(apply),quality=require('./source-text-quality').sourceQualityStats(resources);
  return {...catalog,resources,searchVariants,stats:{...catalog.stats,withDescription:quality.minimumPassed,sourceQuality:quality}};
 }finally{db.close()}
}
function saveDescriptionPatch(db,item,document){
 const {cleanGuideText,guideIssues}=require('./broadcast-guide-text');
 if(!officialUrl(document.sourceUrl)||!document.titleMatched||!require('./source-enrichment').sameTitle({title:item.title,synopsis:item.summary},document.title)||!['OFFICIAL_SERIES_DESCRIPTION','OFFICIAL_VIDEO_METADATA','OFFICIAL_LIST_ITEM','OFFICIAL_DESCRIPTION_EXCERPT'].includes(document.sourceKind)||!document.responseHash||!document.description||guideIssues(document.description).length||!cleanGuideText(document.description)||!document.sourceText?.includes(document.description))throw Error('공식 소개문의 식별·본문 대조 실패');
 if(document.sourceKind==='OFFICIAL_DESCRIPTION_EXCERPT'&&document.sourceText.slice(document.excerptStart,document.excerptEnd)!==document.description)throw Error('공식 발췌 위치 불일치');
 const identityHash=fingerprint(JSON.stringify(identity(item))),record={identity:identity(item),identityHash,...document,checkedAt:new Date().toISOString()};
 record.contentHash=fingerprint(JSON.stringify([identityHash,document.description,document.sourceUrl,document.sourceKind]));
 db.exec('CREATE TABLE IF NOT EXISTS source_description_patches(resource_id TEXT PRIMARY KEY,record TEXT NOT NULL);CREATE TABLE IF NOT EXISTS source_description_patch_events(event_id TEXT PRIMARY KEY,resource_id TEXT NOT NULL,record TEXT NOT NULL)');
 const previous=db.prepare('SELECT record FROM source_description_patches WHERE resource_id=?').get(item.id)?.record;
 if(previous&&JSON.parse(previous).contentHash===record.contentHash)return {id:item.id,status:'UNCHANGED'};
 db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT OR REPLACE INTO source_description_patches VALUES(?,?)').run(item.id,JSON.stringify(record));db.prepare('INSERT OR IGNORE INTO source_description_patch_events VALUES(?,?,?)').run(fingerprint(JSON.stringify(record)),item.id,JSON.stringify({previous:previous?JSON.parse(previous):null,next:record}));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 return {id:item.id,status:'UPDATED',descriptionLength:record.description.length,sourceUrl:record.sourceUrl,sourceKind:record.sourceKind};
}
module.exports={applyDescriptionPatches,saveDescriptionPatch};
