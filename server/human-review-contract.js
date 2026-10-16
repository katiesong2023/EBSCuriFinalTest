const crypto = require("node:crypto");
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const relationKey = (source, standardId) => hash([source.sourceSystem, source.sourceContentId, source.variant || "UNSPECIFIED", standardId]);
const latestDecision = (store, key) => (store.relationReviews || []).findLast((review) => review.relationKey === key);

function currentSource(store, target, broadcasts) {
  const { storedResource, broadcastResource } = require("./automatic-evidence-service");
  const contents = store.contents.filter((item) => target.contentCuriId ? item.curiId === target.contentCuriId : item.sourceIdentity.sourceContentId === target.resourceId);
  if (contents.length > 1) return null;
  if (contents.length) return storedResource(contents[0]);
  const item = target.resourceId && broadcasts.find((item) => item.id === target.resourceId);
  return item ? broadcastResource(item) : null;
}
function currentSources(store, broadcasts) {
  const map = new Map(), reviews = store.relationReviews || [];
  if (!reviews.length) return map;
  if (!broadcasts && reviews.some((review) => review.target.resourceId && !store.contents.some((item) => item.sourceIdentity.sourceContentId === review.target.resourceId))) {
    try { broadcasts = require("./broadcast-store").readBroadcastResources(); } catch { broadcasts = []; }
  }
  for (const review of reviews) {
    const key = hash(review.target);
    if (!map.has(key)) map.set(key, currentSource(store, review.target, broadcasts || []));
  }
  return map;
}
function draftText(store, reference, resource) {
  if (reference?.kind !== "DRAFT") return null;
  const run = store.mappingRuns.find((run) => run.mappingRunId === reference.id), content = store.contents.find((item) => item.curiId === run?.contentCuriId);
  const text = run?.result?.publicText;
  if (!content || content.sourceIdentity.sourceContentId !== resource.sourceContentId || !text ||
      hash(text) !== hash(run.input.publicText) || text.sha256 !== crypto.createHash("sha256").update(text.text || "").digest("hex") ||
      run.result.content?.title !== resource.title || run.result.content?.subject !== content.metadata.subjectSeed ||
      run.result.content?.gradeBand !== content.metadata.gradeBandSeed || !officialUrl(text.sourceUrl) ||
      text.text.trim().length < 20 || text.text.length > 1200) return null;
  return text;
}
function officialUrl(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && (url.hostname === "ebs.co.kr" || url.hostname.endsWith(".ebs.co.kr")); } catch { return false; }
}
function fieldsFor(store, resource, reference) {
  const fields = { title: resource.title, synopsis: resource.synopsis || "" }, draft = draftText(store, reference, resource);
  if (draft) fields.draftText = draft.text;
  return fields;
}
function quoteValid(quote, fields) {
  return quote && ["title", "synopsis", "draftText"].includes(quote.field) && Number.isInteger(quote.start) && Number.isInteger(quote.end) &&
    quote.start >= 0 && quote.end > quote.start && typeof quote.quote === "string" && quote.quote.trim().length >= 4 &&
    quote.end <= (fields[quote.field] || "").length && fields[quote.field].slice(quote.start, quote.end) === quote.quote;
}
function reviewValidity(review, store, resource) {
  const { sourceSnapshot, standardSnapshot } = require("./automatic-evidence");
  const { getEligibleStandards, standardEvidence } = require("./data-quality");
  if (!resource || !resource.active || resource.sourceMismatch || !["clip", "episode", "lecture"].includes(resource.kind) || !officialUrl(resource.sourceUrl) || !officialUrl(resource.textSourceUrl)) return "SOURCE_UNAVAILABLE";
  if (sourceSnapshot(resource).contentHash !== review.source.contentHash) return "SOURCE_CHANGED";
  const standard = getEligibleStandards(store.curriculumStandards).find((item) => item.curiId === review.curriculumCuriId);
  if (!standard || hash(standardEvidence(standard)) !== hash(review.standard) || standardSnapshot(standard).evidenceHash !== review.standardSnapshot.evidenceHash) return "STANDARD_CHANGED";
  if (standard.curriculumVersion !== "2022 개정" || standard.sourceIdentity?.sourceSystem !== "MOE_2022_CURRICULUM" || standard.sourceIdentity.sourceStandardId !== standard.metadata.achievementStandardId || !standard.source.sourceDocument || !(Number(standard.source.sourcePdfPage) > 0) || !standard.source.contentFingerprint) return "OFFICIAL_EVIDENCE_REQUIRED";
  if (review.confirmed !== true || review.reviewerRole !== "LOCAL_HUMAN_REVIEWER" || !Number.isFinite(Date.parse(review.reviewedAt))) return "HUMAN_CONFIRMATION_REQUIRED";
  if (review.reference?.kind === "DRAFT" && hash(store.mappingRuns.find((run) => run.mappingRunId === review.reference.id)?.result || null) !== review.reference.version) return "RELATION_CHANGED";
  const fields = fieldsFor(store, resource, review.reference);
  if (["approve", "edit"].includes(review.decision) && Object.values(fields).filter(Boolean).join("\n").trim().length < 20) return "SOURCE_TEXT_REQUIRED";
  if (["approve", "edit"].includes(review.decision) && (!review.result.quotes?.length || !review.result.quotes.every((quote) => quoteValid(quote, fields)))) return "QUOTE_CHANGED";
  // 자동 규칙·새 자동 실행은 실제 사람 결정의 근거 버전이 아니다.
  return null;
}
function humanPayload(review) {
  return { reviewKind: "RELATION_REVIEW", relationKey: review.relationKey, contentCuriId: review.contentCuriId,
    curriculumCuriId: review.curriculumCuriId, curiMapId: `HUMAN-MAP-${review.relationKey}`, mappingRunId: review.reference.id || null,
    reviewId: review.reviewId, curriculumVersion: review.standard.curriculumVersion, contentVersion: review.source.contentHash,
    provenanceClassification: "HUMAN_VERIFIED", reviewStatus: review.status, content: review.content,
    publicText: review.publicText, standard: review.standard, review };
}
function validHumanAsset(asset, store, sources) {
  const review = latestDecision(store, asset.relationKey);
  if (!review || review.reviewId !== asset.reviewId || !["approve", "edit"].includes(review.decision) || reviewValidity(review, store, sources.get(hash(review.target)))) return false;
  const expected = humanPayload(review), actual = Object.fromEntries(Object.keys(expected).map((key) => [key, asset[key]]));
  return asset.evidenceFingerprint === hash(expected) && hash(actual) === hash(expected);
}
function overriddenLegacyAsset(asset, store) {
  const key = relationKey({ ...asset.content.sourceIdentity, variant: asset.content.metadata.variant || "UNSPECIFIED" }, asset.curriculumCuriId);
  return Boolean(latestDecision(store, key));
}
module.exports = { hash, relationKey, latestDecision, currentSource, currentSources, fieldsFor, quoteValid, reviewValidity, humanPayload, validHumanAsset, overriddenLegacyAsset };
