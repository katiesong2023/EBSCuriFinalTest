// 원문과 같은 길이의 검색용 문자열을 만든다. 삭제 범위·인용은 UTF-16 원문 위치다.
const version = 'figurative-source-v4';
const patterns = [
  { id: 'BODY_METAPHOR', pattern: /(?:도시|산업|경제|금융|시장|조직|사회|문명|문화|나라|국가|일본|지구|숲|학교|교육)(?:의|를\s*움직이는)?\s*(?:심장|허파|폐|혈관|세포)/gu },
  { id: 'ABSTRACT_NATURE', pattern: /(?:지식|정보|데이터|인파|눈물|꿈|추억|감정|마음|역사|인생|시간|고독|욕망|눈썹|머리카락|머리털)(?:의)?\s*(?:바다|홍수|파도|폭풍|물결|강|호수|산맥|빙산|사막|오아시스|늪|우주|숲)/gu },
  { id: 'ABSTRACT_OBJECT', pattern: /(?:희망|평화|성공|행복|변화|역사|인생|마음|사랑|꿈|열정|미래|사회|경제|교육|문화|지식|나눔|우정|배려|선행)(?:의)?\s*(?:빛|불꽃|씨앗|열매|뿌리|날개|기둥|다리|엔진|연료|블랙홀|화석|자석|미로|나침반|창고|등불|그림자)/gu },
  { id: 'ABSTRACT_ENERGY', pattern: /(?:분노|감정|열정|사랑|울분|증오|희망)(?:의)?\s*에너지/gu },
  { id: 'SEA_MILK', pattern: /바다의\s*우유/gu },
  { id: 'ECONOMIC_FEEDING', pattern: /(?:경제(?:적|의)?|산업(?:의)?|시장(?:의)?|자본(?:주의|의)?|기업(?:의)?|정치(?:적|의)?)\s*먹이\s*(?:사슬|관계)/gu },
  { id: 'LIVING_FOSSIL', pattern: /살아\s*있는\s*화석/gu },
  { id: 'COMPETITION_WAR', pattern: /(?:입시|가격|육아|고부|밥상|다이어트|음식|쩐|돈|주차|취업|성적)(?:의)?\s*전쟁/gu },
  // 비교에 빌린 명사만 보류하여 '심장은 펌프처럼 혈액을 보낸다'의 심장은 보존한다.
  { id: 'COMPARISON_VEHICLE', pattern: /(?<![\p{L}\p{N}])(?:먹이\s*사슬|[\p{L}\p{N}]{2,})(?:처럼|같이|같은)(?=$|[^\p{L}\p{N}]|도|는|은|의|를|을)/gu },
  { id: 'EXPLICIT_FIGURATIVE', pattern: /(?<![\p{L}\p{N}])(?:먹이\s*사슬|[\p{L}\p{N}]{2,})(?:을|를|이|가|은|는|에|으로|로)?\s*(?:방불케|에\s*비유|로\s*비유|을\s*상징|를\s*상징|이라는\s*비유|라는\s*비유)/gu },
  { id: 'QUOTED_SYMBOL', pattern: /[‘“"']([^‘’“”"'\n.!?]{2,60})[’”"'](?:은|는|을|를|이|가|에|으로|로)?\s*(?:이라는\s*비유|라는\s*비유|에\s*비유|로\s*비유|(?:라|이라|라고|이라고)?\s*(?:비유|상징|별명))/gu }
];
function analyseLiteralText(value) {
  const raw = String(value || '');
  const readable = raw.replace(/<[^>]*>/g, tag => ' '.repeat(tag.length));
  const spans = [];
  for (const rule of patterns) {
    rule.pattern.lastIndex = 0;
    for (const match of readable.matchAll(rule.pattern)) {
      // 경계 밖 글자까지 마스킹하지 않는다. 원래 인용과 위치를 보존한다.
      let start = match.index, end = start + match[0].length;
      const targets = { ABSTRACT_ENERGY: /에너지/gu, BODY_METAPHOR: /심장|허파|폐|혈관|세포/gu, ABSTRACT_NATURE: /바다|홍수|파도|폭풍|물결|강|호수|산맥|빙산|사막|오아시스|늪|우주/gu, ABSTRACT_OBJECT: /빛|불꽃|씨앗|열매|뿌리|날개|기둥|다리|엔진|연료|블랙홀|화석|자석|미로|나침반|창고|등불|그림자/gu, SEA_MILK: /우유/gu, ECONOMIC_FEEDING: /먹이\s*(?:사슬|관계)/gu, LIVING_FOSSIL: /화석/gu, COMPETITION_WAR: /전쟁/gu };
      const target = targets[rule.id] ? [...match[0].matchAll(targets[rule.id])].at(-1) : null;
      if (target) { start += target.index; end = start + target[0].length; }
      if (!spans.some(span => span.start === start && span.end === end)) spans.push({ start, end, quote: raw.slice(start, end), reason: rule.id, status: rule.id === 'COMPARISON_VEHICLE' ? 'COMPARISON_HELD' : 'FIGURATIVE_EXCLUDED' });
    }
  }
  spans.sort((a,b) => a.start - b.start || b.end - a.end);
  let text = raw;
  for (const span of spans) text = text.slice(0, span.start) + ' '.repeat(span.end - span.start) + text.slice(span.end);
  return { text, spans, version };
}
const views = new WeakMap();
function literalSource(item) {
  const cached = views.get(item);
  if (cached && cached.originalTitle === item.title && cached.originalSummary === item.summary && cached.originalProgram === item.program) return cached.view;
  const title = analyseLiteralText(item.title), summary = analyseLiteralText(item.summary), program = analyseLiteralText(item.program);
  // 소개문에서 비유로만 쓰인 제목 어휘도 같은 근거로 보류한다. 별도 실제 설명이 있으면 보존한다.
  if (summary.spans.length) {
    const { matchingExpressions } = require('./discovery-query-language');
    for (const token of String(item.title || '').matchAll(/[\p{L}\p{N}]+/gu)) {
      const term = token[0];
      if (matchingExpressions(term,item.summary).length && !matchingExpressions(term,summary.text).length && !title.spans.some(span=>span.start<token.index+term.length&&span.end>token.index)) {
        title.spans.push({start:token.index,end:token.index+term.length,quote:term,reason:'TITLE_CORROBORATED_FIGURATIVE',status:'FIGURATIVE_EXCLUDED'});
        title.text=title.text.slice(0,token.index)+' '.repeat(term.length)+title.text.slice(token.index+term.length);
      }
    }
  }
  const view = { ...item, title: title.text, summary: summary.text, program: program.text,
    figurativeExpressions: [...title.spans.map(span=>({field:'title',...span})), ...summary.spans.map(span=>({field:'summary',...span}))] };
  views.set(item, { originalTitle: item.title, originalSummary: item.summary, originalProgram: item.program, view });
  return view;
}
const texts = new Map();
function literalText(value) {
  const raw = String(value || '');
  if (!texts.has(raw)) {
    texts.set(raw, analyseLiteralText(raw).text);
    if (texts.size > 8192) texts.delete(texts.keys().next().value);
  }
  return texts.get(raw);
}
function matchingLiteralExpressions(term, value) { return require('./discovery-query-language').matchingExpressions(term, literalText(value)); }
function overlapsFigurative(item, quote) {
  return literalSource(item).figurativeExpressions.some(span => span.field === quote.field && span.start < quote.end && span.end > quote.start);
}
module.exports = { analyseLiteralText, literalSource, literalText, overlapsFigurative, matchingLiteralExpressions, version };
