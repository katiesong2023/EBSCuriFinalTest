// 원문 언급과 추론 후보를 분리하는 로컬 시맨틱 레이어. 학년·교육과정 승인을 만들지 않는다.
const crypto = require("node:crypto");
const ruleVersion = "2026-10-15.1";
const definitions = [
  ["ecosystem", "생태계", "과학", ["생태계", "생태", "생물 관계", "먹이 사슬", "먹이사슬"]],
  ["bee", "꿀벌", "과학", ["꿀벌", "벌의", "벌들이"], "ecosystem"],
  ["wildlife", "야생동물", "과학", ["야생동물", "야생 동물", "멸종위기", "멸종 위기"], "ecosystem"],
  ["plant", "식물", "과학", ["식물", "식물들", "광합성", "증산", "씨앗"]],
  ["climate", "기후 변화", "공통", ["기후 변화", "기후변화", "지구 온난화", "지구온난화", "기후 위기", "기후위기"]],
  ["weather", "날씨", "과학", ["날씨", "기상 현상", "기상현상"]],
  ["cloud", "구름", "과학", ["구름"], "weather"],
  ["body", "인체", "과학", ["인체", "우리 몸", "몸속", "몸 속"]],
  ["immunity", "면역", "과학", ["면역", "백혈구", "항체"], "body"],
  ["digestion", "소화", "과학", ["소화기관", "소화 기관", "소화 작용", "소화과정", "소화 과정"], "body"],
  ["space", "우주", "과학", ["우주", "은하", "태양계", "천체", "행성"]],
  ["moon", "달의 모양", "과학", ["달의 모양", "달 모양", "달의 위상", "보름달", "초승달", "상현달", "하현달"], "space"],
  ["circuit", "전기 회로", "과학", ["전기 회로", "전기회로", "전구", "직렬연결", "병렬연결"]],
  ["magnet", "자석", "과학", ["자석", "자기장", "전자석"]],
  ["dissolve", "용해", "과학", ["용해", "용질", "용매", "용액", "물에 녹", "소금이 녹"]],
  ["matter", "물질", "과학", ["물질", "고체", "액체", "기체"]],
  ["light", "빛", "과학", ["빛", "빛의 반사", "빛의 굴절", "렌즈"]],
  ["force", "힘과 운동", "과학", ["중력", "마찰력", "관성", "부력", "힘과 운동"]],
  ["energy", "에너지", "과학", ["에너지", "태양광", "풍력", "전기", "배터리"]],
  ["earthquake", "지진", "과학", ["지진", "지각 변동", "판 구조"]],
  ["volcano", "화산", "공통", ["화산", "용암", "분화구", "현무암"]],
  ["ocean", "바다", "과학", ["해양", "바다", "심해", "해류"]],
  ["plastic", "플라스틱", "공통", ["플라스틱", "미세플라스틱"], "environment"],
  ["environment", "환경", "공통", ["환경", "환경오염", "재활용", "쓰레기"]],
  ["democracy", "민주주의", "사회", ["민주주의", "민주 정치", "민주정치"]],
  ["citizen", "시민 참여", "사회", ["시민 참여", "시민참여", "주민 참여", "주민참여"]],
  ["population", "인구", "사회", ["인구", "저출생", "저출산", "고령화"]],
  ["economy", "경제", "사회", ["경제", "경제 활동", "생산과 소비"]],
  ["prices", "물가", "사회", ["물가", "인플레이션"], "economy"],
  ["culture", "문화", "사회", ["문화", "전통문화", "문화유산"]],
  ["multicultural", "다문화", "사회", ["다문화", "이주민", "문화 다양성"]],
  ["dolmen", "고인돌", "사회", ["고인돌", "청동기"]],
  ["map", "대동여지도", "사회", ["대동여지도", "김정호"]],
  ["independence", "독립운동", "사회", ["독립운동", "독립 운동", "3·1 운동", "3.1 운동"]],
  ["yugwansun", "유관순", "사회", ["유관순"], "independence"],
  ["donghak", "동학", "사회", ["동학", "전봉준"]],
  ["coast", "해안 지형", "사회", ["해안 지형", "해안지형", "리아스식 해안", "갯벌"]],
  ["landform", "동고서저", "사회", ["동고서저"]],
  ["housing", "주거", "사회", ["주거", "한옥", "건축"]],
  ["jobs", "직업", "사회", ["직업", "노동", "일자리"]],
  ["transport", "교통", "사회", ["교통", "철도", "도로"]],
  ["rights", "인권", "사회", ["인권", "차별", "평등"]],
  ["april19", "4·19 혁명", "사회", ["4·19", "4.19", "4·19 혁명", "4.19 혁명"]],
  ["june_democracy", "6월 민주항쟁", "사회", ["6월 민주항쟁", "6월 항쟁", "6월항쟁"]],
  ["gojoseon", "고조선", "사회", ["고조선"]],
  ["three_kingdoms", "삼국시대", "사회", ["삼국시대", "삼국 시대"]],
  ["artifact", "유물·유적", "사회", ["유물", "유적"]],
  ["excavation", "발굴", "공통", ["발굴"]],
  ["desert", "사막", "공통", ["사막"]],
  ["tundra", "툰드라", "공통", ["툰드라"]],
  ["nature", "자연환경", "공통", ["자연환경", "자연 환경"]],
  ["dinosaur", "공룡", "과학", ["공룡"]],
  ["fossil", "화석", "과학", ["화석"]],
  ["heart", "심장", "과학", ["심장", "심장병", "심장 질환", "심박수"], "body"],
  ["respiration", "호흡 기관", "과학", ["호흡기관", "호흡 기관", "폐", "허파"], "body"],
  ["fog", "안개", "과학", ["안개"]],
  ["acidrain", "산성비", "과학", ["산성비"]],
  ["acidification", "산성화", "과학", ["바다 산성화", "해양 산성화", "산성화"]],
  ["scientist", "과학자", "과학", ["과학자"]],
  ["engineer", "엔지니어", "공통", ["엔지니어", "공학자"]]
];
const { aliasRegex } = require('./semantic-pattern');
const { evaluateSummaryEvidence, summaryContext } = require('./keyword-context');
// 관련 소재는 후보 확장에 쓸 수 있지만, 명시된 좁은 요청을 상위 주제로 대체하지 않는다.
const specificAliases = { volcano: ['용암', '분화구', '현무암'] };
const concepts = definitions.map(([id, label, subject, aliases, broader]) => ({ id, label, subject, aliases:[...new Set([label,...aliases])],
  specificAliases: specificAliases[id] || [],
  broader: broader || null, classification: "EDITORIAL_RETRIEVAL_VOCABULARY", ruleVersion }));
const { searchableSupplements } = require('./supplement-search');
const rules = concepts.map((concept) => ({ ...concept, patterns: concept.aliases.map(aliasRegex) }));
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
function auditResource(resource) {
  const contentHash = hash(JSON.stringify([resource.title, resource.summary, resource.sourceUrl, resource.evidenceUrl]));
  const supported = [], candidates = [], decisions = [];
  const context = summaryContext(resource);
  for (const rule of rules) {
    const titleMentions = rule.aliases.flatMap((alias, index) => {
      const pattern = rule.patterns[index]; pattern.lastIndex = 0;
      return [...String(resource.title || '').matchAll(pattern)]
        .map(match => ({ alias, field:'title', start:match.index, end:match.index + match[0].length, quote:match[0] }));
    });
    const result = evaluateSummaryEvidence(resource, rule.aliases, context);
    const rawSummaryMentions = result.candidateCount ? [] : rule.aliases.flatMap((alias, index) => {
      const pattern = rule.patterns[index]; pattern.lastIndex = 0;
      return [...String(resource.summary||'').matchAll(pattern)].map(match=>({alias,field:'summary',start:match.index,
        end:match.index+match[0].length,quote:match[0]}));
    });
    if (titleMentions.length || result.candidateCount || rawSummaryMentions.length) decisions.push({ conceptId:rule.id, label:rule.label,
      status:result.evidence?'ACCEPTED':'HELD', reason:result.reason, summaryMentions:result.candidateCount||rawSummaryMentions.length,
      rawSummaryMentions,
      titleMentions, rejected:result.rejected });
    if (!result.evidence) continue;
    const evidence = { ...result.evidence, excerpt:result.evidence.context,
      checkedAt:resource.descriptionCheckedAt || resource.checkedAt || null, contentHash };
    supported.push({ conceptId:rule.id, label:rule.label, subject:rule.subject,
      status:'SOURCE_MENTION', method:'SUMMARY_CONTEXT_RULE', ruleVersion, evidence });
    if(rule.broader)candidates.push({conceptId:rule.broader,fromConceptId:rule.id,
      label:concepts.find(concept=>concept.id===rule.broader).label,
      status:'INFERRED_CANDIDATE',method:'EDITORIAL_BROADER_CONCEPT',ruleVersion,evidence});
  }
  // 보조 원문도 같은 문맥 규칙을 적용하되 인용 위치는 해당 보조 자료에만 대응한다.
  for (const supplement of searchableSupplements(resource)) {
    const review = auditResource({ ...resource, summary: supplement.text, sourceSupplements: [] });
    for (const tag of review.supported) if (!supported.some(existing => existing.conceptId === tag.conceptId)) {
      supported.push({ ...tag, method: 'OFFICIAL_SUPPLEMENT_CONTEXT_RULE', evidence: { ...tag.evidence,
        field: 'sourceSupplement', supplementId: supplement.id, sourceUrl: supplement.sourceUrl,
        checkedAt: supplement.checkedAt, contentHash: supplement.contentHash } });
    }
  }
  return { resourceId:resource.id,contentHash,supported,
    candidates:candidates.filter(tag=>!supported.some(direct=>direct.conceptId===tag.conceptId)),
    review:{ sourceStatus:context?'SUMMARY_AVAILABLE':'NO_USABLE_SUMMARY',decisions,meaningReview:'RULE_SCREENED_NOT_MODEL_VERIFIED' } };
}
function tagResource(resource) {
  const { review, ...tags } = auditResource(resource);
  return tags;
}
const cache = new WeakMap();
function getSemanticIndex(catalog) {
  if (!cache.has(catalog)) {
    // 사전 정의가 초기화된 뒤 표시/검색 공통 어휘를 연결한다.
    const { contentKeywords } = require('./content-keywords');
    cache.set(catalog,new Map([...new Map([...catalog.resources,...(catalog.searchVariants||[])].map(resource=>[resource.id,resource])).values()]
      .map(resource=>{
        const entry = { resourceId: resource.id };
        let audit;
        // 프로그램·유형 등 앞선 필터에서 제외되는 자료의 근거 검사도 미룬다.
        for (const key of ['contentHash', 'supported', 'candidates', 'review']) {
          Object.defineProperty(entry, key, { enumerable: true,
            get() { audit ||= auditResource(resource); return audit[key]; } });
        }
        // 표시 키워드는 실제 검색 조건·반환 자료에서 필요할 때 한 번만 계산한다.
        // 전체 자료의 키워드를 첫 요청에서 만들면 모델 결과 조회까지 함께 지연된다.
        Object.defineProperty(entry, 'contentKeywords', { enumerable: true, configurable: true,
          get() {
            const value = contentKeywords(resource);
            Object.defineProperty(entry, 'contentKeywords', { value, enumerable: true });
            return value;
          } });
        return [resource.id,entry];
      })));
  }
  return cache.get(catalog);
}
function findQueryConcepts(text) {
  // '전기 회로' 안의 '전기'를 독립적인 두 번째 AND 조건으로 만들지 않는다.
  const spans = [];
  for (const rule of rules) for (const pattern of rule.patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) spans.push({ id: rule.id, start: match.index, end: match.index + match[0].length });
  }
  spans.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const selected = [];
  for (const span of spans) if (!selected.some((other) => span.start < other.end && span.end > other.start)) selected.push(span);
  return rules.filter((rule) => selected.some((span) => span.id === rule.id));
}
module.exports = { ruleVersion, concepts, tagResource, auditResource, getSemanticIndex, findQueryConcepts, aliasRegex, hash };
