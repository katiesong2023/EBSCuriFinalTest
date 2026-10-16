const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const read = p => JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p));
const before = read('docs/r12-40-final.json.gz');
const raw = read('docs/r12-40-llm-dollar.json.gz');
const bound = read('docs/r12-40-llm-dollar-bound.json.gz');
const existing = read('docs/r12-40-relevance-labels.json').labels;
const labelPath = 'docs/r12-40-llm-dollar-relevance-labels.json';
const labels = { ...existing, ...(fs.existsSync(labelPath) ? read(labelPath).labels : {}) };
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const fingerprint = r => sha(JSON.stringify(stable([r.title, r.summary, r.sourceSupplements || []])));
const missing = [];
const metrics = [];
for (const [stage, report] of [['local', before], ['modelRaw', raw], ['modelBound', bound]]) {
  assert.equal(report.rows.length, 370); assert.equal(report.catalogFingerprint, before.catalogFingerprint);
  assert.deepEqual(report.inputs, before.inputs); assert.deepEqual(report.before, before.before); assert.deepEqual(report.changedStores, []);
  const metric = { stage, queries: 370, nonempty: 0, accepted: 0, top3: 0, relevant: 0, partial: 0, irrelevant: 0, unjudged: 0, queriesWithRelevantTop3: 0 };
  for (let i = 0; i < report.rows.length; i++) {
    const row = report.rows[i]; assert.equal(row.query, before.rows[i].query); assert.equal(row.id, before.rows[i].id); assert.equal(row.set, before.rows[i].set);
    metric.nonempty += row.total > 0; metric.accepted += row.requestExecution?.adopted === true;
    let hasRelevant = false;
    for (const item of row.top5.slice(0, 3)) {
      metric.top3++;
      const key = row.set + '/' + row.id + '/' + item.id;
      const label = labels[key];
      if (!label || label.fingerprint !== fingerprint(item)) {
        metric.unjudged++;
        if (!missing.some(r => r.key === key)) missing.push({ key, fingerprint: fingerprint(item), query: row.query, candidate: item });
      } else { assert.equal(label.query, row.query); metric[['irrelevant', 'partial', 'relevant'][label.score]]++; hasRelevant ||= label.score === 2; }
    }
    metric.queriesWithRelevantTop3 += hasRelevant;
  }
  metric.empty = 370 - metric.nonempty;
  metric.relevantShare = metric.unjudged ? null : metric.relevant / metric.top3;
  metrics.push(metric);
}
const rows = bound.rows.map((r, i) => ({ set: r.set, id: r.id, query: r.query, localTotal: before.rows[i].total, rawTotal: raw.rows[i].total, boundTotal: r.total,
  rawAccepted: raw.rows[i].requestExecution?.adopted, boundAccepted: r.requestExecution?.adopted,
  localTop3: before.rows[i].top5.slice(0, 3).map(c => c.id), boundTop3: r.top5.slice(0, 3).map(c => c.id) }));
let knownRelevantLostAll = 0, knownRelevantLostTop3 = 0;
for (let i = 0; i < before.rows.length; i++) for (const c of before.rows[i].top5.slice(0, 3)) {
  const key = before.rows[i].set + '/' + before.rows[i].id + '/' + c.id;
  if (labels[key]?.score !== 2) continue;
  if (!bound.rows[i].diagnostics.teacher.groupedIds.includes(c.id)) knownRelevantLostAll++;
  if (!bound.rows[i].top5.slice(0, 3).some(n => n.id === c.id)) knownRelevantLostTop3++;
}
const responses = fs.readFileSync('docs/r12-40-llm-dollar-responses.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const errors = {};
for (const r of bound.rows) for (const e of r.requestExecution?.validation?.errors || []) errors[e] = (errors[e] || 0) + 1;
// 후속 실험이 같은 예산 원장을 공유해도 이 첫 실험의 비용 판본은 고정한다.
const ledger = raw.budget;
const measuredUpperUsd = ledger.calls.filter(c => c.usage).reduce((sum, c) => sum + c.chargedUpperUsd, 0);
const report = { generatedAt: new Date().toISOString(), model: ledger.model, budgetUsd: 1, receivedResponses: responses.length,
  completedResponses: responses.filter(r => r.response.status === 'completed').length,
  incompleteResponses: responses.filter(r => r.response.status !== 'completed').length,
  attempts: ledger.calls.length, uncertainAttempts: ledger.calls.filter(c => !c.usage).length, measuredUpperUsd, reservedUncertainUsd: ledger.chargedUpperUsd - measuredUpperUsd,
  totalConservativeUsd: ledger.chargedUpperUsd, outstandingReservations: ledger.pending.length,
  metrics, knownRelevantLostAll, knownRelevantLostTop3, errors, rows,
  caveat: '에이전트의 잠정 원문 평가이며 교사/실제 영상 정답이 아님. B 후보 재심사 미실행. 미평가 후보를 관련으로 승격하지 않음. 전체 재현율 측정 불가.' };
fs.writeFileSync('docs/r12-40-llm-dollar-comparison.json', JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync('docs/r12-40-llm-dollar-unjudged.json', JSON.stringify(missing, null, 2) + '\n');
console.log(JSON.stringify({ metrics, missingLabels: missing.length, measuredUpperUsd, totalConservativeUsd: ledger.chargedUpperUsd, knownRelevantLostAll, knownRelevantLostTop3 }));
