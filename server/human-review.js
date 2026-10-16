const { randomUUID, createHash } = require("node:crypto");
const { readDataStore, writeDataStore } = require("./data-store");
const { reconcileVerifiedAssets } = require("./data-quality");
const { buildHumanWorkspace } = require("./human-review-workspace");
const { hash, quoteValid, humanPayload, reviewValidity, currentSource } = require("./human-review-contract");
const statuses = { approve: "HUMAN_APPROVED", edit: "HUMAN_EDITED", exclude: "EXCLUDED", hold: "HELD" };
const reasons = ["REVIEWED", "INSUFFICIENT_EVIDENCE", "CONFLICT", "OUT_OF_SCOPE", "SOURCE_CHANGED", "OTHER"];
class HumanReviewError extends Error { constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; } }
const text = (value, label, required = true) => { if (typeof value !== "string" || value.length > 5000 || required && !value.trim()) throw new HumanReviewError(`${label}을 확인하세요 (최대 5000자).`); return value.trim(); };

function createHumanReviewService({ readStore = readDataStore, writeStore = writeDataStore, broadcasts, filename,
  prepare = async (input) => require("./search-index").prepareSearchIndex(input), now = () => new Date().toISOString() } = {}) {
  let writing = false;
  const workspace = async (input) => buildHumanWorkspace(input, await readStore(), { broadcasts, filename });
  async function search(review) {
    if (!["approve", "edit"].includes(review.decision)) return { state: "NOT_SAVED" };
    try { return await prepare({ contentCuriId: review.contentCuriId, relationReviewId: review.reviewId }); }
    catch { return { state: "FAILED", error: "결정·자산은 저장됐지만 검색 준비에 실패했습니다. 검색 준비만 재시도하세요." }; }
  }
  async function save(input) {
    if (writing) throw new HumanReviewError("다른 결정 저장 중입니다. 완료 후 다시 조회하세요.", 409);
    if (!input || Object.keys(input).some((key) => !["target", "subject", "gradeBand", "curriculumCuriId", "expectedVersion", "requestId", "decision", "confirmed", "reasonCode", "note", "changes"].includes(key)) ||
      !Object.hasOwn(statuses, input.decision) || input.confirmed !== true || !reasons.includes(input.reasonCode) ||
      !/^[a-zA-Z0-9-]{16,100}$/.test(input.requestId || "")) throw new HumanReviewError("관계·실제 사람 확인·결정 사유·요청 ID를 확인하세요.");
    if (!input.target || typeof input.target !== "object" || Object.keys(input.target).length !== 1 ||
      !["contentCuriId", "resourceId"].includes(Object.keys(input.target)[0])) throw new HumanReviewError("검토할 원본 ID 하나를 지정하세요.");
    writing = true;
    try {
      const store = await readStore(), requestFingerprint = hash(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))));
      const previous = (store.relationReviews || []).find((review) => review.requestId === input.requestId);
      if (previous) {
        if (previous.requestFingerprint !== requestFingerprint) throw new HumanReviewError("같은 요청 ID로 다른 결정을 덮어쓸 수 없습니다.", 409);
        const source = currentSource(store, previous.target, broadcasts || require("./broadcast-store").readBroadcastResources());
        return { saved: true, reused: true, review: previous, current: (store.relationReviews || []).findLast((review) => review.relationKey === previous.relationKey)?.reviewId === previous.reviewId && !reviewValidity(previous, store, source),
          searchPreparation: await search(previous) };
      }
      const view = await buildHumanWorkspace({ ...input.target, subject: input.subject, gradeBand: input.gradeBand, standardId: input.curriculumCuriId }, store, { broadcasts, filename });
      const relation = view.relations.find((item) => item.curriculumCuriId === input.curriculumCuriId);
      if (!relation || relation.expectedVersion !== input.expectedVersion) throw new HumanReviewError("원문·기준·관계 또는 사람 결정이 변경되었습니다. 새로 조회해 검토하세요.", 409);
      const values = { ...relation.defaults };
      if (input.changes != null && (typeof input.changes !== "object" || Array.isArray(input.changes) || Object.keys(input.changes).some((key) => !["quote", "rationale", "teachingUse", "coreConcepts", "connectedParts", "unconfirmedParts", "coverage"].includes(key)))) throw new HumanReviewError("관계의 수정 필드가 올바르지 않습니다.");
      const changes = input.changes || {};
      if (input.decision === "approve" && Object.keys(changes).some((key) => hash(changes[key]) !== hash(values[key]))) throw new HumanReviewError("내용을 변경했다면 ‘수정’을 선택하세요.");
      Object.assign(values, changes);
      const note = text(input.note, "검토 사유"), approving = ["approve", "edit"].includes(input.decision);
      if (approving) {
        if (!quoteValid(values.quote, relation.fields)) throw new HumanReviewError("인용문과 필드·위치가 현재 원문과 일치해야 합니다.");
        for (const key of ["rationale", "teachingUse", "connectedParts", "unconfirmedParts"]) values[key] = text(values[key], key);
        if (!Array.isArray(values.coreConcepts) || values.coreConcepts.length < 1 || values.coreConcepts.length > 6 || values.coreConcepts.some((value) => typeof value !== "string" || !value.trim() || value.length > 400)) throw new HumanReviewError("핵심개념을 1~6개 입력하세요.");
        if (!["PARTIAL", "FULL"].includes(values.coverage)) throw new HumanReviewError("확인한 연계 범위를 선택하세요.");
      }
      const reviewedAt = now(), reviewId = `RELATION-REVIEW-${randomUUID()}`, source = view.source;
      const result = { ...values, quotes: values.quote ? [values.quote] : [], curriculumCuriIds: [relation.curriculumCuriId], officialStandards: [relation.standard] }; delete result.quote;
      const publicValue = Object.values(relation.fields).filter(Boolean).join("\n");
      const review = { reviewId, requestId: input.requestId, requestFingerprint, relationKey: relation.relationKey, target: view.target,
        contentCuriId: view.contentCuriId, curriculumCuriId: relation.curriculumCuriId, decision: input.decision, status: statuses[input.decision],
        confirmed: true, reviewerRole: "LOCAL_HUMAN_REVIEWER", actorScope: "SINGLE_OPERATOR_SESSION", reviewedAt, note, reasonCode: input.reasonCode,
        source, standard: relation.standard, standardSnapshot: relation.standardSnapshot, reference: relation.reference, result,
        content: { curiId: view.contentCuriId, sourceIdentity: { sourceSystem: source.sourceSystem, sourceContentId: source.sourceContentId },
          sourceVersion: source.sourceVersion, sourceUrl: source.sourceUrl, contentFingerprint: source.contentHash, metadata: { ...view.contentMetadata, variant: source.variant }, provenance: { classification: "SOURCE" } },
        publicText: { sourceUrl: source.textSourceUrl, text: publicValue, sha256: createHash("sha256").update(publicValue).digest("hex") } };
      // 비동기 대기 뒤 파일·원문을 다시 대조한다. 결정과 자산은 동일 JSON 교체로 확정한다.
      const fresh = await readStore(), latestView = await buildHumanWorkspace({ ...input.target, subject: input.subject, gradeBand: input.gradeBand, standardId: input.curriculumCuriId }, fresh, { broadcasts, filename });
      if (latestView.relations.find((item) => item.curriculumCuriId === input.curriculumCuriId)?.expectedVersion !== input.expectedVersion) throw new HumanReviewError("검토 중 자료 또는 결정이 바뀌었습니다. 다시 조회하세요.", 409);
      if (approving) {
        const resource = currentSource(fresh, view.target, broadcasts || require("./broadcast-store").readBroadcastResources());
        if (reviewValidity(review, fresh, resource)) throw new HumanReviewError("현재 출처·공식 근거·인용 조건을 충족하지 못했습니다.", 409);
      }
      fresh.relationReviews ||= []; fresh.relationReviews.push(review); fresh.updatedAt = reviewedAt;
      reconcileVerifiedAssets(fresh);
      if (approving) {
        const payload = humanPayload(review), version = 1 + Math.max(0, ...fresh.verifiedAssetHistory.filter((item) => item.contentCuriId === review.contentCuriId && item.curriculumCuriId === review.curriculumCuriId).map((item) => item.version));
        fresh.verifiedAssets.push({ ...payload, verifiedAssetId: `VERIFIED-${hash([reviewId, version])}`, naturalKey: `${review.contentCuriId}:${review.curriculumCuriId}`,
          version, evidenceFingerprint: hash(payload), assetClassification: "VERIFIED", savedAt: reviewedAt });
      }
      await writeStore(fresh);
      return { saved: true, reused: false, review, current: true, searchPreparation: await search(review) };
    } finally { writing = false; }
  }
  async function retry(input) {
    if (!input || Object.keys(input).length !== 1 || typeof input.reviewId !== "string") throw new HumanReviewError("검색 준비할 사람 검토 ID를 지정하세요.");
    const store = await readStore(), review = (store.relationReviews || []).find((item) => item.reviewId === input.reviewId);
    if (!review || !store.verifiedAssets.some((asset) => asset.reviewId === review.reviewId)) throw new HumanReviewError("현재 유효한 승인 자산이 없습니다. 검토 상태를 다시 조회하세요.", 409);
    return { saved: true, reviewId: review.reviewId, searchPreparation: await search(review) };
  }
  return { workspace, save, retry };
}
const humanReview = createHumanReviewService();
module.exports = { HumanReviewError, createHumanReviewService, humanReview };
