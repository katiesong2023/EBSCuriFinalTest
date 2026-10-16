const assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {validateInterpretation}=require('./request-contract-validation');
const {discoverTeacherContents}=require('./teacher-discovery');
const {expressionState}=require('./request-search-plan');
const cases=[];const check=async(name,run)=>{await run();cases.push(name);};
const envelope=query=>({version:'curi-request-input-v1',requestId:'check',query,lockedConditions:[]});
async function main(){
 const inputs=JSON.parse(await fs.readFile('docs/r07-19-request-contract-development-cases.json','utf8')).rows;
 const protectedPaths=['server/data/broadcast-catalog.sqlite','server/data/semantic-layer.sqlite','server/data/automatic-assets.sqlite','server/data/curi-store.json'];
 const beforeHashes=Object.fromEntries(await Promise.all(protectedPaths.map(async file=>[file,crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
 for(const example of inputs)await check(example.id+' 원문/구조/명시 의미 guard',async()=>assert.ok(validateInterpretation(example.expected,envelope(example.query)).accepted));
 const attacks=[
 ['국내 누락/문법 은폐','Q01',r=>{const c=r.clauses.find(x=>x.id==='c2');r.grammarSpans.push(...c.sourceSpans);r.clauses=r.clauses.filter(x=>x.id!=='c2');r.expression.children=r.expression.children.filter(x=>x.clauseId!=='c2');}],
 ['국내 선호 강등','Q01',r=>{r.clauses.find(x=>x.id==='c2').mode='preferred';r.expression.children=r.expression.children.filter(x=>x.clauseId!=='c2');}],
 ['OR를 AND로 변경','Q03',r=>r.expression.children[0].op='all'],
 ['고유명 훼손','Q05',r=>r.clauses[0].label='미래연구소'],
 ['임의 한라산 추가','Q01',r=>{r.clauses.push({...structuredClone(r.clauses[0]),id:'c5',kind:'geography',label:'한라산'});r.expression.children.push({op:'ref',clauseId:'c5'});}],
 ['잘못된 인용','Q01',r=>r.clauses[0].sourceSpans[0].quote='화산 폭발'],
 ['UTF16 분할','Q10',r=>r.grammarSpans.find(s=>s.quote==='🌋').end=1],
 ['승인 필드 주입','Q01',r=>r.humanVerified=true],
 ['존재하지 않는 참조','Q01',r=>r.expression.children[0].clauseId='c99'],
 ['선호를 실행 필수로','Q08',r=>r.expression.children.push({op:'ref',clauseId:'c1'})],
 ['보류 READY 은폐','Q09',r=>r.status='READY'],
 ['필수 형태 실행 누락','Q06',r=>r.expression.children=r.expression.children.filter(x=>x.clauseId!=='c2')],
 ['OR 대상/인접 필수 조건 재배치','Q03',r=>{r.expression.children[0].children[1].clauseId='c3';r.expression.children[1].clauseId='c2';}],
 ['고유명을 주제로 바꿔 훼손','Q05',r=>{r.clauses[0].kind='topic';r.clauses[0].label='미래연구소';}],
 ['원문 덮어쓰기','Q01',r=>r.originalQuery='화산']];
 for(const [name,id,mutate]of attacks)await check(name+' 런타임 거절',async()=>{const e=inputs.find(x=>x.id===id),r=structuredClone(e.expected);mutate(r);assert.equal(validateInterpretation(r,envelope(e.query)).accepted,false);});
 const resource=(id,title,summary,program='국립공원')=>({id,title,summary,program,kind:'episode',sourceUrl:'https://www.ebs.co.kr/'+id,evidenceUrl:'https://www.ebs.co.kr/'+id});
 const fixture={version:'request-connection-fixture',stats:{},resources:[resource('halla','한라산 화산 지형','한라산의 기후와 화산 지형을 다루는 강의입니다.'),resource('halla-doc','한라산 화산 지형 다큐멘터리','한라산 화산 지형을 다루는 다큐멘터리입니다.','다큐프라임'),resource('foreign','과테말라의 화산 지형','과테말라에서 화산 지형과 분화구를 관찰합니다.'),resource('unknown','화산 지형','화산 지형에 관한 자료이며 지역은 확인하지 못했습니다.')],concepts:[{id:'volcano',label:'화산 지형',aliases:['화산 지형','화산지형','화산'],evidenceTerms:['화산 지형','화산','현무암'],directResourceIds:[],places:[{name:'한라산',resourceIds:['halla','halla-doc'],role:'화산 지형 사례'}],sourceUrl:'https://www.ebs.co.kr/volcano'}]};
 const q1=inputs.find(x=>x.id==='Q01');
 await check('검증 응답→지역 사례/국내 AND 검색 연결',async()=>{const r=await discoverTeacherContents({q:q1.query},fixture,undefined,{interpretation:q1.expected,useSemantic:false});assert.ok(r.requestExecution.adopted);assert.equal(r.requestExecution.status,'SUPPLIED_CONTRACT_APPLIED');assert.equal(r.total,2);assert.ok(r.results.every(x=>x.id.startsWith('halla')));assert.ok(r.results.every(x=>x.requestRequirements.confirmation==='SOURCE_REQUIREMENTS_MATCH'));assert.ok(!r.requestExecution.plan.clauses.some(c=>c.label==='한라산'));});
 await check('시스템 선택 프로그램/정렬/기간/페이지 보존',async()=>{const r=await discoverTeacherContents({q:q1.query,program:'국립공원',sort:'oldest',year:'unknown',page:'1'},fixture,undefined,{interpretation:q1.expected,useSemantic:false});assert.equal(r.total,1);assert.equal(r.program,'국립공원');assert.equal(r.sort,'oldest');assert.equal(r.results[0].id,'halla');const locks=new Map(r.requestExecution.envelope.lockedConditions.map(c=>[c.name,c.value]));assert.equal(locks.get('program'),'국립공원');assert.equal(locks.get('year'),'unknown');});
 await check('형성 관계 UNKNOWN/탐색 후보와 충족 결과 분리',async()=>{const e=inputs.find(x=>x.id==='Q02'),r=await discoverTeacherContents({q:e.query},fixture,undefined,{interpretation:e.expected,useSemantic:false});assert.ok(r.total);assert.ok(r.results.every(x=>x.requestRequirements.confirmation==='DISCOVERY_ONLY'));assert.ok(r.results.every(x=>x.requestRequirements.items.some(c=>c.kind==='relation'&&c.status==='UNKNOWN')));});
 await check('검증 실패 로컬 fallback·선택 조건 유지·미적용 기록',async()=>{const wrong=structuredClone(q1.expected);wrong.originalQuery='화산';const r=await discoverTeacherContents({q:q1.query,program:'국립공원'},fixture,undefined,{interpretation:wrong,useSemantic:false});assert.equal(r.requestExecution.status,'FALLBACK_INVALID');assert.equal(r.requestExecution.adopted,false);assert.equal(r.program,'국립공원');assert.equal(r.requestExecution.conditionAssurance,'UNCONFIRMED');});
 await check('모호한 요구 보류',async()=>{const e=inputs.find(x=>x.id==='Q09'),r=await discoverTeacherContents({q:e.query},fixture,undefined,{interpretation:e.expected,useSemantic:false});assert.equal(r.requestExecution.status,'NEEDS_CLARIFICATION');assert.ok(r.requestExecution.unresolved.length);});
 await check('원문 공백/UTF16 보존·200자 초과 잘림 없이 거절',async()=>{const raw=' '+q1.query+' ',r=await discoverTeacherContents({q:raw},fixture,undefined,{useSemantic:false});assert.equal(r.requestExecution.envelope.query,raw);await assert.rejects(discoverTeacherContents({q:' '.repeat(201)},fixture),/200자/);});
 await check('선호는 탈락 조건 아님',async()=>{const e=inputs.find(x=>x.id==='Q08'),r=await discoverTeacherContents({q:e.query},fixture,undefined,{interpretation:e.expected,useSemantic:false});assert.ok(r.results.some(x=>x.program==='국립공원'));assert.ok(r.results.some(x=>x.program==='다큐프라임'));});
 await check('기존 프로그램과 필수 요구 충돌 시 채택 안 함',async()=>{const e=structuredClone(inputs.find(x=>x.id==='Q08').expected);e.originalQuery='다큐프라임 우리나라 화산 자료';const query=e.originalQuery;const span=(quote)=>({start:query.indexOf(quote),end:query.indexOf(quote)+quote.length,quote});e.clauses=[{id:'c1',kind:'program',mode:'required',label:'다큐프라임',sourceSpans:[span('다큐프라임')]},{id:'c2',kind:'geography',mode:'required',label:'국내',sourceSpans:[span('우리나라')]},{id:'c3',kind:'topic',mode:'required',label:'화산',sourceSpans:[span('화산')]}];e.expression={op:'all',children:e.clauses.map(c=>({op:'ref',clauseId:c.id})),sourceSpans:[]};e.grammarSpans=[span('자료')];const r=await discoverTeacherContents({q:query,program:'국립공원'},fixture,undefined,{interpretation:e,useSemantic:false});assert.equal(r.requestExecution.status,'NEEDS_CLARIFICATION');assert.equal(r.program,'국립공원');});
 await check('AND/OR 3값 대조·OR 분기 의미 보존',async()=>{const expr={op:'any',children:[{op:'ref',clauseId:'a'},{op:'ref',clauseId:'b'}]};const states=new Map([['a',{kind:'geography',status:'MATCH'}],['b',{kind:'geography',status:'UNKNOWN'}]]);assert.equal(expressionState(expr,states),'MATCH');assert.equal(expressionState(expr,states,true),'MATCH');states.get('a').status='MISMATCH';assert.equal(expressionState(expr,states),'UNKNOWN');assert.equal(expressionState(expr,states,true),'MISMATCH');});
 await check('장소 선택과 기타 주소 조건까지 봉투에 보존',async()=>{const r=await discoverTeacherContents({q:q1.query,place:'한라산',view:'list'},fixture,undefined,{interpretation:q1.expected,useSemantic:false});const locks=new Map(r.requestExecution.envelope.lockedConditions.map(c=>[c.name,c.value]));assert.equal(locks.get('place'),'한라산');assert.equal(locks.get('view'),'list');assert.equal(r.place,'한라산');assert.ok(r.results.every(x=>x.id.startsWith('halla')));});
 await check('날짜 요구와 선택 기간의 조건 적용/충돌',async()=>{
  const q='2025년 화산 자료',span=quote=>({start:q.indexOf(quote),end:q.indexOf(quote)+quote.length,quote});
  const r={version:'curi-request-v1',originalQuery:q,status:'READY',clauses:[{id:'c1',kind:'date',mode:'required',label:'2025년',sourceSpans:[span('2025년')]},{id:'c2',kind:'topic',mode:'required',label:'화산',sourceSpans:[span('화산')]}],expression:{op:'all',children:[{op:'ref',clauseId:'c1'},{op:'ref',clauseId:'c2'}],sourceSpans:[]},expansions:[],unresolved:[],grammarSpans:[span('자료')]};
  const dated={...fixture,resources:fixture.resources.map((item,i)=>({...item,broadcastDate:i===0?'2025-05-01':i===1?'2026-05-01':null}))};
  const ok=await discoverTeacherContents({q},dated,undefined,{interpretation:r,useSemantic:false});assert.equal(ok.total,1);assert.equal(ok.results[0].id,'halla');
  const conflict=await discoverTeacherContents({q,year:'2024'},dated,undefined,{interpretation:r,useSemantic:false});assert.equal(conflict.requestExecution.status,'NEEDS_CLARIFICATION');assert.equal(conflict.year,'2024');
  const wrong=structuredClone(r);wrong.clauses[0].label='2026년';assert.equal(validateInterpretation(wrong,envelope(q)).accepted,false);
 });
 await check('원래 날짜 OR의 선택 기간과 양립 가능한 분기 보존',async()=>{
  const q='2025년 또는 2026년 화산 자료',span=quote=>({start:q.indexOf(quote),end:q.indexOf(quote)+quote.length,quote});
  const result={version:'curi-request-v1',originalQuery:q,status:'READY',clauses:[{id:'c1',kind:'date',mode:'required',label:'2025년',sourceSpans:[span('2025년')]},{id:'c2',kind:'date',mode:'required',label:'2026년',sourceSpans:[span('2026년')]},{id:'c3',kind:'topic',mode:'required',label:'화산',sourceSpans:[span('화산')]}],expression:{op:'all',children:[{op:'any',children:[{op:'ref',clauseId:'c1'},{op:'ref',clauseId:'c2'}],sourceSpans:[span('또는')]},{op:'ref',clauseId:'c3'}],sourceSpans:[]},expansions:[],unresolved:[],grammarSpans:[span('자료')]};
  const dated={...fixture,resources:fixture.resources.map((item,i)=>({...item,broadcastDate:i===0?'2025-05-01':i===1?'2026-05-01':null}))};
  const r=await discoverTeacherContents({q,year:'2025'},dated,undefined,{interpretation:result,useSemantic:false});assert.ok(r.requestExecution.adopted);assert.equal(r.total,1);assert.equal(r.results[0].id,'halla');
 });
 await check('유료 미호출·일반 GET 경로에 시스템 입력 봉투',async()=>{const r=await discoverTeacherContents({q:q1.query},fixture,undefined,{useSemantic:false});assert.equal(r.requestExecution.status,'LOCAL_ONLY');assert.equal(r.requestExecution.paidApiCalls,0);assert.ok(r.requestExecution.envelope.lockedConditions.every(x=>x.owner==='SYSTEM'));});
 await check('원본4저장소 SHA 보존',async()=>{for(const [file,hash]of Object.entries(beforeHashes))assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),hash);});
 await fs.writeFile(process.env.CURI_REPORT_PATH || 'docs/r07-19-request-connection-check.json',JSON.stringify({generatedAt:new Date().toISOString(),cases,paidApiCalls:0,modelUnderstandingMeasured:false,meaningValidation:'명시 규칙/예시 기반 런타임 검증. 새로운 표현의 범용 의미 정확성 검증 아님.'},null,2)+'\n');console.log(cases.length,'request connection checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
