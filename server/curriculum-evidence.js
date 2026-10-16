const { fingerprint } = require('./data-quality');
const { requirementEvidence } = require('./automatic-relation-rules');
const { matchesStandard } = require('../public/grade-context');
const { sourceSentences } = require('./source-explanation');
const { aliasRegex } = require('./semantic-layer');

const labels = {
  UNSUPPORTED: '해당 기준의 자동 비교 미지원', TITLE_ONLY: '제목 후보만 있음', DESCRIPTION_LOW: '소개문 부족',
  CONCEPT_ONLY: '관련 개념만 확인', PARTIAL_SUPPORTED: '일부 요구를 뒷받침하는 설명 확인',
  INTERPRETATION_HELD: '표현 해석 보류', EXPLICIT_CONFLICT: '요구와 명확한 상충'
};
const requirementLabels = { SUPPORTED: '설명 확인', NOT_CONFIRMED: '대응 설명 미확인',
  UNSUPPORTED: '요구 분해·자동 비교 미지원', INTERPRETATION_HELD: labels.INTERPRETATION_HELD, EXPLICIT_CONFLICT: labels.EXPLICIT_CONFLICT };

function semanticState(semantic) {
  if (semantic.status === 'UNSUPPORTED') return 'UNSUPPORTED';
  // 과거 CONFLICT에는 대상과 무관한 부정도 포함됐다. 요구별 입증이 없으면 상충으로 표시하지 않는다.
  if (semantic.status === 'CONFLICT') return semantic.explicitConflicts?.length ? 'EXPLICIT_CONFLICT' : 'INTERPRETATION_HELD';
  if (semantic.interpretationHeld || /의문|추측|인용·조건/.test(semantic.reason || '')) return 'INTERPRETATION_HELD';
  return semantic.supportedRequirements?.length ? 'PARTIAL_SUPPORTED' : 'CONCEPT_ONLY';
}

function candidateStates(item) {
  const states = [];
  if (item.semantic.status === 'UNSUPPORTED') states.push('UNSUPPORTED');
  if (['none', 'repeated'].includes(item.sourceQuality.category) && !(item.sourceSupplements || []).some(source => source.text)) states.push('TITLE_ONLY');
  if (!item.sourceQuality.detailedMappingAllowed) states.push('DESCRIPTION_LOW');
  // 최소 원문을 통과한 경우에만 관계 비교 결과의 분모에 포함한다.
  if (item.sourceQuality.detailedMappingAllowed && item.semantic.status !== 'UNSUPPORTED') states.push(semanticState(item.semantic));
  return states;
}

function matchesState(item, state) {
  // 이전 주소는 관계 판정 가능 자료의 개념 일치로만 해석한다.
  return !state || item.candidateStates.includes(state === 'RELATION_MISSING' ? 'CONCEPT_ONLY' : state);
}

function selectedLinks(item, plan) {
  const matches = link => link.standardId === plan.standardId && link.subject === plan.subject && matchesStandard(link, plan.courseId);
  return {
    approvedLinks: (item.approvedLinks || []).filter(matches), automaticLinks: (item.automaticLinks || []).filter(matches),
    otherStandardLinks: { approvedLinks: (item.approvedLinks || []).filter(link => !matches(link)), automaticLinks: (item.automaticLinks || []).filter(link => !matches(link)) }
  };
}

function comparisonFor(item, plan, standard) {
  const textSourceUrl = item.evidenceUrl || item.sourceUrl;
  const contentHash = fingerprint({ sourceSystem: item.sourceSystem, sourceContentId: item.id, variant: item.variant,
    title: item.title, summary: item.summary, sourceUrl: item.sourceUrl, textSourceUrl });
  const quoteReference = quote => ({ ...quote, field: 'summary', offsetUnit: 'UTF16_CODE_UNIT',
    sourceSystem: item.sourceSystem, sourceContentId: item.id, variant: item.variant || 'UNSPECIFIED', sourceUrl: textSourceUrl,
    contentHash, sourceVersion: item.sourceVersion || `LOCAL_SNAPSHOT:${contentHash}`,
    checkedAt: item.descriptionCheckedAt || item.checkedAt || null });
  const patterns = item.matchedTerms.map(aliasRegex);
  const matchesTerms = quote => patterns.some(pattern => { pattern.lastIndex = 0; return pattern.test(quote.quote); });
  const summaryEvidence = sourceSentences(item.summary).filter(matchesTerms).slice(0, 4).map(quoteReference);
  const supplementEvidence = (item.sourceSupplements || []).flatMap(source => sourceSentences(source.text, 'supplement').filter(matchesTerms).slice(0, 2).map(quote => ({
    ...quote, supplementId: source.id, sourceLabel: source.label, documentTitle: source.title, documentType: source.type,
    sourceSystem: 'EBS_OFFICIAL_SUPPLEMENT', sourceContentId: item.id, variant: item.variant || 'UNSPECIFIED',
    sourceUrl: source.sourceUrl, contentHash: source.contentHash, sourceVersion: `OFFICIAL_SUPPLEMENT:${source.contentHash}`,
    checkedAt: source.checkedAt, location: source.location, offsetUnit: 'UTF16_CODE_UNIT',
    originalStart: source.originalStart + quote.start, originalEnd: source.originalStart + quote.end, responseHash: source.responseHash,
    evidencePurpose: 'DISCOVERY_ONLY', scope: source.scope
  }))).slice(0, 4);
  const discoveryEvidence = [...summaryEvidence, ...supplementEvidence];
  const requirements = requirementEvidence({ synopsis: item.summary || '' }, standard, item.semantic);
  const requirementComparisons = requirements.length ? requirements.map(entry => ({
    id: entry.id, requirement: entry.text, status: entry.status, label: requirementLabels[entry.status],
    content: entry.status === 'SUPPORTED' ? entry.text : entry.status === 'EXPLICIT_CONFLICT' ? '이 요구를 명시적으로 부정하는 설명' : '이 요구에 대응하는 설명을 확정하지 못함',
    quotes: entry.evidence.map(quoteReference), reason: entry.reason,
    remaining: entry.status === 'SUPPORTED' ? '위 인용이 설명하는 범위만 확인. 학생의 수행·실제 영상은 미확인.' : entry.text
  })) : [{ id: 'official-standard', requirement: plan.standardText, status: 'UNSUPPORTED', label: requirementLabels.UNSUPPORTED,
    content: '공식 기준의 원문을 유지합니다. 자동 요구 분해는 지원하지 않습니다.', quotes: [],
    remaining: plan.standardText, reason: '미지원은 시스템의 검사 범위이며 자료의 교육적 부적합 판정이 아닙니다.' }];
  return { standardId: plan.standardId, state: item.candidateState, label: labels[item.candidateState],
    ruleSupport: { supported: plan.ruleSupported, label: plan.ruleSupported ? '일부 요구의 제한된 자동 비교 지원' : labels.UNSUPPORTED },
    sourceQuality: item.sourceQuality, semanticState: semanticState(item.semantic), candidateStates: item.candidateStates,
    requirementComparisons, discoveryEvidence, supplementEvidence, evidence: discoveryEvidence,
    guidance: plan.guidance,
    connectedParts: item.semantic.connectedParts, unconfirmedParts: item.semantic.unconfirmedParts, ruleStatus: item.semantic.status,
    note: '공개 소개문의 자동 비교입니다. 후보 발견 표현·요구를 뒷받침하는 인용·자동 저장 검사·사람 확인은 각각 구분합니다. 전체 기준 충족과 학생 수행은 미확인입니다.' +
      (supplementEvidence.length ? ' 공식 보조 원문은 아래 후보 발견 인용에만 사용하며 소개문 품질이나 자동 요구 충족으로 승격하지 않습니다.' : ''),
    activityNote: plan.standardId === '6사04-01' ? '유물의 고조선 소속·당시 생활 전반은 미확인입니다. 생활 추론은 교사가 연결할 학생 활동이며 자료만으로 수행·달성을 확인할 수 없습니다.' : '학생의 수행·태도는 교사가 수업 활동으로 연결하고 별도로 확인할 부분입니다.' };
}

module.exports = { labels, candidateStates, matchesState, selectedLinks, comparisonFor, semanticState };
