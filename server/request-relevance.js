const { matchingLiteralExpressions: matchingExpressions, literalSource } = require('./source-literal');
const { softRelationTerm } = require('./natural-request');
const { assessSourceText } = require('./source-text-quality');
const { searchableSupplements } = require('./supplement-search');
const { queryLiteralAliases } = require('./source-meaning');
const descriptionPeers = new WeakMap();
function peerTitles(item, catalog) {
  if (!catalog) return [];
  if (!descriptionPeers.has(catalog)) {
    const index = new Map();
    for (const resource of catalog.resources) {
      const summary = String(resource.summary || '').trim();
      if (summary.length < 60) continue;
      if (!index.has(summary)) index.set(summary, new Set());
      index.get(summary).add(literalSource(resource).title);
    }
    descriptionPeers.set(catalog, index);
  }
  return [...(descriptionPeers.get(catalog).get(String(item.summary || '').trim()) || [])];
}

// 주제와 설명 단서가 같은 문장에 있는지를 순위에만 반영한다. 의미 충족 판정은 아니다.
const relations = [
  { label: '의미·필요성 설명', query: /뜻|정의|의미|필요성/u, cue: /의미|뜻|정의|이란|란|필요|중요|때문|기능|역할/u },
  { label: '역할·하는 일', query: /역할|하는\s*일|기능/u, cue: /역할|기능|제공|도움|돕|도와|빌리|빌려|대출|서비스|담당|지원/u },
  { label: '변화·과정', query: /바뀐|바뀌|달라진|변화|변천/u, cue: /바뀌|바뀐|달라|변화|변천|사라|생겨|생기|변모|과거|예전/u },
  { label: '원인·결과', query: /까닭|원인|이유|때문/u, cue: /때문|인해|원인|결과|영향|따라서|그래서/u },
  { label: '필요 조건', query: /필요한\s*조건|타려면|타는\s*조건/u, cue: /조건|필요|산소|발화점/u }
];
function requestRelevance(item, request, sentences, catalog) {
  const original = request.naturalLanguage?.original || request.positiveQuery || '';
  const groups = [
    ...(request.concepts || []).map(c => c.requestedAliases?.length ? c.requestedAliases : c.aliases || [c.label]),
    ...(request.terms || []).filter(t => !softRelationTerm(t)).map(t => [t]),
    ...(request.alternativeGroups || []).flatMap(group => group.map(option => [option.text, ...(option.terms || [])].filter(Boolean)))
  ].map(aliases => [...new Set(aliases.flatMap(alias => [alias, ...queryLiteralAliases(alias)]))]);
  const hits = text => groups.filter(aliases => aliases.some(alias => matchingExpressions(alias, text).length)).length;
  const requested = relations.filter(r => r.query.test(original));
  const quality = assessSourceText(item.title, item.summary);
  const summaryAvailable = !['none', 'repeated', 'production'].includes(quality.category);
  const sources = [
    ...(summaryAvailable ? sentences : []),
    ...searchableSupplements(item).flatMap(s => require('./source-explanation').sourceSentences(s.text, 'sourceSupplement')
      .map(sentence => ({ ...sentence, supplementId: s.id, sourceUrl: s.sourceUrl })))
  ];
  const relationQuotes = [...(item.contentRelation?.evidence || []), ...(item.requestRelation?.evidence || []), ...(item.sourcePredicateEvidence || []).flatMap(p=>p.evidence)];
  const scored = sources.map(sentence => {
    const topics = hits(sentence.quote);
    const question = /[?？]$/u.test(sentence.quote.trim());
    const cues = topics && !question ? requested.filter(r => r.cue.test(sentence.quote)).length : 0;
    const knownRelation = relationQuotes.some(q => q.field === sentence.field && q.start === sentence.start && q.end === sentence.end && q.quote === sentence.quote && q.supplementId === sentence.supplementId);
    return { sentence, topics, cues, score: topics * 4 + cues * 12 + (knownRelation ? 16 : 0) - (question ? 8 : 0) };
  }).filter(row => row.topics || row.score > 0).sort((a, b) => b.score - a.score || a.sentence.start - b.sentence.start);
  const details = requested.map(r => ({ label: r.label, status: 'UNKNOWN', evidence: scored.filter(row => row.topics && !/[?？]$/u.test(row.sentence.quote.trim()) && r.cue.test(row.sentence.quote)).slice(0, 2).map(row => row.sentence) }));
  for (const detail of details) if (detail.evidence.length) detail.status = 'RELATION_WORDING_CUE';
  const best = scored[0];
  // 같은 단어가 나와도 본편의 중심 주제와 긴 배경 소개는 다르게 정렬한다.
  // 소개문 뒤의 정당한 설명을 버리지 않고, 제목·도입·반복되는 내용 근거를 함께 본다.
  const primary = summaryAvailable ? sentences.filter(s => s.quote.trim()) : [];
  const groupCount = groups.length;
  const titleCoverage = groupCount ? hits(literalSource(item).title) / groupCount : 0;
  const introCoverage = groupCount ? Math.max(0, ...primary.slice(0, 3).map(s => hits(s.quote) / groupCount)) : 0;
  const topical = primary.filter(s => hits(s.quote) > 0);
  const density = primary.length ? topical.length / primary.length : 0;
  const cohesive = primary.filter(s => groupCount && hits(s.quote) === groupCount);
  const cohesion = groupCount ? Math.max(0, ...primary.map((s, i) => hits(s.quote + ' ' + (primary[i + 1]?.quote || '')) / groupCount)) : 0;
  const backgroundOnly = groupCount > 1 && !titleCoverage && !introCoverage &&
    primary.length >= 5 && cohesive.length === 1 && cohesive[0].start > 450 && density < 0.4;
  const titleWords = String(item.title || '').split(/[^\p{L}\p{N}]+/u)
    .map(word => word.replace(/(?:에서|으로|의|을|를|은|는|이|가|에)$/u, '')).filter(word => word.length >= 2);
  const ownTitleAnchored = titleWords.some(word => matchingExpressions(word, literalSource(item).summary).length);
  const conflictingDuplicate = groupCount > 0 && !titleCoverage && !ownTitleAnchored &&
    peerTitles(item, catalog).some(title => hits(title) > 0);
  const focus = {
    method: 'SOURCE_TOPIC_CENTRALITY', titleCoverage, introCoverage, density, cohesion,
    status: conflictingDuplicate ? 'DUPLICATE_DESCRIPTION_CONFLICT' : backgroundOnly ? 'BACKGROUND_ONLY' : topical.length ? 'PRIMARY_TEXT_CUE' : 'SUPPLEMENT_OR_TITLE_ONLY',
    score: groupCount ? Math.max(0, Math.round(titleCoverage * 60 + introCoverage * 55 + density * 45 + cohesion ** 2 * 80) - (backgroundOnly ? 80 : 0)) : 0,
    evidence: [...cohesive, ...topical].filter((s, i, all) => all.findIndex(x => x.start === s.start && x.field === s.field) === i).slice(0, 3),
    note: '원문 주제의 중심성에 따른 순위 단서이며 의미 충족 판정은 아닙니다.'
  };
  return {
    focus,
    method: 'LOCAL_SENTENCE_CUES', score: groups.length && best && (!requested.length || best.cues || relationQuotes.length) ? Math.min(48, 12 + (hits(literalSource(item).title) ? 8 : 0) + (best?.topics > 1 ? 8 : 0) + (best?.cues || relationQuotes.length ? 20 : 0)) : 0,
    topicEvidence: scored.filter(row => row.sentence.field === 'summary').slice(0, 3).map(row => row.sentence),
    supplementEvidence: scored.filter(row => row.sentence.field === 'sourceSupplement').slice(0, 3).map(row => row.sentence),
    details, note: '같은 문장의 주제·설명 표현을 비교한 로컬 순위입니다. 의미 충족·영상 적합성은 미확인입니다.'
  };
}
module.exports = { requestRelevance };
