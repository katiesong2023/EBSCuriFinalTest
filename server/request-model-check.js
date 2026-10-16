const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createRequestModelClient } = require('./request-model-client');
const { prepareModelRequest, decodeModelResponse } = require('./request-model-preparation');
const { prepareReviewBatch, applyCandidateReview } = require('./candidate-review');
const { expressionState } = require('./request-search-plan');
const { validateInterpretation } = require('./request-contract-validation');
const { discoverTeacherContents } = require('./teacher-discovery');
const cases = [];
async function main() {
  const protectedPaths = ['curi-store.json', 'broadcast-catalog.sqlite', 'semantic-layer.sqlite', 'automatic-assets.sqlite'].map(name => 'server/data/' + name);
  const hashes = async () => Object.fromEntries(await Promise.all(protectedPaths.map(async file => [file, crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
  const before = await hashes();
  let networkAttempts = 0;
  const previousFetch = global.fetch;
  global.fetch = () => { networkAttempts++; throw new Error('EXTERNAL_CALL_FORBIDDEN'); };
  try {
    const check = async (name, run) => { await run(); cases.push(name); };
    const samples = JSON.parse(await fs.readFile('docs/r07-19-request-contract-development-cases.json', 'utf8')).rows;
    const example = samples.find(row => row.id === 'Q01');
    const envelope = { version: 'curi-request-input-v1', requestId: 'offline-check', query: example.query, lockedConditions: [] };
    const plan = { ...example.expected, lockedConditions: [] };
    const item = {
      id: 'fixture-halla', title: '한라산 화산 지형', summary: '우리나라 한라산의 화산 지형을 소개하고 지역 사례를 설명합니다.',
      variant: 'EPISODE', sourceUrl: 'https://www.ebs.co.kr/fixture', score: 10,
      requestRequirements: { items: example.expected.clauses.map(c => ({ clauseId: c.id, ...c, status: c.kind === 'geography' ? 'MATCH' : 'UNKNOWN', evidence: [] })) }
    };
    const batch = prepareReviewBatch([item], plan);
    const quote = { field: 'summary', start: 0, end: item.summary.length, quote: item.summary };
    const response = { version: 'curi-candidate-review-v1', requestFingerprint:batch.requestFingerprint, reviews: [{ candidateId: item.id, sourceFingerprint: batch.candidates[0].sourceFingerprint, judgment: 'SUITABLE', selectionReason: '한라산의 화산 지형과 국내 지역 사례를 원문에서 확인합니다.', requirements: item.requestRequirements.items.filter(c => ['required','excluded'].includes(c.mode)).map(c => ({ clauseId: c.clauseId, status: 'MATCH', quotes: [quote] })) }] };
    const apply = supplied => applyCandidateReview([item], batch, supplied, expressionState);
    await check('A 생성 요청은 v1·기존조건·네트워크0', () => { const payload = prepareModelRequest('A', envelope); assert.equal(payload.productContract, 'curi-request-v1'); assert.equal(payload.model, null); assert.equal(payload.externalApiCalls, 0); assert.equal(JSON.parse(payload.payload.input[1].content).query, example.query); });
    await check('외부 클라이언트 기본차단은 키조회/네트워크 전 거절', async () => { const client=createRequestModelClient();await assert.rejects(client.respond(prepareModelRequest('A',envelope)),/MODEL_CALL_DISABLED/);assert.equal(client.attemptedCalls,0); });
    await check('v2 암묵변환 금지', () => { const wrong = structuredClone(example.expected); wrong.version = 'curi-request-v2'; wrong.clauses[0].value = {type:'text',text:'화산 지형'}; assert.equal(validateInterpretation(wrong,envelope).accepted,false); });
    await check('Responses 완료JSON 수신·미완료·거절 분리', () => { assert.equal(decodeModelResponse({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(example.expected)}]}]}).value.version,'curi-request-v1'); assert.throws(()=>decodeModelResponse({status:'incomplete',output:[]})); assert.throws(()=>decodeModelResponse({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]})); });
    await check('정상 B 자기회차 지문과 인용 적용', () => { const result=apply(response); assert.equal(result.execution.adopted,true); assert.equal(result.items[0].requestRequirements.status,'MATCH'); assert.equal(result.items[0].candidateReview.origin,'SUPPLIED_REVIEW_NOT_MODEL_EXECUTION'); });
    for (const [name, mutate] of [
      ['다른 요청/선택조건', r => r.requestFingerprint='previous-request'],
      ['다른 회차', r => r.reviews[0].candidateId='other'],
      ['오래된 지문', r => r.reviews[0].sourceFingerprint='old'],
      ['원문불일치 인용', r => r.reviews[0].requirements[0].quotes[0].quote='없는 인용'],
      ['잘못된 위치', r => r.reviews[0].requirements[0].quotes[0].start=1],
      ['요구 누락', r => r.reviews[0].requirements.pop()],
      ['중복 후보', r => r.reviews.push(structuredClone(r.reviews[0]))],
      ['충족 판정 인용 없음', r => r.reviews[0].requirements[0].quotes=[]]
    ]) await check('B 거절: '+name, () => { const changed=structuredClone(response);mutate(changed);const result=apply(changed);assert.equal(result.execution.adopted,false);assert.equal(result.items[0],item); });
    await check('변경된 현재 원문 거절', () => { const changed={...item,summary:item.summary+'변경'}; assert.equal(applyCandidateReview([changed],batch,response,expressionState).execution.adopted,false); });
    await check('전송6000자 밖 인용 거절', () => { const long={...item,summary:'가'.repeat(6050)};const packet=prepareReviewBatch([long],plan),r=structuredClone(response);r.reviews[0].sourceFingerprint=packet.candidates[0].sourceFingerprint;r.reviews[0].requirements[0].quotes=[{field:'summary',start:6020,end:6030,quote:'가'.repeat(10)}];assert.equal(applyCandidateReview([long],packet,r,expressionState).execution.adopted,false); });
    await check('지역 미확인을 모델충족으로 덮어쓰기 금지', () => { const unknown=structuredClone(item);unknown.requestRequirements.items.find(c=>c.kind==='geography').status='UNKNOWN';const packet=prepareReviewBatch([unknown],plan);assert.equal(applyCandidateReview([unknown],packet,response,expressionState).execution.adopted,false); });
    await check('부적합 후보 제외와 원문부족 구분', () => { const r=structuredClone(response);r.reviews[0].judgment='UNSUITABLE';r.reviews[0].requirements.find(c=>c.clauseId==='c1').status='MISMATCH';assert.equal(apply(r).items.length,0);const insufficient=structuredClone(response);insufficient.reviews[0].judgment='SOURCE_INSUFFICIENT';for(const c of insufficient.reviews[0].requirements){c.status='UNKNOWN';c.quotes=[];}assert.equal(apply(insufficient).items[0].candidateReview.judgment,'SOURCE_INSUFFICIENT'); });
    await check('제외 미확인은 B의 충족 판정으로 승격 금지', () => { const excluded=structuredClone(item);excluded.requestRequirements.items.find(c=>c.kind==='topic').mode='excluded';const packet=prepareReviewBatch([excluded],plan);assert.equal(applyCandidateReview([excluded],packet,response,expressionState).execution.adopted,false); });
    await check('현무암을 상위화산으로 대체하는 A 거절', () => { const q='현무암 자료',r={version:'curi-request-v1',originalQuery:q,status:'READY',clauses:[{id:'c1',kind:'topic',mode:'required',label:'화산',sourceSpans:[{start:0,end:3,quote:'현무암'}]}],expression:{op:'ref',clauseId:'c1'},expansions:[],unresolved:[],grammarSpans:[{start:4,end:6,quote:'자료'}]};assert.equal(validateInterpretation(r,{...envelope,query:q}).accepted,false); });
    await check('교육 목적은 보존하고 교육 불평등 주제는 숨기지 않음', () => {const q='민주주의 교육',r={version:'curi-request-v1',originalQuery:q,status:'READY',clauses:[{id:'c1',kind:'topic',mode:'required',label:'민주주의',sourceSpans:[{start:0,end:4,quote:'민주주의'}]},{id:'c2',kind:'purpose',mode:'context',label:'수업 활용',sourceSpans:[{start:5,end:7,quote:'교육'}]}],expression:{op:'ref',clauseId:'c1'},expansions:[],unresolved:[],grammarSpans:[]};assert.equal(validateInterpretation(r,{...envelope,query:q}).accepted,true);r.originalQuery='민주주의 교육 불평등';r.grammarSpans=[{start:8,end:11,quote:'불평등'}];assert.equal(validateInterpretation(r,{...envelope,query:r.originalQuery}).accepted,false);});
    const geo=JSON.parse(await fs.readFile('server/data/discovery-geography.json','utf8'));
    const catalog={version:'offline-model-fixture',concepts:geo.concepts,stats:{},resources:[{id:'GEO-PARK-HALLA',kind:'lesson',program:'국립공원',title:'한라산 화산 지형',summary:item.summary,sourceUrl:item.sourceUrl},{id:'other',kind:'lesson',program:'다른 프로그램',title:'화산 사례',summary:'우리나라 한라산의 화산 지형과 지역 사례를 설명하는 강의입니다.',sourceUrl:item.sourceUrl}]};
    await check('제품 경로 A/B 준비·선택프로그램·미호출', async () => { const r=await discoverTeacherContents({q:example.query,program:'국립공원'},catalog,undefined,{useSemantic:false,interpretation:example.expected,prepareModels:true});assert.equal(r.requestExecution.preparationA.status,'PREPARED_NOT_CALLED');const b=JSON.parse(r.requestExecution.preparationB.payload.input[1].content);assert.ok(b.candidates.length);assert.ok(b.candidates.every(c=>c.candidateId==='GEO-PARK-HALLA'));assert.equal(r.program,'국립공원'); });
    await check('제품 경로 A 실패는 원래조건 보존', async () => { const r=await discoverTeacherContents({q:example.query,program:'국립공원'},catalog,undefined,{useSemantic:false,interpretation:{},prepareModels:true});assert.equal(r.requestExecution.status,'FALLBACK_INVALID');assert.equal(r.program,'국립공원');assert.equal(r.requestExecution.preparationB,undefined); });
    await check('기본표시 이유·인용·남은확인 및 HTML escape', async () => { const escape=s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const context={CuriTeacher:{escape,sourceLink:url=>url}};vm.createContext(context);vm.runInContext(await fs.readFile('public/teacher-source.js','utf8'),context);const rendered=context.CuriTeacher.selectionMarkup({...apply(response).items[0],candidateReview:{...apply(response).items[0].candidateReview,selectionReason:'<script>alert(1)</script>'}});assert.ok(rendered.includes('요청과의 연결'));assert.ok(rendered.includes(item.summary));assert.ok(!rendered.includes('<script>')); });
    const after=await hashes();assert.deepEqual(after,before);assert.equal(networkAttempts,0);
    await fs.writeFile('docs/r07-19-model-preparation-check.json',JSON.stringify({date:'2026-10-14',passed:cases.length,failed:0,cases,networkAttempts,paidApiCalls:0,protectedStoresUnchanged:true,source:'OFFLINE_FIXTURES_NOT_REAL_MODEL_QUALITY'},null,2)+'\n');
    console.log(cases.length,'offline checks passed');
  } finally { global.fetch=previousFetch; }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
