const fs = require('node:fs'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { createModelBudget } = require('./request-model-budget');
const { createRequestModelClient } = require('./request-model-client');
const { prepareQueryContract, applyQueryContract, profile: queryProfile, repairProfile, strongProfile } = require('./query-condition-contract');
const { prepareConditionReview, applyConditionReview, profile: sourceProfile } = require('./condition-source-review');
const { packetFor } = require('./condition-source-packets');
const { createSemanticReviewCandidates } = require('./semantic-review-candidates');
const { prepareEntailmentReview, applyEntailmentReview, profile: entailmentProfile } = require('./condition-entailment-review');
const { teacherCatalog } = require('./teacher-approvals');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const read = p => JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p));
const baseline = read('docs/r12-40-final.json.gz'), ledgerPath = 'docs/r12-40-llm-dollar-ledger.json';
const root = 'docs/r12-40-anchored-', model = 'gpt-6-luna';
const stores = () => Object.fromEntries(Object.keys(baseline.before).map(p => [p, sha(fs.readFileSync(p))]));
const assertStores = () => { if (JSON.stringify(stores()) !== JSON.stringify(baseline.before)) throw Error('SOURCE_STORES_CHANGED'); };
const key = r => r.set + '/' + r.id;
const lines = path => fs.existsSync(path) ? fs.readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
async function executeRows(rows, responsePath, profile, apply, requestedModel = model, maxOutputTokens = 4096) {
  const cached = lines(responsePath), recorded = new Map(cached.map(r => [key(r), r]));
  if (cached.length !== recorded.size) throw Error('DUPLICATE_RESPONSE');
  for (const row of rows) { const r = recorded.get(key(row)); if (r && (r.query !== row.query || r.profile !== profile || r.promptHash !== sha(JSON.stringify(row.prepared.payload)))) throw Error('CACHED_RESPONSE_CHANGED'); }
  let missing = rows.filter(r => r.prepared && !recorded.has(key(r)));
  const limitAt = process.argv.indexOf('--limit'); if (limitAt >= 0) missing = missing.slice(0, Number(process.argv[limitAt + 1]));
  console.log(JSON.stringify({ phase: process.argv[2], total: rows.length, cached: cached.length, remaining: missing.length }));
  if (!process.argv.includes('--execute') || !missing.length) return recorded;
  process.env.CURI_ALLOW_PAID_API = 'true';
  const budget = createModelBudget({ path: ledgerPath, approvedBudgetUsd: 2, scope: read(ledgerPath).scope,
    amendment: { previousBudgetUsd: 1, reason: 'USER_ADDITIONAL_USD1_2026_10_16' }, additionalModels: [requestedModel] });
  const client = createRequestModelClient({ allowExternal: true, model: requestedModel, maxCalls: missing.length, maxOutputTokens, timeoutMs: 30000, approvedBudgetUsd: 2, budget });
  let next = 0, failure;
  try {
    const worker = async () => { while (next < missing.length && !failure) {
      const row = missing[next++];
      try {
        const response = await client.respond(row.prepared), result = apply(row, response);
        const record = { set: row.set, id: row.id, query: row.query, profile, promptHash: sha(JSON.stringify(row.prepared.payload)), response, accepted: result.accepted, reason: result.reason };
        fs.appendFileSync(responsePath, JSON.stringify(record) + '\n', { mode: 0o600 }); recorded.set(key(row), record);
        if (recorded.size % 20 === 0) console.log(JSON.stringify({ received: recorded.size, accepted: [...recorded.values()].filter(r => r.accepted).length, conservativeTotalUsd: budget.snapshot.chargedUpperUsd }));
        if (budget.snapshot.halted) throw Error('MODEL_BUDGET_UNCERTAIN_STOP');
      } catch (error) { failure ||= error; }
    } };
    await Promise.all(Array.from({ length: Math.min(8, missing.length) }, worker));
  } finally { budget.close(); }
  if (failure) throw failure;
  return recorded;
}
async function entailment({ luna = false } = {}) {
  const prefix = luna ? 'luna-entailment-' : 'entailment-';
  const parent = read(root + 'results.json.gz');
  const rows = parent.rows.map(r => {
    const candidates = r.top5.slice(0, 3).map(item => packetFor(item, r.contract));
    const prepared = candidates.length ? prepareEntailmentReview(r.contract, candidates) : null;
    if (prepared && luna) prepared.payload.reasoning = { effort: 'low' };
    return { ...r, candidates, prepared };
  });
  if (!fs.existsSync(root + prefix + 'candidates.json.gz')) fs.writeFileSync(root + prefix + 'candidates.json.gz', zlib.gzipSync(JSON.stringify({ profile: entailmentProfile, rows })));
  const recorded = await executeRows(rows.filter(r => r.prepared), root + prefix + 'responses.jsonl', entailmentProfile, (r, response) => applyEntailmentReview(r.contract, r.candidates, response), luna ? model : 'gpt-4.1-2025-04-14', luna ? 2048 : 1024);
  const finalRows = rows.map(row => {
    const record = recorded.get(key(row));
    const result = record ? applyEntailmentReview(row.contract, row.candidates, record.response) : { accepted: !row.prepared, results: [], reason: row.prepared ? 'NO_ENTAILMENT_RESPONSE' : row.reason };
    return { ...row, candidates: undefined, prepared: undefined, total: result.results.length, top5: result.results, returnedIds: result.results.map(i => i.id), entailmentAccepted: result.accepted, entailmentReason: result.reason, entailmentDecisions: result.decisions };
  });
  assertStores();
  fs.writeFileSync(root + prefix + 'results.json.gz', zlib.gzipSync(JSON.stringify({ ...parent, rows: finalRows, entailmentProfile, parentResponses: parent.responses, responses: recorded.size, expectedResponses: rows.filter(r => r.prepared).length, incomplete: recorded.size !== rows.filter(r => r.prepared).length, budget: read(ledgerPath) })));
  console.log(JSON.stringify({ expected: rows.filter(r => r.prepared).length, received: recorded.size, nonempty: finalRows.filter(r => r.total).length, conservativeTotalUsd: read(ledgerPath).chargedUpperUsd }));
}
async function contracts() {
  const rows = baseline.rows.map(r => ({ set: r.set, id: r.id, query: r.query, prepared: prepareQueryContract(r.query) }));
  const recorded = await executeRows(rows, root + 'query-responses.jsonl', queryProfile, (r, response) => applyQueryContract(r.prepared, response));
  const compiled = rows.map(r => ({ ...r, contract: recorded.has(key(r)) ? applyQueryContract(r.prepared, recorded.get(key(r)).response) : null }));
  fs.writeFileSync(root + 'contracts.json.gz', zlib.gzipSync(JSON.stringify({ queryProfile, model, inputs: baseline.inputs, before: baseline.before, rows: compiled })));
  console.log(JSON.stringify({ compiled: compiled.filter(r => r.contract?.accepted).length, unresolved: compiled.filter(r => r.contract?.unresolved).length, responses: recorded.size, totalConservativeUsd: read(ledgerPath).chargedUpperUsd }));
}
async function prepare() {
  if (fs.existsSync(root + 'candidates.json.gz')) throw Error('FROZEN_CANDIDATES_EXIST');
  const compiled = read(root + (fs.existsSync(root + 'contracts-strong.json.gz') ? 'contracts-strong.json.gz' : 'contracts-final.json.gz'));
  if (compiled.rows.some(r => !r.contract)) throw Error('QUERY_RESPONSES_INCOMPLETE');
  const catalog = await teacherCatalog(await loadDiscoveryCatalog());
  const fingerprint = sha(JSON.stringify(catalog.resources.map(r => ({ id: r.id, title: r.title, program: r.program, summary: r.summary, kind: r.kind, sourceSupplements: r.sourceSupplements }))));
  if (fingerprint !== baseline.catalogFingerprint) throw Error('CATALOG_CHANGED');
  const engine = createSemanticReviewCandidates(catalog), rows = [];
  for (const [index, row] of compiled.rows.entries()) {
    let candidates = [], semanticStatus, queryReason;
    if (row.contract.accepted && !row.contract.unresolved) {
      const batch = await engine.retrieve(row.query, { localResults: baseline.rows[index].top5, rewriteHints: [row.contract.searchQuery], semanticQuery: row.contract.searchQuery });
      semanticStatus = batch.semanticStatus;
      candidates = batch.candidates.slice(0, 12).map(c => packetFor(c.item, row.contract));
    } else queryReason = row.contract.reason || 'UNRESOLVED_QUERY';
    rows.push({ set: row.set, id: row.id, query: row.query, contract: row.contract, candidates, semanticStatus, queryReason,
      prepared: candidates.length ? prepareConditionReview(row.contract, candidates) : null });
    if (rows.length % 30 === 0) console.log(JSON.stringify({ prepared: rows.length, eligible: rows.filter(r => r.prepared).length }));
  }
  assertStores();
  fs.writeFileSync(root + 'candidates.json.gz', zlib.gzipSync(JSON.stringify({ model, queryProfile, sourceProfile, catalogFingerprint: fingerprint, inputs: baseline.inputs, before: baseline.before,
    codeHashes: Object.fromEntries(['server/query-condition-contract.js', 'server/condition-source-packets.js', 'server/condition-source-review.js', 'server/request-ranking-context.js'].map(p => [p, sha(fs.readFileSync(p))])), rows })));
  console.log(JSON.stringify({ rows: rows.length, eligible: rows.filter(r => r.prepared).length, candidates: rows.reduce((n, r) => n + r.candidates.length, 0), paidCalls: 0 }));
}
async function strengthen() {
  const original = read(root + 'contracts-final.json.gz');
  const prepareStrong = query => { const p = prepareQueryContract(query, { strong: true }); delete p.payload.reasoning; return p; };
  const rows = original.rows.filter(r => !r.contract.accepted || r.contract.unresolved).map(r => ({ ...r, prepared: prepareStrong(r.query) }));
  const recorded = await executeRows(rows, root + 'strong-responses.jsonl', strongProfile, (r, response) => applyQueryContract(r.prepared, response), 'gpt-4.1-2025-04-14');
  const finalRows = original.rows.map(r => {
    const record = recorded.get(key(r)); if (!record) return r;
    const prepared = prepareStrong(r.query); return { ...r, prepared, contract: applyQueryContract(prepared, record.response), compilation: 'STRONG_REPAIR' };
  });
  fs.writeFileSync(root + 'contracts-strong.json.gz', zlib.gzipSync(JSON.stringify({ ...original, strongProfile, expectedStrong: rows.length, receivedStrong: recorded.size, rows: finalRows })));
  console.log(JSON.stringify({ expectedStrong: rows.length, receivedStrong: recorded.size, ready: finalRows.filter(r => r.contract.accepted && !r.contract.unresolved).length }));
}
async function refresh() {
  const previous = read(root + 'candidates.json.gz'), compiled = read(root + 'contracts-strong.json.gz');
  const catalog = await teacherCatalog(await loadDiscoveryCatalog()), engine = createSemanticReviewCandidates(catalog);
  const rows = [];
  for (const [index, row] of compiled.rows.entries()) {
    const old = previous.rows[index]; let items = old.candidates.map(c => c.item);
    if (row.contract.fingerprint !== old.contract.fingerprint) {
      items = row.contract.accepted && !row.contract.unresolved ? (await engine.retrieve(row.query, { localResults: baseline.rows[index].top5, rewriteHints: [row.contract.searchQuery], semanticQuery: row.contract.searchQuery })).candidates.slice(0, 12).map(c => c.item) : [];
    }
    const candidates = items.map(item => packetFor(item, row.contract));
    rows.push({ ...old, contract: row.contract, candidates, prepared: candidates.length ? prepareConditionReview(row.contract, candidates) : null });
  }
  assertStores();
  fs.copyFileSync(root + 'candidates.json.gz', root + 'candidates-initial.json.gz', fs.constants.COPYFILE_EXCL);
  const codeHashes = Object.fromEntries(Object.keys(previous.codeHashes).map(p => [p, sha(fs.readFileSync(p))]));
  fs.writeFileSync(root + 'candidates.json.gz', zlib.gzipSync(JSON.stringify({ ...previous, strongProfile, codeHashes, rows })));
  console.log(JSON.stringify({ refreshed: rows.length, eligible: rows.filter(r => r.prepared).length, paidCalls: 0 }));
}
async function repairContracts() {
  const original = read(root + 'contracts.json.gz');
  if (original.rows.some(r => !r.contract)) throw Error('FIRST_CONTRACTS_INCOMPLETE');
  const rows = original.rows.filter(r => !r.contract.accepted || r.contract.unresolved).map(r => ({ ...r, prepared: prepareQueryContract(r.query, { repair: true }) }));
  const recorded = await executeRows(rows, root + 'repair-responses.jsonl', repairProfile, (r, response) => applyQueryContract(r.prepared, response));
  const finalRows = original.rows.map(r => {
    const record = recorded.get(key(r));
    if (!record) return { ...r, compilation: r.contract.accepted && !r.contract.unresolved ? 'FIRST' : 'REPAIR_NOT_RECEIVED' };
    const prepared = prepareQueryContract(r.query, { repair: true });
    return { ...r, prepared, contract: applyQueryContract(prepared, record.response), compilation: 'REPAIR' };
  });
  fs.writeFileSync(root + 'contracts-final.json.gz', zlib.gzipSync(JSON.stringify({ ...original, repairProfile, expectedRepairs: rows.length, receivedRepairs: recorded.size, rows: finalRows })));
  console.log(JSON.stringify({ expectedRepairs: rows.length, receivedRepairs: recorded.size, ready: finalRows.filter(r => r.contract.accepted && !r.contract.unresolved).length }));
}
async function review() {
  const snapshot = read(root + 'candidates.json.gz');
  if (snapshot.sourceProfile !== sourceProfile || snapshot.queryProfile !== queryProfile) throw Error('PROFILE_CHANGED');
  const recorded = await executeRows(snapshot.rows.filter(r => r.prepared), root + 'source-responses.jsonl', sourceProfile, (r, response) => applyConditionReview(r.contract, r.candidates, response));
  const rows = snapshot.rows.map(row => {
    const record = recorded.get(key(row)), result = record ? applyConditionReview(row.contract, row.candidates, record.response) : { accepted: false, results: [], reason: row.queryReason || (row.prepared ? 'NO_PAID_RESPONSE' : 'NO_CANDIDATE') };
    return { set: row.set, id: row.id, query: row.query, total: result.results.length, returnedIds: result.results.map(r => r.id), top5: result.results.slice(0, 5),
      contract: row.contract, accepted: result.accepted, reason: result.reason, candidateIds: row.candidates.map(c => c.item.id), assessments: result.assessments, rejected: result.rejected || [] };
  });
  assertStores();
  fs.writeFileSync(root + 'results.json.gz', zlib.gzipSync(JSON.stringify({ model, queryProfile, sourceProfile, inputs: baseline.inputs, catalogFingerprint: snapshot.catalogFingerprint, before: baseline.before, after: stores(), changedStores: [], rows,
    responses: recorded.size, expectedResponses: snapshot.rows.filter(r => r.prepared).length, incomplete: recorded.size !== snapshot.rows.filter(r => r.prepared).length, budget: read(ledgerPath),
    replayCode: Object.fromEntries(['server/query-condition-contract.js', 'server/condition-source-review.js', 'server/supplement-search.js', 'server/request-ranking-context.js'].map(p => [p, sha(fs.readFileSync(p))])) })));
  console.log(JSON.stringify({ responses: recorded.size, nonempty: rows.filter(r => r.total).length, totalConservativeUsd: read(ledgerPath).chargedUpperUsd }));
}
async function main() { assertStores(); const action = process.argv[2]; if (action === 'contracts') await contracts(); else if (action === 'repair') await repairContracts(); else if (action === 'strong') await strengthen(); else if (action === 'refresh') await refresh(); else if (action === 'prepare') await prepare(); else if (action === 'review') await review(); else if (action === 'entailment') await entailment(); else if (action === 'luna-entailment') await entailment({ luna: true }); else throw Error('contracts/repair/strong/prepare/refresh/review/entailment/luna-entailment'); }
main().catch(error => { console.error(error.message); process.exitCode = 1; });
