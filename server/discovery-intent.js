// 고정된 개념·요청 표현을 해석하는 로컬 규칙이다. 미지의 조건은 삭제하지 않는다.
const { findQueryConcepts, concepts } = require("./semantic-layer");
const { queryConcepts: scopedQueryConcepts } = require('./request-concepts');
const {isMeaningNoun,separateMeaningWords}=require('./source-meaning');
const { expandRequestPhrases } = require("./discovery-query-language");
const { extractRequestContext } = require("./discovery-request");
const { parseGradeRequest, stripGradeTerms } = require("../public/grade-context");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const { projectRequestContext } = require('./request-context-roles');
const { normalizeRequestNoun } = require('./request-nouns');
const { isRequestGrammarToken } = require('./request-language');
function parseDiscoveryIntent(query, { exclusionAliases = [], programNames = [], sourceWords, interpretContext = true } = {}) {
  const gradeContext = parseGradeRequest(query);
  const requestProjection = interpretContext ? projectRequestContext(query) : { originalQuery: query, contentQuery: query, contextClauses: [], origin: 'CONTENT_CLAUSE' };
  let remaining = stripGradeTerms(requestProjection.contentQuery.normalize("NFKC").toLowerCase()).trim();
  const separated=separateMeaningWords(remaining);
  remaining=separated.text;
  const context = extractRequestContext(remaining, programNames, [...concepts.flatMap((concept) => concept.aliases), ...exclusionAliases]);
  const expanded = expandRequestPhrases(context.text);
  remaining = expanded.text;
  const warnings = [...context.warnings];
  const constraints = { ...context.constraints };
  const audiences = requestProjection.contextClauses.filter(c => c.kind === "audience");
  if (audiences.length) {
    constraints.audience = audiences.some(c => /초등/u.test(c.label)) ? "ELEMENTARY" : "SPECIFIED";
    warnings.push("시청 대상은 수업 문맥이며 영상의 대상 적합성·난이도는 미확인입니다.");
  }
  remaining = remaining.replace(/(\d+)\s*분\s*(이내|이하|미만|정도|내외|안쪽(?:으로)?)?/g, (_, minutes) => {
    constraints.durationMinutes = Number(minutes); warnings.push("재생시간 조건은 확인할 데이터가 부족합니다. 시간 조건을 충족한 결과가 아닙니다."); return " ";
  });
  remaining = remaining.replace(/자막\s*(포함|있는|있음|달린)?/g, () => {
    constraints.subtitles = true; warnings.push("자막 여부는 미확인입니다. 원문에서 확인해 주세요."); return " ";
  });
  constraints.gradeContext = gradeContext;
  warnings.push(...gradeContext.warnings);
  if (gradeContext.source !== "all") warnings.push("학년은 수업 문맥입니다. 영상의 학년 적합성·난이도·장면은 별도 확인이 필요합니다.");
  if (/무료|로그인\s*없이/.test(remaining)) {
    constraints.freeAccess = true; warnings.push("무료·로그인 조건은 미확인입니다.");
    remaining = remaining.replace(/무료|로그인\s*없이/g, " ");
  }
  const excluded = [...context.exclusions];
  // 부정 범위를 먼저 떼어낸다. 등록된 복합 표현은 가장 긴 별칭 전체를 제외한다.
  const negation = "(?:제외하고|제외한|제외|빼고|말고)";
  remaining = remaining.replace(new RegExp(`(?:"([^"]+)"|'([^']+)'|“([^”]+)”)(?:은|는|을|를)?\\s*${negation}`, "gu"), (_, ...groups) => {
    excluded.push(groups.slice(0, 3).find(Boolean)); return " ";
  });
  const aliases = [...new Set([...concepts.flatMap((concept) => concept.aliases), ...exclusionAliases])].sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(alias).replace(/ /g, "\\s*")}(?:은|는|을|를)?\\s*${negation}`, "giu");
    remaining = remaining.replace(pattern, () => { excluded.push(alias); return " "; });
  }
  remaining = remaining.replace(/([\p{L}\p{N}]+)(?:은|는|을|를)?\s*(?:제외하고|제외|빼고|말고)/gu, (_, token) => {
    excluded.push(token.replace(/(은|는|을|를)$/, "")); return " ";
  });
  // 복합 개념은 원래 구절로 먼저 인식한다. 구절 안의 조사를 지워 별칭을 바꾸지 않는다.
  const positiveQuery = remaining.replace(/\s+/g, " ").trim();
  const foundConcepts = findQueryConcepts(remaining);
  const matches = scopedQueryConcepts(foundConcepts, remaining);
  if (matches.length !== foundConcepts.length) warnings.push("신체 기관을 빗댄 표현의 실제 대상을 확인해 주세요. 신체 영상으로 자동 대체하지 않습니다.");
  for (const rule of matches) for (const pattern of rule.patterns) { pattern.lastIndex = 0; remaining = remaining.replace(pattern, " "); }
  const intent = /비교|차이|서로 다른/.test(query) ? "COMPARE" : /관찰|모습/.test(query) ? "OBSERVE" : /설명|원리|과정|이유/.test(query) ? "EXPLAIN" : "EXPLORE";
  const connector = /또는|아니면|혹은/.test(remaining) ? "OR" : "AND";
  const relationNeeds = [[/적응/, "환경에 대한 적응"], [/미치는|영향/, "영향 관계"], [/대응/, "대응 사례"], [/생기는|원리|작용|과정/, "원리·과정 설명"], [/탐사/, "탐사 방법"]]
    .filter(([pattern]) => pattern.test(query)).map(([, label]) => label);
  if (relationNeeds.length) warnings.push(`요청한 ${relationNeeds.join(" · ")}의 구체적 내용은 후보의 원문에서 추가 확인이 필요합니다.`);
  if (intent === "COMPARE") warnings.push("비교 수업 의도를 해석했지만 비교 장면의 포함 여부는 미확인입니다.");
  const fillers = /^(우리나라|국내|우리|오늘날|생활|속|지역|사회|과학|가정생활|수업|초등|다양한|다른|실제|관련|관련된|대한|통해|위한|미치는|영향|영향을|알아볼|알아보는|살펴볼|살펴보는|보여주는|보여줄|설명하는|설명할|설명|관찰할|관찰하는|관찰|비교할|비교하는|비교|찾아줘|찾아주세요|찾아|추천해줘|추천해주세요|추천해|보여줘|보여주세요|알려줘|주세요|부탁해요|자료|방송|영상|콘텐츠|프로그램|다큐|다큐멘터리|클립|강의|방법|관계|모습|역할|과정|변화|변화를|조건|원리|이유|노력|다양성|어떤|어떻게|왜|좀|있는|있나요|있을까요|할|수|있는지|없을까요|가능한|제공해줘|또는|아니면|혹은)$/;
  const lifeTopic = /생활/u.test(positiveQuery) && !/생활\s*속/u.test(positiveQuery);
  const isFiller = term => fillers.test(term) && !(lifeTopic && term === '생활');
  const grammar = new Set(["미치", "보여주", "설명하", "대응하", "적응하", "생기", "탐사하", "켜지", "작용하", "있", "작용", "사이", "기관", "활동", "옛사람들", "지역마다", "볼", "쉽게", "중", "및", "그리고", "모두", "동시에", "and",
    "의", "을", "를", "은", "는", "이", "가", "와", "과", "에", "에서", "로", "도", "처럼", "으로", "거요", "나오는", "나오", "다큐면", "다큐요", "영상이요", "방송이요", "좋겠고", "좋겠어요", "좋아요", "더", "부분", "있으면", "걸", "싶어요", "실제로", "움직이는지", "만들어지는지", "봐도", "괜찮은", "다룬", "전에", "찾아요", "주", "너무", "바뀐", "참여해서", "시민", "여행", "역사", "현장", "움직임", "찾고", "있어요", "반드시", "꼭", "필요한", "건", "사례", "보여줄래", "소개해줘", "찾아보고", "싶습니다"]);
  // 사전에 있는 온전한 명사를 우선한다. 미지 명사는 잘라서 다른 내용으로 만들지 않는다.
  const tokenNormalization = [];
  const terms = (remaining.match(/[\p{L}\p{N}]+(?:[·.-][\p{L}\p{N}]+)*/gu) || []).filter((term) => !isFiller(term)).map(term => {
      const normalized = normalizeRequestNoun(term, sourceWords, base => isFiller(base) || grammar.has(base) || isRequestGrammarToken(base));
      if (normalized !== term) tokenNormalization.push({ original: term, normalized });
      return normalized;
    })
    .filter((term) => !grammar.has(term) && !isRequestGrammarToken(term))
    .filter((term) => term && !isFiller(term));
  // 긴 문장의 문법만 완화한다. 알려지지 않은 고유명·주제는 AND 조건으로 보존한다.
  const alternativeGroups = context.alternatives.map((group) => group.map((text) => {
    const found = scopedQueryConcepts(findQueryConcepts(text), text);
    return { text, concepts: found.map(({ patterns, ...concept }) => concept), terms: found.length ? found.flatMap(c=>c.requestedAliases) : [text] };
  }));
  const queryConcepts = [...new Map([...matches.map(({ patterns, ...concept }) => concept), ...alternativeGroups.flatMap((group) => group.flatMap((item) => item.concepts))].map((concept) => [concept.id, concept])).values()];
  return { concepts: queryConcepts, terms: [...new Set(terms)], alternativeGroups,
    preferences: context.preferences, requiredPrograms: context.requiredPrograms, classroomContext: context.classroomContext, detailRequests: context.detailRequests,
    contentPlan: context.contentPlan, positiveQuery, intent, connector, relationNeeds, excluded: [...new Set(excluded)], constraints, warnings: [...new Set(warnings)],
    naturalLanguage: context.language, requestProjection, tokenNormalization,
    expansions: [...separated.expansions, ...expanded.expansions, ...context.language.expansions],
    method: "LOCAL_RULES", curriculumStatus: "NOT_ASSESSED" };
}
module.exports = { parseDiscoveryIntent };
