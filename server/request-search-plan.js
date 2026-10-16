const { historicalPlaceEvidence } = require('./historical-place');
const {discoverContents}=require('./discovery-search');
const {matchingLiteralExpressions:matchingExpressions,literalText,literalSource}=require('./source-literal');
const {geographicScopeEvidence,matchesPlaceTerm}=require('./search-geographic-scope');
const {genreEvidence}=require('./discovery-genre');
const {parseDiscoveryIntent}=require('./discovery-intent');
const {requestRelationEvidence}=require('./request-relation-evidence');
const {dateBounds}=require("./request-date-condition");
const {validateInterpretation}=require('./request-contract-validation');
const {projectRequestContext}=require('./request-context-roles');
const {concepts}=require('./semantic-layer');
const {prepareReviewBatch,applyCandidateReview}=require('./candidate-review');
const {prepareModelRequest}=require('./request-model-preparation');
const {filterState,prepareItems,matches,compareItems}=require('./teacher-filters');
const {groupVariants}=require('./teacher-curation');
const {rankingContext}=require('./request-ranking-context');
const hard=new Set(['geography','program','form','date','curriculum']);
function expressionState(node,states,discovery=false){
 if(!node)return 'UNKNOWN';
 if(node.op==='ref'){const item=states.get(node.clauseId);if(!item)return 'UNKNOWN';return discovery&&item.status==='UNKNOWN'?(hard.has(item.kind)||item.discoveryAllowed===false?'MISMATCH':'MATCH'):item.status;}
 const values=node.children.map(child=>expressionState(child,states,discovery));
 return node.op==='all'?(values.includes('MISMATCH')?'MISMATCH':values.includes('UNKNOWN')?'UNKNOWN':'MATCH'):(values.includes('MATCH')?'MATCH':values.includes('UNKNOWN')?'UNKNOWN':'MISMATCH');
}
function matchesLabel(label,program){return label===program||label===program.replace(/^EBS\s+/u,'')||label===program.split(',')[0];}
function lockedConflicts(result,envelope){
 const locked=new Map(envelope.lockedConditions.map(c=>[c.name,c.value]));const program=locked.get('program');
 const selectedDate={from:locked.get('from') || (locked.get('year') && locked.get('year')!=='unknown' ? locked.get('year')+'-01-01':'0000-01-01'),to:locked.get('to') || (locked.get('year') && locked.get('year')!=='unknown'?locked.get('year')+'-12-31':'9999-12-31')};
 const states=new Map(result.clauses.map(c=>{
  let status='MATCH';
  if(c.kind==='program'&&program){const match=matchesLabel(c.label,program);status=(c.mode==='excluded'?!match:match)?'MATCH':'MISMATCH';}
  if(c.kind==='date'){
   const range=dateBounds(c.label);
   if(range){const impossible=c.mode==='excluded'?range.from<=selectedDate.from&&range.to>=selectedDate.to:range.from>selectedDate.to||range.to<selectedDate.from;status=impossible?'MISMATCH':'MATCH';}
  }
  return [c.id,{kind:c.kind,status}];
 }));
 return expressionState(result.expression,states)==='MISMATCH'?['선택한 프로그램/기간과 요청의 필수·제외 조건이 충돌합니다.']:[];
}
function clauseState(clause,item,sets){
 const unknown={clauseId:clause.id,kind:clause.kind,mode:clause.mode,label:clause.label,status:'UNKNOWN',evidence:[],basis:'UNSUPPORTED_OR_INSUFFICIENT_SOURCE'};
 let status='UNKNOWN',evidence=[],basis=unknown.basis;
 if(['topic','entity'].includes(clause.kind)){
  const found=sets.get(clause.id)?.has(item.id);
  const explicit=matchingExpressions(clause.label,`${literalSource(item).title} ${literalSource(item).summary}`).length>0 || item.relations?.some(r=>r.concept===clause.label) || item.semanticTags?.some(t=>t.label===clause.label);
  status=found&&explicit?'MATCH':'UNKNOWN';basis=found?'SOURCE_TOPIC_CANDIDATE':'NO_ORIGINAL_TOPIC_EVIDENCE';
  for(const field of ['title','summary'])for(const quote of matchingExpressions(clause.label,literalSource(item)[field])){const start=literalSource(item)[field].indexOf(quote);if(start>=0)evidence.push({field,start,end:start+quote.length,quote});}
  if(clause.mode==='excluded')status=found?'MISMATCH':'UNKNOWN';
 }else if(clause.kind==='geography'){
  if(['국내','한국','대한민국','우리나라','해외','외국'].includes(clause.label)){
   const domestic=['국내','한국','대한민국','우리나라'].includes(clause.label);
   const wanted=geographicScopeEvidence(item,{required:[domestic?'DOMESTIC':'FOREIGN']});
   const opposite=geographicScopeEvidence(item,{required:[domestic?'FOREIGN':'DOMESTIC']});
   status=wanted.matches?'MATCH':opposite.matches?'MISMATCH':'UNKNOWN';evidence=wanted.evidence;basis='SOURCE_LOCATION_CUE';
  }else{
   const text=matchingExpressions(clause.label,`${literalSource(item).title} ${literalSource(item).summary}`).length>0||matchesPlaceTerm(clause.label,item);
   status=text?'MATCH':'UNKNOWN';basis='SOURCE_PLACE_CUE';
   for(const field of ['title','summary'])for(const quote of matchingExpressions(clause.label,literalSource(item)[field])){const start=literalSource(item)[field].indexOf(quote);if(start>=0)evidence.push({field,start,end:start+quote.length,quote});}
  }
  if(clause.mode==='excluded')status=status==='MATCH'?'MISMATCH':status==='MISMATCH'?'MATCH':'UNKNOWN';
 }else if(clause.kind==='program'){
  status=matchesLabel(clause.label,item.program)?'MATCH':'MISMATCH';basis='CATALOG_PROGRAM';
  if(clause.mode==='excluded')status=status==='MATCH'?'MISMATCH':'MATCH';
 }else if(clause.kind==='form'){
  const forms=genreEvidence(item);status=forms.some(f=>f.label===clause.label)?'MATCH':'UNKNOWN';basis='SOURCE_FORM_CUE';
  if(clause.mode==='excluded')status=status==='MATCH'?'MISMATCH':'UNKNOWN';
 }else if(clause.kind==='relation'){
  if(clause.label==='지역 사례'&&item.relations?.length){status='MATCH';basis='INDEXED_TOPIC_PLACE_RELATION';}
  const original=parseDiscoveryIntent(clause.sourceSpans.map(s=>s.quote).join(' '));
  const source=requestRelationEvidence(item,original,[]);evidence=source.evidence; // 범용 관계 충족 판정은 후속 B로 넘긴다.
 }else if(clause.kind==='duration'){
  const max=clause.label.match(/^(\d+)분\s*(이내|이하|미만)$/u);
  if(max&&item.durationSeconds&&item.durationSourceUrl){status=(max[2]==='미만'?item.durationSeconds<Number(max[1])*60:item.durationSeconds<=Number(max[1])*60)?'MATCH':'MISMATCH';basis='SOURCE_DURATION';}
  if(clause.mode==='excluded')status=status==='MATCH'?'MISMATCH':status==='MISMATCH'?'MATCH':'UNKNOWN';
 }else if(clause.kind==='date'){
  const range=dateBounds(clause.label);if(range&&/^\d{4}-\d{2}-\d{2}$/.test(item.broadcastDate || '')){status=item.broadcastDate>=range.from&&item.broadcastDate<=range.to?'MATCH':'MISMATCH';basis='CATALOG_BROADCAST_DATE';}
  if(clause.mode==='excluded')status=status==='MATCH'?'MISMATCH':status==='MISMATCH'?'MATCH':'UNKNOWN';
 }else if(clause.kind==='purpose'||clause.kind==='audience'){status='UNKNOWN';basis='CLASSROOM_CONTEXT_ONLY';}
 const narrow=clause.kind==='entity'||clause.kind==='topic'&&concepts.some(c=>c.specificAliases.includes(clause.label));
 return {...unknown,status,evidence,basis,...(narrow&&status==='UNKNOWN'?{discoveryAllowed:false}:{})};
}
async function contractSearch(initial,catalog,envelope,result,{useSemantic=true,candidateReview,prepareModels=false,reviewScopeIds}={}){
 if(result===undefined)return {initial,execution:{status:'LOCAL_ONLY',adopted:false,envelope,paidApiCalls:0,reason:'NO_INTERPRETATION_SUPPLIED'}};
 const validation=validateInterpretation(result,envelope);
 if(!validation.accepted)return {initial,execution:{status:'FALLBACK_INVALID',adopted:false,envelope,validation,paidApiCalls:0,conditionAssurance:'UNCONFIRMED',reason:'원래 질문과 기존 선택 조건의 로컬 탐색입니다. 구조화 해석을 적용하지 않았으며 필수/제외 조건 충족을 보장하지 않습니다.'}};
 // 학교급·학년·활용 선호를 외부 계약이 내용어 필수 조건으로 승격하지 못한다.
 if(result.clauses.some(c=>['required','excluded'].includes(c.mode)&&['topic','entity','audience','purpose'].includes(c.kind)&&!rankingContext(c.label).contentQuery.trim()))return {initial,execution:{status:'FALLBACK_RANKING_CONTEXT',adopted:false,envelope,validation,paidApiCalls:0,reason:'학년·활용 선호는 단어 필터로 적용하지 않고 원래 질문의 내용 검색을 유지합니다.'}};
 const conflicts=lockedConflicts(result,envelope);
 if(result.status!=='READY'||conflicts.length)return {initial,execution:{status:'NEEDS_CLARIFICATION',interpretationStatus:result.status,adopted:false,envelope,validation,conflicts,unresolved:result.unresolved,paidApiCalls:0,conditionAssurance:'UNCONFIRMED'}};
 const plan={version:result.version,originalQuery:result.originalQuery,clauses:result.clauses,expression:result.expression,expansions:result.expansions,lockedConditions:envelope.lockedConditions};
 // 문맥의 역할은 검증된 계약이 소유한다. 원래 문자열의 대상/목적을 내용 조건으로 재사용하지 않는다.
 const projection=projectRequestContext(envelope.query,result);
 const projected=await discoverContents({q:projection.contentQuery.trim(),page:initial.page},catalog,{includeCandidates:true,useSemantic,interpretContext:false});
 initial={...initial,understanding:{...projected.understanding,requestProjection:projection},terms:projected.terms,concepts:projected.concepts};
 if(projection.contextClauses.some(c=>c.kind==='audience'))initial.understanding.constraints.audience='SPECIFIED';
 const base=await discoverContents({q:''},catalog,{includeCandidates:true,useSemantic:false});
 const byId=new Map(base.facetCandidates.map(item=>[item.id,item])),sets=new Map(),seed=new Set();
 const content=result.clauses.filter(c=>['topic','entity'].includes(c.kind));
 for(const c of content){const response=await discoverContents({q:c.label},catalog,{includeCandidates:true,useSemantic,interpretContext:false});sets.set(c.id,new Set(response.facetCandidates.map(x=>x.id)));for(const item of response.facetCandidates){if(c.mode!=='excluded')seed.add(item.id);const old=byId.get(item.id);if(!old||item.score>old.score)byId.set(item.id,item);}}
 for(const e of result.expansions){const response=await discoverContents({q:e.text},catalog,{includeCandidates:true,useSemantic});for(const item of response.facetCandidates){seed.add(item.id);if(!byId.has(item.id))byId.set(item.id,item);}}
 if(!content.some(c=>c.mode!=='excluded'))for(const id of byId.keys())seed.add(id);
 const candidates=[];
 for(const id of seed){const item=byId.get(id);
  const historicalContext=historicalPlaceEvidence(item,initial.understanding.contentPlan?.historicalPlace);
  if(historicalContext.requested&&!historicalContext.matched)continue;
  // 각 내용 절의 검색에서 원문 문맥을 이미 검사했다. 계약 실행은 검증된 논리식이 소유한다.
  // 원래 문장의 어휘 조건을 다시 적용하면 문법·선호·OR와 의미 확장 후보가 다시 누락된다.
  const requirements=result.clauses.map(c=>clauseState(c,item,sets));const states=new Map(requirements.map(s=>[s.clauseId,s]));
  if(expressionState(plan.expression,states,true)!=='MATCH')continue;
  const status=expressionState(plan.expression,states);
  const preferenceScore=requirements.filter(s=>s.mode==='preferred'&&s.status==='MATCH').length*25;
  candidates.push({...item,...(historicalContext.requested?{historicalContext}:{}),score:item.score+preferenceScore+(historicalContext.rank-(item.historicalContext?.rank||0))*100,requestRequirements:{status,confirmation:status==='MATCH'?'SOURCE_REQUIREMENTS_MATCH':'DISCOVERY_ONLY',items:requirements,note:'원문/메타데이터 기준의 조건 대조입니다. 영상 장면·난이도·사람 승인은 확인되지 않았습니다.'}});
 }
 const selected=Object.fromEntries(envelope.lockedConditions.map(c=>[c.name,c.value]));
 const programs=[...new Set(catalog.resources.map(item=>item.program).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 const state=filterState(selected,programs);
 const batchItems=groupVariants(prepareItems(candidates).filter(item=>matches(item,state)&&(!reviewScopeIds||reviewScopeIds.has(item.id))).sort(compareItems(state.sort)),state.sort==='relevance');
 const batch=prepareReviewBatch(batchItems,plan);
 const review=candidateReview===undefined?{items:candidates,execution:{status:'NOT_SUPPLIED',adopted:false,externalApiCalls:0}}:applyCandidateReview(candidates,batch,candidateReview,expressionState);
 return {initial:{...initial,candidates:review.items,facetCandidates:review.items},execution:{status:'SUPPLIED_CONTRACT_APPLIED',adopted:true,envelope,validation,plan,source:'CALLER_SUPPLIED_NOT_LLM_EXECUTION',paidApiCalls:0,candidateReview:review.execution,...(prepareModels?{preparationB:batch.candidates.length?prepareModelRequest('B',envelope,batch):{status:'SKIPPED_NO_CANDIDATES',externalApiCalls:0}}:{}),unmappedClauses:result.clauses.filter(c=>!['topic','entity','geography','program','form','relation','duration','date','purpose','audience'].includes(c.kind)).map(c=>c.id)}};
}
module.exports={contractSearch,expressionState,lockedConflicts};
