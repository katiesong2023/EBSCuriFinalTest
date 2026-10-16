const { isListingResource } = require('./resource-presentation');
const { concepts } = require("./semantic-layer");
const { assessSourceText, qualityLabels } = require("./source-text-quality");
const { variantKey, hasRecommendationEvidence } = require("./teacher-curation");
const { DiscoveryInputError } = require("./discovery-search");
const { courseForGrade } = require("../public/grade-context");
const { topics, topicGroups, topicIds, resourceTopics } = require("./curriculum-topics");
const legacyGroups = [
  ["citizens", "사회 · 민주주의·시민", ["democracy", "citizen", "rights", "april19", "june_democracy"]],
  ["history", "사회 · 역사·문화", ["culture", "multicultural", "dolmen", "map", "independence", "yugwansun", "donghak", "gojoseon", "three_kingdoms", "artifact", "excavation"]],
  ["life", "사회 · 경제·생활", ["economy", "prices", "population", "housing", "jobs", "transport"]],
  ["geography", "사회·공통 · 지리·환경", ["coast", "landform", "climate", "environment", "plastic", "desert", "tundra", "nature"]],
  ["biology", "과학 · 생물·생태", ["ecosystem", "bee", "wildlife", "plant", "dinosaur", "fossil"]],
  ["body", "과학 · 인체", ["body", "immunity", "digestion", "heart", "respiration"]],
  ["earth", "과학·공통 · 우주·지구", ["space", "moon", "weather", "cloud", "earthquake", "volcano", "ocean", "fog", "acidrain", "acidification", "scientist"]],
  ["matter", "과학·공통 · 물질·에너지", ["circuit", "magnet", "dissolve", "matter", "light", "force", "energy", "engineer"]]
].map(([value, label, ids]) => ({ value, label, ids }));
const groups = [...legacyGroups, ...topicGroups];
const filterConcepts = [...concepts, ...topics];
const hasEvidence = (item, id) => topicIds.has(id) ? item.filterInfo.concepts.includes(id) : hasRecommendationEvidence(item, [id]);
const labels = {
  kind: { all: "개별 영상 전체", listing: "프로그램·회차 목록", episode: "방송 회차", clip: "클립", lesson: "강의", collection: "프로그램·회차 목록" },
  subject: { all: "교과 탐색 전체", 사회: "사회", 과학: "과학", 공통: "공통", unclassified: "미분류" },
  description: { all: "원문 품질 전체", ...qualityLabels, present: "최소 원문 조건 통과", title: "소개문 없음·제목 반복" },
  curriculum: { all: "교육과정 연계 전체", approved: "사람 연계 확인", automatic: "자동 근거 검사 통과" },
  access: { all: "페이지 확인 전체", direct: "개별 회차·클립 페이지 확인" },
  sort: { relevance: "관련순", newest: "방송일 최신순", oldest: "방송일 오래된순" }
};
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}
function filterState(input, programs) {
  const state = { grade: String(input.grade || "all"), conceptGroup: String(input.conceptGroup || ""), concept: String(input.concept || ""), program: String(input.program || ""),
    year: String(input.year || ""), from: String(input.from || ""), to: String(input.to || "") };
  for (const key of Object.keys(labels)) {
    state[key] = input[key] || (key === "sort" ? "relevance" : "all");
    if (!Object.hasOwn(labels[key], state[key])) throw new DiscoveryInputError(`${key} 조건이 올바르지 않습니다.`);
  }
  if (state.grade !== "all" && !courseForGrade(state.grade)) throw new DiscoveryInputError("지원하는 학교급·과정을 선택하세요.");
  if (state.program && !programs.includes(state.program)) throw new DiscoveryInputError("현재 목록에 없는 프로그램입니다.");
  if (state.conceptGroup && !groups.some((group) => group.value === state.conceptGroup)) throw new DiscoveryInputError("주제 묶음이 올바르지 않습니다.");
  if (state.concept && state.concept !== "unclassified" && !filterConcepts.some((concept) => concept.id === state.concept)) throw new DiscoveryInputError("개념 조건이 올바르지 않습니다.");
  if (state.conceptGroup && state.concept && !groups.find((group) => group.value === state.conceptGroup).ids.includes(state.concept)) throw new DiscoveryInputError("선택한 주제 묶음의 개념을 선택하세요.");
  if (state.year && state.year !== "unknown" && !/^\d{4}$/.test(state.year)) throw new DiscoveryInputError("방송 연도가 올바르지 않습니다.");
  if (state.from && !validDate(state.from) || state.to && !validDate(state.to) || state.from && state.to && state.from > state.to) throw new DiscoveryInputError("방송 기간의 시작일·종료일을 확인하세요.");
  if (state.year && (state.from || state.to)) throw new DiscoveryInputError("방송 연도와 날짜 범위 중 하나를 선택하세요.");
  return state;
}
const prepared = new WeakMap();
function prepareItems(items) {
  if (prepared.has(items)) return prepared.get(items);
  const result = items.map((item) => {
    const tags = item.semanticTags || [], ids = [...tags.map((tag) => tag.conceptId), ...resourceTopics(item)], sourceQuality = assessSourceText(item.title, item.summary);
    return { ...item, sourceQuality, filterInfo: { key: variantKey(item), concepts: ids,
      groups: groups.filter((group) => group.ids.some((id) => ids.includes(id))).map((group) => group.value),
      subjects: [...new Set(tags.map((tag) => tag.subject))], description: sourceQuality.category,
      date: item.kind === "collection" ? "" : validDate(item.broadcastDate), direct: item.navigation?.status === "MATCHED" && ["CLIP", "EPISODE"].includes(item.navigation.kind) } };
  });
  prepared.set(items, result); return result;
}
function matches(item, state, omit = "", { selectedStandard = false } = {}) {
  const meta = item.filterInfo;
  return (omit === "kind" || (state.kind === "all" ? !isListingResource(item) : state.kind === "listing" ? isListingResource(item) : state.kind === "lesson" ? item.kind === "lesson" && !isListingResource(item) : item.kind === state.kind)) &&
    (omit === "program" || !state.program || state.program === item.program) &&
    (omit === "subject" || state.subject === "all" || (state.subject === "unclassified" ? !meta.subjects.length : meta.subjects.includes(state.subject))) &&
    (omit === "description" || state.description === "all" || state.description === meta.description || state.description === "present" && item.sourceQuality.detailedMappingAllowed || state.description === "title" && ["none", "repeated"].includes(meta.description)) &&
    (omit === "access" || state.access === "all" || meta.direct) &&
    (omit === "curriculum" || state.curriculum === "all" || ((state.curriculum === "approved" ? item.approvedLinks : item.automaticLinks)?.some((link) => selectedStandard || omit === "subject" || !["사회", "과학"].includes(state.subject) || link.subject === state.subject))) &&
    (omit === "conceptGroup" || !state.conceptGroup || groups.find((group) => group.value === state.conceptGroup).ids.some((id) => meta.concepts.includes(id) && hasEvidence(item, id))) &&
    (["concept", "conceptGroup"].includes(omit) || !state.concept || (state.concept === "unclassified" ? !meta.concepts.length : meta.concepts.includes(state.concept) && hasEvidence(item, state.concept))) &&
    (omit === "date" || (!state.year || (state.year === "unknown" ? !meta.date : meta.date.startsWith(state.year))) &&
      (!state.from || meta.date && meta.date >= state.from) && (!state.to || meta.date && meta.date <= state.to));
}
function makeFacets(items, state, programs, match = matches) {
  const count = (list) => new Set(list.map((item) => item.filterInfo.key)).size;
  const options = (list, key, definitions) => definitions.map(([value, label]) => ({ value, label, count: count(list.filter((item) => match(item, { ...state, [key]: value }))) }));
  const result = {};
  for (const key of ["kind", "subject", "description", "curriculum", "access"]) {
    const list = items.filter((item) => match(item, state, key));
    result[key] = options(list, key, Object.entries(labels[key]));
  }
  result.program = options(items.filter((item) => match(item, state, "program")), "program", [["", "전체 프로그램"], ...programs.map((program) => [program, program])]);
  const groupItems = items.filter((item) => match(item, state, "conceptGroup"));
  result.conceptGroup = [["", "주제 묶음 전체"], ...groups.map((group) => [group.value, group.label])].map(([value, label]) => ({ value, label, count: count(groupItems.filter((item) => match(item, { ...state, conceptGroup: value, concept: "" }))) }));
  const definitions = filterConcepts.filter((concept) => !state.conceptGroup || groups.find((group) => group.value === state.conceptGroup).ids.includes(concept.id));
  result.concept = options(items.filter((item) => match(item, state, "concept")), "concept", [["", "개념 전체"], ...definitions.map((concept) => [concept.id, concept.label]), ...(!state.conceptGroup ? [["unclassified", "미분류 · 등록 개념 태그 없음"]] : [])]);
  // 통합 주제에서는 현재 주제 선택을 제외한 조건으로 모든 큰 범위·세부 주제를 비교한다.
  const topicState = { ...state, conceptGroup: "", concept: "", subject: "all" };
  const topicItems = items.filter(item => match(item, topicState));
  const topicCount = update => count(topicItems.filter(item => match(item, { ...topicState, ...update })));
  result.topicChoices = topicGroups.map(group => ({ value: group.value, label: group.label.replace(/^.*? · /u, ""),
    count: topicCount({ conceptGroup: group.value }),
    concepts: topics.filter(concept => group.ids.includes(concept.id)).map(concept => ({ value: concept.id,
      label: concept.label, curriculumUnits: concept.units, count: topicCount({ concept: concept.id }) })) }));
  result.topicUnclassified = { value: "unclassified", label: "미분류", count: topicCount({ concept: "unclassified" }) };
  const dated = items.filter((item) => match(item, state, "date"));
  const years = [...new Set(items.map((item) => item.filterInfo.date.slice(0, 4)).filter(Boolean))].sort().reverse();
  if (state.year && state.year !== "unknown" && !years.includes(state.year)) years.push(state.year);
  result.year = [["", "기간 전체"], ...years.map((year) => [year, `${year}년`]), ["unknown", "날짜 미확인"]].map(([value, label]) => ({ value, label, count: count(dated.filter((item) => match(item, { ...state, year: value, from: "", to: "" }))) }));
  return result;
}
function compareItems(sort, rankingContext) {
  return (a, b) => {
    if (sort !== "relevance") {
      const ad = a.filterInfo.date, bd = b.filterInfo.date;
      if (Boolean(ad) !== Boolean(bd)) return ad ? -1 : 1;
      if (ad !== bd) return sort === "newest" ? bd.localeCompare(ad) : ad.localeCompare(bd);
    } else {
      const context = require('./request-ranking-context').contextRank;
      const relevance = (b.score + context(b, rankingContext) * 10) - (a.score + context(a, rankingContext) * 10);
      if (relevance) return relevance;
      if (a.sourceQuality.rank !== b.sourceQuality.rank) return b.sourceQuality.rank - a.sourceQuality.rank;
    }
    return a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id);
  };
}
module.exports = { groups, labels, validDate, filterState, prepareItems, matches, makeFacets, compareItems };
