const { openAssetStore, transact, addEvent } = require("./automatic-asset-store");
const { loadEvidenceContext, createEvidenceContextLoader } = require("./automatic-evidence-service");
const { validateAsset, publicAsset } = require("./automatic-asset-validity");

const assetRows = `SELECT a.*, r.evidence, u.request, u.id run_id FROM assets a
  JOIN relations r ON r.id=a.relation_id JOIN runs u ON u.id=r.run_id`;

function invalidate(db, asset, validity) {
  transact(db, () => {
    db.prepare("UPDATE assets SET state=?,search_state='INVALIDATED',reason=?,human_review_ref=? WHERE id=?")
      .run(validity.reviewId ? "BLOCKED" : "STALE", validity.reason, validity.reviewId || null, asset.id);
    db.prepare("DELETE FROM search_projection WHERE asset_id=?").run(asset.id);
    addEvent(db, "INVALIDATED", { assetId: asset.id, runId: asset.run_id, reason: validity.reason });
  });
}

function createAssetSearch({ filename, loadContext = loadEvidenceContext, project = publicAsset } = {}) {
  async function check(db, asset, contexts, loader) {
    const request = JSON.parse(asset.request), key = JSON.stringify(request);
    if (!contexts.has(key)) contexts.set(key, loader(request));
    try {
      const context = await contexts.get(key);
      const validity = validateAsset(JSON.parse(asset.evidence), context);
      if (!validity.valid) invalidate(db, asset, validity);
      return validity.valid;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 409) invalidate(db, asset, { reason: "SOURCE_UNAVAILABLE" });
      // 일시적인 원본 읽기 실패는 이력을 무효화하지 않지만 현재 응답에서 제외한다.
      return false;
    }
  }

  async function prepare(runId) {
    const db = openAssetStore(filename), contexts = new Map();
    const loader = loadContext === loadEvidenceContext ? createEvidenceContextLoader() : loadContext;
    try {
      const run = typeof runId === "string" && db.prepare("SELECT * FROM runs WHERE id=?").get(runId);
      if (!run) {
        const error = new Error("자동 실행을 찾지 못했습니다."); error.statusCode = 404; throw error;
      }
      if (!["CHECKED", "HELD"].includes(run.state)) return { status: "NOT_REQUESTED", reason: run.state, ready: 0, failed: 0, invalidated: 0 };
      const assets = db.prepare(`${assetRows} WHERE u.id=?`).all(runId);
      const result = { ready: 0, failed: 0, invalidated: 0 };
      for (const asset of assets) {
        if (asset.state !== "CURRENT" || !await check(db, asset, contexts, loader)) { result.invalidated += 1; continue; }
        try {
          const payload = project(asset, JSON.parse(asset.evidence));
          transact(db, () => {
            db.prepare("INSERT OR REPLACE INTO search_projection VALUES (?,?,?)").run(asset.id, JSON.stringify(payload), new Date().toISOString());
            db.prepare("UPDATE assets SET search_state='READY',reason=NULL WHERE id=?").run(asset.id);
            addEvent(db, "SEARCH_READY", { assetId: asset.id, runId });
          });
          result.ready += 1;
        } catch {
          transact(db, () => {
            db.prepare("DELETE FROM search_projection WHERE asset_id=?").run(asset.id);
            db.prepare("UPDATE assets SET search_state='FAILED',reason='SEARCH_PREPARATION_FAILED' WHERE id=?").run(asset.id);
            addEvent(db, "SEARCH_FAILED", { assetId: asset.id, runId, reason: "SEARCH_PREPARATION_FAILED" });
          });
          result.failed += 1;
        }
      }
      return { status: result.failed ? "FAILED" : result.invalidated ? "RECHECK_REQUIRED" : "READY", ...result };
    } finally { db.close(); }
  }

  async function readLinks() {
    const db = openAssetStore(filename, false);
    if (!db) return [];
    try {
      const rows = db.prepare(`${assetRows} WHERE a.state='CURRENT'`).all();
      const contexts = new Map(), links = [];
      const loader = loadContext === loadEvidenceContext ? createEvidenceContextLoader() : loadContext;
      for (const row of rows) {
        if (!await check(db, row, contexts, loader) || row.search_state !== "READY") continue;
        const projection = db.prepare("SELECT payload FROM search_projection WHERE asset_id=?").get(row.id);
        if (projection) links.push(JSON.parse(projection.payload));
      }
      return links;
    } finally { db.close(); }
  }
  return { prepare, readLinks };
}
module.exports = { createAssetSearch, assetRows };
