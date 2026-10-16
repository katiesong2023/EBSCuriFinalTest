// 개인 저장과 별도인 명시적 제안 접수. 사람 승인/자동 공개 정본을 변경하지 않는다.
const {DatabaseSync}=require('node:sqlite'),path=require('node:path'),crypto=require('node:crypto');
const {loadDiscoveryCatalog}=require('./discovery-catalog'),{readDataStore}=require('./data-store'),{getEligibleStandards}=require('./data-quality');
const {requirementPlan}=require('./curriculum-requirements'),{goalRequirements}=require('./lesson-goal');
const file=path.join(__dirname,'data/link-proposals.sqlite');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function open(){const db=new DatabaseSync(file);db.exec('CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,status TEXT NOT NULL,created_at TEXT NOT NULL,record TEXT NOT NULL)');return db;}
async function prepare(id,standardId){
 const catalog=await loadDiscoveryCatalog(),store=await readDataStore(),resource=[...catalog.resources,...catalog.searchVariants].find(r=>r.id===id),standard=getEligibleStandards(store.curriculumStandards).find(s=>s.metadata.achievementStandardId===standardId);
 if(!resource||!standard)throw new Error('현재 영상·공식 기준을 확인하지 못했습니다.');
 const plan=requirementPlan(standard),supplement=resource.sourceSupplements?.[0],field=resource.summary?'summary':supplement?'sourceSupplement':'title',text=field==='sourceSupplement'?supplement.text:resource[field];
 let end=Math.min(text.length,350);if(/[\uD800-\uDBFF]/u.test(text[end-1]||''))end--;
 return {resourceId:id,title:resource.title,variant:resource.variant,standardId,standardText:plan.standardText,curriculumVersion:standard.curriculumVersion,requirements:goalRequirements(plan),sourceFingerprint:hash([resource.id,resource.title,resource.summary,resource.sourceUrl,resource.sourceSupplements?.map(s=>s.contentHash)]),standardFingerprint:hash([standardId,standard.curriculumVersion,plan.standardText]),quote:{field,supplementId:field==='sourceSupplement'?supplement.id:undefined,start:0,end,quote:text.slice(0,end)},sourceUrl:field==='sourceSupplement'?supplement.sourceUrl:resource.evidenceUrl||resource.sourceUrl};
}
async function submit(body){
 if(!body||typeof body!=='object'||Object.keys(body).some(key=>!['resourceId','standardId','sourceFingerprint','standardFingerprint','quote','requirementId','reason'].includes(key))||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)throw new Error('제안 내용·연결 이유를 확인하세요.');
 const current=await prepare(body.resourceId,body.standardId);
 if(body.sourceFingerprint!==current.sourceFingerprint||body.standardFingerprint!==current.standardFingerprint||JSON.stringify(body.quote)!==JSON.stringify(current.quote)||!current.requirements.some(r=>r.id===body.requirementId))throw new Error('원문/기준 변경 또는 인용 불일치. 다시 확인해 주세요.');
 const record={...current,requirementId:body.requirementId,reason:body.reason,origin:'USER_PROPOSAL_NOT_APPROVAL',unconfirmed:'영상·학년 적합성·학생 수행·사람 확인은 미확인',checkedAt:new Date().toISOString()};
 const id=hash([current.resourceId,current.standardId,current.sourceFingerprint,body.requirementId,body.quote,body.reason]),db=open();try{db.prepare('INSERT OR IGNORE INTO proposals VALUES(?,?,?,?)').run(id,'PENDING',record.checkedAt,JSON.stringify(record));return {id,status:'PENDING',note:'관리자 검토 후보로 접수했습니다. 승인/공개 상태는 바뀌지 않았습니다.'};}finally{db.close();}
}
async function list(){const db=open();let rows;try{rows=db.prepare('SELECT * FROM proposals ORDER BY created_at DESC LIMIT 100').all().map(row=>({...row,record:JSON.parse(row.record)}));}finally{db.close();}const store=await readDataStore(),catalog=await loadDiscoveryCatalog(),{currentSource,reviewValidity}=require('./human-review-contract');return rows.map(row=>{const review=(store.relationReviews||[]).findLast(review=>review.source.sourceContentId===row.record.resourceId&&review.standardSnapshot.standardId===row.record.standardId);return {...row,existingReview:review?{reviewId:review.reviewId,decision:review.decision,invalidReason:reviewValidity(review,store,currentSource(store,review.target,catalog.resources))}:null};});}
async function mark(id,status){if(!['IN_REVIEW','REJECTED'].includes(status))throw new Error('검토 상태를 확인하세요.');const db=open();try{if(status==='IN_REVIEW'){const row=db.prepare('SELECT record FROM proposals WHERE id=?').get(id);if(!row)throw new Error('제안 없음');const saved=JSON.parse(row.record),current=await prepare(saved.resourceId,saved.standardId);if(saved.sourceFingerprint!==current.sourceFingerprint||saved.standardFingerprint!==current.standardFingerprint)throw new Error('원문/기준이 변경된 제안입니다. 기존 관계 검토에서 현재 근거를 다시 확인하세요.');}if(db.prepare('UPDATE proposals SET status=? WHERE id=?').run(status,id).changes!==1)throw new Error('제안 없음');return {id,status};}finally{db.close();}}
module.exports={prepare,submit,list,mark};
