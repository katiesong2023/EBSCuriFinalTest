const fs = require('node:fs');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { createSemanticReviewCandidates } = require('./semantic-review-candidates');
const { prepareSemanticReview, applySemanticReview, profile } = require('./semantic-review-model');
const { createModelBudget, model } = require('./request-model-budget');
const { createRequestModelClient } = require('./request-model-client');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { teacherCatalog } = require('./teacher-approvals');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const read = p => JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p));
const baseline = read('docs/r12-40-final.json.gz');
const ledgerPath = 'docs/r12-40-llm-dollar-ledger.json';
const batchesPath = 'docs/r12-40-semantic-source-candidates.json.gz';
const responsePath = 'docs/r12-40-semantic-source-responses.jsonl';
const reportPath = 'docs/r12-40-semantic-source-results.json.gz';
const hashes = () => Object.fromEntries(Object.keys(baseline.before).map(p => [p, sha(fs.readFileSync(p))]));
function assertStores() {
  if (JSON.stringify(hashes()) !== JSON.stringify(baseline.before)) throw Error('SOURCE_STORES_CHANGED');
}
async function prepare() {
  if (fs.existsSync(batchesPath)) throw Error('CANDIDATE_SNAPSHOT_EXISTS');
  assertStores();
  const catalog = await teacherCatalog(await loadDiscoveryCatalog());
  const fingerprint = sha(JSON.stringify(catalog.resources.map(r => ({ id: r.id, title: r.title, program: r.program, summary: r.summary, kind: r.kind, sourceSupplements: r.sourceSupplements }))));
  if (fingerprint !== baseline.catalogFingerprint) throw Error('SOURCE_CATALOG_CHANGED');
  const source = createSemanticReviewCandidates(catalog);
  // 이전 실제 해석은 검색어 제안으로만 재사용한다. 정답·필터·충족 판정으로 쓰지 않는다.
  const old = fs.readFileSync('docs/r12-40-llm-dollar-responses.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
  const hints = new Map(old.filter(r => r.interpretation?.originalQuery === r.query).map(r => [r.query,
    [...(r.interpretation.expansions || []).map(e => e.text), ...(r.interpretation.clauses || []).filter(c => ['topic', 'entity', 'other'].includes(c.kind) && c.mode !== 'excluded').map(c => c.label)].filter(s => typeof s === 'string' && s.length <= 100).slice(0, 6)]));
  const rows = [];
  for (const row of baseline.rows) {
    const batch = await source.retrieve(row.query, { localResults: row.top5, rewriteHints: hints.get(row.query) || [] });
    rows.push({ set: row.set, id: row.id, query: row.query, batch,
      prepared: batch.candidates.length ? prepareSemanticReview(batch) : null });
    if (rows.length % 20 === 0) console.log(JSON.stringify({ prepared: rows.length, semanticOk: rows.filter(r => r.batch.semanticStatus === 'LOCAL_E5').length }));
  }
  assertStores();
  fs.writeFileSync(batchesPath, zlib.gzipSync(JSON.stringify({ profile, inputs: baseline.inputs, catalogFingerprint: fingerprint, before: baseline.before, rows })));
  console.log(JSON.stringify({ output: batchesPath, rows: rows.length, candidates: rows.reduce((n, r) => n + r.batch.candidates.length, 0), paidApiCalls: 0 }));
}
async function execute() {
  if (!process.env.OPENAI_API_KEY) throw Error('MODEL_CREDENTIAL_REQUIRED');
  assertStores();
  const prepared = read(batchesPath), ledger = read(ledgerPath);
  if (prepared.profile !== profile || prepared.rows.length !== 370 || prepared.catalogFingerprint !== baseline.catalogFingerprint) throw Error('EXPERIMENT_SNAPSHOT_CHANGED');
  const cached = fs.existsSync(responsePath) ? fs.readFileSync(responsePath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  const key = r => r.set + '/' + r.id;
  const recorded = new Map(cached.map(r => [key(r), r]));
  for (const row of prepared.rows) {
    const record = recorded.get(key(row));
    if (record && (record.profile !== profile || record.query !== row.query || record.batchFingerprint !== row.batch.fingerprint)) throw Error('EXPERIMENT_RESPONSE_CHANGED');
  }
  const remaining = prepared.rows.filter(r => r.prepared && !recorded.has(key(r)));
  process.env.CURI_ALLOW_PAID_API = 'true';
  const budget = createModelBudget({ path: ledgerPath, approvedBudgetUsd: 1, scope: ledger.scope });
  const client = createRequestModelClient({ allowExternal: true, model, maxCalls: remaining.length,
    maxOutputTokens: 750, timeoutMs: 30000, approvedBudgetUsd: 1, budget });
  let next = 0, failure;
  try {
    const worker = async () => {
      while (next < remaining.length && !failure) {
        const row = remaining[next++];
        try {
          const response = await client.respond(row.prepared);
          const review = applySemanticReview(row.batch, response);
          const record = { set: row.set, id: row.id, query: row.query, profile, batchFingerprint: row.batch.fingerprint,
            promptHash: sha(JSON.stringify(row.prepared.payload)), response, accepted: review.accepted, reason: review.reason };
          fs.appendFileSync(responsePath, JSON.stringify(record) + '\n', { mode: 0o600 });
          recorded.set(key(row), record);
          console.log(JSON.stringify({ responses: recorded.size, valid: [...recorded.values()].filter(r => r.accepted).length, totalBudgetConservativeUsd: budget.snapshot.chargedUpperUsd }));
          if (budget.snapshot.halted) throw Error('MODEL_BUDGET_UNCERTAIN_STOP');
        } catch (error) { failure ||= error; }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  } finally { budget.close(); }
  assertStores();
  const rows = prepared.rows.map((row, index) => {
    const record = recorded.get(key(row));
    const review = record ? applySemanticReview(row.batch, record.response) : null;
    const failed = row.prepared && !review?.accepted;
    // 실패 시 전체 카탈로그를 반환하지 않는다. 기존 제한된 검색 결과만 유지한다.
    const results = failed ? baseline.rows[index].top5 : review?.results || [];
    return { set: row.set, id: row.id, query: row.query, total: failed ? baseline.rows[index].total : results.length,
      candidateCount: row.batch.candidates.length, reviewAccepted: !!review?.accepted,
      reviewReason: review?.reason || (row.prepared ? 'NO_PAID_RESPONSE' : row.batch.reason), fallback: !!failed,
      intent: review?.intent, top5: results.slice(0, 5).map(({ id, title, summary, program, kind, sourceUrl, sourceSupplements, semanticSourceReview }) =>
        ({ id, title, summary, program, kind, sourceUrl, sourceSupplements, semanticSourceReview })) };
  });
  const finalLedger = read(ledgerPath);
  fs.writeFileSync(reportPath, zlib.gzipSync(JSON.stringify({ profile, inputs: baseline.inputs, catalogFingerprint: prepared.catalogFingerprint,
    before: baseline.before, after: hashes(), changedStores: [], rows, budget: finalLedger,
    receivedNewResponses: recorded.size, budgetFailure: failure?.message || null,
    incomplete: remaining.length > 0 && recorded.size < prepared.rows.filter(r => r.prepared).length,
    scope: '동일370. 기존 실험과 총$1 원장 공유. 전체 원문에서 관련 구절을 추출하고 LLM이 원래 질문과 대조. 불명/실패는 기존 로컬 결과로 제한.' })));
  console.log(JSON.stringify({ output: reportPath, nonempty: rows.filter(r => r.total > 0).length, fallbacks: rows.filter(r => r.fallback).length, budgetFailure: failure?.message, totalBudgetConservativeUsd: finalLedger.chargedUpperUsd }));
  if (failure) process.exitCode = 1;
}
function replay() {
  assertStores();
  const prepared = read(batchesPath);
  const records = fs.readFileSync(responsePath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const recorded = new Map(records.map(r => [r.set + '/' + r.id, r]));
  if (prepared.profile !== profile || prepared.rows.length !== baseline.rows.length || records.length !== recorded.size) throw Error('REPLAY_SNAPSHOT_CHANGED');
  const rows = prepared.rows.map((row, index) => {
    const original = baseline.rows[index], record = recorded.get(row.set + '/' + row.id);
    if (original.query !== row.query || original.id !== row.id || original.set !== row.set || !record || record.query !== row.query || record.profile !== profile || record.batchFingerprint !== row.batch.fingerprint || record.promptHash !== sha(JSON.stringify(row.prepared.payload))) throw Error('REPLAY_INPUT_CHANGED');
    const review = applySemanticReview(row.batch, record.response);
    const results = review.accepted ? review.results : original.top5;
    return { set: row.set, id: row.id, query: row.query, total: review.accepted ? results.length : original.total,
      candidateCount: row.batch.candidates.length, candidateIds: row.batch.candidates.map(c => c.item.id),
      reviewAccepted: review.accepted, reviewReason: review.reason, rejected: review.rejected || [], fallback: !review.accepted,
      intent: review.intent, returnedIds: results.map(r => r.id),
      top5: results.slice(0, 5).map(({ id, title, summary, program, kind, sourceUrl, sourceSupplements, semanticSourceReview }) => ({ id, title, summary, program, kind, sourceUrl, sourceSupplements, semanticSourceReview })) };
  });
  const output = 'docs/r12-40-semantic-source-bound-results.json.gz';
  fs.writeFileSync(output, zlib.gzipSync(JSON.stringify({ profile, inputs: baseline.inputs, catalogFingerprint: prepared.catalogFingerprint,
    before: baseline.before, after: hashes(), changedStores: [], rows, budget: read(reportPath).budget,
    receivedResponses: records.length, additionalPaidCalls: 0,
    replayCode: Object.fromEntries(['server/semantic-review-model.js', 'server/semantic-source-quotes.js', __filename].map(p => [p, sha(fs.readFileSync(p))])),
    scope: '동일370 저장 응답 무료 재평가. 보이는 발췌의 공백만 정규화해 원문 좌표로 연결. 잘못된 인용 후보만 제외.' })));
  console.log(JSON.stringify({ output, nonempty: rows.filter(r => r.total).length, fallbacks: rows.filter(r => r.fallback).length, additionalPaidCalls: 0 }));
}
const action = process.argv[2];
(action === 'prepare' ? prepare() : action === 'execute' ? execute() : action === 'replay' ? Promise.resolve().then(replay) : Promise.reject(Error('prepare, execute 또는 replay를 지정하세요.')))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
