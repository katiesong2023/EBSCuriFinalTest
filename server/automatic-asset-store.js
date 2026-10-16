const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const assetPath = process.env.CURI_AUTOMATIC_DB || path.join(__dirname, "data/automatic-assets.sqlite");

function openAssetStore(filename = assetPath, create = true) {
  if (!create && !fs.existsSync(filename)) return null;
  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (version !== 0 && version !== 1) throw new Error(`지원하지 않는 자동 자산 DB 버전: ${version}`);
    if (version === 0) {
      transact(db, () => {
        if (db.prepare("PRAGMA user_version").get().user_version === 1) return;
        if (db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n) throw new Error("버전 없는 기존 DB를 자동 자산 저장소로 덮어쓸 수 없습니다.");
        db.exec(`
        CREATE TABLE sources (content_hash TEXT PRIMARY KEY, resource_key TEXT NOT NULL, snapshot TEXT NOT NULL);
        CREATE TABLE runs (id TEXT PRIMARY KEY, request_key TEXT NOT NULL, request TEXT NOT NULL,
          input_hash TEXT, source_hash TEXT REFERENCES sources(content_hash), state TEXT NOT NULL,
          started_at TEXT NOT NULL, finished_at TEXT, lease_until TEXT, retry_of TEXT REFERENCES runs(id),
          report TEXT, error TEXT);
        CREATE UNIQUE INDEX one_running_input ON runs(input_hash) WHERE state='RUNNING';
        CREATE INDEX run_requests ON runs(request_key, started_at);
        CREATE TABLE relations (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
          standard_id TEXT NOT NULL, evidence TEXT NOT NULL, UNIQUE(run_id, standard_id));
        CREATE TABLE assets (id TEXT PRIMARY KEY, relation_id TEXT NOT NULL REFERENCES relations(id),
          resource_key TEXT NOT NULL, standard_id TEXT NOT NULL, source_hash TEXT NOT NULL REFERENCES sources(content_hash),
          state TEXT NOT NULL, search_state TEXT NOT NULL, saved_at TEXT NOT NULL, reason TEXT, human_review_ref TEXT);
        CREATE INDEX assets_current ON assets(state, search_state);
        CREATE TABLE search_projection (asset_id TEXT PRIMARY KEY REFERENCES assets(id), payload TEXT NOT NULL, prepared_at TEXT NOT NULL);
        CREATE TABLE events (id INTEGER PRIMARY KEY, run_id TEXT REFERENCES runs(id), asset_id TEXT REFERENCES assets(id),
          type TEXT NOT NULL, reason TEXT, recorded_at TEXT NOT NULL);
        PRAGMA user_version=1;
        `);
      });
    }
    return db;
  } catch (error) { db.close(); throw error; }
}

function transact(db, action) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = action(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
function addEvent(db, type, { runId = null, assetId = null, reason = null, at = new Date().toISOString() } = {}) {
  db.prepare("INSERT INTO events(run_id,asset_id,type,reason,recorded_at) VALUES (?,?,?,?,?)").run(runId, assetId, type, reason, at);
}
function backupAssetStore(destination, filename = assetPath) {
  const db = openAssetStore(filename, false);
  if (!db) throw new Error("백업할 자동 자산 DB가 없습니다.");
  try { db.prepare("VACUUM INTO ?").run(destination); return { destination, schemaVersion: 1 }; }
  finally { db.close(); }
}
module.exports = { assetPath, openAssetStore, transact, addEvent, backupAssetStore };
