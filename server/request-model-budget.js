const fs = require('node:fs');
const crypto = require('node:crypto');

// 이 실험은 도구·파일·멀티모달 없는 텍스트 Responses만 허용한다.
// 공식 단가 확인: 2026-10-16, developers.openai.com/api/docs/models/gpt-4.1-mini
const model = 'gpt-4.1-mini-2025-04-14';
const inputUsdPerMillion = 0.40, outputUsdPerMillion = 1.60;
// Luna 공식 표준 단가(2026-10-16)는 입력0.10/출력0.50이며 캐시 쓰기0.125까지 과대 예약한다.
const modelRates = { [model]: { input: inputUsdPerMillion, output: outputUsdPerMillion }, 'gpt-6-luna': { input: 0.125, output: 0.50 }, 'gpt-4.1-2025-04-14': { input: 2, output: 8 } };
function createModelBudget({ path, approvedBudgetUsd, scope, amendment, additionalModels = [] }) {
  if (!path || !scope || !(approvedBudgetUsd > 0 && approvedBudgetUsd <= 2)) throw Error('MODEL_BUDGET_SCOPE_INVALID');
  const lock = fs.openSync(path + '.lock', 'wx', 0o600);
  let state;
  try {
    state = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {
      scope, model, approvedBudgetUsd, chargedUpperUsd: 0, pending: [], halted: false, calls: []
    };
    if (state.scope !== scope || state.model !== model) throw Error('MODEL_BUDGET_SCOPE_CHANGED');
    if (!Array.isArray(state.pending)) state.pending = state.pending ? [state.pending] : [];
    state.allowedModels ||= [model];
    if (state.approvedBudgetUsd !== approvedBudgetUsd) {
      if (state.pending.length || state.approvedBudgetUsd !== 1 || approvedBudgetUsd !== 2 || amendment?.previousBudgetUsd !== 1 || amendment.reason !== 'USER_ADDITIONAL_USD1_2026_10_16') throw Error('MODEL_BUDGET_SCOPE_CHANGED');
      state.approvals ||= [];
      state.approvals.push({ previousBudgetUsd: 1, approvedBudgetUsd: 2, reason: amendment.reason, at: new Date().toISOString(), additionalModels: ['gpt-6-luna'] });
      state.approvedBudgetUsd = 2;
      state.allowedModels.push('gpt-6-luna');
    }
    const newModels = additionalModels.filter(m => !state.allowedModels.includes(m));
    if (newModels.length) {
      if (state.pending.length || approvedBudgetUsd !== 2 || amendment?.reason !== 'USER_ADDITIONAL_USD1_2026_10_16' || newModels.some(m => !modelRates[m])) throw Error('MODEL_SCOPE_AMENDMENT_REQUIRED');
      state.approvals ||= [];
      state.approvals.push({ approvedBudgetUsd, reason: amendment.reason, additionalModels: newModels, at: new Date().toISOString() });
      state.allowedModels.push(...newModels);
    }
  } catch (error) { fs.closeSync(lock); fs.unlinkSync(path + '.lock'); throw error; }
  const save = () => {
    fs.writeFileSync(path + '.tmp', JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(path + '.tmp', path);
  };
  save();
  return {
    reserve(payload) {
      if (state.halted) throw Error('MODEL_BUDGET_UNCERTAIN_STOP');
      const rate = modelRates[payload.model];
      if (!state.allowedModels.includes(payload.model) || !rate || payload.store !== false || Object.keys(payload).some(k => !['model', 'max_output_tokens', 'input', 'text', 'store', 'reasoning', 'service_tier'].includes(k)) ||
          !Array.isArray(payload.input) || payload.input.some(m => !['developer', 'user'].includes(m.role) || typeof m.content !== 'string') ||
          (payload.reasoning && (payload.model !== 'gpt-6-luna' || Object.keys(payload.reasoning).length !== 1 || !['none', 'low'].includes(payload.reasoning.effort))) ||
          (payload.service_tier && payload.service_tier !== 'default') ||
          !Number.isInteger(payload.max_output_tokens) || payload.max_output_tokens < 1 || payload.max_output_tokens > 4096) throw Error('MODEL_BUDGET_TEXT_ONLY');
      // UTF-8 바이트 수로 입력을 넉넉히 예약하고 메시지 구조 여유분도 더한다.
      const inputUpper = Buffer.byteLength(JSON.stringify(payload), 'utf8') + 8192;
      const upperUsd = (inputUpper * rate.input + payload.max_output_tokens * rate.output) / 1e6;
      if (state.chargedUpperUsd + state.pending.reduce((sum, r) => sum + r.upperUsd, 0) + upperUsd > approvedBudgetUsd) throw Error('MODEL_BUDGET_EXHAUSTED');
      const reservationId = crypto.randomUUID();
      state.pending.push({ reservationId, model: payload.model, rate, requestHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'), inputUpper, outputUpper: payload.max_output_tokens, upperUsd, startedAt: new Date().toISOString() });
      save();
      return reservationId;
    },
    settle(usage, status, reservationId) {
      const index = reservationId ? state.pending.findIndex(r => r.reservationId === reservationId) : state.pending.length === 1 ? 0 : -1;
      if (index < 0) throw Error('MODEL_BUDGET_NO_RESERVATION');
      const pending = state.pending[index];
      const valid = Number.isInteger(usage?.input_tokens) && usage.input_tokens >= 0 && Number.isInteger(usage?.output_tokens) && usage.output_tokens >= 0;
      const rate = pending.rate || modelRates[model];
      const usd = valid ? (usage.input_tokens * rate.input + usage.output_tokens * rate.output) / 1e6 : pending.upperUsd;
      // 캐시 할인을 빼고 과대 집계한다. 사용량 불명·예약 가정 위반이면 멈춘다.
      state.chargedUpperUsd += usd;
      state.halted = state.halted || !valid || usage.input_tokens > pending.inputUpper || usage.output_tokens > pending.outputUpper || state.chargedUpperUsd > approvedBudgetUsd;
      state.calls.push({ ...pending, status, usage: valid ? usage : null, chargedUpperUsd: usd, finishedAt: new Date().toISOString() });
      state.pending.splice(index, 1);
      save();
    },
    resumeReservedTransportFailure() {
      const last = state.calls.at(-1);
      if (state.pending.length || !state.halted || last?.status !== 'TRANSPORT_OR_RESPONSE_UNKNOWN' || last.usage !== null ||
          last.chargedUpperUsd !== last.upperUsd || state.chargedUpperUsd >= approvedBudgetUsd) throw Error('MODEL_RECOVERY_NOT_ALLOWED');
      // 명시적 복구만 허용한다. 실패 시도 최대 비용은 차감한 채로 보존한다.
      last.reservedRecoveryAt = new Date().toISOString();
      state.halted = false;
      save();
    },
    get snapshot() { return structuredClone(state); },
    allowsModel(requested) { return state.allowedModels.includes(requested) && !!modelRates[requested]; },
    close() { fs.closeSync(lock); fs.unlinkSync(path + '.lock'); }
  };
}
module.exports = { createModelBudget, model };
