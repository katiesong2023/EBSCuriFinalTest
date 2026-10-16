// 검색의 내용 조건과 교실 활용·난이도 선호를 분리한다. 원문 좌표는 유지한다.
const gradePattern = /(?:초등(?:학교|학생들?)?(?:\s*[1-6](?:\s*[~∼–·,\-]\s*[1-6])*\s*학년(?:군)?)?|중(?:학교|학생들?)(?:\s*[1-3]\s*학년)?|고등(?:학교|학생들?)(?:\s*[1-3]\s*학년)?|(?<![가-힣\d])(?:초|중|고)\s*[1-6](?:\s*학년)?|(?<!\d)[1-6](?:\s*[~∼–·,\-]\s*[1-6])*\s*학년(?:군)?)(?:용|들|한테|에게)?/gu;
const preferencePatterns = [
  /[12]\s*학기/gu,
  /(?:사회|과학|국어|수학|역사|지리|도덕)\s*(?:수업|시간|교과)(?:에(?:서)?|용)?/gu,
  /(?:교사|학생)용/gu,
  /(?:수업|교육|학습|도입|복습|예습|정리|마무리|토론|토의|활동)용/gu,
  /(?:수업|학습)\s*(?:도입|마무리|첫\s*시간|정리|복습|예습)(?:에\s*쓸|용)?/gu,
  /(?:관찰|실험|분류|토론|토의|탐구)(?:\s*(?:활동|일지\s*쓰기))?\s*(?:전에|직전에|시작하기\s*전에)/gu,
  /(?:알기\s*쉽게|쉽게|쉬운|이해하기\s*쉬운|재미있게|재밌는|재미있는|흥미로운|흥미롭게|눈높이(?:에\s*맞(?:는|게))?|동기\s*유발용)/gu
];
function needsReferenceContext(query) {
  return /^\s*(?:(?:저런|그런|이런)\s+(?:힘|모습|현상|것|거)(?=[은는이가을를의\s,.?!]|$)|아까\s*(?:본|봤던))/u.test(String(query || ''));
}
function rankingContext(query) {
  query = String(query || '');
  const spans = [];
  const add = (kind, match) => { if (!spans.some(s => s.start < match.index + match[0].length && s.end > match.index)) spans.push({ kind, start: match.index, end: match.index + match[0].length, quote: match[0] }); };
  for (const m of query.matchAll(gradePattern)) add('audience', m);
  for (const re of preferencePatterns) for (const m of query.matchAll(re)) {
    const after = query.slice(m.index + m[0].length);
    // 교육용 로봇처럼 물건의 용도를 한정하는 표현과 물질의 성질은 내용에 남긴다.
    if (/^(?:교육|수업|학습)용$/u.test(m[0]) && !/^\s*(?:$|[,.!?]|자료|영상|방송|콘텐츠|다큐|클립|강의)/u.test(after)) continue;
    if (/^(?:교육|수업|학습)용$/u.test(m[0]) && /^\s*(?:자료|영상|방송|콘텐츠)(?:의|가|는|을|를|이)(?=$|[^\p{L}\p{N}])/u.test(after)) continue;
    if (/^\s*(?:(?:자료|영상|방송|콘텐츠)(?:은|는|을|를)?\s*)?(?:제외|빼고|말고)/u.test(after)) continue;
    if (m[0] === '쉽게' && !/^\s*(?:설명|이해|알아|배우|가르|볼|쓰|활용|$)/u.test(after)) continue;
    add('preference', m);
  }
  const chars = query.split(''); for (const s of spans) for (let i = s.start; i < s.end; i++) chars[i] = ' ';
  const audiences = spans.filter(s => s.kind === 'audience').map(s => s.quote);
  return { originalQuery: query, contentQuery: chars.join(''), spans: spans.sort((a, b) => a.start - b.start),
    audiences, preferences: spans.filter(s => s.kind === 'preference').map(s => s.quote),
    level: audiences.some(s => /초등|^초\s*\d|^[1-6].*학년/u.test(s)) ? 'elementary' : audiences.some(s => /중/u.test(s)) ? 'middle' : audiences.some(s => /고/u.test(s)) ? 'high' : null };
}
function contextRank(item, context) {
  if (!context?.audiences?.length && !context?.preferences?.length) return 0;
  let level = item.semanticConditionReview?.presentation;
  if (!level || level === 'unknown') {
    const literal = require('./source-literal').literalSource(item);
    // 원문의 명시적 설명 방식만 약한 순위 신호로 쓴다. 해당 표현이 없어도 제외하지 않는다.
    if (/기초|입문|처음\s*배우|알기\s*쉽|어린이(?:들)?(?:을|를)?\s*위한/u.test(literal.title + ' ' + literal.summary)) level = 'introductory';
  }
  if (context.level === 'middle' || context.level === 'high') return level === 'general' ? 2 : level === 'introductory' ? 1 : 0;
  if (context.level === 'elementary' || context.preferences?.some(p => /쉽|눈높|도입|유발/u.test(p))) return level === 'introductory' ? 2 : level === 'general' ? 1 : 0;
  return 0;
}
module.exports = { rankingContext, contextRank, needsReferenceContext };
