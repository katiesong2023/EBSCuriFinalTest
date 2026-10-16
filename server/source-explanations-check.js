const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {openBroadcastStore,saveBroadcastPage,readBroadcastResources}=require('./broadcast-store');
const {applyOfficialDetail,durationSeconds}=require('./source-enrichment');
const {contentGuide,sourceSentences,sourceChecks}=require('./source-explanation');
const cases=[];const check=(name,fn)=>{fn();cases.push({name,passed:true});};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'curi-source-')),db=openBroadcastStore(path.join(tmp,'test.sqlite'));
try{
 const row={title:'자료 안내',program:'시험',summary:'자료 안내',url:'https://www.ebs.co.kr/test?courseId=1&stepId=1&lectId=1'};
 saveBroadcastPage(db,{job:'test',sourceUrl:row.url,fetchedAt:'2026-10-05'},[row,{...row,url:row.url.replace('lectId=1','lectId=2')}]);
 const [first,second]=db.prepare('SELECT * FROM episodes ORDER BY lect_id').all();
 const summary='지방의회에서 시민의 의견을 듣는 여러 창구를 소개한다. 공청회나 토론회, 주민참여조례를 통해 시민의 목소리에 귀 기울이고 있다. 청소년 의회교실에서 참여 사례를 살펴본다.';
 const detail={url:row.url,finalUrl:row.url,title:row.title,description:summary,durationMetadata:'PT6M39S',responseHash:'fixture'};
 check('같은 회차만 복구·다른 판본 원문 보존',()=>{const r=applyOfficialDetail(db,first.id,detail);assert.equal(r.status,'UPDATED');assert.equal(db.prepare('SELECT synopsis FROM episodes WHERE id=?').get(second.id).synopsis,row.summary);assert.equal(db.prepare('SELECT count(*) n FROM source_enrichments').get().n,1);});
 check('이전/현재 원문·내용 해시·시간·출처 이력',()=>{const event=JSON.parse(db.prepare('SELECT record FROM source_enrichments').get().record);assert.equal(event.previous.synopsis,row.summary);assert.equal(event.next.synopsis,summary);assert.notEqual(event.previous.contentHash,event.next.contentHash);assert.equal(event.next.payload.durationSeconds,399);});
 check('제목·ID·외부 주소·오래된 응답 거절',()=>{for(const bad of [{...detail,title:'다른 제목'},{...detail,url:row.url.replace('lectId=1','lectId=2')},{...detail,url:row.url.replace('www.ebs.co.kr','evil.example') }])assert.equal(applyOfficialDetail(db,second.id,bad).status,'MISMATCH');assert.throws(()=>applyOfficialDetail(db,first.id,detail,{expectedHash:'old'}),/변경/);});
 check('제목/제작 안내로 원문 덮어쓰기 금지',()=>{assert.equal(applyOfficialDetail(db,first.id,{...detail,description:row.title}).status,'INSUFFICIENT');assert.equal(db.prepare('SELECT synopsis FROM episodes WHERE id=?').get(first.id).synopsis,summary);});
 check('목록 재수집 후 상세 원문 보존',()=>{applyOfficialDetail(db,first.id,detail);saveBroadcastPage(db,{job:'again',sourceUrl:row.url,fetchedAt:'2026-10-06'},[row]);const saved=db.prepare('SELECT * FROM episodes WHERE id=?').get(first.id);assert.equal(saved.synopsis,summary);assert.equal(JSON.parse(saved.payload).durationSeconds,399);});
 check('2~3문장 안내와 정확한 인용 위치',()=>{const item={title:row.title,summary};const guide=contentGuide(item,['시민','공청회']);assert.ok(guide.evidence.length>=2&&guide.evidence.length<=3);for(const q of guide.evidence)assert.equal(summary.slice(q.start,q.end),q.quote);});
 check('HTML·줄바꿈 원문 인용 오프셋·부족 원문 문장 채우기 금지',()=>{const s='첫째 내용입니다.<br> 둘째 설명입니다.\n셋째 정보입니다.';for(const q of sourceSentences(s))assert.equal(s.slice(q.start,q.end),q.quote);assert.equal(contentGuide({title:'제목',summary:''}).evidence.length,0);});
 check('시간 형식/출처 미확인 구분',()=>{assert.equal(durationSeconds('PT1H2M3S'),3723);assert.equal(durationSeconds('PT'),null);assert.equal(sourceChecks({}).description,'현재 상세 소개문 대조 미확인');});
 const recovery=JSON.parse(fs.readFileSync('docs/r07-03-source-recovery.json'));
 check('실제 보관 원문2건 복구·3건 시간 확인',()=>{assert.equal(recovery.rows.filter(r=>r.status==='UPDATED').length,2);assert.equal(recovery.rows.filter(r=>r.descriptionMatched).length,3);assert.ok(recovery.rows.every(r=>r.archiveCompared.sameDescription));const items=readBroadcastResources();for(const r of recovery.rows){const item=items.find(i=>i.id===r.id);assert.equal(item.durationSeconds,r.durationSeconds);assert.equal(item.descriptionMatchStatus,'MATCHED');}});
 const baseline=JSON.parse(fs.readFileSync('docs/r07-02-quality-baseline.json'));check('기존 사람 승인 JSON 불변',()=>assert.equal(crypto.createHash('sha256').update(fs.readFileSync('server/data/curi-store.json')).digest('hex'),baseline.protectedHashes['curi-store.json']));
 fs.writeFileSync('docs/r07-03-explanation-check.json',JSON.stringify({checkedAt:new Date().toISOString(),cases,paidApiCalls:0},null,2)+'\n');console.log(`원문 복구·설명 ${cases.length}개 통과`);
}finally{db.close();fs.rmSync(tmp,{recursive:true,force:true});}
