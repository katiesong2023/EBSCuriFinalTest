const { fingerprint, getEligibleStandards } = require("./data-quality");
const { findCandidates } = require("./candidate-retrieval");
const { assessSourceText } = require("./source-text-quality");
const { ruleVersion, ruleScope, assessRelation, sourceSentences } = require("./automatic-relation-rules");
const { isOfficialCode } = require("../public/grade-context");

const hasText = (value) => typeof value === "string" && value.trim().length > 0;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function officialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "ebs.co.kr" || url.hostname.endsWith(".ebs.co.kr"));
  } catch { return false; }
}

function sourceSnapshot(resource) {
  const source = { sourceSystem: resource.sourceSystem, sourceContentId: resource.sourceContentId,
    variant: resource.variant, sourceVersion: resource.sourceVersion, sourceUrl: resource.sourceUrl,
    textSourceUrl: resource.textSourceUrl, kind: resource.kind, active: resource.active, sourceMismatch: resource.sourceMismatch === true,
    fields: { title: resource.title, synopsis: resource.synopsis } };
  return { ...source, contentHash: fingerprint(source) };
}

function standardSnapshot(standard) {
  const snapshot = { curriculumCuriId: standard.curiId, sourceSystem: standard.sourceIdentity?.sourceSystem,
    sourceStandardId: standard.sourceIdentity?.sourceStandardId, standardId: standard.metadata.achievementStandardId,
    requirement: standard.metadata.achievementStandard, subject: standard.metadata.subject,
    gradeBand: standard.metadata.gradeBand, curriculumVersion: standard.curriculumVersion,
    document: standard.source?.sourceDocument, page: standard.source?.sourcePdfPage,
    sourceFingerprint: standard.source?.contentFingerprint };
  // 기존 승인·자동 자산의 지문을 보존하고, 새 과정의 편성 변경만 추가로 추적한다.
  if (standard.metadata.courseId) Object.assign(snapshot, { schoolLevel: standard.metadata.schoolLevel,
    courseId: standard.metadata.courseId, placement: standard.placement || null, documentSha256: standard.source?.documentSha256 });
  return { ...snapshot, evidenceHash: fingerprint(snapshot) };
}

function officialEvidenceAvailable(standard) {
  if (!standard) return false;
  const snapshot = standardSnapshot(standard);
  return [snapshot.curriculumCuriId, snapshot.sourceSystem, snapshot.standardId, snapshot.requirement,
    snapshot.document, snapshot.sourceFingerprint].every(hasText) &&
    snapshot.sourceSystem === "MOE_2022_CURRICULUM" && snapshot.sourceStandardId === snapshot.standardId && isOfficialCode(snapshot.standardId) &&
    snapshot.curriculumVersion === "2022 개정" && Number.isFinite(Number(snapshot.page)) && Number(snapshot.page) > 0;
}

function retrievalFor(resource, standards, subject, gradeBand, standardId) {
  return findCandidates({ contentCuriId: "AUTO-INPUT", subject, gradeBand }, {
    contents: [{ curiId: "AUTO-INPUT", metadata: { title: resource.title, synopsis: resource.synopsis,
      subjectSeed: subject, gradeBandSeed: gradeBand, contentLevel: resource.kind } }], curriculumStandards: standardId ? standards.filter(s => s.metadata.achievementStandardId === standardId) : standards
  });
}

function quoteReference(sentence, source) {
  return { ...sentence, sourceSystem: source.sourceSystem, sourceContentId: source.sourceContentId,
    variant: source.variant, contentHash: source.contentHash, sourceUrl: source.textSourceUrl,
    offsetUnit: "UTF16_CODE_UNIT" };
}

function createRelation(resource, standard, candidate) {
  const source = sourceSnapshot(resource), assessment = assessRelation(resource, standard);
  const { evidence, ...semantic } = assessment;
  // 미지원·보류 후보도 어떤 원문 표현으로 검색됐는지 보존한다. 이 인용은 의미 충족 근거가 아니다.
  const fallback = sourceSentences(resource.synopsis).find((sentence) =>
    candidate.matchedTerms.some((term) => sentence.quote.includes(term))) || sourceSentences(resource.synopsis)[0];
  const quotes = (evidence.length ? evidence : fallback ? [fallback] : []).map((sentence) => quoteReference(sentence, source));
  return { ruleVersion, generationMethod: "LOCAL_RULES", source, standard: standardSnapshot(standard),
    matchedTerms: candidate.matchedTerms, quotes, semantic };
}

// 입력의 통과/승인 플래그를 신뢰하지 않고 현재 원문·공식 목록에서 각 조건을 다시 계산한다.
function checkRelation(proposal, { resource, standards, subject, gradeBand, standardId, checkedAt = new Date().toISOString() }) {
  proposal = proposal && typeof proposal === "object" ? proposal : {};
  const source = sourceSnapshot(resource), checks = [];
  const check = (code, ok, message, failedStatus = "FAIL") => checks.push({ code, status: ok ? "PASS" : failedStatus, message });
  const quality = assessSourceText(resource.title, resource.synopsis);
  const eligible = getEligibleStandards(standards, subject);
  const standard = eligible.find((entry) => entry.curiId === proposal.standard?.curriculumCuriId);
  const retrieval = retrievalFor(resource, standards, subject, gradeBand, standardId);
  const candidate = retrieval.candidates.find((entry) => entry.curriculumCuriId === standard?.curiId);
  const expected = standard && candidate ? createRelation(resource, standard, candidate) : null;
  check("OFFICIAL_CANDIDATE_ALLOWED", Boolean(candidate && officialEvidenceAvailable(standard)), "현재 지원 범위의 공식 원문·코드·출처가 있는 후보인지 확인");
  check("OFFICIAL_VERSION_MATCH", Boolean(standard && same(proposal.standard, standardSnapshot(standard))), "현재 공식 성취기준 원문·출처·버전과 대조");
  check("SOURCE_IDENTITY_MATCH", Boolean(proposal.source && ["sourceSystem", "sourceContentId", "variant"]
    .every((key) => hasText(source[key]) && proposal.source[key] === source[key])), "자료·판본 식별자를 대조");
  check("SOURCE_VERSION_MATCH", same(proposal.source, source), "현재 원문 필드·지문·출처·활성 상태를 대조");
  check("SOURCE_LOCATION_AVAILABLE", !source.sourceMismatch && officialUrl(source.sourceUrl) && officialUrl(source.textSourceUrl) && hasText(source.sourceVersion), "공식 EBS 출처와 텍스트 출처·버전 존재 및 알려진 출처 불일치 확인; 도착 페이지·재생 검사는 별도");
  check("SOURCE_ACTIVE", resource.active === true && ["episode", "lecture", "clip"].includes(resource.kind), "활성 회차·강의·클립 단위인지 확인");
  check("RULE_VERSION_MATCH", proposal.ruleVersion === ruleVersion && proposal.generationMethod === "LOCAL_RULES", "현재 로컬 검사 규칙·생성 방식과 대조");
  check("SOURCE_TEXT_SUFFICIENT", quality.detailedMappingAllowed, quality.message, "HELD");
  const quotes = Array.isArray(proposal.quotes) ? proposal.quotes : [];
  check("QUOTE_REQUIRED", quotes.length > 0 && quotes.length <= 10, "검사 가능한 인용문이 필요함");
  check("QUOTE_IDENTITY_MATCH", quotes.length > 0 && quotes.every((quote) => quote &&
    ["sourceSystem", "sourceContentId", "variant", "contentHash"].every((key) => quote[key] === source[key]) &&
    quote.sourceUrl === source.textSourceUrl), "인용이 같은 자료·판본·원문 버전·출처에 속하는지 확인");
  const positionsValid = quotes.length > 0 && quotes.every((quote) => quote &&
    quote.field === "synopsis" && quote.offsetUnit === "UTF16_CODE_UNIT" &&
    Number.isInteger(quote.start) && Number.isInteger(quote.end) && quote.start >= 0 &&
    quote.end > quote.start && quote.end <= resource.synopsis.length);
  check("QUOTE_POSITION_VALID", positionsValid, "원문 필드와 UTF-16 시작/끝 위치 확인");
  check("QUOTE_EXISTS", positionsValid && quotes.every((quote) => hasText(quote.quote) &&
    resource.synopsis.slice(quote.start, quote.end) === quote.quote), "인용문이 지정한 원문 위치에 정확히 존재하는지 확인");
  check("RELATION_EVIDENCE_MATCH", Boolean(expected && same(proposal.quotes, expected.quotes) &&
    same(proposal.semantic, expected.semantic) && same(proposal.matchedTerms, expected.matchedTerms)),
  "연결 부분·미확인 요구·인용을 현재 규칙 결과와 대조; 의미 정확도 검증은 아님");
  const status = checks.some((item) => item.status === "FAIL") ? "FAIL" :
    checks.some((item) => item.status === "HELD") ? "HELD" : "PASS";
  const semantic = expected?.semantic ?? { status: "NOT_EVALUATED", standardCoverage: "NONE",
    connectedParts: [], unconfirmedParts: ["공식 후보·현재 원문 조건부터 다시 확인해야 합니다."] };
  const publicationEligible = status === "PASS" && ["SUPPORTED", "PARTIAL"].includes(semantic.status);
  return { checkedAt, ruleVersion, status, checks, semantic, publicationEligible,
    verificationLevel: status === "PASS" ? "AUTOMATIC_EVIDENCE_CHECKED" : "CURRICULUM_CANDIDATE",
    label: status === "PASS" ? "자동 근거 검사 통과" : "교육과정 연계 후보",
    currentValidity: checks.some((item) => ["SOURCE_VERSION_MATCH", "OFFICIAL_VERSION_MATCH", "RULE_VERSION_MATCH"].includes(item.code) && item.status !== "PASS") ? "STALE" : "CURRENT",
    humanReview: { status: "NOT_EVALUATED", note: "이 자동 검사는 기존 사람 결정의 존재·유효성을 판정하거나 새 결정을 만들지 않습니다." },
    searchPreparation: "NOT_REQUESTED",
    unverified: ["교육과정 의미 정확도", "출처 도착 페이지", "영상 재생·자막·장면", "학년 적합성", "학생의 학습 수행"] };
}

function createAutomaticEvidence(resource, standards, { subject, gradeBand, standardId, checkedAt = new Date().toISOString() }) {
  const retrieval = retrievalFor(resource, standards, subject, gradeBand, standardId);
  const quality = assessSourceText(resource.title, resource.synopsis);
  const relations = retrieval.candidates.map((candidate) => {
    const standard = standards.find((entry) => entry.curiId === candidate.curriculumCuriId);
    const proposal = createRelation(resource, standard, candidate);
    return { ...proposal, inspection: checkRelation(proposal, { resource, standards, subject, gradeBand, standardId, checkedAt }) };
  });
  const publishable = relations.filter((relation) => relation.inspection.publicationEligible).length;
  return { status: relations.length ? "CHECKED" : "HELD", checkedAt, generationMethod: "LOCAL_RULES",
    source: sourceSnapshot(resource), scope: { requestedSubject: subject, requestedGradeBand: gradeBand, requestedStandardId: standardId || null, ...ruleScope() }, sourceQuality: quality,
    retrieval, relations, summary: { candidates: relations.length, structurallyPassed: relations.filter((r) => r.inspection.status === "PASS").length,
      publishable, unsupported: relations.filter((r) => r.inspection.semantic.status === "UNSUPPORTED").length },
    hold: retrieval.hold ?? (publishable ? null : { code: "NO_PUBLISHABLE_RELATION", message: "현재 공개 조건을 충족한 관계가 없습니다. 개별 검사·의미 판정 이유를 확인하세요." }),
    topicDiscovery: { availableText: quality.topicTextAvailable, label: "주제 관련 자료", note: "소재 표현은 주제 탐색에 사용할 수 있으나 이 실행은 검색 제공 상태를 변경하지 않습니다." },
    persisted: false, paidApiCalls: 0,
    note: "자동 구조 검사와 제한된 관계 설명 검사입니다. 사람 승인·전체 성취기준 충족·의미 정확도 측정이 아닙니다." };
}

module.exports = { createAutomaticEvidence, checkRelation, sourceSnapshot, standardSnapshot };
