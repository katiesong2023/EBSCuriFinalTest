// 외부 실행은 기본 차단이다. 준비 경로에서는 이 클라이언트를 호출하지 않는다.
function createRequestModelClient({ allowExternal = false, model, maxCalls = 0, maxOutputTokens = 4096, timeoutMs = 12000, approvedBudgetUsd = 0, budget, budgetAuthorization } = {}) {
  let calls = 0;
  return {
    async respond(prepared) {
      const authorizedSearch = budgetAuthorization?.kind === 'APPROVED_TEACHER_SEARCH' && budgetAuthorization.scope === budget?.snapshot.scope && budgetAuthorization.budgetUsd === approvedBudgetUsd;
      if (!allowExternal || process.env.CURI_ALLOW_PAID_API !== 'true' && !authorizedSearch) throw new Error('MODEL_CALL_DISABLED');
      if (!Number.isInteger(maxCalls) || maxCalls <= calls || !Number.isFinite(approvedBudgetUsd) || approvedBudgetUsd <= 0 || !model) throw new Error('MODEL_EXECUTION_SCOPE_REQUIRED');
      if (!budget || budget.snapshot.approvedBudgetUsd !== approvedBudgetUsd || !(budget.allowsModel ? budget.allowsModel(model) : budget.snapshot.model === model)) throw new Error('MODEL_COST_GUARD_REQUIRED');
      if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 4096 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || !prepared?.payload) throw new Error('MODEL_EXECUTION_LIMIT_INVALID');
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('MODEL_CREDENTIAL_REQUIRED');
      const payload = { ...prepared.payload, model, max_output_tokens: maxOutputTokens };
      const reservationId = budget.reserve(payload);
      calls++;
      let response, data;
      try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload)
      });
      data = await response.json();
      } catch {
        budget.settle(null, 'TRANSPORT_OR_RESPONSE_UNKNOWN', reservationId);
        throw new Error('MODEL_PROVIDER_UNCERTAIN_STOP');
      }
      budget.settle(data.usage, response.ok ? data.status : 'HTTP_' + response.status, reservationId);
      if (!response.ok) throw new Error('MODEL_PROVIDER_ERROR');
      return data;
    },
    get attemptedCalls() { return calls; }
  };
}
module.exports = { createRequestModelClient };
