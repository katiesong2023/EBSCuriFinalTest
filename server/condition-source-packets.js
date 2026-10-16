const crypto = require('node:crypto');
const { literalSource, literalText } = require('./source-literal');
const { searchableSupplements } = require('./supplement-search');
const { sourceSentences } = require('./source-explanation');
const { tokens } = require('./semantic-review-candidates');
const { genreEvidence } = require('./discovery-genre');
function packetFor(item, contract) {
  const literal = literalSource(item), words = tokens(contract.searchQuery + ' ' + contract.requirements.map(r => r.meaning).join(' '));
  const fields = [{ field: 'title', raw: item.title, text: literal.title }, { field: 'summary', raw: item.summary || '', text: literal.summary },
    ...searchableSupplements(item).map(s => ({ field: 'sourceSupplement', supplementId: s.id, raw: s.text, text: literalText(s.text) }))];
  const pieces = [];
  for (const f of fields) {
    for (const sentence of sourceSentences(f.text, f.field)) {
      if (!sentence.quote.trim()) continue;
      const score = [...tokens(sentence.quote)].reduce((n, t) => n + (words.has(t) ? 1 : 0), 0);
      pieces.push({ field: f.field, supplementId: f.supplementId, start: sentence.start, end: sentence.end, quote: f.raw.slice(sentence.start, sentence.end), text: sentence.quote, score });
    }
  }
  const title = pieces.filter(p => p.field === 'title');
  const sentences = pieces.filter(p => p.field !== 'title').sort((a, b) => b.score - a.score || a.start - b.start);
  const selected = [...title]; let length = 0;
  for (const p of sentences) {
    if (length >= 1000 || selected.length >= 7) break;
    const size = Math.min(p.text.length, 1000 - length, 440);
    selected.push({ ...p, text: p.text.slice(0, size), quote: p.quote.slice(0, size), end: p.start + size }); length += size;
  }
  const facts = selected.map((p, id) => ({ ...p, id }));
  const forms = genreEvidence(item).map(e => e.label);
  if (item.program) facts.push({ id: facts.length, field: 'catalogProgram', text: '프로그램: ' + item.program, value: item.program });
  if (['episode', 'clip', 'lesson'].includes(item.kind)) facts.push({ id: facts.length, field: 'catalogResourceType', text: '자료 단위: ' + ({ episode: '방송 회차 영상', clip: '클립 영상', lesson: '강의 영상' })[item.kind], value: item.kind });
  if (forms.length) facts.push({ id: facts.length, field: 'derivedGenre', text: '자료 형식: ' + forms.join(', '), value: forms });
  if (item.durationSourceUrl && item.durationSeconds) facts.push({ id: facts.length, field: 'verifiedDuration', text: '확인된 전체 길이(초): ' + item.durationSeconds, value: item.durationSeconds, sourceUrl: item.durationSourceUrl });
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([item.id, item.title, item.summary, item.sourceSupplements || []])).digest('hex');
  return { item, fingerprint, facts, packet: { program: item.program, facts: facts.map(({ id, text }) => ({ id, text })) } };
}
module.exports = { packetFor };
