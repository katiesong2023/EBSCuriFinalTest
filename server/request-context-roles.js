// 문맥의 소유권을 한곳에서 정한다. 이후 검색 단계에는 같은 길이의 내용 투영만 전달한다.
// 범용 한국어 의미 분석기는 아니다. 확실한 시청 대상/활용 목적만 분리하고 나머지는 남긴다.
const material = '(?:자료|영상|방송|콘텐츠|다큐(?:멘터리)?|클립)';
const audience = '(?:초등학생들?|중학생들?|고등학생들?|대학생들?|학생들?|어린이들?|아이들|애들|청소년|유아|성인|교사)';
const purpose = '(?:교육|수업|학습|토론|도입|정리|마무리|복습|예습|활동)용';
const boundary = '(?=$|[^\\p{L}\\p{N}])';
const { rankingContext } = require('./request-ranking-context');
function maskSpans(query, spans) {
  const chars = query.split(''); // UTF-16 위치를 원문 계약과 동일하게 유지한다.
  for (const span of spans) for (let i = span.start; i < span.end; i++) chars[i] = ' ';
  return chars.join('');
}
function localContextClauses(query) {
  const clauses = [];
  const add = (kind, match) => {
    const start = match.index, end = start + match[0].length;
    if (clauses.some(c => c.sourceSpans.some(s => s.start < end && s.end > start))) return;
    clauses.push({ id: `context${clauses.length + 1}`, kind, mode: 'context', label: match[0],
      sourceSpans: [{ start, end, quote: match[0] }] });
  };
  // ‘교육용 로봇’, ‘수업 자료의 제작’처럼 자료 자체를 다루는 주제는 목적이 아니다.
  const purposePattern = new RegExp(`(?<![\\p{L}\\p{N}])${purpose}${boundary}`, 'gu');
  for (const match of query.matchAll(purposePattern)) {
    const after = query.slice(match.index + match[0].length);
    if (new RegExp(`^\\s*(?:${material}(?:은|는|을|를)?\\s*)?(?:제외|빼고|말고)`, 'u').test(after)) continue;
    if (new RegExp(`^\\s*${material}(?:의|가|는|을|를|이)(?=$|[^\\p{L}\\p{N}])`, 'u').test(after)) continue;
    if (!new RegExp(`^\\s*(?:$|[,.!?]|${material}${boundary}|${audience})`, 'u').test(after)) continue;
    add('purpose', match);
  }
  const audiencePattern = new RegExp(`(?<![\\p{L}\\p{N}])${audience}(?:한테|에게|을\\s*위한|를\\s*위한|을\\s*대상으로|를\\s*대상으로|\\s+대상(?:으로)?|용|이|가|은|는)?`, 'gu');
  for (const match of query.matchAll(audiencePattern)) {
    const after = query.slice(match.index + match[0].length);
    if (/^\s*(?:제외|빼고|말고)/u.test(after)) continue;
    // '어린이 인권', '아이들이 줄어드는 이유'의 내용 대상을 제거하지 않는다.
    const viewing = /^\s*(?:보여|설명하|이해하|공감할|시청|보기|볼\s*만|좋아할)/u.test(after) ||
      /한테$|에게$/u.test(match[0]) && !/^\s*(?:일어나|벌어지|가해지|겪|당하|받)/u.test(after) &&
      /보여|설명하|소개하|가르|틀어/u.test(after.split(/[.!?。]/u)[0].slice(0, 80));
    const nextPurpose = clauses.some(c => c.kind === 'purpose' && /^\s*$/u.test(query.slice(match.index + match[0].length, c.sourceSpans[0].start)) && c.sourceSpans[0].start >= match.index + match[0].length);
    const explicit = /한테|에게|위한|대상(?:으로)?$|용$/u.test(match[0]);
    const resourceRequest = new RegExp(`^\\s*(?:${material})${boundary}`, 'u').test(after);
    const schoolAtEnd = /^(?:초등학생|중학생|고등학생|대학생)들?$/u.test(match[0]) && /^\s*$/u.test(after);
    if ((viewing || nextPurpose || explicit && (resourceRequest || /^\s*$/u.test(after)) || schoolAtEnd) && !/^[\p{L}\p{N}]/u.test(after)) add('audience', match);
  }
  for (const span of rankingContext(query).spans) add(span.kind === 'audience' ? 'audience' : 'purpose', { index: span.start, 0: span.quote });
  return clauses.sort((a, b) => a.sourceSpans[0].start - b.sourceSpans[0].start);
}
function projectRequestContext(query, interpretation) {
  const supplied = interpretation !== undefined;
  // 호출자는 원문/전체 피복/역할 검증에 통과한 계약만 전달한다.
  const contextClauses = supplied ? interpretation.clauses.filter(c => c.mode === 'context' || c.mode === 'preferred') : localContextClauses(query);
  // 검증된 날짜/형태/프로그램/제외는 실행식에서 대조한다. 내용어 AND 검사로 이중 적용하지 않는다.
  const conditionClauses = supplied ? interpretation.clauses.filter(c => !contextClauses.includes(c) &&
    (c.mode === 'excluded' || ['date', 'duration', 'form', 'program', 'subtitles', 'scene', 'curriculum'].includes(c.kind))) : [];
  const grammarSpans = supplied ? interpretation.grammarSpans.filter(s =>
    !/또는|아니면|혹은|\bOR\b/iu.test(s.quote) &&
    !interpretation.clauses.some(c => ['required','excluded'].includes(c.mode) && c.sourceSpans.some(r => r.start < s.end && r.end > s.start))) : [];
  for (const clause of contextClauses.filter(c => c.kind === 'purpose')) {
    const end = Math.max(...clause.sourceSpans.map(s => s.end));
    const match = new RegExp(`^\\s*(${material})${boundary}`, 'u').exec(query.slice(end));
    if (match && !new RegExp(`^\\s*${material}(?:의|가|는|을|를|이)`, 'u').test(query.slice(end))) {
      const start = end + match[0].indexOf(match[1]);
      grammarSpans.push({ start, end: start + match[1].length, quote: match[1] });
    }
  }
  const ranking = rankingContext(query);
  const spans = [...contextClauses.flatMap(c => c.sourceSpans), ...conditionClauses.flatMap(c => c.sourceSpans), ...grammarSpans, ...ranking.spans];
  return { version: 'curi-context-projection-v1', originalQuery: query,
    contentQuery: maskSpans(query, spans), contextClauses, conditionClauses, grammarSpans, origin: supplied ? 'VALIDATED_CONTRACT' : 'LOCAL_EXPLICIT_CONTEXT',
    rankingContext: ranking, suitability: 'UNCONFIRMED' };
}
function audienceSourceSpan(quote) {
  return new RegExp(`^(?:${audience}|(?:초등(?:학교)?|중학교|고등학교|초|중|고)?\\s*[1-6](?:학년)?)(?:한테|에게|을\\s*위한|를\\s*위한|을\\s*대상으로|를\\s*대상으로|\\s+대상(?:으로)?|용)?$`, 'u').test(quote);
}
module.exports = { projectRequestContext, localContextClauses, maskSpans, audienceSourceSpan };
