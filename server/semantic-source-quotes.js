const { literalText, literalSource, analyseLiteralText, overlapsFigurative } = require('./source-literal');

// 모델은 화면에 전달한 문구만 인용한다. 공백/줄바꿈을 제외한 글자는 그대로여야 한다.
function bindVisibleQuote(candidate, quote) {
  if (typeof quote !== 'string' || quote.trim().length < 4 || quote.length > 360) return null;
  const target = quote.replace(/\s/gu, '');
  const title = { field: 'title', start: 0, quote: candidate.item.title, visible: literalSource(candidate.item).title };
  for (const parts of [[title], candidate.passages]) {
    let text = '';
    const positions = [];
    parts.forEach((part, partIndex) => {
      const visible = part.visible ?? literalText(part.quote);
      for (let i = 0; i < visible.length; i++) if (!/\s/u.test(visible[i])) {
        text += visible[i]; positions.push({ partIndex, offset: i });
      }
    });
    const at = text.indexOf(target);
    if (at < 0 || !target.length) continue;
    const spans = [];
    for (const position of positions.slice(at, at + target.length)) {
      const last = spans.at(-1);
      if (last?.partIndex === position.partIndex) last.end = position.offset + 1;
      else spans.push({ partIndex: position.partIndex, start: position.offset, end: position.offset + 1 });
    }
    const result = [];
    for (const span of spans) {
      const part = parts[span.partIndex];
      const proof = { field: part.field, supplementId: part.supplementId, start: part.start + span.start,
        end: part.start + span.end, quote: part.quote.slice(span.start, span.end) };
      if (part.field !== 'sourceSupplement' && overlapsFigurative(candidate.item, proof)) return null;
      if (part.field === 'sourceSupplement' && analyseLiteralText(part.quote).spans.some(s => s.start < span.end && s.end > span.start)) return null;
      result.push(proof);
    }
    return result;
  }
  return null;
}
module.exports = { bindVisibleQuote };
