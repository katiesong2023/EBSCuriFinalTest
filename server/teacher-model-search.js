const fs = require('node:fs'), path = require('node:path');
const { createModelBudget } = require('./request-model-budget');
const { createRequestModelClient } = require('./request-model-client');
const { createResponseCache } = require('./model-response-cache');
const { prepareQueryContract, applyQueryContract } = require('./query-condition-contract');
const { prepareConditionReview, applyConditionReview } = require('./condition-source-review');
const { packetFor } = require('./condition-source-packets');
const { createSemanticReviewCandidates } = require('./semantic-review-candidates');
const { needsReferenceContext } = require('./request-ranking-context');
const { recheckPartialCandidates } = require('./condition-candidate-recheck');
const { createTeacherSearchResultCache } = require('./teacher-search-result-cache');
const { indexRevision } = require('./broadcast-semantic-index');
const policyPath = path.resolve(__dirname, 'data/teacher-search-model-policy.json');
const cache = createResponseCache(path.resolve(__dirname, 'data/.teacher-model-cache'));
const engines = new WeakMap(); let serial = Promise.resolve();
const resultCache = createTeacherSearchResultCache();
function readPolicy() { try { return JSON.parse(fs.readFileSync(policyPath, 'utf8')); } catch { return { enabled: false }; } }
async function searchTeacherWithModel(query, catalog, { localResults = [], forceEnabled = false, respond: suppliedRespond } = {}) {
  const policy = readPolicy();
  if (!policy.enabled && !forceEnabled && !suppliedRespond) return { active: false, results: [], status: 'DISABLED', paidCalls: 0, cacheHits: 0 };
  const execute = () => executeTeacherModelSearch(query, catalog, { localResults, suppliedRespond, policy });
  // 외부에서 전달한 응답은 평가별로 다를 수 있으므로 운영 결과 캐시와 섞지 않는다.
  if (suppliedRespond) return execute();
  const key = JSON.stringify([query, localResults.map(item => item.id), policy, indexRevision()]);
  return resultCache.run(catalog, key, execute);
}
async function executeTeacherModelSearch(query, catalog, { localResults, suppliedRespond, policy }) {
  let paidCalls = 0, cacheHits = 0;
  const respond = suppliedRespond || (async (prepared, model) => {
    const payload = { ...prepared.payload, model, max_output_tokens: 4096 };
    const cached = cache.get(payload); if (cached) { cacheHits++; return cached; }
    const execute = async () => {
      const again = cache.get(payload); if (again) { cacheHits++; return again; }
      const ledgerPath = path.resolve(__dirname, '..', policy.ledgerPath || '');
      if (ledgerPath !== path.resolve(__dirname, '../docs/r12-40-llm-dollar-ledger.json') || policy.approvedBudgetUsd !== 2) throw Error('SEARCH_BUDGET_POLICY_INVALID');
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      if (ledger.scope !== policy.scope || ledger.approvedBudgetUsd !== 2 || ledger.halted) throw Error('SEARCH_BUDGET_UNAVAILABLE');
      const budget = createModelBudget({ path: ledgerPath, scope: policy.scope, approvedBudgetUsd: 2 });
      let client;
      try {
        client = createRequestModelClient({ allowExternal: true, model, maxCalls: 1, maxOutputTokens: 4096, timeoutMs: 30000, approvedBudgetUsd: 2, budget,
          budgetAuthorization: { kind: 'APPROVED_TEACHER_SEARCH', scope: policy.scope, budgetUsd: 2 } });
        const response = await client.respond(prepared); cache.put(payload, response); return response;
      } finally { paidCalls += client?.attemptedCalls || 0; budget.close(); }
    };
    const pending = serial.then(execute, execute); serial = pending.catch(() => {}); return pending;
  });
  try {
    if (needsReferenceContext(query)) return { active: true, results: [], status: 'MISSING_REFERENCE_CONTEXT', paidCalls, cacheHits };
    let prepared = prepareQueryContract(query), contract = applyQueryContract(prepared, await respond(prepared, 'gpt-6-luna'));
    if (!contract.accepted || contract.unresolved) {
      prepared = prepareQueryContract(query, { repair: true }); contract = applyQueryContract(prepared, await respond(prepared, 'gpt-6-luna'));
    }
    if (!contract.accepted || contract.unresolved) {
      prepared = prepareQueryContract(query, { strong: true }); delete prepared.payload.reasoning;
      contract = applyQueryContract(prepared, await respond(prepared, 'gpt-4.1-2025-04-14'));
    }
    if (!contract.accepted || contract.unresolved) return { active: true, results: [], contract, status: contract.reason || 'QUERY_UNRESOLVED', paidCalls, cacheHits };
    if (!engines.has(catalog)) engines.set(catalog, createSemanticReviewCandidates(catalog));
    const batch = await engines.get(catalog).retrieve(query, { localResults, rewriteHints: [contract.searchQuery], semanticQuery: contract.searchQuery });
    const candidates = batch.candidates.slice(0, 12).map(c => packetFor(c.item, contract));
    if (!candidates.length) return { active: true, results: [], contract, status: 'NO_CANDIDATE', paidCalls, cacheHits };
    prepared = prepareConditionReview(contract, candidates);
    let review = applyConditionReview(contract, candidates, await respond(prepared, 'gpt-6-luna'));
    review = await recheckPartialCandidates(contract, candidates, review, respond);
    return { active: true, results: review.results, contract, review, candidateIds: candidates.map(c => c.item.id), status: review.reason, paidCalls, cacheHits };
  } catch (error) {
    return { active: true, results: [], status: 'SEARCH_UNAVAILABLE', reason: error.message, paidCalls, cacheHits };
  }
}
module.exports = { searchTeacherWithModel, readPolicy };
