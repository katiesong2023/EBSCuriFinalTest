const fs = require('node:fs');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { requestEnvelope } = require('./request-envelope');
const { prepareModelRequest, decodeModelResponse } = require('./request-model-preparation');
const { validateInterpretation } = require('./request-contract-validation');
const { createRequestModelClient } = require('./request-model-client');
const { createModelBudget, model } = require('./request-model-budget');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const baselinePath = 'docs/r12-40-final.json.gz';
const baselineBytes = fs.readFileSync(baselinePath);
const baseline = JSON.parse(zlib.gunzipSync(baselineBytes));
const fixedEnvelope = requestEnvelope({ q: '프로필 확인' }, {}).envelope;
const profile = prepareModelRequest('A', { ...fixedEnvelope, requestId: 'fixed-profile' });
const scope = 'R12-40-370-stage-A-' + sha(baselineBytes) + '-' + sha(JSON.stringify(profile.payload));
const ledgerPath = 'docs/r12-40-llm-dollar-ledger.json';
const responsesPath = 'docs/r12-40-llm-dollar-responses.jsonl';
const bindQuotes = process.argv.includes('--bind-quotes');
if (bindQuotes && process.argv.includes('--execute')) throw Error('QUOTE_BINDING_IS_OFFLINE_REPLAY_ONLY');
const reportPath = bindQuotes ? 'docs/r12-40-llm-dollar-bound.json.gz' : 'docs/r12-40-llm-dollar.json.gz';
const cached = fs.existsSync(responsesPath) ? fs.readFileSync(responsesPath, 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s)) : [];
const rowKey = r => r.set + '/' + r.id;
const positions = new Map(baseline.rows.map((r, i) => [rowKey(r), i]));
cached.sort((a, b) => positions.get(rowKey(a)) - positions.get(rowKey(b)));
if (baseline.rows.length !== 370 || new Set(cached.map(rowKey)).size !== cached.length || cached.some(r => r.scope !== scope || r.query !== baseline.rows[positions.get(rowKey(r))]?.query)) throw Error('MODEL_EXPERIMENT_INPUT_CHANGED');
const preparations = baseline.rows.map(row => {
  const envelope = requestEnvelope({ q: row.query, workspace: 'teacher' }, {}).envelope;
  return { row, envelope, prepared: prepareModelRequest('A', envelope) };
});
async function main() {
  for (const [p, fingerprint] of Object.entries(baseline.before)) {
    if (sha(fs.readFileSync(p)) !== fingerprint) throw Error('MODEL_SOURCE_STORES_CHANGED');
  }
  // 비교 대상 검색 코드는 고정한다. 비용 클라이언트와 별도 확장 검사 수정만 허용한다.
  const allowed = new Set(['server/request-model-client.js', 'server/extension-popup-check.js', 'server/segment-bookmarks-check.js']);
  for (const [p, fingerprint] of Object.entries(baseline.runtimeCode)) {
    if (!allowed.has(p) && sha(fs.readFileSync(p)) !== fingerprint) throw Error('MODEL_BASELINE_ENGINE_CHANGED');
  }
  if (!process.argv.includes('--execute') && !process.argv.includes('--evaluate')) {
    const report = { status: 'PREPARED_NOT_CALLED', model, budgetUsd: 1, queries: preparations.length,
      apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY), cached: cached.length,
      scope, baselinePath, stages: ['A: request interpretation'],
      note: '1달러 전체 실험 한도. 원문370만 전송. 답안·영상 원문·키는 프롬프트에 넣지 않음. 제품 유료 호출 자동 활성화 없음.' };
    fs.writeFileSync('docs/r12-40-llm-dollar-preflight.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    return;
  }
  if (process.argv.includes('--execute')) {
    if (!process.env.OPENAI_API_KEY) throw Error('MODEL_CREDENTIAL_REQUIRED');
    // 제품 설정을 바꾸지 않고 승인된 이 프로세스의 이 실험에만 허용한다.
    process.env.CURI_ALLOW_PAID_API = 'true';
    const budget = createModelBudget({ path: ledgerPath, approvedBudgetUsd: 1, scope });
    try {
      if (process.argv.includes('--resume-reserved-transport')) budget.resumeReservedTransportFailure();
      const resolvedCalls = budget.snapshot.calls.filter(c => !c.reservedRecoveryAt);
      if (resolvedCalls.length !== cached.length) throw Error('MODEL_EXPERIMENT_UNCERTAIN_STOP');
      const client = createRequestModelClient({ allowExternal: true, model, maxCalls: 370 - cached.length,
        maxOutputTokens: 1800, timeoutMs: 30000, approvedBudgetUsd: 1, budget });
      const done = new Set(cached.map(rowKey));
      const remaining = preparations.filter(p => !done.has(rowKey(p.row)));
      let next = 0, failure = null;
      const worker = async () => {
       while (next < remaining.length && !failure) {
        const { row, envelope, prepared } = remaining[next++];
        try {
        const response = await client.respond(prepared);
        let interpretation = null, validation = null, decodeError = null;
        try {
          interpretation = decodeModelResponse(response).value;
          validation = validateInterpretation(interpretation, envelope);
        } catch (error) { decodeError = error.message; }
        const record = { scope, id: row.id, set: row.set, query: row.query, envelope, interpretation, validation, decodeError,
          response, promptHash: sha(JSON.stringify(prepared.payload)) };
        fs.appendFileSync(responsesPath, JSON.stringify(record) + '\n', { mode: 0o600 });
        cached.push(record);
        console.log(JSON.stringify({ completed: cached.length, accepted: cached.filter(r => r.validation?.accepted).length, chargedUpperUsd: budget.snapshot.chargedUpperUsd }));
        if (budget.snapshot.halted) throw Error('MODEL_BUDGET_UNCERTAIN_STOP');
        } catch (error) { failure ||= error; }
       }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      if (failure) throw failure;
    } finally { budget.close(); }
  }
  if (cached.length !== 370) throw Error('MODEL_EXPERIMENT_INCOMPLETE');
  cached.sort((a, b) => positions.get(rowKey(a)) - positions.get(rowKey(b)));
  if (fs.existsSync(reportPath)) throw Error('MODEL_REPORT_ALREADY_EXISTS');
  const { loadDiscoveryCatalog } = require('./discovery-catalog');
  const { teacherCatalog } = require('./teacher-approvals');
  const { discoverTeacherContents } = require('./teacher-discovery');
  const stores = Object.keys(baseline.before);
  const hashes = () => Object.fromEntries(stores.map(p => [p, sha(fs.readFileSync(p))]));
  const before = hashes();
  if (JSON.stringify(before) !== JSON.stringify(baseline.before)) throw Error('MODEL_SOURCE_STORES_CHANGED');
  const catalog = await loadDiscoveryCatalog(), expanded = await teacherCatalog(catalog);
  const catalogFingerprint = sha(JSON.stringify(expanded.resources.map(r => ({ id: r.id, title: r.title, program: r.program, summary: r.summary, kind: r.kind, sourceSupplements: r.sourceSupplements }))));
  if (catalogFingerprint !== baseline.catalogFingerprint) throw Error('MODEL_SOURCE_CATALOG_CHANGED');
  const rows = [];
  for (const record of cached) {
    const binding = bindQuotes ? require('./request-quote-binding').bindRequestQuotes(record.interpretation, record.envelope) : null;
    const api = await discoverTeacherContents({ q: record.query, workspace: 'teacher' }, catalog, undefined,
      { interpretation: binding?.interpretation || record.interpretation || {}, diagnostics: true });
    rows.push({ id: record.id, set: record.set, query: record.query, total: api.total, understanding: api.understanding,
      terms: api.terms, diagnostics: api.diagnostics, emptyReason: api.emptyReason, requestExecution: api.requestExecution, quoteBinding: binding ? { changed: binding.changed, validation: binding.validation, bindingValidation: binding.bindingValidation } : null,
      top5: api.results.slice(0, 5).map(({ id, title, program, kind, summary, sourceUrl, sourceSupplements, searchExplanation, requestRequirements }) =>
        ({ id, title, program, kind, summary, sourceUrl, sourceSupplements, searchExplanation, requestRequirements })) });
    if (rows.length % 20 === 0) console.log('local evaluation', rows.length);
  }
  const after = hashes();
  const ledger = JSON.parse(fs.readFileSync(ledgerPath));
  const report = { scope, inputs: baseline.inputs, before, after, catalogFingerprint,
    changedStores: stores.filter(p => before[p] !== after[p]), model,
    budget: ledger, attemptedApiCalls: ledger.calls.length, receivedModelResponses: cached.length,
    completedModelResponses: cached.filter(c => c.response.status === 'completed').length,
    incompleteModelResponses: cached.filter(c => c.response.status !== 'completed').length,
    uncertainAttempts: ledger.calls.filter(c => c.usage === null).length, rows,
    scopeNote: '실제 A 해석만 적용. 후보 재판정 B 미실행. 후보 수 증가는 관련성 개선 지표가 아님. 신규 상위3개 원문 평가 필요.' };
  fs.writeFileSync(reportPath, zlib.gzipSync(JSON.stringify(report)));
  console.log(JSON.stringify({ output: reportPath, nonempty: rows.filter(r => r.total > 0).length, receivedModelResponses: cached.length, attemptedApiCalls: ledger.calls.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
