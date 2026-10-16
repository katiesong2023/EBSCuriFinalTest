const { readDataStore, writeDataStore } = require("./data-store");
const { evaluateVerification, verifiedPayload, fingerprint, reconcileVerifiedAssets } = require("./data-quality");

class VerifiedSaveError extends Error {
  constructor(message, statusCode = 409) {
    super(message);
    this.statusCode = statusCode;
  }
}

function createStatus(store, contentCuriId) {
  const gate = evaluateVerification(store, contentCuriId);
  const assets = store.verifiedAssets.filter((asset) => asset.contentCuriId === contentCuriId);
  return {
    contentCuriId, mappingRunId: gate.run?.mappingRunId ?? null, reviewId: gate.review?.reviewId ?? null,
    contentVersion: gate.review?.contentVersion ?? null,
    eligible: gate.eligible, reasons: gate.reasons, saved: assets.length > 0,
    assets: assets.map(({ verifiedAssetId, curriculumCuriId, curriculumVersion, version, savedAt }) =>
      ({ verifiedAssetId, curriculumCuriId, curriculumVersion, version, savedAt })),
    invalidatedCount: store.verifiedAssetHistory.filter((asset) => asset.contentCuriId === contentCuriId).length
  };
}

async function getVerifiedStatus(contentCuriId) {
  const store = await readDataStore();
  if (!store.contents.some((content) => content.curiId === contentCuriId)) {
    throw new VerifiedSaveError("콘텐츠를 찾지 못했습니다.", 404);
  }
  return createStatus(reconcileVerifiedAssets(store), contentCuriId);
}

async function saveVerifiedAssets(input) {
  if (!input || typeof input !== "object" || typeof input.contentCuriId !== "string") {
    throw new VerifiedSaveError("저장할 콘텐츠와 검수 기록을 지정하세요.", 400);
  }
  const store = reconcileVerifiedAssets(await readDataStore());
  if ((store.relationReviews || []).some((review) => review.contentCuriId === input.contentCuriId)) {
    throw new VerifiedSaveError("관계별 판단 자료는 관리자 작업공간의 통합 저장·검색 재시도를 사용하세요.");
  }
  const gate = evaluateVerification(store, input.contentCuriId);
  if (!gate.eligible) throw new VerifiedSaveError(gate.reasons.join(" "));
  if (input.mappingRunId !== gate.run.mappingRunId || input.reviewId !== gate.review.reviewId ||
      input.contentVersion !== gate.review.contentVersion) {
    throw new VerifiedSaveError("콘텐츠 또는 검수 기록이 변경되었습니다. 새로고침 후 저장하세요.");
  }
  const status = createStatus(store, input.contentCuriId);
  if (status.saved) return { ...status, reused: true };
  const savedAt = new Date().toISOString();
  const version = 1 + Math.max(0, ...store.verifiedAssetHistory
    .filter((asset) => asset.contentCuriId === input.contentCuriId).map((asset) => asset.version));
  const assets = gate.maps.map((map, index) => {
    const payload = verifiedPayload(gate, index);
    const evidenceFingerprint = fingerprint(payload);
    return { ...payload, verifiedAssetId: `VERIFIED-${fingerprint([map.curiMapId, gate.review.reviewId, version])}`,
      naturalKey: `${input.contentCuriId}:${map.curriculumCuriId}`, version, evidenceFingerprint,
      assetClassification: "VERIFIED", savedAt };
  });
  store.verifiedAssets.push(...assets);
  store.updatedAt = savedAt;
  reconcileVerifiedAssets(store);
  // 관계 전체·검증 자산·무효화 이력을 하나의 임시 파일 교체로 확정한다.
  await writeDataStore(store);
  return { ...createStatus(store, input.contentCuriId), reused: false };
}

module.exports = { VerifiedSaveError, getVerifiedStatus, saveVerifiedAssets };
