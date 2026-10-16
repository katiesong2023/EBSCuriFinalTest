const fs = require('node:fs'), zlib = require('node:zlib'), crypto = require('node:crypto');
const { discoverTeacherContents } = require('./teacher-discovery');
const { searchTeacherWithModel } = require('./teacher-model-search');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { readDataStore } = require('./data-store');
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
async function main() {
  const baseline = JSON.parse(zlib.gunzipSync(fs.readFileSync('docs/r12-40-final.json.gz'))), rows = [];
  const hashes = () => Object.fromEntries(Object.keys(baseline.before).map(p => [p, sha(fs.readFileSync(p))]));
  if (JSON.stringify(hashes()) !== JSON.stringify(baseline.before)) throw Error('SOURCE_STORES_CHANGED');
  const catalog = await loadDiscoveryCatalog(), store = await readDataStore();
  const beforeBudget = JSON.parse(fs.readFileSync('docs/r12-40-llm-dollar-ledger.json')).chargedUpperUsd;
  const checkpoint = 'docs/r12-40-teacher-model-progress.json.gz';
  // 중단 후에도 완료된 질의는 재실행하지 않고 같은 코드 판본에서만 이어간다.
  const codeFiles = ['server/teacher-discovery.js', 'server/teacher-model-search.js', 'server/query-condition-contract.js', 'server/condition-source-review.js', 'server/condition-source-packets.js', 'server/request-ranking-context.js', 'server/supplement-search.js'];
  const codeHashes = Object.fromEntries(codeFiles.map(p => [p, sha(fs.readFileSync(p))]));
  if (fs.existsSync(checkpoint)) {
    const saved = JSON.parse(zlib.gunzipSync(fs.readFileSync(checkpoint)));
    if (JSON.stringify(saved.codeHashes) !== JSON.stringify(codeHashes)) throw Error('RUNTIME_CODE_CHANGED_SINCE_CHECKPOINT');
    rows.push(...saved.rows);
  }
  let paidCalls = rows.reduce((n, r) => n + (r.modelSearch?.paidCalls || 0), 0), cacheHits = rows.reduce((n, r) => n + (r.modelSearch?.cacheHits || 0), 0);
  for (const original of baseline.rows.slice(rows.length)) {
    const result = await discoverTeacherContents({ q: original.query }, catalog, store, { diagnostics: true, allowModelSearch: true,
      modelSearch: (q, c, options) => searchTeacherWithModel(q, c, { ...options, forceEnabled: true }) });
    const modelSearch = result.requestExecution?.modelSearch;
    paidCalls += modelSearch?.paidCalls || 0; cacheHits += modelSearch?.cacheHits || 0;
    rows.push({ set: original.set, id: original.id, query: original.query, total: result.total, returnedIds: result.diagnostics.teacher.groupedIds,
      modelSearch, emptyReason: result.emptyReason, candidateIds: [], top5: result.results.slice(0, 5) });
    if (rows.length % 10 === 0) {
      fs.writeFileSync(checkpoint, zlib.gzipSync(JSON.stringify({ codeHashes, beforeBudget, rows })));
      console.log(JSON.stringify({ queries: rows.length, nonempty: rows.filter(r => r.total).length, paidCalls, cacheHits, conservativeTotalUsd: JSON.parse(fs.readFileSync('docs/r12-40-llm-dollar-ledger.json')).chargedUpperUsd }));
    }
    if (modelSearch?.status === 'SEARCH_UNAVAILABLE') throw Error('RUNTIME_MODEL_UNAVAILABLE_' + rows.length);
  }
  if (JSON.stringify(hashes()) !== JSON.stringify(baseline.before)) throw Error('SOURCE_STORES_CHANGED');
  const ledger = JSON.parse(fs.readFileSync('docs/r12-40-llm-dollar-ledger.json'));
  if (ledger.pending.length || ledger.chargedUpperUsd > 2) throw Error('BUDGET_AUDIT_FAILED');
  const output = 'docs/r12-40-teacher-model-results.json.gz';
  fs.writeFileSync(output, zlib.gzipSync(JSON.stringify({ rows, before: baseline.before, after: hashes(), changedStores: [], inputs: baseline.inputs, catalogFingerprint: baseline.catalogFingerprint,
    codeHashes, paidCalls, cacheHits, beforeBudget, budget: ledger, incomplete: false, scope: '실제 교사 검색 함수·동일370·캐시는 실제 응답만/정답 라벨 미사용. 시험 중 명시적 모드로 실행하며 제품 정책 활성화는 별도.' })));
  console.log(JSON.stringify({ output, queries: rows.length, nonempty: rows.filter(r => r.total).length, paidCalls, cacheHits, totalConservativeUsd: ledger.chargedUpperUsd }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
