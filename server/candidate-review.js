const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { typeErrors } = require('./request-contract-validation');
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/candidate-review.schema.json'), 'utf8'));
const reviewSummaryLimit = 6000;
// 앞부분 안내 뒤의 내용도 전달하되 후보별 전송량을 제한하고 원문 위치를 유지한다.
function reviewSummary(value) {
  const text = String(value || '');
  let end = Math.min(text.length, reviewSummaryLimit);
  if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
  return text.slice(0, end);
}
const { literalSource, matchingLiteralExpressions } = require('./source-literal');
const { matchingExpressions } = require('./discovery-query-language');
const immutableKinds = new Set(['geography', 'program', 'form', 'date', 'duration', 'curriculum', 'scene', 'subtitles']);
const fingerprint = item => createHash('sha256').update(JSON.stringify([item.id, item.title, item.summary || '', item.variant || '', item.evidenceUrl || item.sourceUrl || ''])).digest('hex');
function prepareReviewBatch(items, plan) {
  return {
    version: 'curi-candidate-review-input-v1', interpretation: plan,
    requestFingerprint: createHash('sha256').update(JSON.stringify([plan.version, plan.originalQuery, plan.clauses, plan.expression, [...(plan.lockedConditions || [])].sort((a,b)=>a.name.localeCompare(b.name))])).digest('hex'),
    candidates: items.slice(0, 10).map(item => ({
      candidateId: item.id, sourceFingerprint: fingerprint(item), title: item.title,
      summary: reviewSummary(item.summary), summaryTruncated: (item.summary || '').length > reviewSummary(item.summary).length,
      sourceUrl: item.evidenceUrl || item.sourceUrl || '',
      figurativeExpressions: literalSource(item).figurativeExpressions.filter(span => span.field === 'title' || span.end <= reviewSummary(item.summary).length),
      systemRequirements: item.requestRequirements.items
    }))
  };
}
function quoteValid(quote, candidate) {
  const text = candidate[quote.field];
  if (typeof text !== 'string' || quote.start < 0 || quote.end <= quote.start || quote.end > text.length || text.slice(quote.start, quote.end) !== quote.quote || !quote.quote.trim()) return false;
  // UTF-16 서로게이트의 중간 위치를 허용하지 않는다.
  const boundaries = new Set([0]); let offset = 0;
  for (const ch of text) { offset += ch.length; boundaries.add(offset); }
  return boundaries.has(quote.start) && boundaries.has(quote.end);
}
function applyCandidateReview(items, batch, response, expressionState) {
  const fallback = errors => ({ items, execution: { status: 'FALLBACK_INVALID_REVIEW', adopted: false, errors, externalApiCalls: 0 } });
  const errors = typeErrors(response, schema, schema);
  if (errors.length) return fallback(errors);
  if (response.requestFingerprint !== batch.requestFingerprint) return fallback(['changed request or selected conditions']);
  const supplied = new Map(response.reviews.map(review => [review.candidateId, review]));
  if (supplied.size !== response.reviews.length || supplied.size !== batch.candidates.length) return fallback(['missing or duplicate candidate review']);
  const allowed = new Map(batch.candidates.map(candidate => [candidate.candidateId, candidate]));
  const byId = new Map(items.map(item => [item.id, item]));
  const adopted = new Map();
  for (const [id, review] of supplied) {
    const candidate = allowed.get(id), item = byId.get(id);
    if (!candidate || !item || review.sourceFingerprint !== candidate.sourceFingerprint || fingerprint(item) !== candidate.sourceFingerprint) return fallback(['unknown candidate or changed source']);
    const required = item.requestRequirements.items.filter(c => ['required', 'excluded'].includes(c.mode));
    const checks = new Map(review.requirements.map(c => [c.clauseId, c]));
    if (checks.size !== review.requirements.length || checks.size !== required.length || required.some(c => !checks.has(c.clauseId))) return fallback(['missing or duplicate requirement']);
    for (const check of checks.values()) {
      if (check.quotes.some(quote => !quoteValid(quote, candidate))) return fallback(['quote outside supplied source']);
      if (check.status !== 'UNKNOWN' && !check.quotes.length) return fallback(['decisive review without source quote']);
      const original = required.find(c => c.clauseId === check.clauseId);
      if (check.status === 'MATCH' && ['topic','entity'].includes(original.kind) && check.quotes.some(q => matchingExpressions(original.label,q.quote).length && !matchingLiteralExpressions(original.label,literalSource(candidate)[q.field].slice(q.start,q.end)).length)) return fallback(['figurative expression cannot establish literal content match']);
      if ((immutableKinds.has(original.kind) || original.mode === 'excluded') && check.status !== 'UNKNOWN' && check.status !== original.status) return fallback(['review cannot override system condition']);
    }
    const requirements = item.requestRequirements.items.map(clause => {
      const check = checks.get(clause.clauseId);
      if (!check || immutableKinds.has(clause.kind) || clause.mode === 'excluded') return clause;
      return { ...clause, status: check.status, evidence: check.quotes, basis: 'SUPPLIED_SOURCE_REVIEW' };
    });
    const state = expressionState(batch.interpretation.expression, new Map(requirements.map(c => [c.clauseId, c])));
    if (state === 'MISMATCH' && review.judgment !== 'UNSUITABLE') return fallback(['unmet requirement cannot be suitable or partial']);
    if (review.judgment === 'UNSUITABLE' && state !== 'MISMATCH') return fallback(['unsuitable verdict without unmet requirement']);
    if (review.judgment === 'SUITABLE' && state !== 'MATCH') return fallback(['suitable verdict conflicts with system requirements']);
    if (review.judgment === 'SOURCE_INSUFFICIENT' && requirements.some(c => !immutableKinds.has(c.kind) && ['required', 'excluded'].includes(c.mode) && c.status === 'MATCH')) return fallback(['insufficient source marked as content match']);
    adopted.set(id, {
      ...item, requestRequirements: { ...item.requestRequirements, status: state, confirmation: state === 'MATCH' ? 'SOURCE_REQUIREMENTS_MATCH' : 'DISCOVERY_ONLY', items: requirements },
      candidateReview: { judgment: review.judgment, selectionReason: review.selectionReason, quotes: review.requirements.flatMap(c => c.quotes), origin: 'SUPPLIED_REVIEW_NOT_MODEL_EXECUTION', sourceFingerprint: review.sourceFingerprint }
    });
  }
  const maxScore = Math.max(0, ...items.map(item => item.score || 0));
  const grade = { SUITABLE: 3, PARTIAL: 2, SOURCE_INSUFFICIENT: 0 };
  const updated = items.filter(item => adopted.get(item.id)?.candidateReview.judgment !== 'UNSUITABLE').map(item => {
    const reviewed = adopted.get(item.id);
    return reviewed ? { ...reviewed, score: (reviewed.score || 0) + (grade[reviewed.candidateReview.judgment] || 0) * (maxScore + 1) } : item;
  });
  return { items: updated, execution: { status: 'SUPPLIED_REVIEW_APPLIED', adopted: true, reviewed: adopted.size, rejected: items.length - updated.length, externalApiCalls: 0 } };
}
module.exports = { fingerprint, prepareReviewBatch, applyCandidateReview };
