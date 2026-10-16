// 기존370 원문과 원천 판본을 고정해 단계별 탈락과 상위 결과를 비교한다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const zlib = require('node:zlib');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const stage = process.argv[2];
if (!/^[a-z][a-z0-9-]{0,30}$/.test(stage || '')) throw Error('실행 이름이 필요합니다.');
const output = `docs/r12-40-${stage}.json.gz`;
if (fs.existsSync(output)) throw Error('기준선을 덮어쓰지 않습니다.');
const codeDir = process.env.CURI_EVAL_CODE_DIR || __dirname;
const snapshot = new Map(fs.readdirSync(codeDir).filter(n => n.endsWith('.js')).map(n => [path.join(__dirname, n), fs.readFileSync(path.join(codeDir, n), 'utf8')]));
const loader = Module._extensions['.js'];
Module._extensions['.js'] = (module, filename) => snapshot.has(filename) ? module._compile(snapshot.get(filename), filename) : loader(module, filename);
const { discoverTeacherContents } = require('./teacher-discovery');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { teacherCatalog } = require('./teacher-approvals');
const inputPaths = ['docs/r12-search-test-200-input.json', 'docs/r12-03-common-stable170.json'];
const inputs = inputPaths.map(p => ({ path: p, sha256: sha(fs.readFileSync(p)), data: JSON.parse(fs.readFileSync(p)) }));
const requests = [...inputs[0].data.rows.map(r => ({ ...r, set: 'new200' })), ...inputs[1].data.rows.map(r => ({ ...r.request, set: 'previous170' }))];
const stores = ['broadcast-catalog.sqlite', 'semantic-layer.sqlite', 'automatic-assets.sqlite', 'broadcast-semantic-search.sqlite', 'curi-store.json', 'description-patches.json'].map(n => 'server/data/' + n).filter(p => fs.existsSync(p));
const hashes = () => Object.fromEntries(stores.map(p => [p, sha(fs.readFileSync(p))]));
async function main() {
  const startedAt = new Date().toISOString(), before = hashes();
  const catalog = await loadDiscoveryCatalog(), expanded = await teacherCatalog(catalog);
  const catalogFingerprint = sha(JSON.stringify(expanded.resources.map(r => ({ id: r.id, title: r.title, program: r.program, summary: r.summary, kind: r.kind, sourceSupplements: r.sourceSupplements }))));
  const rows = [];
  for (const request of requests) {
    const started = performance.now();
    try {
      const api = await discoverTeacherContents({ q: request.query, workspace: 'teacher' }, catalog, undefined, { diagnostics: true });
      rows.push({ set: request.set, id: request.id, query: request.query, total: api.total, terms: api.terms, understanding: api.understanding,
        retrieval: api.retrieval, emptyReason: api.emptyReason, diagnostics: api.diagnostics, latencyMs: Math.round(performance.now() - started),
        top5: api.results.slice(0, 5).map(r => ({ id: r.id, title: r.title, program: r.program, kind: r.kind, summary: r.summary, sourceUrl: r.sourceUrl,
          sourceSupplements: r.sourceSupplements, searchExplanation: r.searchExplanation, contentContext: r.contentContext, relevanceEvidence: r.relevanceEvidence, meaningMatches: r.meaningMatches, semanticRetrieval: r.semanticRetrieval, sourcePredicateEvidence: r.sourcePredicateEvidence })) });
    } catch (e) { rows.push({ set: request.set, id: request.id, query: request.query, error: e.message }); }
    if (rows.length % 20 === 0) {
      fs.writeFileSync('/private/tmp/r12-40-' + stage + '-partial.json', JSON.stringify({ completed: rows.length, rows }));
      console.log(stage, rows.length + '/370', 'heapMB', Math.round(process.memoryUsage().heapUsed / 1024 / 1024));
    }
  }
  const after = hashes();
  const counts = Object.fromEntries(['new200', 'previous170'].map(set => { const list = rows.filter(r => r.set === set); return [set, { queries: list.length, nonempty: list.filter(r => r.total > 0).length, empty: list.filter(r => r.total === 0).length, errors: list.filter(r => r.error).length }]; }));
  const report = { stage, startedAt, finishedAt: new Date().toISOString(), inputs: inputs.map(({ path, sha256 }) => ({ path, sha256 })),
    sourceCatalogCount: catalog.resources.length, expandedCount: expanded.resources.length, catalogFingerprint, before, after,
    changedStores: stores.filter(p => before[p] !== after[p]), runtimeCode: Object.fromEntries([...snapshot].map(([p, s]) => [path.relative(process.cwd(), p), sha(s)])),
    paidApiCalls: 0, counts, rows, scope: '기존370 원문. 기대 주제/학년/유형은 검색 입력에 주입하지 않음. 원문 기반 에이전트 평가와 사람/영상 적합성은 별도.' };
  fs.writeFileSync(output, zlib.gzipSync(JSON.stringify(report)));
  console.log(JSON.stringify({ output, counts, changedStores: report.changedStores, catalogFingerprint }));
  if (rows.some(r => r.error) || report.changedStores.length) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
