const { openAssetStore } = require("./automatic-asset-store");
const { automaticAssets } = require("./automatic-assets");
const { loadEvidenceContext } = require("./automatic-evidence-service");
const { sourceSnapshot, standardSnapshot } = require("./automatic-evidence");
const { fingerprint, getEligibleStandards } = require("./data-quality");
const { ruleVersion } = require("./automatic-relation-rules");

// 관리 집계는 최근 100개 이력 API의 페이지 제한에 의존하지 않는다.
async function readAutomaticAdminState(store, base, { filename, refresh = automaticAssets.readLinks } = {}) {
  await refresh();
  const db = openAssetStore(filename, false), byResource = new Map();
  if (!db) return { byResource, totals: { runs: 0, relations: 0, assets: 0 } };
  try {
    const runs = db.prepare("SELECT rowid sequence,* FROM runs ORDER BY rowid").all();
    const assets = db.prepare("SELECT * FROM assets").all();
    const totals = { runs: runs.length, relations: db.prepare("SELECT count(*) n FROM relations").get().n, assets: assets.length };
    const contents = new Map(store.contents.map((content) => [content.curiId, content]));
    for (const row of runs) {
      const request = JSON.parse(row.request), report = row.report ? JSON.parse(row.report) : null;
      const id = request.resourceId || contents.get(request.contentCuriId)?.sourceIdentity.sourceContentId || report?.source.sourceContentId || request.contentCuriId;
      if (!id) continue;
      if (!byResource.has(id)) byResource.set(id, { history: [], latest: new Map() });
      const entry = byResource.get(id);
      const content = contents.get(request.contentCuriId) || store.contents.find((item) => item.sourceIdentity.sourceContentId === id);
      const scope = `${report?.scope.requestedSubject || request.subject || content?.metadata.subjectSeed || ""}:${report?.scope.requestedGradeBand || request.gradeBand || content?.metadata.gradeBandSeed || "5~6학년군"}`;
      const run = { ...row, request, report, subject: report?.scope.requestedSubject || request.subject || "",
        assets: assets.filter((asset) => asset.relation_id.startsWith(`${row.id}:`)) };
      entry.history.push(run); entry.latest.set(scope, run);
    }
    for (const entry of byResource.values()) {
      entry.latest = [...entry.latest.values()];
      for (const run of entry.latest) {
        let context;
        try { context = await loadEvidenceContext(run.request, store, base.resources); } catch { /* 삭제·식별 중복도 변경 예외로 남긴다. */ }
        const sourceChanged = Boolean(run.report && (!context || run.report.source.contentHash !== sourceSnapshot(context.resource).contentHash));
        run.currentReasons = sourceChanged ? ["SOURCE_CHANGED"] : [];
        if (run.report && run.report.scope.version !== ruleVersion) run.currentReasons.push("RULE_CHANGED");
        if (run.state === "STALE") run.currentReasons.push(run.error || "INPUT_CHANGED_DURING_CHECK");
        run.relations = (run.report?.relations || []).map((evidence, index) => {
          const relationId = `${run.id}:${index}`, asset = run.assets.find((item) => item.relation_id === relationId);
          const standard = context?.standards.find((item) => item.curiId === evidence.standard.curriculumCuriId);
          const reasons = [...run.currentReasons];
          if (!standard || fingerprint(standardSnapshot(standard)) !== fingerprint(evidence.standard) || !getEligibleStandards([standard]).length) reasons.push("STANDARD_CHANGED");
          if (asset?.state === "STALE" && !reasons.includes(asset.reason)) reasons.push(asset.reason);
          return { relationId, evidence, persisted: !["FAILED", "RUNNING", "INTERRUPTED"].includes(run.state), asset: asset || null, currentReasons: reasons,
            currentStandard: standard ? standardSnapshot(standard) : null };
        });
        if (run.state === "RUNNING" && run.lease_until <= new Date().toISOString()) run.displayState = "INTERRUPTED";
        else run.displayState = run.state;
      }
    }
    return { byResource, totals };
  } finally { db.close(); }
}

function automaticSummary(entry) {
  const runs = entry?.latest || [], relations = runs.flatMap((run) => run.relations || []), assets = runs.flatMap((run) => run.assets || []);
  const changed = runs.some((run) => run.currentReasons?.length) || relations.some((relation) => relation.currentReasons.length);
  const current = relations.filter((relation) => !relation.currentReasons.length);
  return { processed: Boolean(runs.length), runCount: entry?.history.length || 0, latestRunCount: runs.length,
    relationCount: relations.length, changedRelations: relations.filter((relation) => relation.currentReasons.length).length,
    affectedStandards: [...new Set(relations.filter((relation) => relation.currentReasons.length || relation.asset?.state === "BLOCKED" || ["FAILED", "PENDING"].includes(relation.asset?.search_state) || relation.evidence.inspection.status !== "PASS" || !relation.evidence.inspection.publicationEligible)
      .map((relation) => relation.evidence.standard.standardId))],
    changed, running: runs.some((run) => run.displayState === "RUNNING"),
    failed: runs.some((run) => ["FAILED", "INTERRUPTED"].includes(run.displayState)),
    searchFailed: assets.some((asset) => asset.state === "CURRENT" && asset.search_state === "FAILED"),
    searchPending: assets.some((asset) => asset.state === "CURRENT" && asset.search_state === "PENDING"),
    blocked: assets.some((asset) => asset.state === "BLOCKED"),
    passed: current.filter((relation) => relation.persisted !== false && relation.asset?.state !== "BLOCKED" && relation.evidence.inspection.publicationEligible).length,
    published: assets.filter((asset) => asset.state === "CURRENT" && asset.search_state === "READY").length,
    inspectionFailed: current.filter((relation) => relation.evidence.inspection.status === "FAIL").length,
    citationFailed: current.some((relation) => relation.evidence.inspection.checks.some((check) => check.code.startsWith("QUOTE_") && check.status === "FAIL")),
    conflict: current.some((relation) => relation.evidence.semantic.status === "CONFLICT"),
    unsupported: current.some((relation) => relation.evidence.semantic.status === "UNSUPPORTED"),
    held: runs.some((run) => run.displayState === "HELD") || current.some((relation) => ["HELD", "CONFLICT", "UNSUPPORTED"].includes(relation.evidence.semantic.status) || relation.evidence.inspection.status === "HELD"),
    lastCheckedAt: runs.map((run) => run.finished_at || run.started_at).sort().at(-1) || null,
    latestRunId: runs.at(-1)?.id || null };
}

module.exports = { readAutomaticAdminState, automaticSummary };
