const { readDataStore } = require("./data-store");
const { getEligibleStandards } = require("./data-quality");
const { assessSourceText } = require("./source-text-quality");
const { courseForGrade, gradeLabel } = require("../public/grade-context");
const { assessRelation } = require('./automatic-relation-rules');

const supportedSubjects = new Set(["사회", "과학"]);
const adjacentSubjects = new Set(["환경/생태", "사회/경제"]);
const broadGradeBands = new Set(["초등고~고등", "중등~고등"]);
const candidateCourse = (gradeBand) => broadGradeBands.has(String(gradeBand || "").replace(/\s/g, "")) ? "elementary56" : courseForGrade(gradeBand);
const defaultLimit = 5;
const maximumLimit = 5;
const minimumMatchedTerms = 2;
const genericTerms = new Set([
  "대한", "관련", "내용", "사례", "이해", "학습", "활동", "자료", "방법", "모습",
  "우리", "초등", "학년", "교과", "수업", "콘텐츠", "소개", "설명", "탐구", "알아보기",
  "있다", "없다", "대해", "위한", "통해", "찾아서", "과정", "구조", "사회", "과학", "생활"
]);
const particleSuffixes = ["으로", "에서", "에게", "까지", "부터", "처럼", "하고", "이며", "이다", "한다", "하는", "에게", "의", "은", "는", "을", "를", "이", "가", "와", "과", "에", "로", "도", "만"];

class CandidateRetrievalInputError extends Error {
  constructor(message) {
    super(message);
    this.code = "INVALID_CANDIDATE_RETRIEVAL_INPUT";
  }
}

async function retrieveCandidates(input = {}) {
  const store = await readDataStore();
  return findCandidates(input, store);
}

function findCandidates(input, store) {
  const request = normalizeRequest(input, store.contents);
  const eligibleStandards = getEligibleStandards(store.curriculumStandards, request.subject, candidateCourse(request.gradeBand) || request.gradeBand);
  const hold = getHoldReason(request, eligibleStandards);

  if (hold) {
    return createHoldResponse(request, eligibleStandards, hold);
  }

  const contentTerms = extractTerms(`${request.title} ${request.synopsis}`);
  const scoredCandidates = eligibleStandards
    .map((standard) => createCandidate(standard, contentTerms, request.synopsis));
  const candidates = scoredCandidates
    .filter((candidate) => candidate.matchedTerms.length >= minimumMatchedTerms || candidate.supportedRequirementCount > 0)
    .sort(compareCandidates)
    .slice(0, request.limit);

  if (candidates.length === 0) {
    return createHoldResponse(request, eligibleStandards, {
      code: "NO_RELATED_OFFICIAL_CANDIDATE",
      message: "현재 공식 목록에서 입력 텍스트와 겹치는 후보를 찾지 못했습니다. 최종 선택 없이 보류합니다."
    });
  }

  return {
    status: "CANDIDATES_FOUND",
    retrievalMode: "RELATION_THEN_TERM_MATCH",
    retrievalScope: createRetrievalScope(request, eligibleStandards),
    input: createInputSummary(request),
    candidates
  };
}

function normalizeRequest(input, contents) {
  const contentCuriId = normalizeText(input.contentCuriId);
  const content = contentCuriId ? contents.find((item) => item.curiId === contentCuriId) : null;

  if (contentCuriId && !content) {
    throw new CandidateRetrievalInputError("요청한 콘텐츠 CURI ID를 저장소에서 찾지 못했습니다.");
  }

  const title = normalizeText(input.title ?? content?.metadata?.title);
  const synopsis = normalizeText(input.synopsis ?? content?.metadata?.synopsis);
  const subject = normalizeText(input.subject) ?? normalizeText(content?.metadata?.subjectSeed);
  const gradeBand = normalizeText(input.gradeBand) ?? normalizeText(content?.metadata?.gradeBandSeed);
  const limit = parseLimit(input.limit);

  if (!title && !synopsis) {
    throw new CandidateRetrievalInputError("콘텐츠 제목 또는 소개문을 입력해야 합니다.");
  }

  return {
    contentCuriId: content?.curiId ?? null,
    title: title ?? "",
    synopsis: synopsis ?? "",
    subject,
    gradeBand,
    contentLevel: content?.metadata?.contentLevel ?? null,
    limit
  };
}

function getHoldReason(request, eligibleStandards) {
  if (adjacentSubjects.has(request.subject)) {
    return {
      code: "SUBJECT_SCOPE_UNSUPPORTED",
      message: `입력 분류(${request.subject})를 특정 교과로 자동 확정하지 않습니다. 조회할 공식 교과 범위(사회·과학)를 지정하세요. 교과 선택은 관계의 사람 승인이 아닙니다.`
    };
  }

  if (!supportedSubjects.has(request.subject)) {
    return {
      code: request.subject ? "UNSUPPORTED_SUBJECT" : "SUBJECT_REQUIRED",
      message: request.subject
        ? `현재 공식 목록은 사회·과학만 지원합니다. 입력 교과(${request.subject})는 후보 반환 없이 보류합니다.`
        : "교과가 없어서 공식 목록을 안전하게 제한할 수 없습니다. 후보 반환 없이 보류합니다."
    };
  }

  if (!isSupportedGradeBand(request.gradeBand)) {
    return {
      code: request.gradeBand ? "UNSUPPORTED_GRADE_BAND" : "GRADE_BAND_REQUIRED",
      message: request.gradeBand
        ? `현재 대상은 초등 3~6학년과 중1입니다. 입력 학년군(${request.gradeBand})은 후보 반환 없이 보류합니다. 중학교 공식 학년군 전체를 중1로 간주하지 않습니다.`
        : "학년군이 없어서 공식 목록을 안전하게 제한할 수 없습니다. 후보 반환 없이 보류합니다."
    };
  }

  if (request.contentLevel === "program_series") {
    return {
      code: "EPISODE_LEVEL_REQUIRED",
      message: "프로그램 묶음 단위는 CuriBase 승인 대상이 아닙니다. 개별 회차 콘텐츠를 선택하세요."
    };
  }

  const quality = assessSourceText(request.title, request.synopsis);
  if (!quality.detailedMappingAllowed) return { code: quality.code, message: quality.message };

  if (eligibleStandards.length === 0) {
    return {
      code: "OFFICIAL_LIST_NOT_AVAILABLE",
      message: "요청 조건에 맞는 원문 대조된 공식 성취기준 목록이 없습니다. 후보 반환 없이 보류합니다."
    };
  }

  return null;
}

function createCandidate(standard, contentTerms, synopsis) {
  const standardTerms = extractTerms(
    `${standard.metadata.unitTitle} ${standard.metadata.achievementStandard}`
  );
  const matchedTerms = contentTerms.filter((term) => standardTerms.includes(term));
  const relation = assessRelation({ synopsis }, standard);

  return {
    curriculumCuriId: standard.curiId,
    achievementStandardId: standard.metadata.achievementStandardId,
    achievementStandard: standard.metadata.achievementStandard,
    subject: standard.metadata.subject,
    gradeBand: standard.metadata.gradeBand,
    ...(standard.metadata.courseId ? { courseId: standard.metadata.courseId, schoolLevel: standard.metadata.schoolLevel, placement: standard.placement } : {}),
    unit: {
      number: standard.metadata.unitNo,
      title: standard.metadata.unitTitle
    },
    officialSource: {
      document: standard.source.sourceDocument,
      pdfPage: standard.source.sourcePdfPage,
      curriculumVersion: standard.curriculumVersion
    },
    matchedTerms, supportedRequirementCount: relation.status === 'CONFLICT' ? 0 : relation.supportedRequirements.length
  };
}

function createHoldResponse(request, eligibleStandards, hold) {
  return {
    status: "HELD",
    hold,
    retrievalScope: createRetrievalScope(request, eligibleStandards),
    input: createInputSummary(request),
    candidates: []
  };
}

function createRetrievalScope(request, eligibleStandards) {
  const courseId = candidateCourse(request.gradeBand);
  return {
    subject: request.subject,
    gradeBand: courseId ? gradeLabel(courseId) : request.gradeBand,
    courseId,
    ...(broadGradeBands.has(String(request.gradeBand || "").replace(/\s/g, "")) ? { contextNote: "기존 광범위 콘텐츠 표기는 초등 5~6 기준으로 조회합니다. 다른 과정은 수업 대상 학년을 명시하세요." } : {}),
    officialStandardCount: eligibleStandards.length,
    constraint: "공식 원문 대조 또는 실제 사람 확인을 기록한 활성 성취기준 중 요청 과정의 기준만 반환합니다. 원문 대조는 사람의 연계 승인이 아닙니다.",
    evaluationNote: "반환은 공식 목록 제약 검증용 후보이며 교육과정 의미 정확도 또는 최종 연계 승인을 뜻하지 않습니다."
  };
}

function createInputSummary(request) {
  return {
    contentCuriId: request.contentCuriId,
    title: request.title || null,
    synopsisProvided: Boolean(request.synopsis),
    subject: request.subject,
    gradeBand: request.gradeBand
  };
}

function extractTerms(text) {
  const terms = new Set();
  const words = String(text ?? "").toLowerCase().match(/[가-힣a-z0-9]+/g) ?? [];

  for (const word of words) {
    const term = trimParticle(word);
    if (term.length >= 2 && !genericTerms.has(term)) {
      terms.add(term);
    }
  }

  return [...terms];
}

function trimParticle(word) {
  const suffix = particleSuffixes.find(
    (item) => word.endsWith(item) && word.length > item.length + 1
  );
  return suffix ? word.slice(0, -suffix.length) : word;
}

function isSupportedGradeBand(gradeBand) {
  return Boolean(candidateCourse(gradeBand));
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "") {
    return defaultLimit;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximumLimit) {
    throw new CandidateRetrievalInputError(`후보 수는 1~${maximumLimit} 사이의 정수여야 합니다.`);
  }
  return limit;
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function compareCandidates(left, right) {
  return (
    right.supportedRequirementCount - left.supportedRequirementCount ||
    right.matchedTerms.length - left.matchedTerms.length ||
    left.achievementStandardId.localeCompare(right.achievementStandardId, "ko")
  );
}

module.exports = {
  CandidateRetrievalInputError,
  candidateCourse,
  extractTerms,
  findCandidates,
  getEligibleStandards,
  retrieveCandidates
};
