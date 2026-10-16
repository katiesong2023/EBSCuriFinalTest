const {goalRequirements}=require('./lesson-goal');
const {loadDiscoveryCatalog}=require('./discovery-catalog');
const {teacherCatalog}=require('./teacher-approvals');
const {readDataStore}=require('./data-store');
const {getEligibleStandards}=require('./data-quality');
const {assessSourceText}=require('./source-text-quality');
const {requirementPlan}=require('./curriculum-requirements');
const {assessRelation,ruleVersion}=require('./automatic-relation-rules');
const {sourceChecks,explainRequest}=require('./source-explanation');
const {labels,candidateStates,matchesState,selectedLinks,comparisonFor}=require('./curriculum-evidence');
const {aliasRegex,tagResource}=require('./semantic-layer');
const {addContentPreview}=require('./content-preview');
const {groupVariants,hasRecommendationEvidence}=require('./teacher-curation');
const {DiscoveryInputError}=require('./discovery-search');
const {courseOptions,courseForGrade,standardCourse,matchesStandard,gradeLabel}=require('../public/grade-context');
const {summarizeGradeEvidence}=require('./grade-evidence-summary');
const {buildQueue,gapTopics}=require('./curriculum-source-queue');
const cache=new WeakMap();
function buildIndex(catalog,standards){
 const signature=JSON.stringify([standards,ruleVersion]);if(cache.get(catalog)?.signature===signature)return cache.get(catalog).value;
 const resources=catalog.resources.filter(i=>i.kind!=='collection').map(item=>({...item,sourceQuality:assessSourceText(item.title,item.summary),
  searchText:[item.title,item.summary,...(item.sourceSupplements||[]).map(source=>source.text)].join(' ').normalize('NFKC').toLowerCase()}));
 // 여러 기준에 반복되는 용어는 같은 원문 집합에서 한 번만 대조한다.
 const postings=new Map();
 const matchesTerm=term=>{
  if(!postings.has(term)){
   const pattern=aliasRegex(term),ids=new Set();
   resources.forEach((item,index)=>{pattern.lastIndex=0;if(pattern.test(item.searchText))ids.add(index);});
   postings.set(term,ids);
  }
  return postings.get(term);
 };
 const rows=standards.map(standard=>{
  const plan=requirementPlan(standard);
  const anchors=plan.anchors.map(aliasRegex);
  const discoveryAliases=[...plan.relationTerms,...plan.conceptAliases];
  const patterns=[...new Set([...plan.terms,...discoveryAliases])].map(term=>({term,ids:matchesTerm(term)}));
  const candidateIds=new Set(patterns.flatMap(p=>[...p.ids]));
  const candidates=[...candidateIds].map(index=>{const item=resources[index];let matchedTerms=patterns.filter(p=>p.ids.has(index)).map(p=>p.term);
   // 보조 원문은 후보 발견의 주제 경계에만 사용한다. 아래 요구 판정과 소개문 품질에는 합치지 않는다.
   const discoveryItem=(item.sourceSupplements||[]).length?{...item,summary:[item.summary,...item.sourceSupplements.map(source=>source.text)].join('\n')}:item;
   if(matchedTerms.includes("화석")&&!tagResource(discoveryItem).supported.some(t=>t.conceptId==="fossil"))matchedTerms=matchedTerms.filter(t=>t!=="화석");
   if(!matchedTerms.length||anchors.length&&!matchedTerms.some(term=>discoveryAliases.includes(term))&&!anchors.some(pattern=>{pattern.lastIndex=0;return pattern.test(item.searchText);}))return null;
   if(matchedTerms.some(t=>["우주","태양계","행성"].includes(t))&&!hasRecommendationEvidence(discoveryItem,["space"]))return null;
   const semantic=assessRelation({synopsis:item.summary||''},standard);
   const states=candidateStates({...item,semantic});
   const supported=semantic.supportedRequirements.length;
   const relationRank=item.sourceQuality.detailedMappingAllowed&&semantic.status!=='CONFLICT'?supported:0;
   const ranking={ruleSupported:plan.ruleSupported,confirmedRequirements:supported,limitedRequirements:plan.requirements.length,
    relationRank,sourceQualityRank:Number(item.sourceQuality.detailedMappingAllowed)*10+item.sourceQuality.rank,conceptMatches:matchedTerms.length,
    explanation:plan.ruleSupported?`제한된 요구 ${supported}/${plan.requirements.length}개의 직접 설명 → ${item.sourceQuality.label} → 개념 표현 ${matchedTerms.length}개`:
      `자동 비교 미지원 · ${item.sourceQuality.label} → 개념 표현 ${matchedTerms.length}개. 미지원을 불일치 점수로 쓰지 않습니다.`};
   return {...item,matchedTerms,semantic,ranking,candidateStates:states,candidateState:states[0],score:matchedTerms.length*10};
  }).filter(Boolean).sort((a,b)=>b.ranking.relationRank-a.ranking.relationRank||b.ranking.sourceQualityRank-a.ranking.sourceQualityRank||b.matchedTerms.length-a.matchedTerms.length||a.id.localeCompare(b.id));
  // 이미 관계→원문→개념 순으로 정렬했다. 더 긴 다른 판본으로 관계 근거를 바꾸지 않는다.
  const grouped=groupVariants(candidates);
  const counts=Object.fromEntries(Object.keys(labels).map(key=>[key,groupVariants(candidates.filter(i=>matchesState(i,key)),true).length]));
  return {standard,plan,candidates,grouped,counts,total:grouped.length};
 });
 const value={rows,queue:buildQueue(rows)};cache.set(catalog,{signature,value});return value;
}
function summarize(rows,resources=[]){
 const ids=new Set(),minimumIds=new Set(),approved=new Set(),automatic=new Set();
 for(const row of rows)for(const item of row.candidates){
  ids.add(item.id);if(item.sourceQuality.detailedMappingAllowed)minimumIds.add(item.id);
 }
 const standards=new Map(rows.map(row=>[row.plan.standardId,row.plan]));
 for(const item of resources)for(const [links,target] of [[item.approvedLinks,approved],[item.automaticLinks,automatic]])for(const link of links||[]){
  const plan=standards.get(link.standardId);
  if(plan&&link.subject===plan.subject&&matchesStandard(link,plan.courseId))target.add(`${item.id}:${link.standardId}`);
 }
 return {standards:rows.length,noCandidate:rows.filter(r=>!r.total).length,titleOnly:rows.filter(r=>r.total&&r.candidates.every(i=>i.candidateStates.includes('TITLE_ONLY'))).length,
  withoutMinimumDescription:rows.filter(r=>r.total&&r.candidates.every(i=>!i.sourceQuality.detailedMappingAllowed)).length,
  withoutSupportedRelation:rows.filter(r=>r.plan.ruleSupported&&!r.counts.PARTIAL_SUPPORTED).length,
  conceptOnly:rows.filter(r=>r.counts.CONCEPT_ONLY>0).length,interpretationHeld:rows.filter(r=>r.counts.INTERPRETATION_HELD>0).length,
  explicitConflict:rows.filter(r=>r.counts.EXPLICIT_CONFLICT>0).length,
  comparisonEligibleRelations:rows.reduce((n,r)=>n+r.candidates.filter(i=>r.plan.ruleSupported&&i.sourceQuality.detailedMappingAllowed).length,0),
  countNote:'기준 수와 자료×기준 관계 수를 구분합니다. 미지원·소개문 부족은 중복될 수 있고, 지원 관계 없음의 분모는 자동 비교 지원 기준입니다. 공식 보조 원문이 있는 자료는 제목 후보뿐에서 제외하지만 소개문 품질·자동 요구 판정은 바꾸지 않습니다.',
  ruleSupported:rows.filter(r=>r.plan.ruleSupported).length,
  ruleUnsupported:rows.filter(r=>!r.plan.ruleSupported).length,candidateRelations:rows.reduce((n,r)=>n+r.candidates.length,0),
  uniqueResources:ids.size,uniqueResourcesWithMinimumText:minimumIds.size,automaticPublicRelations:automatic.size,humanApprovedRelations:approved.size};
}
function present(item,plan,standard){
 const {searchText,score,alternatives,...rest}=item,tags=tagResource(item).supported;
 const links=selectedLinks(item,plan);
 const decorated={...rest,...links,curriculumStatus:links.approvedLinks.length?'APPROVED':'NOT_ASSESSED',
  teachingContext:{grade:plan.courseLabel,courses:[plan.courseId],standardId:plan.standardId,standard:plan.standardText,subject:plan.subject,source:'curriculum',suitability:'UNCONFIRMED'},
  semanticTags:tags,coreTags:tags.slice(0,3),kindLabel:({episode:'일반방송 회차',clip:'교과 클립',lesson:'강의'})[item.kind]||item.kind,
  descriptionStatus:item.sourceQuality.category,sourceChecks:sourceChecks(item),relevanceReason:item.ranking.explanation,
  curriculumComparison:comparisonFor(item,plan,standard)};
 decorated.searchExplanation=explainRequest(decorated,{terms:item.matchedTerms});
 return {...addContentPreview(decorated),alternatives:alternatives?.map(i=>present(i,plan,standard))};
}
async function discoverCurriculum(input={},catalog,store){
 if(Object.keys(input).some(k=>!['standard','subject','page','state','grade'].includes(k)))throw new DiscoveryInputError('허용하지 않은 교육과정 조건');
 if(input.subject&&!['사회','과학'].includes(input.subject))throw new DiscoveryInputError('교과 조건 오류');
 if(input.page&&!/^[1-9]\d{0,4}$/.test(String(input.page)))throw new DiscoveryInputError('페이지 조건 오류');
 if(input.state&&!Object.hasOwn(labels,input.state)&&input.state!=='RELATION_MISSING')throw new DiscoveryInputError('공백 조건 오류');
 const grade=input.grade||'all';
 if(grade!=='all'&&!courseForGrade(grade))throw new DiscoveryInputError('초등 3~6학년 또는 중학교 1학년 과정을 선택하세요.');
 store||=await readDataStore();catalog=await teacherCatalog(catalog||await loadDiscoveryCatalog(),store);
 const standards=getEligibleStandards(store.curriculumStandards);
 const index=buildIndex(catalog,standards);
 const scoped=index.rows.filter(r=>(!input.subject||r.plan.subject===input.subject)&&matchesStandard(r.standard,grade));
 const selected=input.standard?scoped.find(r=>r.plan.standardId===input.standard):null;
 if(input.standard&&!selected)throw new DiscoveryInputError('현재 공식 목록에 없는 성취기준');
 const options=scoped.map(r=>({curriculumVersion:r.standard.curriculumVersion,id:r.plan.standardId,text:r.plan.standardText,subject:r.plan.subject,gradeBand:r.plan.gradeBand,
  schoolLevel:r.plan.schoolLevel,courseId:r.plan.courseId,courseLabel:r.plan.courseLabel,placement:r.plan.placement,officialCheck:r.plan.officialCheck,
  goalTopic:(r.plan.anchors.length?r.plan.anchors:r.plan.terms).slice(0,4).join(" · "),goalSummary:goalRequirements(r.plan).map(requirement=>requirement.text).join(" / "),goalRequirements:goalRequirements(r.plan),total:r.total,counts:r.counts,countNote:'표시 자료 묶음 수. 미지원·소개문 부족은 중복될 수 있습니다.',ruleSupported:r.plan.ruleSupported,gap:r.total?'CANDIDATES':'NO_CANDIDATE'}));
 const rows=selected?groupVariants(selected.candidates.filter(i=>matchesState(i,input.state))):[];
 const pageSize=9,pages=Math.ceil(rows.length/pageSize),page=Math.min(Number(input.page||1),Math.max(1,pages));
 const queue=buildQueue(scoped);
 const evidence=catalog.liveSource===true?await summarizeGradeEvidence(store,{broadcasts:catalog.resources}):null;
 const segments=courseOptions.flatMap(course=>['사회','과학'].map(subject=>({courseId:course.value,courseLabel:course.label,subject,
  ...summarize(index.rows.filter(r=>r.plan.courseId===course.value&&r.plan.subject===subject),catalog.resources),
  evidence:evidence?.available?evidence.segments.find(segment=>segment.courseId===course.value&&segment.subject===subject)||null:null,
  acquiredStandards:store.curriculumStandards.filter(s=>standardCourse(s)===course.value&&s.metadata.subject===subject).length})));
 return {standards:options,standard:selected?{...selected.plan,officialSource:selected.standard.source}:null,results:rows.slice((page-1)*pageSize,page*pageSize).map(i=>present(i,selected.plan,selected.standard)),
  total:rows.length,pages,page,pageSize,state:input.state||'',labels,queue:queue.slice(0,200),queueTotal:queue.length,gapTopics:gapTopics(scoped),
  grade,selectedGrade:grade,courseOptions,segments,evidenceSummaryNote:evidence?.available?evidence.note:'검사 이력을 읽지 못했거나 현재 실행에서 제공하지 않습니다.',summary:{...summarize(scoped,catalog.resources),segments},
  scope:`${grade==='all'?'초등 3~6학년·중학교 1학년':gradeLabel(grade)} 사회·과학. 중1은 2022 개정 EBS 뉴런 편성 참고이며 학교별 배치·영상 학년 적합성은 미확인입니다. 후보 탐색·자동 규칙 지원·사람 승인은 별도입니다.`,paidApiCalls:0};
}
module.exports={discoverCurriculum,buildIndex,summarize};
