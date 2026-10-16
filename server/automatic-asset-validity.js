const { fingerprint } = require("./data-quality");
const { sourceSnapshot, standardSnapshot, checkRelation } = require("./automatic-evidence");
const { ruleVersion } = require("./automatic-relation-rules");

const resourceKey = (source) => fingerprint([source.sourceSystem, source.sourceContentId, source.variant]);

// 기존 묶음 검토도 실제 결정이 있는 관계만 보호한다. 자동 실행은 이 기록을 생성·수정하지 않는다.
function humanDecisions(context) {
  const { resource, store } = context, decisions = new Map();
  const ids = new Set((store.contents || []).filter((item) => item.sourceIdentity?.sourceSystem === resource.sourceSystem &&
    item.sourceIdentity?.sourceContentId === resource.sourceContentId &&
    (item.metadata?.variant || "UNSPECIFIED") === resource.variant).map((item) => item.curiId));
  const runs = (store.mappingRuns || []).filter((run) => ids.has(run.contentCuriId));
  const reviews = runs.flatMap((run) => (run.reviewHistory || []).map((review) => ({ run, review })))
    .sort((a, b) => String(a.review.reviewedAt).localeCompare(String(b.review.reviewedAt)));
  for (const { run, review } of reviews) {
    if (review.confirmed !== true || review.reviewerRole !== "LOCAL_HUMAN_REVIEWER" ||
        !review.reviewId || !["approve", "edit", "exclude"].includes(review.decision)) continue;
    const selected = review.result?.curriculumCuriIds || [];
    const related = new Set([...selected, ...(store.contentCurriculumMaps || []).filter((map) => map.mappingRunId === run.mappingRunId).map((map) => map.curriculumCuriId)]);
    if (!related.size && review.decision === "exclude") related.add("*");
    for (const id of related) decisions.set(id, { reviewId: review.reviewId,
      decision: review.decision === "exclude" || !selected.includes(id) ? "exclude" : review.decision,
      contentVersion: review.contentVersion, reviewedAt: review.reviewedAt });
  }
  const { relationKey } = require("./human-review-contract");
  for (const review of store.relationReviews || []) {
    if (review.confirmed !== true || review.reviewerRole !== "LOCAL_HUMAN_REVIEWER" ||
        review.relationKey !== relationKey(resource, review.curriculumCuriId)) continue;
    decisions.set(review.curriculumCuriId, { reviewId: review.reviewId, decision: review.decision,
      contentVersion: review.source.contentHash, reviewedAt: review.reviewedAt });
  }
  return decisions;
}

function contextHash(context) {
  return fingerprint({ source: sourceSnapshot(context.resource), options: context.options, ruleVersion,
    standards: context.standards.map((standard) => ({ evidence: standardSnapshot(standard), lifecycle: standard.lifecycle,
      classification: standard.provenance?.classification, reviewStatus: standard.review?.status })),
    decisions: [...humanDecisions(context)] });
}

function validateAsset(evidence, context) {
  if (evidence.source.contentHash !== sourceSnapshot(context.resource).contentHash) return { valid: false, reason: "SOURCE_CHANGED" };
  if (evidence.ruleVersion !== ruleVersion) return { valid: false, reason: "RULE_CHANGED" };
  const decision = humanDecisions(context).get(evidence.standard.curriculumCuriId) || humanDecisions(context).get("*");
  if (decision) return { valid: false, reason: `HUMAN_${decision.decision.toUpperCase()}`, reviewId: decision.reviewId };
  const standard = context.standards.find((item) => item.curiId === evidence.standard.curriculumCuriId);
  if (!standard || fingerprint(standardSnapshot(standard)) !== fingerprint(evidence.standard)) return { valid: false, reason: "STANDARD_CHANGED" };
  // 순위의 상위 5개 제한은 생성 때만 적용한다. 무관한 기준의 순위 변경은 이 관계를 무효화하지 않는다.
  const inspection = checkRelation(evidence, { resource: context.resource, standards: [standard], ...context.options });
  return inspection.publicationEligible ? { valid: true, inspection } : { valid: false, reason: "EVIDENCE_NO_LONGER_ELIGIBLE" };
}

function publicAsset(asset, evidence) {
  return { assetId: asset.id, sourceSystem: evidence.source.sourceSystem, sourceContentId: evidence.source.sourceContentId,
    variant: evidence.source.variant, contentHash: evidence.source.contentHash, title: evidence.source.fields.title,
    synopsis: evidence.source.fields.synopsis, sourceUrl: evidence.source.sourceUrl,
    standardId: evidence.standard.standardId, standard: evidence.standard.requirement, subject: evidence.standard.subject,
    grade: evidence.standard.gradeBand, curriculumVersion: evidence.standard.curriculumVersion,
    ...(evidence.standard.courseId ? { courseId: evidence.standard.courseId, schoolLevel: evidence.standard.schoolLevel, placement: evidence.standard.placement } : {}),
    checkedAt: evidence.inspection.checkedAt, ruleVersion: evidence.ruleVersion,
    level: "AUTOMATIC_EVIDENCE_CHECKED", coverage: "PARTIAL", humanVerified: false,
    quotes: evidence.quotes.map(({ field, start, end, quote, sourceUrl }) => ({ field, start, end, quote, sourceUrl })),
    connectedParts: evidence.semantic.connectedParts, unconfirmedParts: evidence.semantic.unconfirmedParts,
    officialSource: { document: evidence.standard.document, page: evidence.standard.page },
    note: "자동 근거 검사를 통과한 부분 연계 후보입니다. 사람 검토·전체 성취기준 충족·영상 적합성은 미확인입니다." };
}

module.exports = { resourceKey, contextHash, humanDecisions, validateAsset, publicAsset };
