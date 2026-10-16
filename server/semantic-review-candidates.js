const crypto = require('node:crypto');
const { semanticCandidates } = require('./broadcast-semantic-index');
const { literalSource, literalText } = require('./source-literal');
const { searchableSupplements } = require('./supplement-search');
const { sourceSentences } = require('./source-explanation');
const { projectRequestContext } = require('./request-context-roles');
const { requestLanguage } = require('./request-language');
const { parseDiscoveryIntent } = require('./discovery-intent');
const { genreEvidence } = require('./discovery-genre');
const { variantKey } = require('./teacher-curation');
const { prepareItems, matches, filterState } = require('./teacher-filters');

const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function tokens(text) {
  const result = new Set();
  for (const match of String(text).normalize('NFKC').toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = match[0];
    if (word.length) result.add(word);
    if (/[가-힣]/u.test(word)) for (let i = 0; i < word.length - 1; i++) result.add(word.slice(i, i + 2));
  }
  return result;
}
function createSemanticReviewCandidates(catalog, { semanticSearch = semanticCandidates } = {}) {
  const resources = prepareItems(catalog.resources);
  const byId = new Map(resources.map(r => [r.id, r]));
  const postings = new Map(), documents = new Map();
  for (let index = 0; index < resources.length; index++) {
    const item = resources[index], literal = literalSource(item);
    const fields = [{ field: 'title', text: item.title, searchable: literal.title },
      { field: 'summary', text: item.summary || '', searchable: literal.summary },
      ...searchableSupplements(item).map(s => ({ field: 'sourceSupplement', supplementId: s.id, text: s.text, searchable: literalText(s.text) }))];
    const words = tokens(fields.map(f => f.searchable).join(' '));
    for (const word of words) {
      if (!postings.has(word)) postings.set(word, []);
      postings.get(word).push(index);
    }
    documents.set(item.id, { fields, words, forms: genreEvidence(item).map(g => g.label),
      fingerprint: sha([item.id, item.title, item.summary, item.sourceSupplements || []]) });
  }
  const programs = [...new Set(resources.map(r => r.program).filter(Boolean))];
  function lexicalRank(query) {
    const weights = new Map(), scores = new Map();
    for (const word of tokens(query)) {
      const list = postings.get(word);
      if (!list || list.length > resources.length * 0.25) continue;
      const weight = Math.log(1 + resources.length / (1 + list.length));
      weights.set(word, weight);
      for (const index of list) scores.set(index, (scores.get(index) || 0) + weight);
    }
    return { weights, ranked: [...scores].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([i]) => resources[i].id) };
  }
  function passages(id, weights, semantic) {
    const document = documents.get(id), candidates = [];
    for (const field of document.fields.filter(f => f.field !== 'title')) {
      for (const sentence of sourceSentences(field.searchable, field.field)) {
        const words = tokens(sentence.quote);
        let score = [...weights].reduce((sum, [word, w]) => sum + (words.has(word) ? w : 0), 0);
        if (semantic?.evidence?.field === field.field && semantic.evidence.start < sentence.end && semantic.evidence.end > sentence.start) score += 4;
        // 소개문 전체와 공식 보조 원문을 대조한 뒤 관련 문장을 고른다.
        candidates.push({ ...sentence, supplementId: field.supplementId, score, raw: field.text });
      }
    }
    const selected = candidates.sort((a, b) => b.score - a.score || a.start - b.start).slice(0, 2);
    return selected.map(s => {
      // 앞부분 고정 대신 일치 위치 주변을 고르고 원문 좌표를 보존한다.
      let start = s.start;
      if (s.end - start > 180) {
        const hits = [...weights].map(([word, weight]) => ({ at: s.quote.normalize('NFKC').toLowerCase().indexOf(word), weight }))
          .filter(h => h.at >= 0).sort((a, b) => b.weight - a.weight);
        if (hits.length) start += Math.max(0, hits[0].at - 50);
      }
      let end = Math.min(s.end, start + Math.floor(240 / selected.length));
      if (/[\uDC00-\uDFFF]/u.test(s.raw[start] || '')) start--;
      if (/[\uD800-\uDBFF]/u.test(s.raw[end - 1] || '')) end--;
      return { field: s.field, supplementId: s.supplementId, start, end, quote: s.raw.slice(start, end) };
    });
  }
  return {
    documents,
    async retrieve(query, { input = {}, localResults = [], rewriteHints = [], semanticQuery } = {}) {
      const projection = projectRequestContext(query);
      const content = requestLanguage(projection.contentQuery).text.trim();
      if (!content || !tokens(content).size) return { candidates: [], reason: 'TOPIC_REQUIRED' };
      const intent = parseDiscoveryIntent(query, { programNames: programs });
      const state = filterState(input, programs);
      const lexical = lexicalRank([content, ...rewriteHints].join(' '));
      const semantic = await semanticSearch(catalog, semanticQuery || projection.contentQuery.trim());
      const ranks = new Map();
      const add = (ids, weight) => ids.forEach((id, i) => ranks.set(id, (ranks.get(id) || 0) + weight / (30 + i)));
      add([...semantic.matches.keys()], 1); add(lexical.ranked, 1);
      add(localResults.map(r => r.id), 1.2);
      const eligible = id => {
        const item = byId.get(id); if (!item || !matches(item, state)) return false;
        const forms = documents.get(id).forms;
        if (intent.requiredPrograms.length && !intent.requiredPrograms.includes(item.program)) return false;
        if (intent.constraints.excludedPrograms?.includes(item.program) || intent.constraints.excludedKinds?.includes(item.kind)) return false;
        const required = intent.constraints.requiredGenres || [];
        if (required.length && !(intent.constraints.genreOperator === 'OR' ? required.some(g => forms.includes(g)) : required.every(g => forms.includes(g)))) return false;
        return !(intent.constraints.excludedGenres || []).some(g => forms.includes(g));
      };
      const ordered = [...new Set([...localResults.slice(0, 3).map(r => r.id), ...[...ranks].sort((a, b) => b[1] - a[1]).map(([id]) => id)])];
      const seen = new Set(), candidates = [];
      for (const id of ordered) {
        if (!eligible(id)) continue;
        const item = byId.get(id), key = variantKey(item);
        if (seen.has(key)) continue; seen.add(key);
        const doc = documents.get(id), proof = passages(id, lexical.weights, semantic.matches.get(id));
        candidates.push({ item, fingerprint: doc.fingerprint, passages: proof,
          packet: { i: candidates.length, title: literalSource(item).title, program: item.program, forms: doc.forms,
            text: proof.map(p => literalText(p.quote)).join('\n'),
            date: item.broadcastDate || null,
            ...(item.durationSourceUrl && item.durationSeconds ? { seconds: item.durationSeconds } : {}) } });
        if (candidates.length >= 16) break;
      }
      return { query, contentQuery: content, candidates, semanticStatus: semantic.status,
        fingerprint: sha([query, candidates.map(c => [c.item.id, c.fingerprint, c.packet])]) };
    }
  };
}
module.exports = { createSemanticReviewCandidates, tokens };
