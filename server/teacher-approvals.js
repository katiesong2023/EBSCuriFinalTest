const { readDataStore } = require("./data-store");
const { automaticAssets } = require("./automatic-assets");
const { readBroadcastResources } = require("./broadcast-store");
const { sourceQualityStats } = require("./source-text-quality");
const { standardCourse, gradeLabel } = require("../public/grade-context");
const cache = new WeakMap();

async function teacherCatalog(catalog, store, automaticLinks) {
  // readDataStore는 현재 원문·검수 지문으로 무효화한 읽기 전용 사본을 반환한다.
  store ||= await readDataStore();
  automaticLinks ??= catalog.liveSource === true ? await automaticAssets.readLinks() : [];
  const signature = JSON.stringify([store.verifiedAssets, automaticLinks]);
  if (cache.get(catalog)?.signature === signature) return cache.get(catalog).value;
  const sourceResources = [...catalog.resources, ...(catalog.searchVariants || [])];
  const ids = new Set(sourceResources.map((item) => item.id));
  const missing = new Set([...automaticLinks, ...store.verifiedAssets.filter((asset) => asset.reviewKind === "RELATION_REVIEW").map((asset) => asset.content.sourceIdentity)]
    .filter((link) => catalog.liveSource === true && link.sourceSystem === "EBS_BROADCAST" && !ids.has(link.sourceContentId)).map((link) => link.sourceContentId));
  // 제목 대표로 숨겨졌던 회차도 자기 ID로만 제공한다. 대표 회차에 관계를 전파하지 않는다.
  const resources = missing.size ? [...sourceResources, ...readBroadcastResources().filter((item) => missing.has(item.id))] : sourceResources;
  const links = new Map();
  for (const asset of store.verifiedAssets) {
    const id = asset.content.sourceIdentity.sourceContentId;
    const standard = asset.standard.metadata;
    if (!links.has(id)) links.set(id, []);
    links.get(id).push({ title: asset.content.metadata.title, verifiedAssetId: asset.verifiedAssetId,
      standardId: standard.achievementStandardId, standard: standard.achievementStandard,
      subject: standard.subject, grade: gradeLabel(asset.standard), courseId: standardCourse(asset.standard), officialGradeBand: standard.gradeBand, placement: asset.standard.placement || null, reason: asset.review.result.rationale,
      ...(asset.reviewKind === "RELATION_REVIEW" ? { sourceSystem: asset.content.sourceIdentity.sourceSystem, sourceUrl: asset.content.sourceUrl,
        synopsis: asset.content.metadata.synopsis || "", variant: asset.content.metadata.variant, coverage: asset.review.result.coverage,
        connectedParts: asset.review.result.connectedParts, unconfirmedParts: asset.review.result.unconfirmedParts, quotes: asset.review.result.quotes } : {}) });
  }
  const value = { ...catalog, stats: { ...catalog.stats, catalog: resources.length,
    sourceQuality: sourceQualityStats(resources), withDescription: sourceQualityStats(resources).minimumPassed,
    individual: resources.filter((item) => item.kind !== "collection").length,
    collections: resources.filter((item) => item.kind === "collection").length,
    directLinks: resources.filter((item) => item.navigation?.status === "MATCHED" && ["CLIP", "EPISODE"].includes(item.navigation.kind)).length }, resources: resources.map((item) => {
    const approvedLinks = (links.get(item.id) || []).filter((link) => link.title === item.title && (!link.sourceSystem ||
      link.sourceSystem === item.sourceSystem && link.sourceUrl === item.sourceUrl && link.synopsis === item.summary && link.variant === item.variant));
    // 검색 대표 그룹·제목으로 다른 회차의 관계를 물려주지 않는다.
    const auto = automaticLinks.filter((link) => link.sourceContentId === item.id && link.title === item.title &&
      link.synopsis === item.summary && link.sourceUrl === item.sourceUrl &&
      link.sourceSystem === item.sourceSystem && link.variant === item.variant);
    return { ...item, approvedLinks, automaticLinks: auto, evidenceRefresh: "CURRENT",
      curriculumStatus: approvedLinks.length ? "APPROVED" : "NOT_ASSESSED" };
  }) };
  cache.set(catalog, { signature, value });
  return value;
}
module.exports = { teacherCatalog };
