const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAutomaticEvidence,checkRelation}=require('./automatic-evidence');const {loadEvidenceContext}=require('./automatic-evidence-service');
const {createAutomaticAssetService}=require('./automatic-assets');const {readDataStore}=require('./data-store');const {ruleScope}=require('./automatic-relation-rules');
const {approvalState,assertApprovalStateUnchanged,checkOperationalWithdrawals}=require('./regression-approval-state');
async function run(){const store=await readDataStore(),cases=[],tmp=fs.mkdtempSync(path.join(os.tmpdir(),'curi-relation-'));const check=async(name,fn)=>{await fn();cases.push({name,passed:true});};
const originalApprovals=approvalState(store),operationalApprovals=checkOperationalWithdrawals(store);
try{
 const bronzeContext=await loadEvidenceContext({resourceId:'BCAST-edc5b3f9fd8742c0b2f0',standardId:'6사04-01'},store);const bronze=bronzeContext.resource;
 const evaluate=(source,standardId,subject)=>createAutomaticEvidence(source,store.curriculumStandards,{standardId,subject,gradeBand:'5~6학년군'});
 const report=evaluate(bronze,'6사04-01','사회');
 await check('네 기준의 제한 규칙·실제 복구 원문 관계 근거',()=>{assert.equal(ruleScope().rules.length,4);assert.equal(report.summary.publishable,1);assert.equal(report.relations[0].standard.standardId,'6사04-01');assert.equal(report.relations[0].semantic.standardCoverage,'PARTIAL');for(const q of report.relations[0].quotes)assert.equal(bronze.synopsis.slice(q.start,q.end),q.quote);});
 await check('유물 명칭만으로 생활 관계 공개 금지',()=>{const r=evaluate({...bronze,synopsis:'농경문 청동기는 청동기 시대를 소개하는 문화유산이다. 유물의 크기를 관찰한다.'},'6사04-01','사회');assert.equal(r.summary.publishable,0);});
 await check('문양 맥락 없는 다른 그림·부정·인용 주장 보류',()=>{for(const synopsis of [bronze.synopsis.replace('농경문청동기에 그려진 ‘문양’','다른 그림에 그려진 문양'),bronze.synopsis+' 이 설명은 거짓이다.',bronze.synopsis.replace('밭을 갈고 있는 걸 볼 수 있다','밭을 갈고 있지 않다'),bronze.synopsis.replace('‘최고의 명품 청동기’라 불리는 농경문 청동기는','사람들은 농경문 청동기는')])assert.equal(evaluate({...bronze,synopsis},'6사04-01','사회').summary.publishable,0);});
 const science={...bronze,sourceContentId:'SCIENCE-FIXTURE',title:'연소 생성물과 생태계 피해',synopsis:'석탄을 태우면 황산화물이 발생한다. 배출된 황산화물은 산성비를 일으켜 산림의 생태계에 피해를 준다.'};
 await check('연소→생성물→피해를 함께 확인하고 학생 수행은 미확인',()=>{const r=evaluate(science,'6과14-04','과학');assert.equal(r.summary.publishable,1);assert.ok(r.relations[0].semantic.unconfirmedParts.some(s=>s.includes('학생')));assert.equal(r.relations[0].semantic.standardCoverage,'PARTIAL');});
 await check('연소/피해 중 한 관계만 있거나 꿀벌 생태계 단어뿐이면 공개 금지',()=>{for(const synopsis of ['꿀벌의 일생과 생태계를 소개한다. 생태계에 관한 다양한 이야기를 다룬다.','석탄을 태우면 황산화물이 발생한다. 기체의 색을 소개한다.','배출된 황산화물은 산성비를 일으켜 산림의 생태계에 피해를 준다. 피해 사례를 살펴본다.'])assert.equal(evaluate({...science,synopsis},'6과14-04','과학').summary.publishable,0);});
 await check('의문·상충·제목 반복·부족 원문 보류',()=>{for(const synopsis of [science.synopsis+' 이 설명은 틀렸다.',science.synopsis.replace('발생한다.','발생할까?'),science.title,'연소'])assert.equal(evaluate({...science,synopsis},'6과14-04','과학').summary.publishable,0);});
 await check('변조 인용·공식 원문·규칙 버전 차단',()=>{for(const mutate of [r=>r.quotes[0].quote='위조 문장',r=>r.standard.requirement='위조 요구',r=>r.ruleVersion='old']){const proposal=structuredClone(report.relations[0]);mutate(proposal);assert.equal(checkRelation(proposal,{resource:bronze,standards:store.curriculumStandards,subject:'사회',gradeBand:'5~6학년군',standardId:'6사04-01'}).publicationEligible,false);}});
 await check('선택한 공식 기준·교과 불일치 거절',async()=>{await assert.rejects(loadEvidenceContext({resourceId:bronze.sourceContentId,standardId:'6과99-99'},store));await assert.rejects(loadEvidenceContext({resourceId:bronze.sourceContentId,standardId:'6사04-01',subject:'과학'},store));});
 let current=structuredClone(bronzeContext);const service=createAutomaticAssetService({filename:path.join(tmp,'auto.sqlite'),loadContext:async()=>current});
 const input={resourceId:bronze.sourceContentId,subject:'사회',standardId:'6사04-01'};let saved;
 await check('관계 선택→별도 저장→검색·중복 재사용',async()=>{saved=await service.process(input);assert.equal(saved.assets.length,1);const links=await service.readLinks();assert.equal(links.length,1);assert.equal(links[0].humanVerified,false);assert.equal((await service.process(input)).reused,true);});
 await check('변경 후 관계 검색 무효화·현재 승인/취소 이력 JSON 불변',async()=>{current.resource.synopsis+=' 새 원문';assert.equal((await service.readLinks()).length,0);assert.equal(service.history(saved.runId).assets[0].state,'STALE');assertApprovalStateUnchanged(await readDataStore(),originalApprovals);});
 fs.writeFileSync(process.env.CURI_REPORT_PATH||'docs/r09-02-regression-relation-reuse.json',JSON.stringify({checkedAt:new Date().toISOString(),cases,scope:ruleScope(),operationalApprovals,paidApiCalls:0,source:'실제 보강 원문/합성 반례·임시 자동DB. 의미 정확도 정답률 아님'},null,2)+'\n');console.log(`관계 확대·재사용 ${cases.length}개 통과`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}}
run().catch(e=>{console.error(e);process.exitCode=1});
