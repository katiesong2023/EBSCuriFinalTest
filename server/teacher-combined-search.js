const {lessonGoal}=require('./lesson-goal');
const { DiscoveryInputError } = require("./discovery-search");
const { readDataStore } = require("./data-store");
const { getEligibleStandards } = require("./data-quality");
const { buildIndex } = require("./curriculum-discovery");
const { labels, matchesState, selectedLinks, comparisonFor } = require("./curriculum-evidence");
const { prepareItems, matches, makeFacets, compareItems } = require("./teacher-filters");
const { groupVariants, variantKey, legacyDirection } = require("./teacher-curation");
const { concepts } = require("./semantic-layer");

const allowed = new Set(["q", "workspace", "grade", "kind", "access", "place", "program", "page", "curriculum", "topic",
  "sort", "conceptGroup", "concept", "subject", "description", "year", "from", "to", "view", "browse", "standard", "state", "standardMode", "lessonGoal", "usePurpose", "goalRequirements"]);

function validateTeacherInput(input) {
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new DiscoveryInputError("허용하지 않은 자료 검색 조건입니다.");
  if(input.standardMode && !["priority","candidates","verified"].includes(input.standardMode))throw new DiscoveryInputError("검색 범위를 확인하세요.");
  if (input.standard !== undefined && typeof input.standard !== "string") throw new DiscoveryInputError("성취기준 코드 한 개를 선택하세요.");
  if (input.state !== undefined && typeof input.state !== "string") throw new DiscoveryInputError("관계 상태 한 개를 선택하세요.");
  if (input.state && !Object.hasOwn(labels, input.state) && input.state !== "RELATION_MISSING") throw new DiscoveryInputError("관계 상태 조건이 올바르지 않습니다.");
  for (const key of ["standardMode","lessonGoal","usePurpose","goalRequirements"]) if(input[key]!==undefined && (typeof input[key]!=="string" || input[key].length>1000)) throw new DiscoveryInputError("수업 목표 입력을 확인하세요.");
  if (!input.standard && [input.lessonGoal,input.usePurpose,input.goalRequirements].some(Boolean)) throw new DiscoveryInputError("수업 목표의 기준을 선택하세요.");
  if (input.state && !input.standard) throw new DiscoveryInputError("관계 상태 조건을 적용할 성취기준을 선택하세요.");
}

function compareCombined(sort) {
  if (sort !== "relevance") return compareItems(sort);
  return (a, b) => b.ranking.relationRank - a.ranking.relationRank ||
    b.ranking.sourceQualityRank - a.ranking.sourceQualityRank || b.score - a.score ||
    b.ranking.conceptMatches - a.ranking.conceptMatches || a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id);
}

async function combineTeacherSearch({ input, catalog, store, state, gradeContext, initial, queryCandidates, programs, presentCandidate }) {
  store ||= await readDataStore();
  const standards = getEligibleStandards(store.curriculumStandards);
  // 전체 기준 색인을 재사용하되, 교사 대상 학년·탐색 태그로 공식 기준을 바꾸지 않는다.
  if (!standards.some((entry) => entry.metadata.achievementStandardId === input.standard)) {
    throw new DiscoveryInputError("현재 공식 목록에 없는 성취기준입니다. 선택 기준을 확인하세요.");
  }
  const selected = buildIndex(catalog, standards).rows.find((row) => row.plan.standardId === input.standard);
  const { plan, standard } = selected;
  const goal=lessonGoal(input,{...plan,curriculumVersion:standard.curriculumVersion});
  const relationState = input.state === "RELATION_MISSING" ? "CONCEPT_ONLY" : input.state || "";
  const queryById = new Map(queryCandidates.map((item) => [item.id, item]));
  const intersected = selected.candidates.filter((item) => queryById.has(item.id)).map((item) => {
    const queryItem = queryById.get(item.id), links = selectedLinks(item, plan);
    return { ...queryItem, ...item, score: queryItem.score, semanticTags: queryItem.semanticTags, ...links,
      curriculumStatus: links.approvedLinks.length ? "APPROVED" : "NOT_ASSESSED",
      teachingContext: { grade: gradeContext.label, targetGrade: state.grade, courses: [plan.courseId],
        standardId: plan.standardId, standard: plan.standardText, subject: plan.subject, officialGradeBand: plan.gradeBand,
        targetNeedsClarification: gradeContext.needsClarification, source: "curriculum", suitability: "UNCONFIRMED" } };
  });
  for(const item of intersected){item.lessonGoalContext=goal;item.curriculumScope='RELATED';if(input.goalRequirements){const comparisons=comparisonFor(item,plan,standard).requirementComparisons;item.ranking={...item.ranking,relationRank:comparisons.filter(r=>goal.requirements.some(g=>g.id===r.id)&&r.status==='SUPPORTED').length};}}
  const relatedIds=new Set(intersected.map(item=>item.id));
  const allowExpansion=goal.standardMode==='priority' && Boolean(initial.query) && !relationState && state.curriculum==='all';
  const expanded=allowExpansion?queryCandidates.filter(item=>!relatedIds.has(item.id)).map(item=>({...item,lessonGoalContext:goal,curriculumScope:'EXPANSION',selectedStandard:undefined,curriculumComparison:undefined,approvedLinks:[],automaticLinks:[],curriculumStatus:'NOT_ASSESSED',teachingContext:undefined})):[];
  const items = prepareItems([...intersected,...expanded]), stateItems = items.filter(item=>item.curriculumScope==='EXPANSION'||matchesState(item,relationState)).filter(item=>goal.standardMode!=='verified'||(item.approvedLinks?.length||item.automaticLinks?.length));
  // 탐색용 교과 태그는 독립 조건이다. 선택 기준 관계는 공식 교과로 이미 제한했다.
  const match = (item, filter, omit) => matches(item, filter, omit, { selectedStandard: item.curriculumScope!=="EXPANSION" });
  const filters = makeFacets(stateItems, state, programs, match);
  const count = (rows) => new Set(rows.map(variantKey)).size;
  filters.state = [["", "선택 관계 상태 전체"], ...Object.entries(labels)].map(([value, label]) => ({ value, label,
    count: count(items.filter((item) => item.curriculumScope==='RELATED' && matchesState(item, value) && match(item, state))) }));
  const compare=compareCombined(state.sort);
  const sorted=stateItems.filter(item=>match(item,state)).sort((a,b)=> (a.curriculumScope==='EXPANSION')-(b.curriculumScope==='EXPANSION') || (a.curriculumScope==='EXPANSION'?compareItems(state.sort)(a,b):compare(a,b)));
  const grouped = [...groupVariants(sorted.filter(item=>item.curriculumScope==='RELATED')),...groupVariants(sorted.filter(item=>item.curriculumScope==='EXPANSION'))];
  const pages = Math.ceil(grouped.length / initial.pageSize), page = Math.min(Number(input.page || 1), Math.max(1, pages));
  const mismatch = gradeContext.courses.length && !gradeContext.courses.includes(plan.courseId);
  const contextWarning = mismatch ? "수업 대상과 선택 기준의 과정이 다릅니다. 기준은 유지하며 영상의 대상 학년 적합성은 별도로 확인하세요." : "";
  const { candidates: unused, facetCandidates: unusedFacets, ...response } = initial;
  const combined = Boolean(initial.query), topic = input.topic ? legacyDirection(input.topic) : null;
  const emptyReason = grouped.length ? null : !selected.candidates.length ? "STANDARD_NO_CANDIDATES" :
    !items.length ? "COMBINED_NO_MATCH" : "FILTERED_OUT";
  const emptyMessage = emptyReason === "STANDARD_NO_CANDIDATES" ? "선택 기준의 원문 후보를 확보하지 못했습니다. 기준을 해제하면 일반 자료를 찾을 수 있습니다." :
    emptyReason === "COMBINED_NO_MATCH" ? "검색어와 선택 기준을 함께 만족하는 자료가 없습니다. 검색어 또는 기준을 개별 해제해 범위를 확인하세요." :
      "현재 기준 후보에 맞는 필터 결과가 없습니다. 관계 상태·유형·주제·프로그램·기간·확인 조건을 개별 해제하세요.";
  return { ...response, ...state, gradeContext, state: relationState, searchMode: combined ? "COMBINED" : "STANDARD",
    standard: { ...plan, officialSource: standard.source }, lessonGoalContext:goal, standardMode:goal.standardMode, contextWarning,
    understanding: { ...initial.understanding, warnings: [...initial.understanding.warnings, ...(contextWarning ? [contextWarning] : [])] },
    programs, tagConcepts: concepts.length, topic: topic?.id || "", topicLabel: topic?.label || "",
    pages, page, total: grouped.length, filters,
    facets: Object.fromEntries(filters.kind.filter((option) => option.value !== "all").map((option) => [option.value, option.count])),
    results: grouped.slice((page - 1) * initial.pageSize, page * initial.pageSize).map((item) => {
      const decorate = (candidate) => {
        const { searchText: unusedText, ...resource } = candidate;
        if(candidate.curriculumScope==='EXPANSION')return {...resource,curriculumRelevanceReason:'주제 확장 자료 — 선택 기준 연계 미확인',alternatives:candidate.alternatives?.map(decorate)};
        const comparison=comparisonFor(candidate,plan,standard);
        comparison.requirementComparisons=comparison.requirementComparisons.filter(r=>goal.requirements.some(g=>g.id===r.id));
        return { ...resource, selectedStandard: { ...plan, officialSource: standard.source },
          curriculumRelevanceReason: candidate.ranking.explanation,
          curriculumComparison: comparison,
          alternatives: candidate.alternatives?.map(decorate) };
      };
      return presentCandidate(decorate(item), item.curriculumScope==='RELATED'?plan.subject:'');
    }),
    emptyReason, emptyMessage,
    note: "선택 기준의 제한된 관계 설명 → 원문 품질 → 검색어 관련성·개념 표현 순입니다. 자동 비교 미지원은 부적합 판정이 아니며 영상의 학년 적합성·학생 수행은 미확인입니다.",
    countNote: "건수는 검색어·선택 기준·필터를 통과한 판본 묶음 수입니다. 각 필터 건수는 그 조건만 바꾼 전체 결과이며 중복될 수 있습니다.",
    dateNote: "방송일은 EBS 공개 목록 날짜이며 최초 방송일과 다를 수 있습니다. 날짜 미확인은 마지막에 표시합니다." };
}

module.exports = { validateTeacherInput, combineTeacherSearch };
