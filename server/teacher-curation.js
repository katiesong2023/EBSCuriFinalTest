// 이전 주제 선택 URL을 읽는 편집 관점 정의. 새 화면은 원문 개념 필터를 사용한다.
const directions = [
  { id: "space-explore", label: "우주를 탐사하는 방법", parent: "space", terms: ["탐사", "우주선", "망원경"],
    description: "망원경 관측과 탐사선이 우주 정보를 얻는 방법을 비교합니다.", question: "직접 가기 어려운 우주를 어떻게 알아볼 수 있을까요?" },
  { id: "space-planets", label: "행성과 태양계", parent: "space", terms: ["행성", "태양계", "자전", "공전"],
    description: "지구와 다른 행성의 특징, 자전·공전에 따른 차이를 비교합니다.", question: "행성마다 하루와 일 년의 길이가 다른 이유는 무엇일까요?" },
  { id: "space-environment", label: "우주 개발과 환경", parent: "space", terms: ["우주 쓰레기", "우주쓰레기", "인공위성"],
    description: "인공위성의 쓰임과 우주 쓰레기 문제를 살펴보고, 우주 이용에 필요한 규칙을 논의합니다.", question: "우주를 계속 이용하려면 어떤 약속이 필요할까요?" },
  { id: "democracy-participation", label: "시민의 참여", parent: "democracy", terms: ["참여", "선거"],
    description: "선거와 의견 나누기 등 시민이 공동의 결정과 지역 문제 해결에 참여하는 방법을 다룹니다.", question: "우리의 의견을 공동의 결정에 어떻게 담을 수 있을까요?" },
  { id: "democracy-council", label: "의회와 생활 속 규칙", parent: "democracy", terms: ["의회", "조례"],
    description: "생활 속 요구가 의회의 논의를 거쳐 조례와 지역 규칙으로 만들어지는 과정을 다룹니다.", question: "우리 동네에 필요한 규칙은 누가, 어떻게 정할까요?" },
  { id: "democracy-history", label: "민주주의의 역사", parent: "democracy", terms: ["역사", "민주화"],
    description: "민주주의의 변화 과정에서 시민의 권리와 참여 기회가 어떻게 넓어졌는지 다룹니다.", question: "오늘날의 민주주의를 만들기 위해 어떤 노력이 있었을까요?" },
  { id: "ecosystem-bees", label: "꿀벌과 생태계", parent: "ecosystem", terms: ["꿀벌", "꽃가루", "꽃가루받이"],
    description: "꿀벌과 식물, 주변 생물이 서로 주고받는 영향을 살펴봅니다.", question: "꿀벌의 변화는 주변 생물에게 어떤 영향을 줄까요?" },
  { id: "ecosystem-habitat", label: "생물이 살아가는 터전", parent: "ecosystem", terms: ["갯벌", "숲", "서식"],
    description: "숲과 갯벌의 환경을 비교하고, 생물이 살아가는 데 필요한 조건을 살펴봅니다.", question: "생물이 살아가는 데 어떤 환경이 필요할까요?" },
  { id: "ecosystem-change", label: "생태계의 변화", parent: "ecosystem", terms: ["멸종", "오염", "기후"],
    description: "기후 변화와 오염이 생물에 미치는 영향, 생태계를 보호하는 방법을 다룹니다.", question: "환경이 달라지면 생물의 삶은 어떻게 바뀔까요?" },
  { id: "start-democracy", label: "사회 · 민주주의와 참여", concept: "democracy",
    description: "시민의 참여, 의회의 역할, 민주주의의 역사를 통해 공동의 의사결정 과정을 다룹니다.", question: "모두의 의견을 존중하며 함께 결정하려면 무엇이 필요할까요?" },
  { id: "start-culture", label: "사회 · 다양한 문화", concept: "multicultural",
    description: "서로 다른 문화와 생활방식을 이해하고, 편견을 줄이는 방법을 다룹니다.", question: "서로 다른 문화를 어떻게 이해하고 존중할 수 있을까요?" },
  { id: "start-space", label: "과학 · 우주와 행성", concept: "space",
    description: "행성의 특징, 우주 탐사 방법, 우주 개발에 따른 문제를 다룹니다.", question: "우주에 대해 어떤 점을 가장 알아보고 싶나요?" },
  { id: "start-ecosystem", label: "과학 · 생태계와 생물", concept: "ecosystem",
    description: "생물 사이의 관계, 서식지의 조건, 환경 변화가 생물에 미치는 영향을 다룹니다.", question: "생물은 주변 환경과 어떤 관계를 맺고 살아갈까요?" }
];
const plain = (value) => String(value || "").replace(/<[^>]*>/g, " ");
const normalize = (value) => plain(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

function hasRecommendationEvidence(item, conceptIds) {
  const text = `${plain(item.title)} ${plain(item.summary)}`;
  const climateIds = conceptIds.filter((id) => ["desert", "tundra"].includes(id));
  if (climateIds.length && (climateIds.length === conceptIds.length || item.semanticTags?.some((tag) => climateIds.includes(tag.conceptId)))) {
    // 바다 사막화나 극의 배경만으로 기후·생활 주제 자료로 분류하지 않는다.
    // 교사 목록에서 해당 주제를 선택했을 때 실제 환경·생활의 추가 표현을 요구한다.
    const climateText = text.replace(/(?:바다|바닷속|바다속|해양)(?:의|속)?\s*사막(?:화)?|사막(?:처럼|같은)/g, "");
    const literalClimate = /사막|툰드라/.test(climateText);
    const realContext = /유목|카라반|민족|주민|생계|기후\s*변화|사막화|강수량|건조\s*기후|북극|영구\s*동토/.test(climateText);
    return literalClimate && realContext && !/구조대|악당|마법|초능력|변신/.test(text);
  }
  if (conceptIds.includes("space") && (conceptIds.length === 1 || item.semanticTags?.some((tag) => tag.conceptId === "space"))) {
    // '우주'·'은하'는 비유나 극의 배경으로도 쓰인다. 우주 주제의 교사 목록에는 추가 천문 표현을 요구한다.
    const titleAnchor = /태양계|행성|자전|공전|인공위성|천체|천문|블랙홀|운석|탐사선|우주선|우주\s*(?:탐사|개발|정거장|망원경|쓰레기|비행)|NASA/i.test(plain(item.title));
    const explanation = /행성.{0,60}(?:자전|공전|대기|궤도)|(?:자전|공전|궤도).{0,60}행성|우주\s*쓰레기|(?:태양계|블랙홀|운석|탐사선).{0,60}(?:관측|원리|분석|발견|연구|과학|탐사)/s.test(plain(item.summary));
    return (titleAnchor || explanation) && !/악당|마법|초능력|변신|우주\s*전사/.test(text);
  }
  return true;
}

function directionEvidence(item, direction) {
  if (direction.concept) return item.semanticTags?.find((tag) => tag.conceptId === direction.concept)?.evidence;
  for (const field of ["title", "summary"]) {
    const text = plain(item[field]);
    const term = direction.terms?.find((word) => text.includes(word));
    if (term) {
      const start = text.indexOf(term);
      return { field, quote: term, excerpt: text.slice(Math.max(0, start - 30), start + 90) };
    }
  }
  return null;
}

function variantKey(item) {
  const clean = (text) => normalize(text)
    .replace(/[\[(（]\s*(?:한국어\s*)?(?:더빙|수어|수화|재방송|재|자막|영어|한국어)(?:판|방송|버전)?\s*[\])）]/gu, " ")
    .replace(/^(?:한국어\s*)?(?:더빙|수어|수화|재방송)(?:판|방송|버전)?\s*[-:：]\s*/gu, "")
    .replace(/\s*[-:：]\s*(?:한국어\s*)?(?:더빙|수어|수화|재방송)(?:판|방송|버전)?$/gu, "")
    .replace(/\s+/g, " ").trim();
  return `${item.kind || ""}:${clean(item.program)}:${clean(item.title)}`;
}

function groupVariants(items, preferQuality = false) {
  const groups = new Map();
  for (const item of items) {
    const key = variantKey(item);
    if (!groups.has(key)) groups.set(key, { ...item, alternatives: [] });
    else {
      const current = groups.get(key);
      if (preferQuality && (item.sourceQuality?.rank || 0) > (current.sourceQuality?.rank || 0)) {
        const { alternatives, ...previous } = current;
        groups.set(key, { ...item, alternatives: [previous, ...alternatives] });
      } else current.alternatives.push(item);
    }
  }
  return [...groups.values()];
}

function legacyDirection(id) {
  const known = directions.find((item) => item.id === id);
  if (known) return known;
  const concept = require("./semantic-layer").concepts.find((item) => `concept-${item.id}` === id);
  return concept ? { id, concept: concept.id, label: concept.label } : null;
}
module.exports = { directionEvidence, groupVariants, variantKey, hasRecommendationEvidence, legacyDirection };
