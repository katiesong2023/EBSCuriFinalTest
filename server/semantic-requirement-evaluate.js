const fs = require('node:fs'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { prepareRequirementReview, applyRequirementReview, profile } = require('./semantic-requirement-review');
const { createModelBudget, model } = require('./request-model-budget');
const { createRequestModelClient } = require('./request-model-client');
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const read = p => JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p));
const parent = read('docs/r12-40-semantic-source-bound-results.json.gz');
const source = read('docs/r12-40-semantic-source-candidates.json.gz');
const ledgerPath = 'docs/r12-40-llm-dollar-ledger.json', responsesPath = 'docs/r12-40-requirement-responses.jsonl';
const batches = parent.rows.map((r, index) => {
  const candidates = r.top5.slice(0, 3).map(item => {
    const original = source.rows[index].batch.candidates.find(c => c.item.id === item.id);
    if (!original) throw Error('REVIEWED_SOURCE_MISSING');
    return { ...original, item };
  }).map((c, i) => ({ ...c, packet: { ...c.packet, i } }));
  const batch = { query: r.query, candidates };
  return { ...r, batch, batchFingerprint: sha(JSON.stringify(batch)), prepared: candidates.length ? prepareRequirementReview(batch) : null };
});
function assertStores() { for (const [p, h] of Object.entries(parent.before)) if (sha(fs.readFileSync(p)) !== h) throw Error('SOURCE_STORES_CHANGED'); }
async function main() {
  assertStores();
  const cached = fs.existsSync(responsesPath) ? fs.readFileSync(responsesPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  const key = r => r.set + '/' + r.id, recorded = new Map(cached.map(r => [key(r), r]));
  for (const row of batches) { const r = recorded.get(key(row)); if (r && (r.profile !== profile || r.query !== row.query || r.batchFingerprint !== row.batchFingerprint || r.promptHash !== sha(JSON.stringify(row.prepared.payload)))) throw Error('CACHED_REVIEW_CHANGED'); }
  const remaining = batches.filter(r => r.prepared && !recorded.has(key(r)));
  console.log(JSON.stringify({ eligibleQueries: batches.filter(r => r.prepared).length, remaining: remaining.length, approvedTotalUsd: 1, sharedSpentUsd: read(ledgerPath).chargedUpperUsd }));
  let failure;
  if (process.argv.includes('--execute') && remaining.length) {
    process.env.CURI_ALLOW_PAID_API = 'true';
    const budget = createModelBudget({ path: ledgerPath, scope: read(ledgerPath).scope, approvedBudgetUsd: 1 });
    const client = createRequestModelClient({ allowExternal: true, model, maxCalls: remaining.length, maxOutputTokens: 1000, timeoutMs: 30000, approvedBudgetUsd: 1, budget });
    let next = 0;
    try {
      const worker = async () => { while (next < remaining.length && !failure) {
        const row = remaining[next++];
        try {
          const response = await client.respond(row.prepared);
          const review = applyRequirementReview(row.batch, response);
          const record = { set: row.set, id: row.id, query: row.query, profile, batchFingerprint: row.batchFingerprint, promptHash: sha(JSON.stringify(row.prepared.payload)), response, accepted: review.accepted, reason: review.reason };
          fs.appendFileSync(responsesPath, JSON.stringify(record) + '\n', { mode: 0o600 }); recorded.set(key(row), record);
          if (recorded.size % 20 === 0) console.log(JSON.stringify({ responses: recorded.size, conservativeTotalUsd: budget.snapshot.chargedUpperUsd }));
          if (budget.snapshot.halted) throw Error('MODEL_BUDGET_UNCERTAIN_STOP');
        } catch (error) { failure ||= error; }
      } };
      await Promise.all(Array.from({ length: 4 }, worker));
    } finally { budget.close(); }
  }
  assertStores();
  const rows = batches.map(row => {
    const record = recorded.get(key(row)), review = record ? applyRequirementReview(row.batch, record.response) : null;
    // 조건 확인 실패·예산 부족에서는 미검증 후보를 통과시키지 않는다.
    const results = review?.accepted ? review.results : [];
    return { set: row.set, id: row.id, query: row.query, total: results.length, returnedIds: results.map(r => r.id), candidateIds: row.candidateIds,
      reviewAccepted: row.prepared ? !!review?.accepted : true, reviewReason: review?.reason || (row.prepared ? 'NO_PAID_RESPONSE' : 'NO_FIRST_PASS_MATCH'),
      requirements: review?.requirements || [], excluded: review?.excluded || [], top5: results };
  });
  const output = 'docs/r12-40-requirement-results.json.gz';
  fs.writeFileSync(output, zlib.gzipSync(JSON.stringify({ profile, rows, inputs: parent.inputs, catalogFingerprint: parent.catalogFingerprint, before: parent.before, changedStores: [],
    budget: read(ledgerPath), responses: recorded.size, expectedResponses: batches.filter(r => r.prepared).length, incomplete: recorded.size < batches.filter(r => r.prepared).length,
    budgetFailure: failure?.message || null, scope: '동일370. 첫 단계 상위3 후보를 각 필수 조건별로 검증. 하나라도 원문 미확인이면 제외. 기존 총$1 공유.' })));
  console.log(JSON.stringify({ output, responses: recorded.size, nonempty: rows.filter(r => r.total).length, sharedSpentUsd: read(ledgerPath).chargedUpperUsd, failure: failure?.message }));
  if (failure) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
