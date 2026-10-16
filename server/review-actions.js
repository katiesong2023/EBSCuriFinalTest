const crypto = require("node:crypto");
const { readDataStore, writeDataStore } = require("./data-store");
const { getEligibleStandards, contentVersion, mappingGradeContext } = require("./data-quality");

const statuses = { approve: "HUMAN_APPROVED", edit: "HUMAN_EDITED", exclude: "EXCLUDED" };

class ReviewInputError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function getReviewOptions(contentCuriId) {
  const store = await readDataStore();
  const content = store.contents.find((item) => item.curiId === contentCuriId);
  if (!content) throw new ReviewInputError("콘텐츠를 찾지 못했습니다.");
  const run = [...store.mappingRuns].reverse().find((item) => item.contentCuriId === contentCuriId);
  const curriculumSubject = run?.result?.content?.curriculumSubject ?? content.metadata?.subjectSeed;
  const gradeContext = mappingGradeContext(run, content);
  return { contentVersion: contentVersion(content), curriculumSubject, curriculumGradeBand: gradeContext.gradeBand,
    standards: gradeContext.consistent ? getEligibleStandards(store.curriculumStandards, curriculumSubject, gradeContext.courseId || "UNSUPPORTED") : [] };
}

async function saveReviewDecision(input) {
  if (!input || typeof input !== "object" || !Object.hasOwn(statuses, input.decision)) {
    throw new ReviewInputError("승인·수정·제외 중 판단을 선택하세요.");
  }
  if (input.confirmed !== true) throw new ReviewInputError("원문과 공식 근거를 검토했는지 확인하세요.");
  const store = await readDataStore();
  if ((store.relationReviews || []).some((review) => review.contentCuriId === input.contentCuriId)) {
    throw new ReviewInputError("관계별 사람 결정이 있는 자료입니다. 관리자 작업공간에서 해당 관계를 검토하세요.", 409);
  }
  const content = store.contents.find((item) => item.curiId === input.contentCuriId);
  const run = [...store.mappingRuns].reverse().find((item) => item.contentCuriId === input.contentCuriId);
  const isDraft = run?.result?.status === "DRAFT";
  const isModelHeldWithCandidates = run?.result?.status === "HELD" &&
    run.result.hold?.code === "MODEL_HELD" && Array.isArray(run.result.candidateOptions) &&
    run.result.candidateOptions.length > 0;
  if (!content?.lifecycle?.isActive || !run || run.mappingRunId !== input.mappingRunId ||
      (!isDraft && !isModelHeldWithCandidates) ||
      (isDraft ? run.status !== "SUCCEEDED" : run.status !== "HELD") ||
      run.result.content?.curiId !== content.curiId) {
    throw new ReviewInputError("현재 콘텐츠의 최신 검수 전 초안만 검수할 수 있습니다. 새로고침하세요.", 409);
  }
  if (!isDraft && input.decision === "approve") {
    throw new ReviewInputError("AI가 보류한 연계는 그대로 승인할 수 없습니다. 공식 후보를 선택해 사람 수정으로 저장하세요.", 409);
  }
  const history = run.reviewHistory ?? [];
  if (input.expectedReviewId !== (history.at(-1)?.reviewId ?? null) ||
      input.contentVersion !== contentVersion(content)) {
    throw new ReviewInputError("콘텐츠 또는 검수 기록이 변경되었습니다. 새로고침 후 다시 검토하세요.", 409);
  }
  const note = readText(input.note, "검수 사유", input.decision !== "approve");
  const draft = run.result;
  const curriculumSubject = draft.content.curriculumSubject ?? content.metadata?.subjectSeed;
  const gradeContext = mappingGradeContext(run, content);
  if (input.decision !== "exclude" && (!gradeContext.courseId || !gradeContext.consistent)) {
    throw new ReviewInputError("초안 입력과 연계 과정이 일치하지 않습니다. 현재 과정으로 다시 후보를 확인하세요.", 409);
  }
  const candidateSource = draft.selectedCandidates ?? draft.candidateOptions ?? [];
  const excludedResult = input.decision === "exclude" ? history.at(-1)?.result : null;
  const selectedIds = input.decision === "edit" ? input.curriculumCuriIds :
    excludedResult?.curriculumCuriIds ?? candidateSource.map((item) => item.curriculumCuriId);
  if (!Array.isArray(selectedIds) || !selectedIds.length || new Set(selectedIds).size !== selectedIds.length) {
    throw new ReviewInputError("중복 없이 공식 성취기준을 하나 이상 선택하세요.");
  }
  if (input.decision === "approve" && gradeContext.explicit && candidateSource.some((candidate) => !run.input?.officialCandidateIds?.includes(candidate.achievementStandardId))) {
    throw new ReviewInputError("초안의 선택 관계가 생성 당시 공식 후보와 다릅니다. 새로고침 후 다시 확인하세요.", 409);
  }
  const official = getEligibleStandards(store.curriculumStandards, curriculumSubject, gradeContext.courseId || "UNSUPPORTED");
  const standards = selectedIds.map((id) => official.find((item) => item.curiId === id));
  if (input.decision !== "exclude" && standards.some((item) => !item)) {
    throw new ReviewInputError("현재 사용 가능한 공식 목록 안에서 성취기준을 선택하세요.");
  }
  const reviewedAt = new Date().toISOString();
  const review = {
    reviewId: `REVIEW-${crypto.randomUUID()}`, mappingRunId: run.mappingRunId,
    contentCuriId: content.curiId, contentVersion: contentVersion(content),
    decision: input.decision, status: statuses[input.decision],
    reviewedAt, reviewerRole: "LOCAL_HUMAN_REVIEWER", confirmed: true, note,
    curriculumSubject, curriculumGradeBand: gradeContext.gradeBand,
    result: {
      curriculumCuriIds: selectedIds,
      coreConcepts: input.decision === "edit" ? readTextArray(input.coreConcepts, "수정 핵심개념", 6) : draft.coreConcepts,
      rationale: input.decision === "edit" ? readText(input.rationale, "수정 연계근거", true) : excludedResult?.rationale ?? draft.rationale,
      teachingUse: input.decision === "edit" ? readText(input.teachingUse, "수정 수업 활용", true) : excludedResult?.teachingUse ?? draft.teachingUse,
      officialStandards: standards.filter(Boolean)
    }
  };
  // AI 원본 result/draft는 수정하지 않고 사람 결정의 각 버전을 별도로 보존한다.
  run.reviewHistory = [...history, review];
  for (const standard of standards.filter(Boolean)) {
    const exists = store.contentCurriculumMaps.some((map) =>
      map.mappingRunId === run.mappingRunId && map.curriculumCuriId === standard.curiId);
    if (!exists && input.decision !== "exclude") {
      store.contentCurriculumMaps.push({
        curiMapId: `CURIMAP-${crypto.randomUUID()}`, mappingRunId: run.mappingRunId,
        contentCuriId: content.curiId, curriculumCuriId: standard.curiId,
        curriculumVersion: standard.curriculumVersion, provenanceClassification: "HUMAN_VERIFIED",
        createdAt: reviewedAt
      });
    }
  }
  for (const map of store.contentCurriculumMaps.filter((item) => item.mappingRunId === run.mappingRunId)) {
    map.reviewStatus = input.decision === "exclude" || !selectedIds.includes(map.curriculumCuriId)
      ? "EXCLUDED" : review.status;
    map.assetClassification = map.reviewStatus === "EXCLUDED" ? "EXCLUDED" : "DRAFT";
    map.reviewId = review.reviewId;
    map.reviewedAt = reviewedAt;
    map.reviewerRole = review.reviewerRole;
    map.updatedAt = reviewedAt;
  }
  store.updatedAt = reviewedAt;
  await writeDataStore(store);
  return { review, reviewHistory: run.reviewHistory };
}

function readText(value, label, required) {
  if (value != null && typeof value !== "string") throw new ReviewInputError(`${label}는 텍스트로 입력하세요.`);
  const text = (value ?? "").trim();
  if ((required && !text) || text.length > 5000) throw new ReviewInputError(`${label}를 1~5000자로 입력하세요.`);
  return text;
}

function readTextArray(value, label, maximumItems) {
  if (!Array.isArray(value) || !value.length || value.length > maximumItems ||
      value.some((item) => typeof item !== "string" || !item.trim() || item.length > 400)) {
    throw new ReviewInputError(`${label}을(를) 1~${maximumItems}개 입력하세요.`);
  }
  const values = value.map((item) => item.trim());
  if (new Set(values).size !== values.length) throw new ReviewInputError(`${label}에는 중복 항목을 넣을 수 없습니다.`);
  return values;
}

module.exports = { ReviewInputError, getReviewOptions, saveReviewDecision };
