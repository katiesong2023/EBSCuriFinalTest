const { literalSource } = require('./source-literal');
const { concepts } = require('./semantic-layer');
const { specificTerms } = require('./content-preview');
const { unitAnchors } = require('./curriculum-expansion-anchors');
const { summaryEvidence, summaryContext } = require('./keyword-context');
const { vocabulary, sourceDishNames, sourceTopicNames } = require('./keyword-vocabulary');
const { maskEditorial } = require('./source-editorial');
const { searchableSupplements } = require('./supplement-search');
// 표시용 원문 어휘다. 검색 개념·학년 적합성·교육과정 승인으로 사용하지 않는다.
const additionalTerms = [...new Set([...Object.values(unitAnchors).flat(), ...specificTerms,
  '뇌','기억','수면','감정','심리','건강','운동','영양','음식','요리','식재료','사찰음식','농업','농촌','농사','어업','수산자원',
  '가족','육아','부모','아이','청소년','학교','교육','경찰','경찰관','안전','구조','노동자','택배','배송','스포츠','스키','사격','올림픽',
  '음악','미술','예술','영화','공연','건축','여행','관광','지역','도시','농촌','재난','전쟁','평화','인공지능','로봇','반도체','기술',
  '한국','대한민국','서울','부산','제주','평창','일본','중국','인도','미국','캐나다','브라질','볼리비아','페루','몽골','스페인','프랑스','영국','러시아','베트남','필리핀','호주','인도네시아','독일','스위스','터키','대만',
  '장어','전골','찌개','김치','불고기','된장','치즈','우유','커피','채소','과일',
  '재생에너지','자원','연소','산화','자전','공전','전통','유산','갈등','불평등','빈곤','장애','복지','종교','철학','자연','숲','산림',
  '수행','굴','염전','소금','책임감','끈기','청각 장애','장애인','냉동 보존','혈액','혈관','꽃가루','여왕벌','말벌','서식지','운석','박물관','무역','생산','소비','세포','수분','분화구'
])].filter(term => !['장소','지역','역할 갈등','사회 변화','세계의 변화','지역의 변화','생활 주변'].includes(term));
const stopWords = new Set(['다양한','새로운','뜨거운','차가운','가장','어떤','모든','많은','당신','함께','이런','이렇게','누구','세상','이야기','한번','한다','하루','사람들','위한','따라','찾아','우리는','그리고','으로','언제','보는','살펴본다','담은','지키는','동네','이름','맛']);
const normalize = value => String(value).normalize('NFKC').replace(/\s+/g,'').toLowerCase();
function extractKeywords(item, expanded = false) {
  const keywords = [];
  const context = summaryContext(item);
  if (!context) return keywords;
  context.readable = maskEditorial(context.readable, item.title);
  // 기존 등록 태그도 제목 인용을 그대로 재사용하지 않고 소개문에서 다시 확인한다.
  // 별칭→대표 어휘 정리는 탐색용이며 성취기준 충족 판단이 아니다.
  for (const concept of concepts) {
    const evidence = summaryEvidence(item, concept.aliases, context);
    if (!evidence) continue;
    keywords.push({ label: concept.label, conceptId: concept.id, kind: 'REGISTERED_CONCEPT', evidence });
  }
  for (const label of additionalTerms) {
    if (stopWords.has(label) || keywords.some(word => normalize(word.label) === normalize(label))) continue;
    const evidence = summaryEvidence(item, [label], context);
    if (evidence) keywords.push({ label, kind: 'SOURCE_KEYWORD', evidence });
  }
  // 기존에 내용 키워드가 없는 자료만 보충한다. 새 명사는 원문의 경계·문맥 검사도 통과해야 한다.
  if (expanded && !keywords.length) {
    const compact = context.readable.replace(/\s+/gu, '').toLowerCase();
    const candidates = [...new Set([...vocabulary.filter(label => label.length >= 2), ...sourceDishNames(context.readable), ...sourceTopicNames(context.readable)])];
    for (const label of candidates) {
      if (stopWords.has(label) || !compact.includes(normalize(label))) continue;
      const evidence = summaryEvidence(item, [label], context);
      if (evidence) keywords.push({ label, kind: 'SOURCE_KEYWORD', evidence });
    }
  }
  // 본문에서 검증한 뒤에만 제목과 함께 다루는 주제를 앞에 둔다.
  const title = normalize(literalSource(item).title);
  const titleTopic = word => title.includes(normalize(word.label)) || title.includes(normalize(word.evidence.quote));
  return keywords.filter(word => !keywords.some(other => other !== word && other.evidence.start === word.evidence.start &&
    other.evidence.end > word.evidence.end && other.kind === word.kind))
    .sort((a, b) => Number(titleTopic(b)) - Number(titleTopic(a)) ||
      Number(b.kind === 'REGISTERED_CONCEPT') - Number(a.kind === 'REGISTERED_CONCEPT'));
}
function contentKeywords(item) {
  const words = extractKeywords(item, true);
  if (words.length) return words;
  const supplemented = [];
  for (const supplement of searchableSupplements(item)) {
    for (const word of extractKeywords({ ...item, summary: supplement.text, sourceSupplements: [] }, true)) {
      if (supplemented.some(existing => normalize(existing.label) === normalize(word.label))) continue;
      supplemented.push({ ...word, evidence: { ...word.evidence, field: 'sourceSupplement',
        supplementId: supplement.id, sourceUrl: supplement.sourceUrl, contentHash: supplement.contentHash } });
    }
  }
  return supplemented;
}
module.exports = { contentKeywords, additionalTerms, extractKeywords };
