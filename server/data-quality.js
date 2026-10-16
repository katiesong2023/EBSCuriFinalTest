const crypto = require("node:crypto");
const { reconcileSearchProjection } = require("./search-index-contract");
const { standardCourse, matchesStandard, isOfficialCode, courseForGrade } = require("../public/grade-context");

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function contentVersion(content) {
  return fingerprint({ source: content.source?.contentFingerprint, metadata: content.metadata,
    active: content.lifecycle?.isActive });
}

function getEligibleStandards(standards, subject = null, grade = null) {
  const standardIds = new Set();
  return standards.filter((standard) => {
    const existingHumanCheck = standard.provenance?.classification === "HUMAN_VERIFIED" && standard.review?.status === "HUMAN_APPROVED";
    const sourceCheck = standard.provenance?.classification === "SOURCE" && standard.review?.status === "SOURCE_CHECKED" &&
      standard.review?.humanConfirmed === false && standard.sourceIdentity?.sourceSystem === "MOE_2022_CURRICULUM" &&
      standard.sourceIdentity?.sourceStandardId === standard.metadata?.achievementStandardId && isOfficialCode(standard.metadata?.achievementStandardId) &&
      standard.curriculumVersion === "2022 개정" && Boolean(standard.source?.sourceDocument) && Number(standard.source?.sourcePdfPage) > 0 &&
      /^[a-f0-9]{64}$/.test(standard.source?.documentSha256 || "") && /^[a-f0-9]{64}$/.test(standard.source?.contentFingerprint || "");
    const course = standardCourse(standard);
    const placementAvailable = course !== "middle1" || standard.placement?.status === "REFERENCE_MAPPED" && Boolean(standard.placement?.version) && standard.placement?.schoolPlacementConfirmed === false;
    const eligible = standard.lifecycle?.isActive === true && (existingHumanCheck || sourceCheck) &&
      ["사회", "과학"].includes(standard.metadata?.subject) &&
      (!subject || standard.metadata?.subject === subject) &&
      Boolean(course) && placementAvailable && matchesStandard(standard, grade);
    if (!eligible || standardIds.has(standard.curiId)) return false;
    standardIds.add(standard.curiId);
    return true;
  });
}

function isEbsUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password &&
      (url.hostname === "ebs.co.kr" || url.hostname.endsWith(".ebs.co.kr"));
  } catch { return false; }
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isReviewableModelHeld(run) {
  return run?.status === "HELD" && run.result?.status === "HELD" &&
    run.result.hold?.code === "MODEL_HELD" && Array.isArray(run.result.candidateOptions) &&
    run.result.candidateOptions.length > 0;
}

// 최종 확인 시각처럼 교육 내용과 무관한 값은 기준 버전 비교에서 제외한다.
function standardEvidence(standard) {
  return { curiId: standard.curiId, sourceIdentity: standard.sourceIdentity,
    curriculumVersion: standard.curriculumVersion, metadata: standard.metadata,
    sourceDocument: standard.source?.sourceDocument, sourcePdfPage: standard.source?.sourcePdfPage,
    contentFingerprint: standard.source?.contentFingerprint,
    ...(standard.metadata?.courseId ? { placement: standard.placement || null,
      officialCheck: { classification: standard.provenance?.classification, status: standard.review?.status,
        humanConfirmed: standard.review?.humanConfirmed === true, documentSha256: standard.source?.documentSha256 } } : {}) };
}

// 원본의 학년 표기는 유지하고 초안에서 선택한 연계 과정만 별도로 대조한다.
function mappingGradeContext(run, content) {
  const inputGrade = run?.input?.curriculumGradeBand, resultGrade = run?.result?.content?.curriculumGradeBand;
  const explicit = inputGrade !== undefined || resultGrade !== undefined;
  const gradeBand = resultGrade ?? inputGrade ?? run?.result?.content?.gradeBand ?? content?.metadata?.gradeBandSeed;
  const legacyBroad = ["초등고~고등", "중등~고등"].includes(String(gradeBand || "").replace(/\s/g, ""));
  return { gradeBand, courseId: courseForGrade(gradeBand) || (legacyBroad ? "elementary56" : null), explicit,
    consistent: !explicit || typeof inputGrade === "string" && inputGrade === resultGrade };
}

function evaluateVerification(store, contentCuriId, curriculumCuriId) {
  const reasons = [];
  const content = store.contents.find((item) => item.curiId === contentCuriId);
  const run = store.mappingRuns.findLast((item) => item.contentCuriId === contentCuriId);
  const review = run?.reviewHistory?.at(-1);
  const fail = (message) => reasons.push(message);
  if (!content || content.lifecycle?.isActive !== true) fail("활성 콘텐츠가 필요합니다.");
  const reviewableModelHeld = isReviewableModelHeld(run);
  if (!run || (!reviewableModelHeld && (run.status !== "SUCCEEDED" || run.result?.status !== "DRAFT")) ||
      run.result?.content?.curiId !== contentCuriId || run.input?.contentCuriId !== contentCuriId) {
    fail("현재 콘텐츠의 최신 성공 초안이 필요합니다.");
  }
  if (!content || !run || reasons.length) return { eligible: false, reasons, content, run, review };

  const text = run.result.publicText;
  if (!hasText(content.sourceIdentity?.sourceSystem) || !hasText(content.sourceIdentity?.sourceContentId) ||
      !hasText(content.source?.contentFingerprint) || !isEbsUrl(content.source?.sourceUrl) || !isEbsUrl(text?.sourceUrl)) {
    fail("EBS 출처 URL과 원본 콘텐츠 ID·지문이 필요합니다.");
  }
  if (!hasText(text?.text) || text.text.trim().length < 20 || text.text.length > 1200 ||
      text.sha256 !== crypto.createHash("sha256").update(text?.text ?? "").digest("hex") ||
      fingerprint(text) !== fingerprint(run.input.publicText)) {
    fail("초안 입력과 일치하는 20~1200자의 공개 원문이 필요합니다.");
  }
  const curriculumSubject = run.result.content.curriculumSubject ?? run.result.content.subject;
  const gradeContext = mappingGradeContext(run, content);
  if (!gradeContext.courseId || !gradeContext.consistent || gradeContext.explicit && review?.curriculumGradeBand !== gradeContext.gradeBand) {
    fail("초안 입력·결과·사람 검토의 연계 과정이 일치해야 합니다.");
  }
  if (!["clip", "episode", "lecture"].includes(content.metadata?.contentLevel) ||
      !hasText(content.metadata?.title) || content.metadata.title !== run.result.content.title ||
      content.metadata.subjectSeed !== run.result.content.subject ||
      !["사회", "과학"].includes(curriculumSubject) ||
      content.metadata.gradeBandSeed !== run.result.content.gradeBand) {
    fail("제목·교과·학년이 초안과 일치하는 클립·회차·강의 단위 콘텐츠가 필요합니다.");
  }
  const expectedStatus = { approve: "HUMAN_APPROVED", edit: "HUMAN_EDITED" }[review?.decision];
  if (reviewableModelHeld && review?.decision !== "edit") {
    fail("AI 보류 결과는 사람이 공식 후보를 선택해 수정한 기록만 저장할 수 있습니다.");
  }
  if (!expectedStatus || review.status !== expectedStatus || review.confirmed !== true ||
      !hasText(review.reviewId) || review.contentCuriId !== contentCuriId ||
      review.mappingRunId !== run.mappingRunId || review.contentVersion !== contentVersion(content) ||
      (review.curriculumSubject ?? run.result.content.subject) !== curriculumSubject ||
      review.reviewerRole !== "LOCAL_HUMAN_REVIEWER" || !Number.isFinite(Date.parse(review.reviewedAt)) ||
      (review.decision === "edit" && !hasText(review.note))) {
    fail("현재 콘텐츠 버전에 대한 최신 사람 승인·수정 기록이 필요합니다.");
  }
  const result = review?.result;
  if (!hasText(result?.rationale) || !hasText(result?.teachingUse) ||
      !Array.isArray(result?.coreConcepts) || !result.coreConcepts.length || !result.coreConcepts.every(hasText)) {
    fail("검수 결과의 핵심개념·연계근거·수업 활용이 필요합니다.");
  }
  const ids = curriculumCuriId ? result?.curriculumCuriIds?.filter((id) => id === curriculumCuriId) : result?.curriculumCuriIds;
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !hasText(id)) || new Set(ids).size !== ids.length) {
    fail("중복 없는 공식 성취기준 관계가 필요합니다.");
    return { eligible: false, reasons, content, run, review };
  }
  if (review?.decision === "approve" && (ids.some((id) => !run.result.selectedCandidates?.some((candidate) => candidate.curriculumCuriId === id)) ||
      gradeContext.explicit && run.result.selectedCandidates?.some((candidate) => !run.input.officialCandidateIds?.includes(candidate.achievementStandardId)))) {
    fail("그대로 승인한 관계는 해당 초안의 공식 후보와 일치해야 합니다.");
  }
  const official = getEligibleStandards(store.curriculumStandards, curriculumSubject, gradeContext.courseId || "UNSUPPORTED");
  const standards = ids.map((id) => official.find((standard) => standard.curiId === id));
  if (standards.some((standard) => !standard || !hasText(standard.curriculumVersion) ||
      !hasText(standard.metadata?.achievementStandardId) || !hasText(standard.metadata?.achievementStandard) ||
      !hasText(standard.source?.sourceDocument) || !(Number(standard.source?.sourcePdfPage) > 0) ||
      standard.sourceIdentity?.sourceStandardId !== standard.metadata.achievementStandardId ||
      !result.officialStandards?.some((snapshot) => fingerprint(standardEvidence(snapshot)) === fingerprint(standardEvidence(standard))))) {
    fail("사람이 검토한 원문·버전과 일치하는 유효 공식 성취기준이 필요합니다.");
  }
  const maps = ids.map((id) => {
    const matches = store.contentCurriculumMaps.filter((map) => map.contentCuriId === contentCuriId &&
      map.mappingRunId === run.mappingRunId && map.curriculumCuriId === id);
    return matches.length === 1 ? matches[0] : null;
  });
  if (maps.some((map, index) => !map || !hasText(map.curiMapId) || map.reviewId !== review?.reviewId || map.reviewStatus !== expectedStatus ||
      map.curriculumVersion !== standards[index]?.curriculumVersion || map.reviewedAt !== review?.reviewedAt ||
      map.reviewerRole !== review?.reviewerRole)) {
    fail("모든 연계 관계가 해당 콘텐츠의 최신 검수 기록과 일치해야 합니다.");
  }
  return { eligible: reasons.length === 0, reasons, content, run, review, standards, maps };
}

function verifiedPayload(context, index) {
  const { content, run, review, standards, maps } = context;
  return {
    contentCuriId: content.curiId, curriculumCuriId: standards[index].curiId,
    curiMapId: maps[index].curiMapId, mappingRunId: run.mappingRunId, reviewId: review.reviewId,
    curriculumVersion: standards[index].curriculumVersion, contentVersion: contentVersion(content),
    provenanceClassification: "HUMAN_VERIFIED", reviewStatus: review.status,
    content: { curiId: content.curiId, sourceIdentity: content.sourceIdentity, sourceVersion: content.sourceVersion,
      sourceUrl: content.source.sourceUrl, contentFingerprint: content.source.contentFingerprint,
      metadata: content.metadata, provenance: content.provenance },
    publicText: run.result.publicText, standard: standardEvidence(standards[index]), review
  };
}

// 모든 저장 경로와 읽기 경계에서 같은 Gate를 적용한다. 무효 자산은 이력으로 옮긴다.
function reconcileVerifiedAssets(store) {
  store.verifiedAssetHistory ??= [];
  const relationContract = require("./human-review-contract");
  const currentSources = relationContract.currentSources(store);
  for (const asset of [...store.verifiedAssets]) {
    const context = asset.reviewKind === "RELATION_REVIEW" ? null : evaluateVerification(store, asset.contentCuriId, asset.curriculumCuriId);
    let valid = false;
    if (asset.reviewKind === "RELATION_REVIEW") valid = relationContract.validHumanAsset(asset, store, currentSources);
    else if (context.eligible && !relationContract.overriddenLegacyAsset(asset, store)) {
      const index = context.maps.findIndex((map) => map.curiMapId === asset.curiMapId);
      if (index >= 0) {
        const expected = verifiedPayload(context, index);
        const actual = Object.fromEntries(Object.keys(expected).map((key) => [key, asset[key]]));
        valid = asset.evidenceFingerprint === fingerprint(expected) && fingerprint(actual) === fingerprint(expected);
      }
    }
    if (valid) continue;
    const invalidatedAt = store.updatedAt ?? new Date().toISOString();
    store.verifiedAssetHistory.push({ ...asset, assetClassification: "INVALIDATED", invalidatedAt,
      invalidationReason: context?.reasons.join(" ") || "해당 관계의 검토·출처·공식 기준 버전이 변경되었습니다." });
    store.verifiedAssets = store.verifiedAssets.filter((item) => item.verifiedAssetId !== asset.verifiedAssetId);
    store.searchProjection = store.searchProjection.filter((item) => item.verifiedAssetId !== asset.verifiedAssetId);
  }
  for (const map of store.contentCurriculumMaps) {
    const verified = store.verifiedAssets.some((asset) => asset.curiMapId === map.curiMapId);
    if (verified) map.assetClassification = "VERIFIED";
    else if (map.assetClassification === "VERIFIED") map.assetClassification = map.reviewStatus === "EXCLUDED" ? "EXCLUDED" : "DRAFT";
  }
  for (const content of store.contents) {
    const verified = store.verifiedAssets.some((asset) => asset.contentCuriId === content.curiId);
    if (!content.lifecycle) continue;
    content.lifecycle.isCuriBaseVerified = verified;
    if (!verified) content.lifecycle.isSearchEligible = false;
  }
  return reconcileSearchProjection(store);
}

module.exports = { contentVersion, getEligibleStandards, evaluateVerification, verifiedPayload,
  reconcileVerifiedAssets, fingerprint, isReviewableModelHeld, standardEvidence, mappingGradeContext };
