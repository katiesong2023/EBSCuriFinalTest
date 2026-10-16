const { loadEvidenceContext, AutomaticEvidenceInputError } = require("./automatic-evidence-service");
const { candidateCourse } = require("./candidate-retrieval");
const { createAutomaticEvidence, sourceSnapshot, standardSnapshot } = require("./automatic-evidence");
const { getEligibleStandards, standardEvidence } = require("./data-quality");
const { openAssetStore } = require("./automatic-asset-store");
const { hash, relationKey, latestDecision, fieldsFor, reviewValidity } = require("./human-review-contract");

function savedAutomatic(resource, filename) {
  const db = openAssetStore(filename, false);
  if (!db) return [];
  try { return db.prepare("SELECT r.id,r.evidence FROM relations r JOIN runs x ON x.id=r.run_id WHERE json_extract(x.report,'$.source.sourceContentId')=? ORDER BY x.rowid DESC").all(resource.sourceContentId).map((row) => ({ ...row, evidence: JSON.parse(row.evidence) })); }
  finally { db.close(); }
}
async function buildHumanWorkspace(input, store, { broadcasts, filename } = {}) {
  const target = input.contentCuriId ? { contentCuriId: input.contentCuriId } : { resourceId: input.resourceId };
  const selected = input.standardId && getEligibleStandards(store.curriculumStandards).find((standard) => standard.curiId === input.standardId || standard.metadata.achievementStandardId === input.standardId);
  if (input.standardId && !selected) throw new AutomaticEvidenceInputError("현재 공식 지원 범위에 없는 성취기준입니다.");
  const context = await loadEvidenceContext({ ...target, ...(input.subject ? { subject: input.subject } : {}),
    ...(input.gradeBand ? { gradeBand: input.gradeBand } : {}), ...(selected ? { standardId: selected.metadata.achievementStandardId } : {}) }, store, broadcasts);
  const { resource } = context, source = sourceSnapshot(resource);
  const content = store.contents.find((item) => item.sourceIdentity.sourceSystem === resource.sourceSystem && item.sourceIdentity.sourceContentId === resource.sourceContentId && (item.metadata.variant || "UNSPECIFIED") === resource.variant);
  const contentCuriId = content?.curiId || `RESOURCE-${hash([resource.sourceSystem, resource.sourceContentId, resource.variant])}`;
  const legacy = store.mappingRuns.filter((run) => run.contentCuriId === content?.curiId).at(-1);
  if (!["사회", "과학"].includes(context.options.subject)) context.options.subject = legacy?.result.content?.curriculumSubject || "";
  const official = getEligibleStandards(store.curriculumStandards, context.options.subject || null,
    candidateCourse(context.options.gradeBand) || context.options.gradeBand), proposals = new Map();
  const add = (id, proposal) => { if (official.some((item) => item.curiId === id)) proposals.set(id, proposal); };
  if (legacy) for (const candidate of legacy.result.selectedCandidates || legacy.result.candidateOptions || []) add(candidate.curriculumCuriId, {
    reference: { kind: "DRAFT", id: legacy.mappingRunId, version: hash(legacy.result) }, rationale: legacy.result.rationale || "",
    teachingUse: legacy.result.teachingUse || "", coreConcepts: legacy.result.coreConcepts || [], connectedParts: legacy.result.rationale || "", unconfirmedParts: "전체 기준 충족 여부·실제 영상의 적합성은 직접 확인해야 합니다.", legacyText: legacy.result.publicText });
  if (["사회", "과학"].includes(context.options.subject)) {
    const generated = createAutomaticEvidence(resource, context.standards, context.options);
    const saved = savedAutomatic(resource, filename);
    for (const evidence of generated.relations) {
      const old = saved.find((row) => row.evidence.standard.curriculumCuriId === evidence.standard.curriculumCuriId &&
        row.evidence.standard.evidenceHash === evidence.standard.evidenceHash && row.evidence.source.contentHash === source.contentHash && row.evidence.ruleVersion === evidence.ruleVersion);
      if (!proposals.has(evidence.standard.curriculumCuriId)) add(evidence.standard.curriculumCuriId, {
        reference: old ? { kind: "AUTO", id: old.id, version: hash(old.evidence) } : { kind: "CURRENT_SOURCE", id: null, version: hash([source.contentHash, evidence.standard.evidenceHash, evidence.ruleVersion, evidence.semantic, evidence.quotes]) },
        automatic: evidence, quotes: evidence.quotes, rationale: evidence.semantic.connectedParts.join("\n"), teachingUse: "", coreConcepts: evidence.matchedTerms,
        connectedParts: evidence.semantic.connectedParts.join("\n"), unconfirmedParts: evidence.semantic.unconfirmedParts.join("\n") });
    }
  }
  const prior = (store.relationReviews || []).filter((review) => review.source.sourceSystem === source.sourceSystem && review.source.sourceContentId === source.sourceContentId && review.source.variant === source.variant);
  const assets = store.verifiedAssets.filter((asset) => asset.content.sourceIdentity.sourceSystem === source.sourceSystem && asset.content.sourceIdentity.sourceContentId === source.sourceContentId && (asset.content.metadata.variant || "UNSPECIFIED") === source.variant);
  for (const id of [...prior.map((review) => review.curriculumCuriId), ...assets.map((asset) => asset.curriculumCuriId), ...(selected ? [selected.curiId] : [])]) {
    if (!proposals.has(id)) add(id, { reference: { kind: "CURRENT_SOURCE", id: null, version: source.contentHash } });
  }
  const relations = [...proposals].map(([id, proposal]) => {
    const standard = official.find((item) => item.curiId === id), snapshot = standardSnapshot(standard), key = relationKey(source, id), review = latestDecision(store, key);
    const legacyReviews = store.mappingRuns.filter((run) => run.contentCuriId === content?.curiId).flatMap((run) => (run.reviewHistory || []).filter((item) => item.result?.curriculumCuriIds?.includes(id)));
    const legacyAsset = assets.find((asset) => asset.curriculumCuriId === id), inherited = review || legacyAsset?.review || legacyReviews.at(-1);
    if (review?.reference.kind === "DRAFT" && !proposals.get(id).legacyText) proposal.reference = review.reference;
    const fields = fieldsFor(store, resource, proposal.reference), initial = inherited?.result || proposal;
    const textField = fields.synopsis ? "synopsis" : fields.draftText ? "draftText" : "title";
    const quote = initial.quotes?.[0] || { field: textField, start: 0, end: fields[textField].length, quote: fields[textField] };
    const defaults = { quote, rationale: initial.rationale || "", teachingUse: initial.teachingUse || "", coreConcepts: initial.coreConcepts || [],
      connectedParts: initial.connectedParts || proposal.connectedParts || "", unconfirmedParts: initial.unconfirmedParts || proposal.unconfirmedParts || "", coverage: initial.coverage || "PARTIAL" };
    const asset = assets.find((asset) => asset.curriculumCuriId === id) || null;
    const indexed = asset && store.searchProjection.some((item) => require("./search-index-contract").projectionMatches(item, asset));
    const indexRun = asset && (store.searchIndexRuns || []).findLast((run) => run.assetIds.includes(asset.verifiedAssetId));
    return { curriculumCuriId: id, relationKey: key, standard: standardEvidence(standard), standardSnapshot: snapshot,
      reference: proposal.reference, fields, automatic: proposal.automatic || null, legacyText: proposal.legacyText || null, defaults,
      expectedVersion: hash([source.contentHash, snapshot.evidenceHash, proposal.reference, review?.reviewId || null, legacyReviews.at(-1)?.reviewId || null]),
      latest: review ? { ...review, invalidReason: reviewValidity(review, store, resource) } : null,
      history: prior.filter((item) => item.relationKey === key), legacyReviews,
      asset, search: { state: !asset ? "NOT_SAVED" : indexed ? "READY" : indexRun?.status === "FAILED" ? "FAILED" : "PENDING", error: indexRun?.error || null } };
  }).sort((a, b) => Number(Boolean(b.latest?.invalidReason) || ["HELD", "CONFLICT"].includes(b.automatic?.semantic.status)) - Number(Boolean(a.latest?.invalidReason) || ["HELD", "CONFLICT"].includes(a.automatic?.semantic.status)));
  const eligibleIds = new Set(getEligibleStandards(store.curriculumStandards).map((item) => item.curiId));
  const archived = [...new Map(prior.filter((review) => !eligibleIds.has(review.curriculumCuriId)).map((review) => [review.relationKey, review])).values()]
    .map((review) => ({ ...review, invalidReason: reviewValidity(review, store, resource), history: prior.filter((item) => item.relationKey === review.relationKey) }));
  return { target, contentCuriId, source, contentMetadata: content?.metadata || { title: resource.title, synopsis: resource.synopsis, contentLevel: resource.kind, variant: resource.variant },
    subject: context.options.subject, gradeBand: context.options.gradeBand, relations, archived, standards: official.map(standardSnapshot), operator: "단일 운영자 세션 · 개인별 실명 인증 아님" };
}
module.exports = { buildHumanWorkspace };
