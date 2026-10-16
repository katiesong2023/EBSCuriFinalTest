const fs = require('node:fs'), zlib = require('node:zlib'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const read = p => JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p));
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const fp = r => sha(JSON.stringify(stable([r.title, r.summary, r.sourceSupplements || []])));
const baseline = read('docs/r12-40-final.json.gz'), first = read('docs/r12-40-semantic-source-bound-results.json.gz'), final = read('docs/r12-40-requirement-results.json.gz');
const { mergeReviewedCandidates } = require('./semantic-result-merge');
const { prepareRequirementReview, profile } = require('./semantic-requirement-review');
const sourceSnapshot = read('docs/r12-40-semantic-source-candidates.json.gz');
const responses = fs.readFileSync('docs/r12-40-requirement-responses.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(final.profile, profile); assert.equal(responses.length, final.expectedResponses);
assert.equal(new Set(responses.map(r => r.set + '/' + r.id)).size, responses.length);
assert.equal(final.budget.pending.length, 0); assert(final.budget.chargedUpperUsd <= 1);
for (const response of responses) {
  const index = first.rows.findIndex(r => r.set === response.set && r.id === response.id);
  const row = first.rows[index]; assert.equal(response.query, row.query); assert.equal(response.profile, profile);
  const batch = { query: row.query, candidates: row.top5.slice(0, 3).map(item => ({ ...sourceSnapshot.rows[index].batch.candidates.find(c => c.item.id === item.id), item })).map((c, i) => ({ ...c, packet: { ...c.packet, i } })) };
  const prepared = prepareRequirementReview(batch);
  assert.equal(response.batchFingerprint, sha(JSON.stringify(batch))); assert.equal(response.promptHash, sha(JSON.stringify(prepared.payload)));
  const payload = { ...prepared.payload, model: final.budget.model, max_output_tokens: 1000 };
  const calls = final.budget.calls.filter(c => c.requestHash === sha(JSON.stringify(payload)));
  assert.equal(calls.length, 1); assert.equal(response.response.model, final.budget.model); assert.deepEqual(calls[0].usage, response.response.usage);
}
const merged = { ...final, rows: final.rows.map((row, index) => {
  const local = baseline.rows[index];
  const results = mergeReviewedCandidates(local.top5, { accepted: row.reviewAccepted, results: row.top5 });
  const localIds = local.diagnostics.teacher.groupedIds;
  const ids = [...new Set([...localIds, ...row.returnedIds])];
  return { ...row, total: ids.length, top5: results.slice(0, 5), returnedIds: ids };
}) };
const paths = ['docs/r12-40-relevance-labels.json', 'docs/r12-40-llm-dollar-relevance-labels.json', 'docs/r12-40-semantic-source-relevance-labels.json', 'docs/r12-40-requirement-relevance-labels.json'];
const labels = Object.assign({}, ...paths.filter(p => fs.existsSync(p)).map(p => read(p).labels));
const missing = [], metrics = [], rows = [];
for (const [stage, report] of [['local', baseline], ['semanticSource', first], ['requirements', final], ['preserveLocalAndSupplement', merged]]) {
  assert.equal(report.rows.length, 370); assert.deepEqual(report.inputs, baseline.inputs); assert.equal(report.catalogFingerprint, baseline.catalogFingerprint); assert.deepEqual(report.before, baseline.before); assert.deepEqual(report.changedStores, []);
  const metric = { stage, queries: 370, nonempty: 0, top1: { relevant: 0, partial: 0, irrelevant: 0, unjudged: 0 }, top3: { relevant: 0, partial: 0, irrelevant: 0, unjudged: 0 }, queriesWithRelevantTop3: 0 };
  report.rows.forEach((row, index) => {
    assert.equal(row.query, baseline.rows[index].query); assert.equal(row.set, baseline.rows[index].set); assert.equal(row.id, baseline.rows[index].id);
    metric.nonempty += row.total > 0; let relevant = false;
    row.top5.slice(0, 3).forEach((item, rank) => {
      const key = row.set + '/' + row.id + '/' + item.id, label = labels[key], valid = label && label.fingerprint === fp(item);
      if (valid) assert.equal(label.query, row.query);
      const category = valid ? ['irrelevant', 'partial', 'relevant'][label.score] : 'unjudged';
      metric.top3[category]++; if (!rank) metric.top1[category]++; relevant ||= !!valid && label.score === 2;
      if (!valid && ['requirements', 'preserveLocalAndSupplement'].includes(stage) && !missing.some(r => r.key === key)) missing.push({ key, query: row.query, fingerprint: fp(item), rank: rank + 1, candidate: item });
    });
    metric.queriesWithRelevantTop3 += relevant;
    if (stage === 'requirements') rows.push({ set: row.set, id: row.id, query: row.query, total: row.total, requirements: row.requirements, top3: row.top5.map(item => ({ id: item.id, title: item.title, score: labels[row.set + '/' + row.id + '/' + item.id]?.score ?? null })) });
  });
  metric.empty = 370 - metric.nonempty;
  if (metric.top3.unjudged) metric.queriesWithRelevantTop3 = null;
  for (const k of ['top1', 'top3']) { const m = metric[k], n = m.relevant + m.partial + m.irrelevant + m.unjudged; m.relevantShare = m.unjudged || !n ? null : m.relevant / n; }
  metrics.push(metric);
}
let knownRelevant = 0, lostAll = 0, lostTop3 = 0, mergedLostKnownAll = 0, mergedLostKnownTop3 = 0, quotesChecked = 0;
for (let i = 0; i < baseline.rows.length; i++) {
  for (const item of baseline.rows[i].top5.slice(0, 3)) if (labels[baseline.rows[i].set + '/' + baseline.rows[i].id + '/' + item.id]?.score === 2) {
    knownRelevant++; lostAll += !final.rows[i].returnedIds.includes(item.id); lostTop3 += !final.rows[i].top5.slice(0, 3).some(r => r.id === item.id);
    mergedLostKnownAll += !merged.rows[i].returnedIds.includes(item.id); mergedLostKnownTop3 += !merged.rows[i].top5.slice(0, 3).some(r => r.id === item.id);
  }
  for (const item of final.rows[i].top5) for (const condition of item.semanticRequirementReview.conditions) {
    assert(condition.evidence.length);
    for (const p of condition.evidence) { const text = p.field === 'sourceSupplement' ? item.sourceSupplements.find(s => s.id === p.supplementId)?.text : item[p.field]; assert.equal(text.slice(p.start, p.end), p.quote); quotesChecked++; }
  }
}
for (const [p, hash] of Object.entries(baseline.before)) assert.equal(sha(fs.readFileSync(p)), hash);
const report = { generatedAt: new Date().toISOString(), metrics, knownRelevant, lostAll, lostTop3, mergedLostKnownAll, mergedLostKnownTop3, quotesChecked, receivedResponses: final.responses, expectedResponses: final.expectedResponses, incomplete: final.incomplete, budgetFailure: final.budgetFailure,
  totalConservativeUsd: final.budget.chargedUpperUsd, remainingApprovedUsd: 1 - final.budget.chargedUpperUsd, conditionPhaseConservativeUsd: final.budget.chargedUpperUsd - first.budget.chargedUpperUsd,
  missingLabels: missing.length, changedStores: [], rows,
  verifiedPromptsAndUsage: responses.length,
  codeHashes: Object.fromEntries(['server/semantic-requirement-review.js', 'server/semantic-requirement-evaluate.js', 'server/semantic-source-quotes.js', 'server/semantic-result-merge.js'].map(p => [p, sha(fs.readFileSync(p))])),
  caveat: '원문370·카탈로그 고정. 이전 판단과 같은 원문 라벨 재사용. 미평가를 관련으로 세지 않음. 원문 텍스트의 잠정 에이전트 평가이며 교사/영상 정답률·학년 적합성·전체 재현율 아님. 필수 조건 분해의 누락 자체는 모델이 보증하지 않음. 제품 검색 자동 유료 호출은 비활성.' };
fs.writeFileSync('docs/r12-40-requirement-comparison.json', JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync('docs/r12-40-semantic-merged-results.json.gz', zlib.gzipSync(JSON.stringify(merged)));
fs.writeFileSync('docs/r12-40-requirement-unjudged.json', JSON.stringify(missing, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined }));
