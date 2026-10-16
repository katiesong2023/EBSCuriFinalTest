const { randomUUID } = require("node:crypto");
const { fingerprint } = require("./data-quality");
const { openAssetStore, transact, addEvent } = require("./automatic-asset-store");
const { loadEvidenceContext, validateEvidenceInput } = require("./automatic-evidence-service");
const { createAutomaticEvidence, sourceSnapshot } = require("./automatic-evidence");
const { resourceKey, contextHash, validateAsset } = require("./automatic-asset-validity");
const { createAssetSearch } = require("./automatic-asset-search");

function recoverInterrupted(db, now) {
  for (const run of db.prepare("SELECT id FROM runs WHERE state='RUNNING' AND lease_until<=?").all(now)) {
    db.prepare("UPDATE runs SET state='INTERRUPTED',finished_at=?,error='PROCESS_INTERRUPTED' WHERE id=?").run(now, run.id);
    addEvent(db, "INTERRUPTED", { runId: run.id, at: now, reason: "PROCESS_INTERRUPTED" });
  }
}

function createAutomaticAssetService({ filename, loadContext = loadEvidenceContext,
  generate = createAutomaticEvidence, project, now = () => new Date() } = {}) {
  const search = createAssetSearch({ filename, loadContext, project });

  function history(runId) {
    const db = openAssetStore(filename, false);
    if (!db) return { schemaVersion: 1, runs: [], relations: [], assets: [], events: [] };
    try {
      const runs = runId ? db.prepare("SELECT * FROM runs WHERE id=?").all(runId) :
        db.prepare("SELECT * FROM runs ORDER BY started_at DESC,rowid DESC LIMIT 100").all();
      const selected = new Set(runs.map((run) => run.id));
      const relations = db.prepare("SELECT * FROM relations").all().filter((row) => selected.has(row.run_id));
      const ids = new Set(relations.map((row) => row.id));
      return { schemaVersion: 1,
        runs: runs.map((row) => ({ ...row, request: JSON.parse(row.request), report: row.report ? JSON.parse(row.report) : null })),
        relations: relations.map((row) => ({ ...row, evidence: JSON.parse(row.evidence) })),
        assets: db.prepare("SELECT * FROM assets").all().filter((row) => ids.has(row.relation_id)),
        events: db.prepare("SELECT * FROM events ORDER BY id").all().filter((row) => selected.has(row.run_id)) };
    } finally { db.close(); }
  }

  async function process(input) {
    validateEvidenceInput(input);
    const request = Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
    const requestKey = fingerprint(request), db = openAssetStore(filename), startedAt = now().toISOString();
    let runId, reused = false, reusableReport;
    try {
      let context, loadError;
      try { context = await loadContext(request); } catch (error) { loadError = error; }
      const inputHash = context ? contextHash(context) : null, source = context && sourceSnapshot(context.resource);
      transact(db, () => {
        recoverInterrupted(db, startedAt);
        const previous = db.prepare("SELECT * FROM runs WHERE request_key=? ORDER BY rowid DESC LIMIT 1").get(requestKey);
        if (previous?.error === "ASSET_SAVE_FAILED" && previous.input_hash === inputHash && previous.report) reusableReport = JSON.parse(previous.report);
        const invalidated = previous && db.prepare(`SELECT a.id FROM assets a JOIN relations r ON r.id=a.relation_id
          WHERE r.run_id=? AND a.state IN ('STALE','SUPERSEDED') LIMIT 1`).get(previous.id);
        if (previous && inputHash && previous.input_hash === inputHash && ["CHECKED", "HELD"].includes(previous.state) && !invalidated) {
          runId = previous.id; reused = true; return;
        }
        if (inputHash && db.prepare("SELECT id FROM runs WHERE input_hash=? AND state='RUNNING'").get(inputHash)) {
          const error = new Error("같은 버전의 자동 검사가 실행 중입니다. 잠시 후 상태를 확인하세요."); error.statusCode = 409; throw error;
        }
        runId = `AUTO-RUN-${randomUUID()}`;
        if (source) db.prepare("INSERT OR IGNORE INTO sources VALUES (?,?,?)").run(source.contentHash, resourceKey(source), JSON.stringify(source));
        db.prepare(`INSERT INTO runs(id,request_key,request,input_hash,source_hash,state,started_at,lease_until,retry_of)
          VALUES (?,?,?,?,?,'RUNNING',?,?,?)`).run(runId, requestKey, JSON.stringify(request), inputHash,
          source?.contentHash || null, startedAt, new Date(now().getTime() + 300000).toISOString(), previous?.id || null);
        addEvent(db, "STARTED", { runId, at: startedAt });
      });
      if (!reused) {
        let report, stage = "CHECK";
        try {
          if (loadError) throw loadError;
          report = reusableReport || await generate(context.resource, context.standards, { ...context.options, checkedAt: startedAt });
          const latest = await loadContext(request);
          stage = "SAVE";
          if (inputHash !== contextHash(latest)) {
            transact(db, () => {
              const run = db.prepare("SELECT state,lease_until FROM runs WHERE id=?").get(runId);
              if (run.state !== "RUNNING" || run.lease_until <= now().toISOString()) throw new Error("PROCESS_LEASE_EXPIRED");
              for (const [index, evidence] of report.relations.entries()) {
                db.prepare("INSERT INTO relations VALUES (?,?,?,?)").run(`${runId}:${index}`, runId, evidence.standard.curriculumCuriId, JSON.stringify(evidence));
              }
              db.prepare("UPDATE runs SET state='STALE',finished_at=?,report=?,error='INPUT_CHANGED_DURING_CHECK' WHERE id=?")
                .run(now().toISOString(), JSON.stringify({ ...report, persisted: true }), runId);
              addEvent(db, "STALE", { runId, reason: "INPUT_CHANGED_DURING_CHECK" });
            });
          } else {
            transact(db, () => {
              // 임대가 끝난 작업은 뒤늦게 완료되더라도 새 작업의 결과를 덮어쓰지 못한다.
              const run = db.prepare("SELECT state,lease_until FROM runs WHERE id=?").get(runId);
              if (run.state !== "RUNNING" || run.lease_until <= now().toISOString()) throw new Error("PROCESS_LEASE_EXPIRED");
              for (const [index, evidence] of report.relations.entries()) {
                const relationId = `${runId}:${index}`, standardId = evidence.standard.curriculumCuriId;
                db.prepare("INSERT INTO relations VALUES (?,?,?,?)").run(relationId, runId, standardId, JSON.stringify(evidence));
                if (!evidence.inspection.publicationEligible) continue;
                const validity = validateAsset(evidence, latest), key = resourceKey(source);
                const id = `AUTO-ASSET-${fingerprint([source.contentHash, evidence.standard.evidenceHash, evidence.ruleVersion, latest.options])}`;
                for (const old of db.prepare("SELECT id FROM assets WHERE resource_key=? AND standard_id=? AND state='CURRENT' AND id<>?").all(key, standardId, id)) {
                  db.prepare("UPDATE assets SET state='SUPERSEDED',search_state='INVALIDATED',reason='NEW_VERSION' WHERE id=?").run(old.id);
                  db.prepare("DELETE FROM search_projection WHERE asset_id=?").run(old.id);
                  addEvent(db, "SUPERSEDED", { assetId: old.id, runId, reason: "NEW_VERSION" });
                }
                // 같은 자산 버전의 재검사는 참조를 갱신한다. 이전 관계·실행·무효화 사건은 계속 보존한다.
                db.prepare(`INSERT INTO assets VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                  relation_id=excluded.relation_id,state=excluded.state,search_state=excluded.search_state,
                  saved_at=excluded.saved_at,reason=excluded.reason,human_review_ref=excluded.human_review_ref`).run(id, relationId, key, standardId,
                  source.contentHash, validity.valid ? "CURRENT" : "BLOCKED", validity.valid ? "PENDING" : "INVALIDATED",
                  now().toISOString(), validity.reason || null, validity.reviewId || null);
                addEvent(db, validity.valid ? "SAVED" : "BLOCKED", { runId, assetId: id, reason: validity.reason });
              }
              db.prepare("UPDATE runs SET state=?,finished_at=?,report=? WHERE id=? AND state='RUNNING'")
                .run(report.status, now().toISOString(), JSON.stringify({ ...report, persisted: true }), runId);
              addEvent(db, report.status, { runId });
            });
          }
        } catch (error) {
          transact(db, () => {
            const interrupted = error.message === "PROCESS_LEASE_EXPIRED";
            const state = interrupted ? "INTERRUPTED" : "FAILED";
            const reason = interrupted ? "PROCESS_LEASE_EXPIRED" : error.statusCode === 404 ? "SOURCE_NOT_FOUND" : stage === "SAVE" ? "ASSET_SAVE_FAILED" : "AUTOMATIC_CHECK_FAILED";
            const updated = db.prepare("UPDATE runs SET state=?,finished_at=?,error=?,report=? WHERE id=? AND state='RUNNING'")
              .run(state, now().toISOString(), reason, report ? JSON.stringify(report) : null, runId);
            if (updated.changes) addEvent(db, state, { runId, reason });
          });
        }
      }
    } finally { db.close(); }
    let searchPreparation;
    try { searchPreparation = await search.prepare(runId); }
    catch { searchPreparation = { status: "FAILED", reason: "SEARCH_PREPARATION_FAILED", retryRunId: runId }; }
    const result = history(runId);
    return { runId, reused, saveStatus: result.runs[0].state, searchPreparation, ...result };
  }
  return { process, history, prepare: search.prepare, readLinks: search.readLinks };
}

const automaticAssets = createAutomaticAssetService();
module.exports = { createAutomaticAssetService, automaticAssets };
