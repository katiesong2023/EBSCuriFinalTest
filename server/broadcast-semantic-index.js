const { overlapsFigurative } = require('./source-literal');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { createLocalEmbedder } = require('./local-embedding');
const { embeddingSpec } = require('./search-index-contract');
const indexFile = path.join(__dirname, 'data/broadcast-semantic-search.sqlite');
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceKey = item => sha([item.id, item.title, item.summary, item.evidenceUrl || item.sourceUrl]);
const specKey = sha([embeddingSpec, 'broadcast-passages-v1']);
let loaded, signature, embedder, idleTimer;
let tail = Promise.resolve(), waiting = 0;
const queryCache = new Map();
function indexRevision() {
  try { const stat=fs.statSync(indexFile); return `${stat.mtimeMs}:${stat.size}`; } catch { return "missing"; }
}
function readIndex() {
  if (!fs.existsSync(indexFile)) return null;
  const stat = fs.statSync(indexFile), current = `${stat.mtimeMs}:${stat.size}`;
  if (signature === current) return loaded;
  const db = new DatabaseSync(indexFile, { readOnly: true });
  try {
    if (db.prepare('SELECT value FROM metadata WHERE key=?').get('spec')?.value !== specKey) return null;
    loaded = db.prepare('SELECT * FROM passages').all().map(row => ({ ...row,
      vector: new Float32Array(row.vector.buffer.slice(row.vector.byteOffset, row.vector.byteOffset + row.vector.byteLength)) }));
    signature = current;
    return loaded;
  } finally { db.close(); }
}
async function embedQuery(query) {
  if (queryCache.has(query)) return queryCache.get(query);
  if (waiting >= 16) throw new Error('로컬 의미 검색 대기 상한');
  waiting++;
  const work = tail.then(async () => {
    clearTimeout(idleTimer);
    embedder ||= createLocalEmbedder({ timeoutMs: 8000 });
    try {
      const result = await embedder.embed(`query: ${query}`);
      if (result.truncated) throw new Error('질의 입력 상한');
      queryCache.set(query, result.vector);
      if (queryCache.size > 64) queryCache.delete(queryCache.keys().next().value);
      return result.vector;
    } finally {
      waiting--;
      idleTimer = setTimeout(async () => { const previous = embedder; embedder = null; await previous?.close(); }, 1000);
      idleTimer.unref();
    }
  });
  tail = work.catch(() => {});
  return work;
}
async function semanticCandidates(catalog, query) {
  const started = performance.now();
  try {
    const entries = catalog.liveSource ? readIndex() : null;
    if (!entries) return { matches: new Map(), status: 'INDEX_UNAVAILABLE', elapsedMs: 0 };
    const vector = await embedQuery(query);
    const current = new Map(catalog.resources.map(item => [item.id, sourceKey(item)]));
    const byId = new Map(catalog.resources.map(item => [item.id, item]));
    const best = new Map();
    for (const entry of entries) {
      if (current.get(entry.resource_id) !== entry.source_key) continue;
      if (overlapsFigurative(byId.get(entry.resource_id), {field:entry.field,start:entry.start,end:entry.end})) continue;
      let score = 0;
      for (let i=0; i<vector.length; i++) score += vector[i]*entry.vector[i];
      const previous = best.get(entry.resource_id);
      if (!previous || (entry.field === "summary" && previous.evidence.field === "title") || (entry.field === previous.evidence.field && score > previous.similarity)) best.set(entry.resource_id, { similarity: score,
        evidence: { field: entry.field, start: entry.start, end: entry.end, quote: entry.quote }, sourceKey: entry.source_key });
    }
    const selected = [...best.entries()].sort((a,b)=>b[1].similarity-a[1].similarity).slice(0, 80);
    return { matches: new Map(selected), status: 'LOCAL_E5', elapsedMs: Math.round(performance.now()-started) };
  } catch {
    return { matches: new Map(), status: 'LOCAL_FAILED', elapsedMs: Math.round(performance.now()-started) };
  }
}
module.exports = { indexFile, sourceKey, specKey, semanticCandidates, indexRevision };
