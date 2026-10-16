// 후보 묶음의 상대적 문맥 때문에 실제 내용 사례가 부분 일치로 밀리는 경우를 제한 재검사한다.
const crypto = require('node:crypto');
const { prepareConditionReview, applyConditionReview } = require('./condition-source-review');
const clarification = '이 후보 하나의 원문으로 각 필수를 독립 대조한다. 넓은 주제·범주를 찾는 질문에는 그 범주에 속하는 구체적 사례를 실제 설명하는 자료도 충족할 수 있다. 질문에 없는 모든 하위 유형·예시·설명 범위를 새 필수로 추가하지 않는다. 단순 단어 언급이나 배경 소재는 충분하지 않다. 명시된 대상·비교·관계·원인·시간·장면·제외 조건은 모두 보존한다. 앞선 다른 후보나 평가 결과는 제공하지 않는다.';
function partialRecheckIndices(contract, candidates, review) {
  if (!review.accepted) return [];
  const rows = review.assessments || [];
  return rows.filter(row => Number.isInteger(row.i) && candidates[row.i] && rows.filter(other => other.i === row.i).length === 1 &&
    Array.isArray(row.state) && row.state.length === contract.requirements.length &&
    row.state.some((state, j) => state === 'partial' && contract.requirements[j].kind === 'content') &&
    row.state.every((state, j) => state === 'yes' || state === 'partial' && contract.requirements[j].kind === 'content'))
    .map(row => row.i).sort((a, b) => a - b).slice(0, 3);
}
function prepareCandidateRecheck(contract, candidate) {
  const prepared = prepareConditionReview(contract, [candidate]);
  prepared.stage = 'INDEPENDENT_PARTIAL_CONTENT_RECHECK';
  prepared.payload.input[0].content += '\n' + clarification;
  prepared.profile = crypto.createHash('sha256').update(JSON.stringify(prepared.payload)).digest('hex');
  return prepared;
}
async function recheckPartialCandidates(contract, candidates, review, respond) {
  const results = [...review.results], rechecks = [];
  for (const i of partialRecheckIndices(contract, candidates, review)) {
    try {
      const prepared = prepareCandidateRecheck(contract, candidates[i]);
      const checked = applyConditionReview(contract, [candidates[i]], await respond(prepared, 'gpt-6-luna'));
      rechecks.push({ i, accepted: checked.accepted, reason: checked.reason });
      if (checked.results.length && !results.some(item => item.id === candidates[i].item.id)) results.push({ ...checked.results[0],
        semanticConditionReview: { ...checked.results[0].semanticConditionReview, independentRecheckProfile: prepared.profile } });
    } catch {
      // 추가 검사를 완료하지 못해도 이미 원문 검증을 통과한 결과는 유지한다.
      rechecks.push({ i, accepted: false, reason: 'RECHECK_UNAVAILABLE' }); break;
    }
  }
  return { ...review, results, rechecks, reason: results.length ? 'ALL_CONDITIONS_SUPPORTED' : review.reason };
}
module.exports = { partialRecheckIndices, prepareCandidateRecheck, recheckPartialCandidates };
