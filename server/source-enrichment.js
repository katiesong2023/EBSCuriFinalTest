// 공식 상세 원문은 회차 ID·제목·주소를 대조한 경우에만 같은 원본에 반영한다.
const { fingerprint } = require('./broadcast-store');
const { assessSourceText } = require('./source-text-quality');
const normalize = value => String(value || '').replace(/<\/?(?:br|span|em|strong|b|i)\b[^>]*>/gi, ' ').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
function officialUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port && (u.hostname==='ebs.co.kr'||u.hostname.endsWith('.ebs.co.kr')) ? u : null;}catch{return null;}
}
function sameEpisode(a,b) {
  const x=officialUrl(a),y=officialUrl(b);return Boolean(x&&y&&['courseId','lectId'].every(k=>x.searchParams.get(k)&&x.searchParams.get(k)===y.searchParams.get(k)));
}
function sameTitle(row, actualTitle) {
 const expected=normalize(row.title), actual=normalize(actualTitle);
 if(expected===actual)return true;
 // 목록 제목에 실제로 붙은 제공 방식 표기만 대조한다. ‘자막의 미래’ 같은 내용어는 보존한다.
 const prefixed=String(row.title||'').match(/^(?:\[(?:자막|수어|HD|고화질)\]|자막(?!은|을|이|의|과|와|으로|에|제작|번역|기술|정보))\s*(.+)$/u);
 if(prefixed&&normalize(prefixed[1])===actual)return true;
 // 목록에 따로 보관된 제공 방식 표기만 허용한다. 회차 ID도 별도로 일치해야 한다.
 const suffix=String(actualTitle||'').match(/\s*\((수어|더빙|자막)\)\s*$/u);
 if(!suffix || normalize(String(actualTitle).slice(0,suffix.index))!==expected)return false;
 const marker=suffix[1];
 let payload={};try{payload=JSON.parse(row.payload||'{}');}catch{}
 return normalize(row.synopsis)===normalize(marker+row.title)||payload.officialTitleVariant===marker;
}
function durationSeconds(value) {const m=String(value||'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);return m&&m.slice(1).some(Boolean)?Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0):null;}
function applyOfficialDetail(db, id, detail, options={}) {
 const row=db.prepare('SELECT * FROM episodes WHERE id=?').get(id);if(!row)throw new Error('원본 회차 없음');
 const checkedAt=options.checkedAt||new Date().toISOString();
 const matched=officialUrl(row.url)&&sameEpisode(row.url,detail.url)&&sameEpisode(row.url,detail.finalUrl||row.url)&&sameTitle(row,detail.title);
 const previous={synopsis:row.synopsis,contentHash:row.content_hash,payload:JSON.parse(row.payload)};
 const incoming=String(detail.description||'');const before=assessSourceText(row.title,row.synopsis),after=assessSourceText(row.title,incoming);
 // 빈약해진 현재 페이지는 기존 원문을 지우지 않고 불일치로 기록해 재확인 대상으로 남긴다.
 const canReplace=matched&&Boolean(incoming)&&after.rank>=before.rank&&(!before.detailedMappingAllowed||after.detailedMappingAllowed);
 const synopsis=canReplace?incoming:row.synopsis;
 const status=!matched?'MISMATCH':canReplace?(incoming===row.synopsis?'UNCHANGED':'UPDATED'):'INSUFFICIENT';
 const descriptionMatched=matched&&incoming===synopsis;
 const seconds=matched?durationSeconds(detail.durationMetadata||detail.duration):null;
 const variant=matched&&String(detail.title).match(/\s*\((수어|더빙|자막)\)\s*$/u)?.[1];
 const verifiedUrl=detail.finalUrl||row.url;
 const payload={...previous.payload,...(variant?{officialTitleVariant:variant}:{}),...(descriptionMatched?{synopsisSourceUrl:verifiedUrl,synopsisCheckedAt:checkedAt}:{}),
   ...(matched?{durationSeconds:seconds,durationSourceUrl:verifiedUrl,durationCheckedAt:checkedAt}:{}),summary:synopsis};
 const event={id,checkedAt,status,previous,next:{synopsis,contentHash:fingerprint(JSON.stringify([row.title,synopsis,row.url])),payload},
   detail:{...detail,description:incoming},archiveCompared:options.archiveCompared??null,descriptionMatched};
 db.exec('BEGIN IMMEDIATE');
 try {
  db.exec('CREATE TABLE IF NOT EXISTS source_enrichments (event_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, checked_at TEXT NOT NULL, status TEXT NOT NULL, record TEXT NOT NULL)');
  // stale response: the source snapshot used to fetch must still be the current source.
  if(options.expectedHash&&db.prepare('SELECT content_hash FROM episodes WHERE id=?').get(id).content_hash!==options.expectedHash)throw new Error('수집 중 원본 변경·재조회 필요');
  db.prepare('INSERT OR IGNORE INTO source_enrichments VALUES (?,?,?,?,?)').run(fingerprint(JSON.stringify(event)),id,checkedAt,status,JSON.stringify(event));
  if(!options.preserveNavigation)db.prepare('INSERT OR REPLACE INTO link_checks VALUES (?,?,?,?,?,?)').run(id,row.title,row.url,matched?'MATCHED':'MISMATCH',checkedAt,JSON.stringify({...detail,description:descriptionMatched?incoming:'',descriptionMatched,durationSeconds:seconds}));
  if(matched){db.prepare('UPDATE episodes SET synopsis=?,content_hash=?,payload=? WHERE id=?').run(synopsis,event.next.contentHash,JSON.stringify(payload),id);db.prepare('UPDATE episode_text SET synopsis=? WHERE id=?').run(synopsis,id);}
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 return {id,status,checkedAt,descriptionMatched,before:before.category,after:assessSourceText(row.title,synopsis).category,previousLength:row.synopsis.length,currentLength:synopsis.length,durationSeconds:seconds,responseHash:detail.responseHash,archiveCompared:event.archiveCompared};
}
function applyOfficialListDescription(db,id,document,{expectedHash,checkedAt=new Date().toISOString()}={}) {
 const row=db.prepare('SELECT * FROM episodes WHERE id=?').get(id);
 const source=officialUrl(document.sourceUrl),original=row&&officialUrl(row.url);
 if(!row||!source||!original||!expectedHash||row.content_hash!==expectedHash)throw Error('소개 보충 전 현재 원본·공식 출처 대조 필요');
 if(!sameEpisode(row.url,document.itemUrl)||!sameTitle(row,document.title)||
   source.searchParams.get('courseId')!==original.searchParams.get('courseId')||source.searchParams.get('stepId')!==original.searchParams.get('stepId'))return {id,status:'MISMATCH'};
 const incoming=String(document.description||'').trim(),clean=value=>String(value||'').replace(/\s+/gu,' ').trim();
 const {cleanGuideText,guideIssues}=require('./broadcast-guide-text');
 if(!document.responseHash||!document.sourceText||!clean(document.sourceText).includes(clean(incoming)))throw Error('목록 본문 발췌 근거 누락');
 const before=assessSourceText(row.title,row.synopsis),after=assessSourceText(row.title,incoming);
 if(!cleanGuideText(incoming)||['none','repeated','production'].includes(after.category)||guideIssues(incoming).length||after.rank<before.rank)return {id,status:'INSUFFICIENT'};
 if(row.synopsis===incoming)return {id,status:'UNCHANGED'};
 const previous={synopsis:row.synopsis,contentHash:row.content_hash,payload:JSON.parse(row.payload)};
 const payload={...previous.payload,summary:incoming,synopsisSourceUrl:source.href,synopsisCheckedAt:checkedAt,synopsisSourceKind:'OFFICIAL_LIST_ITEM'};
 const next={synopsis:incoming,contentHash:fingerprint(JSON.stringify([row.title,incoming,row.url])),payload};
 const event={id,checkedAt,status:'UPDATED',previous,next,detail:{...document,description:incoming,sourceKind:'OFFICIAL_LIST_ITEM'},descriptionMatched:true};
 db.exec('BEGIN IMMEDIATE');
 try{if(db.prepare('SELECT content_hash FROM episodes WHERE id=?').get(id).content_hash!==expectedHash)throw Error('보충 중 원본 변경');
  db.exec('CREATE TABLE IF NOT EXISTS source_enrichments (event_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, checked_at TEXT NOT NULL, status TEXT NOT NULL, record TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO source_enrichments VALUES(?,?,?,?,?)').run(fingerprint(JSON.stringify(event)),id,checkedAt,'UPDATED',JSON.stringify(event));
  db.prepare('UPDATE episodes SET synopsis=?,content_hash=?,payload=? WHERE id=?').run(incoming,next.contentHash,JSON.stringify(payload),id);
  db.prepare('UPDATE episode_text SET synopsis=? WHERE id=?').run(incoming,id);db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 return {id,status:'UPDATED',previousLength:row.synopsis.length,currentLength:incoming.length,sourceKind:'OFFICIAL_LIST_ITEM'};
}
module.exports={applyOfficialDetail,applyOfficialListDescription,sameEpisode,sameTitle,officialUrl,durationSeconds};
