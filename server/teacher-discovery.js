const { loadDiscoveryCatalog } = require("./discovery-catalog");
const { discoverContents, DiscoveryInputError } = require("./discovery-search");
const { teacherCatalog } = require("./teacher-approvals");
const { directionEvidence, groupVariants, hasRecommendationEvidence, legacyDirection } = require("./teacher-curation");
const { addContentPreview, recommendationExplanation } = require("./content-preview");
const { explainRequest, sourceChecks } = require("./source-explanation");
const { contentKeywords } = require("./content-keywords");
const { matchingLiteralExpressions: matchingExpressions, literalSource } = require("./source-literal");
const { concepts } = require("./semantic-layer");
const { filterState, prepareItems, matches, makeFacets, compareItems } = require("./teacher-filters");
const { requestEnvelope } = require("./request-envelope");
const { contractSearch } = require("./request-search-plan");
const { readDataStore } = require("./data-store");
const { getEligibleStandards } = require("./data-quality");
const { buildIndex } = require("./curriculum-discovery");
const { validateTeacherInput, combineTeacherSearch } = require("./teacher-combined-search");

const { parseGradeRequest, courseForGrade, gradeLabel } = require("../public/grade-context");

const { resourcePresentation } = require('./resource-presentation');
const { rankingContext, needsReferenceContext } = require('./request-ranking-context');

function present(item, request, selectedConcept) {
  const { filterInfo, matchedConceptGroups, ...resource } = item;
  const relevant = (item.semanticTags || []).filter((tag) => tag.conceptId === selectedConcept || request.concepts.some((concept) => concept.id === tag.conceptId));
  const tags = [...new Map([...relevant, ...(item.semanticTags || [])].map((tag) => [tag.conceptId, tag])).values()];
  const reasons = ["title", "summary"].map((field) => {
    const quotes = [...new Set([...relevant.filter((tag) => tag.evidence.field === field).map((tag) => tag.evidence.quote),
      ...request.terms.flatMap((term) => matchingExpressions(term,literalSource(item)[field]))])].slice(0, 3);
    return quotes.length ? `${field === "title" ? "제목" : "소개문"}에서 ‘${quotes.join(" · ")}’ 표현 확인` : "";
  }).filter(Boolean);
  const linkMatches = (link) => !request.relationSubject || link.subject === request.relationSubject;
  const approvedLinks = (resource.approvedLinks || []).filter(linkMatches), automaticLinks = (resource.automaticLinks || []).filter(linkMatches);
  const preview = addContentPreview({ ...resource, approvedLinks, automaticLinks, curriculumStatus: approvedLinks.length ? "APPROVED" : "NOT_ASSESSED", alternatives: undefined });
  const searchExplanation = explainRequest(item, request);
  return { ...preview, resourcePresentation: resourcePresentation(item), searchExplanation, sourceChecks: sourceChecks(item), coreTags: tags, contentKeywords: item.contentKeywords || contentKeywords(item), descriptionStatus: filterInfo.description,
    relevanceReason: reasons.join(" / ") || (request.terms.length || request.concepts.length ? item.reason : "검색 조건에 맞는 보유 자료"),
    recommendationExplanation: searchExplanation.text,
    alternatives: item.alternatives?.map((alternative) => present(alternative, request, selectedConcept)) };
}
async function discoverTeacherContents(input = {}, catalog, store, { useSemantic = true, interpretation, candidateReview, prepareModels = false, diagnostics = false, allowModelSearch = false, modelSearch } = {}) {
  validateTeacherInput(input);
  catalog = await teacherCatalog(catalog || await loadDiscoveryCatalog(), store);
  const programs = [...new Set(catalog.resources.map((item) => item.program).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const state = filterState(input, programs);
  const preparedEnvelope = requestEnvelope(input, state);
  if (preparedEnvelope.error) throw new DiscoveryInputError(preparedEnvelope.error);
  if (input.standard) {
    store ||= await readDataStore();
    if (!getEligibleStandards(store.curriculumStandards).some(entry => entry.metadata.achievementStandardId === input.standard)) throw new DiscoveryInputError("현재 공식 목록에 없는 성취기준입니다.");
  }
  if (input.place && !catalog.concepts.some(c => c.places.some(p => p.name === input.place))) throw new DiscoveryInputError("현재 목록에 없는 장소입니다.");
  const gradeContext = parseGradeRequest(String(input.q || ""), state.grade);
  gradeContext.label = gradeContext.needsClarification ? "학년 확인 필요" : gradeContext.value === "all" && gradeContext.courses.length ? gradeContext.courses.map(gradeLabel).join(" 또는 ") : gradeContext.value === "all" ? "미지정" : gradeContext.value;
  // 자연어 조건은 검색 엔진에서, 화면 필터는 전체 일치 자료에서 적용한다.
  const modelMode = allowModelSearch && (modelSearch || require('./teacher-model-search').readPolicy().enabled);
  let initial = await discoverContents({ q: input.q, place: interpretation === undefined ? input.place : undefined, page: input.page }, catalog, { includeCandidates: true, useSemantic: useSemantic && !modelMode, diagnostics });
  if (interpretation !== undefined && input.place) initial.place = input.place;
  const reviewScopeIds = input.standard && prepareModels ? new Set(buildIndex(catalog, getEligibleStandards(store.curriculumStandards)).rows.find(row => row.plan.standardId === input.standard).candidates.map(item => item.id)) : undefined;
  const runtime = preparedEnvelope.envelope ? await contractSearch(initial, catalog, preparedEnvelope.envelope, interpretation, { useSemantic, candidateReview, prepareModels, reviewScopeIds }) :
    {initial, execution:{status:"NO_QUERY",adopted:false,envelope:null,paidApiCalls:0}};
  initial = { ...runtime.initial, requestExecution: runtime.execution };
  if (prepareModels && preparedEnvelope.envelope) initial.requestExecution.preparationA = require('./request-model-preparation').prepareModelRequest('A', preparedEnvelope.envelope);
  if (runtime.execution.adopted) initial.understanding.method = "SUPPLIED_VALIDATED_CONTRACT";
  if (runtime.execution.adopted) initial.understanding.warnings = [...initial.understanding.warnings, "검증된 구조화 요청을 적용했습니다. 탐색 후보와 원문 조건 일치를 구분하며 실제 영상/수업 적합성은 별도 확인합니다."];
  if (runtime.execution.unmappedClauses?.length) initial.understanding.warnings.push("현재 검색 대조가 지원하지 않는 요구가 있습니다. 요구를 삭제하지 않았으며 조건 충족은 미확인입니다.");
  if (!runtime.execution.adopted && interpretation !== undefined) initial.understanding.warnings = [...initial.understanding.warnings, "구조화 해석은 적용하지 않았습니다. 원래 질문과 기존 선택 조건의 로컬 탐색이며 필수/제외 충족은 보장하지 않습니다."];
  if (runtime.execution.conflicts?.length) initial.understanding.warnings.push(runtime.execution.conflicts.join(" ") + " 선택 조건을 직접 해제하거나 질문을 수정해 주세요.");
  if (runtime.execution.unresolved?.length) initial.understanding.warnings.push(runtime.execution.unresolved.map(item => item.question).join(" "));
  const u = initial.understanding;
  const inferredGradeWarnings = u.constraints.gradeContext?.warnings || [];
  u.constraints.gradeContext = gradeContext;
  u.warnings = [...new Set([...u.warnings.filter((warning) => !inferredGradeWarnings.includes(warning)), ...gradeContext.warnings])];
  const noTopicWords = !u.alternativeGroups?.length && !u.contentPlan?.relations?.length && !initial.concepts.length && !u.concepts.length && !initial.terms.length && !u.requiredPrograms.length && !u.preferences.programs.length && !u.preferences.genres.length && !u.constraints.requiredGenres?.length && !u.constraints.excludedGenres?.length && !u.constraints.excludedPrograms?.length && !u.excluded.length;
  const hasContractContent = runtime.execution.adopted && runtime.execution.plan.clauses.some(c => c.mode === 'required' && ['topic','entity','program','form','geography','relation'].includes(c.kind));
  const contextOnly = noTopicWords && !hasContractContent && u.requestProjection?.contextClauses.length > 0;
  const referenceMissing = needsReferenceContext(input.q);
  const base = contextOnly || referenceMissing ? { ...initial, facetCandidates: [] } : noTopicWords && initial.query && !u.naturalLanguage?.active && !runtime.execution.adopted ? await discoverContents({ q: "" }, catalog, { includeCandidates: true }) : initial;
  const topic = input.topic ? legacyDirection(input.topic) : null;
  if (input.topic && !topic) throw new DiscoveryInputError("주제 조건이 올바르지 않습니다. 주제 선택을 해제하세요.");
  let queryCandidates = base.facetCandidates.filter((item) => {
    if (u.constraints.excludedKinds?.includes(item.kind)) return false;
    // OR의 한 주제가 오탐이어도 다른 분기의 유효한 근거가 있으면 보존한다.
    const supported = !item.matchedConceptGroups.length || item.matchedConceptGroups.some((ids) => ids.every((id) => hasRecommendationEvidence(item, [id])));
    const selectedPlaceMatches = !input.place || item.relations.some(relation => relation.place === input.place) || matchingExpressions(input.place, `${literalSource(item).title} ${literalSource(item).summary}`).length > 0;
    return selectedPlaceMatches && supported && (!topic || hasRecommendationEvidence(item, [topic.parent || topic.concept]) && directionEvidence(item, topic));
  });
  let semanticSearchResult;
  if (allowModelSearch && initial.query && interpretation === undefined && !input.standard && !referenceMissing) {
    const provider = modelSearch || require('./teacher-model-search').searchTeacherWithModel;
    const localResults = prepareItems(queryCandidates).filter(item => matches(item, filterState({}, programs))).sort(compareItems('relevance')).slice(0, 5);
    semanticSearchResult = await provider(String(input.q), catalog, { localResults });
    if (semanticSearchResult.active) {
      const { tagResource } = require('./semantic-layer');
      queryCandidates = semanticSearchResult.results.map((item, index) => ({ ...item, semanticTags: tagResource(item).supported, relations: item.relations || [], matchedConceptGroups: [], score: 10000 - index * 100 }))
        .filter(item => (!input.place || matchingExpressions(input.place, `${literalSource(item).title} ${literalSource(item).summary}`).length > 0) && (!topic || hasRecommendationEvidence(item, [topic.parent || topic.concept]) && directionEvidence(item, topic)));
      initial.understanding.method = 'LLM_SOURCE_CONDITIONS';
      initial.requestExecution = { ...initial.requestExecution, modelSearch: { status: semanticSearchResult.status, paidCalls: semanticSearchResult.paidCalls, cacheHits: semanticSearchResult.cacheHits } };
    }
  }
  if (diagnostics && initial.diagnostics) initial.diagnostics.teacher = { before: base.facetCandidates.length, afterConceptEvidence: queryCandidates.length };
  const request = { ...u, concepts: [...u.concepts, ...concepts.filter((concept) => concept.id === state.concept)], terms: initial.terms };
  if (input.standard) return combineTeacherSearch({ input, catalog, store, state, gradeContext, initial, queryCandidates, programs,
    presentCandidate: (item, subject) => present(item, { ...request, relationSubject: subject }, state.concept) });
  const relationSubject = ["사회", "과학"].includes(state.subject) ? state.subject : "";
  const scoped = gradeContext.source === "all" && !relationSubject ? queryCandidates : queryCandidates.map((item) => {
    const matchesCourse = (link) => !gradeContext.needsClarification && (!gradeContext.courses.length || gradeContext.courses.includes(link.courseId || courseForGrade(link.grade)));
    const approvedLinks = (item.approvedLinks || []).filter(matchesCourse), automaticLinks = (item.automaticLinks || []).filter(matchesCourse);
    return { ...item, approvedLinks, automaticLinks, curriculumStatus: approvedLinks.length ? "APPROVED" : "NOT_ASSESSED", teachingContext: gradeContext.source === "all" && !relationSubject ? null : { subject: relationSubject, grade: gradeContext.label, courses: gradeContext.courses, source: gradeContext.source, needsClarification: gradeContext.needsClarification, suitability: "UNCONFIRMED" } };
  });
  const items = prepareItems(scoped);
  const facets = makeFacets(items, state, programs);
  const grouped = groupVariants(items.filter((item) => matches(item, state)).sort(compareItems(state.sort, rankingContext(input.q))), state.sort === "relevance");
  if (diagnostics && initial.diagnostics) Object.assign(initial.diagnostics.teacher, { afterFilters: items.filter(item=>matches(item,state)).length, grouped: grouped.length, groupedIds: grouped.map(item=>item.id) });
  const { candidates: unused, facetCandidates: unusedFacets, ...response } = initial;
  const pages = Math.ceil(grouped.length / response.pageSize), page = Math.min(Number(input.page || 1), Math.max(1, pages));
  return { ...response, ...state, gradeContext, searchMode: initial.query ? "QUERY" : "ALL", standard: null, state: "", programs, tagConcepts: concepts.length, topic: topic?.id || "", topicLabel: topic?.label || "", pages, page, total: grouped.length,
    filters: facets, facets: Object.fromEntries(facets.kind.filter((item) => item.value !== "all").map((item) => [item.value, item.count])),
    results: grouped.slice((page - 1) * response.pageSize, page * response.pageSize).map((item) => present(item, { ...request, relationSubject }, state.concept)),
    note: "관련순은 제목·소개문의 내용 근거와 프로그램·장르 선호를 사용합니다. 학교급·학년·수업 목적·난이도 선호는 필수 단어 필터가 아니며 원문의 명시적 설명 방식을 약한 순위 신호로 사용합니다. 실제 학년 적합성·장면·교육적 효용은 별도 확인이 필요합니다.",
    countNote: semanticSearchResult?.active ? "건수는 이번 의미 검색에서 원문 조건을 확인한 후보의 판본 묶음 기준이며 전체 보유 자료의 일치 총수는 아닙니다. 필터는 확인된 후보 안에서 적용합니다." : "건수는 현재 조건의 판본 묶음 기준입니다. 각 필터의 수는 그 필터만 바꿨을 때의 결과이며 주제·교과는 겹칠 수 있습니다.",
    dateNote: "방송일은 EBS 공개 목록에 표시된 날짜이며 최초 방송일과 다를 수 있습니다. 날짜 미확인은 정렬 시 마지막에 표시합니다.",
    emptyReason: grouped.length ? null : semanticSearchResult?.status === 'SEARCH_UNAVAILABLE' ? 'SEARCH_UNAVAILABLE' : referenceMissing ? "NEEDS_CONTEXT" : contextOnly ? "TOPIC_REQUIRED" : queryCandidates.length ? "FILTERED_OUT" : "SOURCE_OR_RETRIEVAL_UNRESOLVED",
    emptyMessage: semanticSearchResult?.status === 'SEARCH_UNAVAILABLE' ? "검색을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." : referenceMissing ? "가리키는 대상이나 앞서 본 자료의 내용을 함께 적어 주세요." : contextOnly ? "찾으려는 내용이나 주제를 입력해 주세요. 시청 대상과 활용 목적만으로는 관련 자료를 정할 수 없습니다." : "현재 검색어와 필터에 맞는 자료가 없습니다. 자료 미보유·원문 부족·후보 발견 실패는 이 결과만으로 구분할 수 없습니다. 선택 조건을 해제하거나 제목·소개문에 있는 다른 표현으로 검색하세요." };
}
module.exports = { discoverTeacherContents };
