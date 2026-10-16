// 공개 텍스트에서 키워드와 핵심 문장만 추린다. 영상 분석·추론 태그를 소개로 승격하지 않는다.
const { contentGuide } = require("./source-explanation");
const { assessSourceText } = require("./source-text-quality");
const { matchingExpressions } = require('./discovery-query-language');
const { concepts, aliasRegex, tagResource } = require("./semantic-layer");
const specificTerms = [
  "자전", "공전", "태양일", "항성일", "태양계", "행성", "천체망원경", "우주 망원경", "우주 탐사", "우주 쓰레기", "우주쓰레기",
  "인공위성", "공유지의 비극", "탐사선", "우주선", "뉴호라이즌스호", "명왕성", "에리스", "소행성", "운석", "블랙홀", "중력", "궤도", "관측", "충돌",
  "지방의회", "의회", "조례", "공청회", "토론회", "선거", "투표", "시민 참여", "주민참여조례", "청소년 의회교실", "권력", "갈등", "헌법", "국회", "민주화", "역사", "제도", "법률", "시민", "주민",
  "수분", "꽃가루", "여왕벌", "꿀벌", "말벌", "먹이사슬", "먹이 사슬", "서식지", "갯벌", "습지", "숲", "야행성", "동식물", "멸종", "오염", "오폐수", "새만금",
  "심장", "혈액", "혈관", "폐", "호흡", "소화", "소화기관", "면역", "항체", "백혈구", "병원체", "세포", "산소", "이산화탄소",
  "고인돌", "유물", "유적", "발굴", "청동기", "삼국시대", "고조선", "독립운동", "문화유산", "이주민", "다문화", "편견", "차별", "인권",
  "물가", "인플레이션", "생산", "소비", "분업", "무역", "시장", "저출생", "고령화", "인구", "재활용", "미세플라스틱", "기후 변화", "지구 온난화",
  "설악산", "김제", "백두대간", "산맥", "평야", "동고서저", "화산", "분화구", "용암", "현무암", "침식", "퇴적", "지층", "화석"
];
const terms = [...new Set([...specificTerms, ...concepts.flatMap((c) => c.aliases).filter((term) => !["벌의", "벌들이", "식물들"].includes(term))])]
  .map((term) => ({ term, pattern: aliasRegex(term), specific: specificTerms.includes(term) }));

function plainText(value) {
  return String(value || "").replace(/<\/?(?:br|p|div|span|strong|b|em|i|a|ul|li)\b[^>]*>/giu, " ")
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g, (entity) => ({ "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" }[entity]))
    .replace(/^\s*자막\s*/u, "").replace(/\s+/g, " ").trim();
}
const comparable = (value) => plainText(value).normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

const extraTermsCache = new WeakMap();
function previewContent(item, { keywordLimit = 5, additionalTerms = null, repeatedTitleMentions = 2 } = {}) {
  if (additionalTerms && !extraTermsCache.has(additionalTerms)) extraTermsCache.set(additionalTerms,
    additionalTerms.filter(term => !terms.some(entry => entry.term === term)).map(term => ({ term, pattern: aliasRegex(term), specific: true })));
  const vocabulary = additionalTerms ? [...terms, ...extraTermsCache.get(additionalTerms)] : terms;
  const title = plainText(item.title), summary = plainText(item.summary);
  const quality = assessSourceText(item.title, item.summary);
  const hasDescription = quality.detailedMappingAllowed;
  const fields = hasDescription ? { title, summary } : { title };
  // 등록 어휘에 없는 지명·인물·소재도 제목과 소개문에 함께 나오면 단서로 보존한다.
  const titleWords = title.replace(/\[[^\]]*\]/g, " ").split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.replace(/(?:에서|으로|의|은|는|이|가|을|를)$/, ""))
    .filter((word) => word.length >= 2 && word.length <= 16 && !/\d/.test(word) && !/(?:다|까|요|만)$/.test(word) && !/^(?:이야기|이름|이유|특집|시즌|어떻게|무엇|우리|그들|하나|결코|작지|않은|다큐멘터리)$/.test(word));
  const localTerms = [...new Set(titleWords)].filter((word) => {
    if (vocabulary.some((entry) => entry.term.includes(word) || word.includes(entry.term)) || !hasDescription) return false;
    return [...summary.matchAll(aliasRegex(word))].length >= repeatedTitleMentions;
  }).map((term) => ({ term, pattern: aliasRegex(term), specific: false }));
  const matches = [];
  for (const { term, pattern, specific } of [...vocabulary, ...localTerms]) {
    for (const [field, text] of Object.entries(fields)) {
      pattern.lastIndex = 0;
      const found = [...text.matchAll(pattern)];
      if (!found.length) continue;
      matches.push({ keyword: term, field, quote: found[0][0], start: found[0].index,
        score: (specific ? 5 : 0) + Math.min(term.length, 6) + (field === "title" ? 5 : 0) + Math.min(found.length, 3) });
    }
  }
  matches.sort((a, b) => b.score - a.score || a.start - b.start || a.keyword.localeCompare(b.keyword, "ko"));
  const selected = [];
  for (const match of matches) {
    if (selected.some((other) => comparable(other.keyword).includes(comparable(match.keyword)) || comparable(match.keyword).includes(comparable(other.keyword)))) continue;
    selected.push(match);
    if (selected.length >= keywordLimit) break;
  }
  let guide = contentGuide(item, selected.map((m) => m.keyword));
  if(item.descriptionPatch?.sourceKind==='OFFICIAL_DESCRIPTION_EXCERPT'&&guide.method!=='OFFICIAL_SUPPLEMENT_EXTRACT')guide={...guide,
    label:'공식 소개의 확인 가능한 문장으로 보충한 설명',method:'OFFICIAL_DESCRIPTION_EXCERPT',
    sourceNote:'전체 공식 소개에 말줄임·문장 잘림이 있어 확인한 온전한 문장만 기입했습니다. 빠진 내용은 추정하지 않았습니다.'};
  return { keywords: selected.map((m) => m.keyword), ...guide,
    basis: guide.evidence.some(e=>e.field==='sourceSupplement') ? 'OFFICIAL_SUPPLEMENT' : guide.evidence.length ? "SOURCE_DESCRIPTION" : "TITLE_ONLY", keywordEvidence: selected };

}

function addContentPreview(item) {
  return { ...item, contentPreview: previewContent(item), alternatives: item.alternatives?.map(addContentPreview) };
}

function recommendationExplanation(item, request) {
  const tags = item.semanticTags || tagResource(item).supported;
  const relevant = tags.filter((tag) => request.concepts?.some((c) => c.id === tag.conceptId));
  const labels = relevant.map((tag) => tag.label);
  const geographic = (item.relations || []).map((relation) => `${relation.concept}의 ${relation.place} 사례`);
  const words = (request.terms || []).flatMap((word) => matchingExpressions(word,`${item.title} ${item.summary}`));
  const connected = [...new Set([...labels, ...geographic, ...words])].slice(0, 3);
  const expressions = [...new Set(relevant.map((tag) => tag.evidence.quote))].slice(0, 3);
  return connected.length ? `찾는 주제 ‘${connected.join(" · ")}’와 연결되는 ${expressions.length ? `‘${expressions.join(" · ")}’ ` : ""}표현이 제목·소개문에 있어 비교 후보로 골랐습니다.` : item.reason;
}
module.exports = { previewContent, addContentPreview, recommendationExplanation, plainText, specificTerms };
