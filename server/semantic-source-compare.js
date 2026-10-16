const fs = require('node:fs');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const read = p => JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p));
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const fingerprint = r => sha(JSON.stringify(stable([r.title, r.summary, r.sourceSupplements || []])));
const before = read('docs/r12-40-final.json.gz');
const after = read('docs/r12-40-semantic-source-bound-results.json.gz');
const labels = Object.assign({}, ...['docs/r12-40-relevance-labels.json', 'docs/r12-40-llm-dollar-relevance-labels.json', 'docs/r12-40-semantic-source-relevance-labels.json', 'docs/r12-40-requirement-relevance-labels.json'].filter(p => fs.existsSync(p)).map(p => read(p).labels));
const snapshot = read('docs/r12-40-semantic-source-candidates.json.gz');
const responses = fs.readFileSync('docs/r12-40-semantic-source-responses.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const ledger = read('docs/r12-40-llm-dollar-ledger.json');
assert.equal(responses.length, 370); assert.equal(new Set(responses.map(r => r.set + '/' + r.id)).size, 370);
assert.equal(ledger.pending.length, 0); assert(ledger.chargedUpperUsd <= 1);
for (const [path, hash] of Object.entries(before.before)) assert.equal(sha(fs.readFileSync(path)), hash);
let quotesChecked = 0, knownRelevant = 0, missingCandidates = 0, lostAll = 0, lostTop3 = 0;
const unknown = [], metrics = [];
const labelFor = (row, item) => {
  const label = labels[row.set + '/' + row.id + '/' + item.id];
  if (!label || label.fingerprint !== fingerprint(item)) return null;
  assert.equal(label.query, row.query); assert([0, 1, 2].includes(label.score)); return label;
};
for (const [stage, report] of [['local', before], ['semanticSource', after]]) {
  assert.equal(report.rows.length, 370); assert.deepEqual(report.inputs, before.inputs);
  assert.equal(report.catalogFingerprint, before.catalogFingerprint); assert.deepEqual(report.before, before.before);
  assert.deepEqual(report.changedStores, []);
  const metric = { stage, queries: 370, nonempty: 0, empty: 0, top1: { relevant: 0, partial: 0, irrelevant: 0, unjudged: 0 }, top3: { relevant: 0, partial: 0, irrelevant: 0, unjudged: 0 } };
  report.rows.forEach((row, index) => {
    const original = before.rows[index]; assert.equal(row.query, original.query); assert.equal(row.id, original.id); assert.equal(row.set, original.set);
    metric.nonempty += row.total > 0;
    row.top5.slice(0, 3).forEach((item, rank) => {
      const label = labelFor(row, item), category = label ? ['irrelevant', 'partial', 'relevant'][label.score] : 'unjudged';
      metric.top3[category]++; if (!rank) metric.top1[category]++;
      if (!label && stage === 'semanticSource') unknown.push({ set: row.set, id: row.id, query: row.query, rank: rank + 1, resourceId: item.id });
    });
  });
  metric.empty = 370 - metric.nonempty;
  metric.top1.relevantShare = metric.top1.unjudged ? null : metric.top1.relevant / metric.nonempty;
  const exposures = metric.top3.relevant + metric.top3.partial + metric.top3.irrelevant + metric.top3.unjudged;
  metric.top3.relevantShare = metric.top3.unjudged ? null : metric.top3.relevant / exposures;
  assert.equal(metric.top1.unjudged, 0);
  metrics.push(metric);
}
after.rows.forEach((row, index) => {
  const batch = snapshot.rows[index].batch;
  for (const item of before.rows[index].top5.slice(0, 3)) if (labelFor(row, item)?.score === 2) {
    knownRelevant++; missingCandidates += !row.candidateIds.includes(item.id); lostAll += !row.returnedIds.includes(item.id); lostTop3 += !row.top5.slice(0, 3).some(r => r.id === item.id);
  }
  for (const item of row.top5) for (const proof of item.semanticSourceReview?.evidence || []) {
    const source = proof.field === 'sourceSupplement' ? item.sourceSupplements.find(s => s.id === proof.supplementId)?.text : item[proof.field];
    assert.equal(typeof source, 'string'); assert.equal(source.slice(proof.start, proof.end), proof.quote); quotesChecked++;
  }
  const response = responses.find(r => r.set === row.set && r.id === row.id);
  assert.equal(response.batchFingerprint, batch.fingerprint); assert.equal(response.query, row.query);
  assert.equal(response.promptHash, sha(JSON.stringify(snapshot.rows[index].prepared.payload)));
  const payload = { ...snapshot.rows[index].prepared.payload, model: ledger.model, max_output_tokens: 750 };
  const calls = ledger.calls.filter(c => c.requestHash === sha(JSON.stringify(payload)));
  assert.equal(calls.length, 1); assert(calls[0].usage);
  assert.equal(response.response.model, ledger.model);
  assert.deepEqual(calls[0].usage, response.response.usage);
});
const total = after.budget.chargedUpperUsd, initial = read('docs/r12-40-llm-dollar.json.gz').budget.chargedUpperUsd;
const report = { generatedAt: new Date().toISOString(), metrics, knownRelevant, missingCandidates, lostAll, lostTop3, quotesChecked,
  responses: responses.length, responseStatuses: responses.reduce((o, r) => ((o[r.response.status] = (o[r.response.status] || 0) + 1), o), {}),
  accepted: after.rows.filter(r => r.reviewAccepted).length, fallbacks: after.rows.filter(r => r.fallback).length,
  firstExperimentConservativeUsd: initial, newExperimentConservativeUsd: total - initial, totalConservativeUsd: total, remainingApprovedUsd: 1 - total,
  changedStores: [], unknownTop3: unknown,
  caveat: '동일370 전체의 첫 결과를 평가했다. 상위2·3개 미평가는 unknownTop3에 별도 기록하고 관련으로 세지 않는다. 관련률은 원문에 근거한 잠정 에이전트 평가이며 영상·학년 적합성·전체 재현율 아님. 비용은 캐시 할인을 제외하고 불명2시도의 최대 비용을 포함한 과대 추산이며 계정 잔액/실청구액이 아님. 일반 검색 자동 호출은 활성화하지 않음.' };
fs.writeFileSync('docs/r12-40-semantic-source-comparison.json', JSON.stringify(report, null, 2) + '\n');
const score = (r, item) => item ? (labelFor(r, item)?.score ?? '?') : '-';
const md = ['# 동일370 의미 검색·LLM 원문 재선별 비교', '', '관련2 / 부분1 / 무관0. 첫 결과 전체 평가. 둘째·셋째 결과는 미평가를 관련으로 세지 않는다. 상세는 JSON 참조.', '', '|세트/ID|원문 질문|로컬 건수/첫 결과 판정|새 건수/첫 결과 판정|새 첫 결과|', '|---|---|---|---|---|'];
for (let i = 0; i < after.rows.length; i++) { const a = before.rows[i], b = after.rows[i]; const esc = s => String(s || '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' '); md.push(`|${b.set}/${b.id}|${esc(b.query)}|${a.total}/${score(a, a.top5[0])}|${b.total}/${score(b, b.top5[0])}|${esc(b.top5[0]?.title)}|`); }
fs.writeFileSync('docs/r12-40-semantic-source-query-comparison.md', md.join('\n') + '\n');
console.log(JSON.stringify({ ...report, unknownTop3: unknown.length }));
