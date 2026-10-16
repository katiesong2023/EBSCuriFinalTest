// 새 성공 예문을 만들지 않고 기존 입력/전체 등록 어휘에 공통 불변 조건을 적용한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseDiscoveryIntent } = require('./discovery-intent');
const { vocabulary } = require('./keyword-vocabulary');
const { normalizeRequestNoun } = require('./request-nouns');
const { projectRequestContext } = require('./request-context-roles');
const { validateInterpretation } = require('./request-contract-validation');
const { discoverTeacherContents } = require('./teacher-discovery');
const inputs = [
  ...JSON.parse(fs.readFileSync('docs/r12-search-test-200-input.json')).rows,
  ...JSON.parse(fs.readFileSync('docs/r12-03-common-stable170.json')).rows.map(r => r.request)
];
const signature = q => {
  const r = parseDiscoveryIntent(q);
  return [r.terms, r.concepts.map(c => c.id), r.excluded, r.constraints.requiredGenres, r.constraints.excludedGenres, r.constraints.durationMinutes];
};
async function main() {
  let comparisons = 0;
  for (const { query } of inputs) {
    for (const context of [' 초등학생 교육용 자료', ' 중학생 학습용 영상']) {
      const changed = query + context, projection = projectRequestContext(changed);
      assert.deepEqual(signature(changed), signature(query), query);
      assert.equal(projection.contentQuery.length, changed.length);
      assert.equal(projectRequestContext(projection.contentQuery).contentQuery, projection.contentQuery);
      for (const s of [...projection.contextClauses.flatMap(c => c.sourceSpans), ...projection.grammarSpans]) assert.equal(changed.slice(s.start, s.end), s.quote);
      comparisons++;
    }
  }
  for (const noun of vocabulary) assert.equal(normalizeRequestNoun(noun), noun);
  const contracts = JSON.parse(fs.readFileSync('docs/r07-19-request-contract-development-cases.json')).rows;
  for (const row of contracts) assert.equal(validateInterpretation(row.expected, {version:'curi-request-input-v1',requestId:'structure',query:row.query,lockedConditions:[]}).accepted, true, row.id);
  // 사용자 재현 질의. 성공 표본 확대용 세트로 집계하지 않는다.
  const q = '자본주의 초등학생 교육용 자료';
  const clause = (id, kind, quote, mode) => ({id,kind,mode,label:quote,sourceSpans:[{start:q.indexOf(quote),end:q.indexOf(quote)+quote.length,quote}]});
  const supplied = {version:'curi-request-v1',originalQuery:q,status:'READY',clauses:[clause('c1','topic','자본주의','required'),clause('c2','audience','초등학생','context'),clause('c3','purpose','교육용','context')],expression:{op:'ref',clauseId:'c1'},expansions:[],unresolved:[],grammarSpans:[{start:q.indexOf('자료'),end:q.length,quote:'자료'}]};
  const env = {version:'curi-request-input-v1',requestId:'reproduction',query:q,lockedConditions:[]};
  assert.equal(validateInterpretation(supplied, env).accepted, true);
  for (const kind of ['audience','purpose','topic']) {
    const wrong = {...supplied,clauses:[{...supplied.clauses[0],kind,mode:'context',sourceSpans:[{start:0,end:q.length,quote:q}]}],expression:null,grammarSpans:[]};
    assert.equal(validateInterpretation(wrong,env).accepted,false, '주제를 문맥으로 은폐할 수 없음');
  }
  const resource = {id:'role-contract',title:'자본주의',summary:'자본주의의 시장과 경제 구조를 살펴본다.',kind:'episode',program:'계약 검사',sourceUrl:'https://www.ebs.co.kr/contract'};
  const catalog = {resources:[resource],concepts:[]}, store = {verifiedAssets:[]};
  const search = (query, options = {}) => discoverTeacherContents({q:query},catalog,store,{useSemantic:false,...options});
  const topic = await search('자본주의'), local = await search(q), structured = await search(q,{interpretation:supplied});
  assert.deepEqual(local.results.map(r=>r.id), topic.results.map(r=>r.id));
  assert.deepEqual(structured.results.map(r=>r.id), topic.results.map(r=>r.id));
  assert.equal(structured.requestExecution.adopted,true);
  const contentAudience = structuredClone(supplied);
  contentAudience.clauses[1].kind = 'entity'; contentAudience.clauses[1].mode = 'required';
  contentAudience.expression = {op:'all',children:[{op:'ref',clauseId:'c1'},{op:'ref',clauseId:'c2'}],sourceSpans:[]};
  const required = await search(q,{interpretation:contentAudience});
  assert.equal(required.requestExecution.adopted,false);
  assert.deepEqual(required.results.map(r=>r.id),topic.results.map(r=>r.id),'사용자 최신 요청: 학교급·학년은 외부 계약에서도 필수 단어 필터가 아님');
  for (const grammar of ['다루는','다룬','설명해주는']) {
    const query = `자본주의 ${grammar} 자료`, span = quote => ({start:query.indexOf(quote),end:query.indexOf(quote)+quote.length,quote});
    const contract = {version:'curi-request-v1',originalQuery:query,status:'READY',clauses:[{id:'c1',kind:'topic',mode:'required',label:'자본주의',sourceSpans:[span('자본주의')]}],expression:{op:'ref',clauseId:'c1'},expansions:[],unresolved:[],grammarSpans:[span(grammar),span('자료')]};
    const parsed = await search(query,{interpretation:contract});
    assert.equal(parsed.requestExecution.adopted,true);
    assert.deepEqual(parsed.results.map(r=>r.id),topic.results.map(r=>r.id),'검증된 문법을 원래 문장의 필수 어휘로 다시 검사하지 않음');
  }
  assert.equal((await search('초등학생 교육용 자료')).emptyReason,'TOPIC_REQUIRED');
  for (const text of ['어린이 인권','다문화 어린이','교육용 로봇','교육용 자료의 문제점','루미나비밀조약','교육용 자료 제외']) assert.equal(projectRequestContext(text).contentQuery,text);
  assert(!projectRequestContext('초등학생용 제외').contentQuery.includes('초등학생'),'학교급 제외도 필수 단어 필터로 사용하지 않음');
  const report = {checkedAt:new Date().toISOString(),existingInputs:inputs.length,contextInvarianceComparisons:comparisons,unchangedRegisteredNouns:vocabulary.length,existingContracts:contracts.length,productPaths:['LOCAL','VALIDATED_CONTRACT','CONTEXT_ONLY'],paidApiCalls:0,scope:'구조 불변/실행 계약 검사. 검색 정확도·영상 적합성 평가가 아님.'};
  fs.writeFileSync(process.env.CURI_REPORT_PATH || 'docs/r12-39-request-structure-check.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
