const { readDataStore } = require("./data-store");
const { readBroadcastResources } = require("./broadcast-store");
const { createAutomaticEvidence } = require("./automatic-evidence");
const { courseForGrade, standardCourse } = require("../public/grade-context");

class AutomaticEvidenceInputError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.code = "INVALID_AUTOMATIC_EVIDENCE_INPUT";
    this.statusCode = statusCode;
  }
}

function storedResource(content) {
  return { sourceSystem: content.sourceIdentity.sourceSystem, sourceContentId: content.sourceIdentity.sourceContentId,
    variant: content.metadata.variant || "UNSPECIFIED", sourceVersion: content.sourceVersion,
    sourceUrl: content.source.sourceUrl,
    textSourceUrl: content.provenance?.descriptionSourceUrl || content.source.sourceUrl,
    title: content.metadata.title || "", synopsis: content.metadata.synopsis || "",
    active: content.lifecycle?.isActive === true, kind: content.metadata.contentLevel,
    subject: content.metadata.subjectSeed, gradeBand: content.metadata.gradeBandSeed };
}

function broadcastResource(item) {
  return { sourceSystem: "EBS_BROADCAST", sourceContentId: item.id, variant: item.variant,
    sourceVersion: "EBS_PUBLIC_METADATA", sourceUrl: item.sourceUrl, textSourceUrl: item.evidenceUrl,
    title: item.title, synopsis: item.summary, active: true, kind: item.kind,
    sourceMismatch: item.navigation.status === "UNCONFIRMED" };
}

function validateEvidenceInput(input) {
  const allowed = ["contentCuriId", "resourceId", "subject", "gradeBand", "standardId"];
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key)) ||
      Object.values(input).some((value) => typeof value !== "string" || !value.trim() || value.length > 200) ||
      Boolean(input.contentCuriId) === Boolean(input.resourceId)) {
    throw new AutomaticEvidenceInputError("contentCuriId 또는 resourceId 하나와 선택적인 subject·gradeBand·standardId만 지정하세요. 원문·검사 결과는 서버에서 읽습니다.");
  }
  return input;
}

async function loadEvidenceContext(input, store, broadcasts) {
  validateEvidenceInput(input);
  store ||= await readDataStore();
  const contents = input.contentCuriId ? store.contents.filter((item) => item.curiId === input.contentCuriId) :
    store.contents.filter((item) => item.sourceIdentity.sourceContentId === input.resourceId);
  if (contents.length > 1) throw new AutomaticEvidenceInputError("자료 식별자가 중복됩니다. contentCuriId로 판본을 지정하세요.", 409);
  let resource;
  if (contents.length) resource = storedResource(contents[0]);
  else if (input.resourceId) {
    const broadcast = (broadcasts || readBroadcastResources({ resourceId: input.resourceId })).find((item) => item.id === input.resourceId);
    if (broadcast) resource = broadcastResource(broadcast);
  }
  if (!resource) throw new AutomaticEvidenceInputError("저장된 원본 자료를 찾지 못했습니다.", 404);
  const target = input.standardId && require("./data-quality").getEligibleStandards(store.curriculumStandards).find(s => s.metadata.achievementStandardId === input.standardId);
  if (input.standardId && (!target || input.subject && target.metadata.subject !== input.subject || input.gradeBand && standardCourse(target) !== courseForGrade(input.gradeBand))) throw new AutomaticEvidenceInputError("선택한 공식 성취기준·교과·학년 조건이 일치하지 않습니다.");
  // 기준을 직접 선택한 경우 방송의 광범위 학년 표기보다 선택 과정이 우선이다.
  const targetGrade = target && (target.metadata.courseId || target.metadata.gradeBand);
  return { resource, store, standards: store.curriculumStandards, options: {
    ...(input.standardId ? { standardId: input.standardId } : {}),
    subject: input.subject ?? target?.metadata.subject ?? resource.subject ?? "", gradeBand: input.gradeBand ?? targetGrade ?? resource.gradeBand ?? "5~6학년군"
  } };
}

async function inspectAutomaticEvidence(input) {
  const { resource, standards, options } = await loadEvidenceContext(input);
  return createAutomaticEvidence(resource, standards, options);
}

// 한 검색 응답의 여러 자산은 같은 원본 사본을 공유한다. 다음 요청에서는 다시 읽는다.
function createEvidenceContextLoader() {
  let storePromise;
  const broadcasts = new Map();
  return async (input) => {
    validateEvidenceInput(input);
    const store = await (storePromise ||= readDataStore());
    if (input.resourceId && !store.contents.some((item) => item.sourceIdentity.sourceContentId === input.resourceId) && !broadcasts.has(input.resourceId)) {
      // 자산 검증에 필요한 ID만 읽는다. 다른 요청에는 재사용하지 않아 최신 원문 대조를 유지한다.
      broadcasts.set(input.resourceId, readBroadcastResources({ resourceId: input.resourceId }));
    }
    return loadEvidenceContext(input, store, broadcasts.get(input.resourceId));
  };
}

module.exports = { AutomaticEvidenceInputError, inspectAutomaticEvidence, validateEvidenceInput, loadEvidenceContext, createEvidenceContextLoader, storedResource, broadcastResource };
