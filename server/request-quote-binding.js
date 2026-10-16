const { validateInterpretation } = require('./request-contract-validation');

// 의미·논리·인용문은 변경하지 않는다. 유일한 정확 인용의 위치만 원문에서 계산한다.
function bindRequestQuotes(interpretation, envelope) {
  if (!interpretation || typeof interpretation !== 'object') return { interpretation, validation: { accepted: false, errors: ['MISSING_INTERPRETATION'] }, changed: false };
  const query = envelope.query, original = validateInterpretation(interpretation, envelope);
  if (original.accepted) return { interpretation, validation: original, changed: false };
  if (!interpretation || interpretation.originalQuery !== query) return { interpretation, validation: original, changed: false };
  const result = structuredClone(interpretation);
  let failure = false, rebound = 0;
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.quote === 'string' && Object.hasOwn(value, 'start') && Object.hasOwn(value, 'end')) {
      if (query.slice(value.start, value.end) !== value.quote || value.end <= value.start) {
        const start = query.indexOf(value.quote);
        if (!value.quote || start < 0 || query.indexOf(value.quote, start + 1) >= 0) { failure = true; return; }
        value.start = start; value.end = start + value.quote.length; rebound++;
      }
    }
    for (const child of Object.values(value)) if (typeof child === 'object') walk(child);
  };
  walk(result);
  if (failure) return { interpretation, validation: original, changed: false, reason: 'QUOTE_MISSING_OR_AMBIGUOUS' };
  if (!Array.isArray(result.clauses) || !Array.isArray(result.unresolved) || !Array.isArray(result.grammarSpans)) return { interpretation, validation: original, changed: false };
  const content = [...result.clauses.flatMap(c => c.sourceSpans || []), ...result.unresolved.map(u => u.sourceSpan)];
  const contentCovered = position => content.some(s => s && s.start <= position && position < s.end);
  // 이미 내용 절로 보존한 구절을 문법으로 중복 분류한 경우에만 문법 목록에서 제거한다.
  result.grammarSpans = result.grammarSpans.filter(s => !Array.from({ length: Math.max(0, s.end - s.start) }, (_, i) => s.start + i).every(contentCovered));
  const covered = new Set();
  for (const s of [...content, ...result.grammarSpans]) if (s) for (let i = s.start; i < s.end; i++) covered.add(i);
  for (let start = 0; start < query.length;) {
    if (covered.has(start) || /\s/u.test(query[start])) { start++; continue; }
    let end = start + 1;
    while (end < query.length && !covered.has(end) && !/\s/u.test(query[end])) end++;
    result.grammarSpans.push({ start, end, quote: query.slice(start, end) });
    start = end;
  }
  // 빠진 내용은 기존의 문법·의미 검사가 거절한다. 실패한 보정은 실행하지 않는다.
  const validation = validateInterpretation(result, envelope);
  return validation.accepted ? { interpretation: result, validation, changed: true, rebound } :
    { interpretation, validation: original, changed: false, bindingValidation: validation };
}
module.exports = { bindRequestQuotes };
