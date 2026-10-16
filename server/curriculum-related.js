const { readDataStore } = require("./data-store");
const { getEligibleStandards } = require("./data-quality");
const { requirementPlan } = require("./curriculum-requirements");
const { parseDiscoveryIntent } = require("./discovery-intent");
const { sourceView, matchStandard } = require('./curriculum-content-match');
const { courseForGrade } = require("../public/grade-context");
const { DiscoveryInputError } = require("./discovery-search");

const note = "질문과 공식 문장·기존 탐색 어휘의 관련 후보입니다. 자료의 교육과정 연계 승인·영상 적합성·기준 충족을 뜻하지 않습니다.";
function rankRelatedStandards(query, standards, resource) {
  const source = sourceView(resource || {summary:parseDiscoveryIntent(query).positiveQuery});
  return standards.map(standard => {
    const plan = requirementPlan(standard), match = matchStandard(plan,source);
    return match ? {id:plan.standardId,...match,ruleSupported:plan.ruleSupported} : null;
  }).filter(Boolean).sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id,'ko'));
}
async function discoverRelatedStandards(input = {}, store) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DiscoveryInputError("관련 기준 조회 내용을 확인하세요.");
  if (Object.keys(input).some(key => !["q","title","summary","searchQuery","subject","grade"].includes(key))) throw new DiscoveryInputError("관련 기준 조회 조건을 확인하세요.");
  if (input.q !== undefined && typeof input.q !== "string" || String(input.q || "").length > 200) throw new DiscoveryInputError("검색어는 200자 이내로 입력하세요.");
  for (const [field,limit] of [['title',2000],['summary',200000]]) {
    if (input[field] !== undefined && (typeof input[field] !== 'string' || input[field].length > limit)) throw new DiscoveryInputError(`${field === 'title' ? '제목' : '소개문'} 입력 범위를 확인하세요.`);
  }
  const resource = input.title !== undefined || input.summary !== undefined ? {title:input.title || '',summary:input.summary || ''} : null;
  if (resource && input.q !== undefined) throw new DiscoveryInputError("자료 내용과 검색어 입력 방식을 함께 지정할 수 없습니다.");
  if (input.searchQuery !== undefined && (typeof input.searchQuery !== "string" || input.searchQuery.length > 200)) throw new DiscoveryInputError("자료를 찾은 검색어는 200자 이내로 입력하세요.");
  if (input.subject && !["사회","과학"].includes(input.subject)) throw new DiscoveryInputError("기준 교과 조건을 확인하세요.");
  const grade = input.grade || "all", course = courseForGrade(grade);
  if (grade !== "all" && !course) throw new DiscoveryInputError("기준 과정 조건을 확인하세요.");
  const query = (input.q || "").trim(), searchQuery = (input.searchQuery || "").trim();
  store ||= await readDataStore();
  const standards = getEligibleStandards(store.curriculumStandards).filter(item => (!input.subject || item.metadata.subject === input.subject) && (grade === "all" || requirementPlan(item).courseId === course));
  let related = resource ? rankRelatedStandards("",standards,resource) : query ? rankRelatedStandards(query, standards) : [];
  if (searchQuery && related.length) {
    const searchScores = new Map(rankRelatedStandards(searchQuery, standards).map(item => [item.id, item]));
    // 검색어만으로 기준을 새로 추천하지 않는다. 자료 내용에서 발견한 후보 안에서 수업 의도를 우선한다.
    related = related.map(item => {
      const search = searchScores.get(item.id), searchScore = search?.score || 0;
      return { ...item, contentScore: item.score, searchScore, score: item.score + searchScore * 2,
        reason: search ? `자료를 찾은 검색어와 관련: ${search.reason} / 자료 내용: ${item.reason}` : item.reason };
    }).sort((a,b) => Number(b.searchScore > 0) - Number(a.searchScore > 0) || b.score - a.score || a.id.localeCompare(b.id, "ko"));
  }
  return { query, searchQuery, contentLength: resource ? resource.title.length + resource.summary.length : query.length, related: related.slice(0,8), total: related.length, limit:8, method:"LOCAL_CONTENT_MEANING", note, paidApiCalls:0 };
}
module.exports = { discoverRelatedStandards, rankRelatedStandards };
