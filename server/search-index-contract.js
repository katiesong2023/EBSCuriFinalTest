const { createHash } = require("node:crypto");

const embeddingSpec = Object.freeze({
  model: "Xenova/multilingual-e5-small",
  revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
  runtime: "transformers.js-4.3.0", dtype: "q8", dimensions: 384,
  pooling: "mean", normalize: true, maxTokens: 512, documentVersion: 1
});
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function documentForAsset(asset) {
  const metadata = asset.content.metadata;
  const standard = asset.standard.metadata;
  const review = asset.review.result;
  return ["passage: " + metadata.title,
    `${standard.subject} · ${standard.gradeBand} · ${asset.curriculumVersion}`,
    `성취기준: ${standard.achievementStandardId} ${standard.achievementStandard}`,
    `핵심개념: ${review.coreConcepts.join(", ")}`,
    `연계근거: ${review.rationale}`, `수업 활용: ${review.teachingUse}`,
    `공개 원문: ${asset.publicText.text}`].join("\n");
}

function embeddingKey(text) { return hash({ spec: embeddingSpec, text }); }

function validEmbedding(item, key) {
  return item?.embeddingKey === key && Boolean(item.spec) && hash(item.spec) === hash(embeddingSpec) &&
    Array.isArray(item.vector) && item.vector.length === embeddingSpec.dimensions &&
    item.vector.every(Number.isFinite) &&
    Math.abs(Math.hypot(...item.vector) - 1) < 0.01 &&
    Number.isInteger(item.inputTokens) && item.inputTokens > 0 && item.inputTokens <= embeddingSpec.maxTokens &&
    typeof item.truncated === "boolean";
}

function projectionMatches(item, asset) {
  return item.verifiedAssetId === asset.verifiedAssetId && item.version === asset.version &&
    item.contentCuriId === asset.contentCuriId && item.curiMapId === asset.curiMapId &&
    item.curriculumCuriId === asset.curriculumCuriId && item.contentVersion === asset.contentVersion &&
    item.evidenceFingerprint === asset.evidenceFingerprint &&
    validEmbedding(item, embeddingKey(documentForAsset(asset)));
}

// 읽을 때도 현재 검증 자산·모델과 일치하는지 확인해 고립된 이전 버전을 제거한다.
function reconcileSearchProjection(store) {
  const valid = store.searchProjection.filter((item) => store.verifiedAssets.some((asset) => projectionMatches(item, asset)));
  for (const content of store.contents) {
    const assets = store.verifiedAssets.filter((asset) => asset.contentCuriId === content.curiId);
    const items = assets.map((asset) => store.searchProjection.find((item) => projectionMatches(item, asset)));
    const ready = assets.length > 0 && items.every(Boolean);
    if (content.lifecycle) content.lifecycle.isSearchEligible = ready;
  }
  store.searchProjection = valid;
  return store;
}

module.exports = { embeddingSpec, documentForAsset, embeddingKey, validEmbedding,
  projectionMatches, reconcileSearchProjection };
