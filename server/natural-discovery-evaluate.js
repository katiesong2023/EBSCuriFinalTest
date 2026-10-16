const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { discoverTeacherContents } = require('./teacher-discovery');
async function main() {
  const inputs = JSON.parse(await fs.readFile('docs/r07-19-evaluation-inputs.json', 'utf8'));
  const catalog = await loadDiscoveryCatalog(), rows = [];
  const useSemantic = !process.argv.includes("--keywords-only");
  for (const request of inputs.rows) {
    const started = performance.now();
    const response = await discoverTeacherContents({ q: request.query }, catalog, undefined, { useSemantic });
    const top = [...response.results];
    for (let page = 2; page <= Math.min(3, response.pages); page++) {
      top.push(...(await discoverTeacherContents({ q: request.query, page: String(page) }, catalog, undefined, { useSemantic })).results);
    }
    rows.push({ id: request.id, split: request.split, query: request.query, total: response.total,
      latencyMs: Math.round(performance.now() - started), understanding: response.understanding,
      top20: top.slice(0, 20).map(item => ({ id: item.id, title: item.title, program: item.program,
        summary: item.summary, evidenceUrl: item.evidenceUrl, sourceQuality: item.sourceQuality,
        reason: item.relevanceReason, semanticRetrieval: item.semanticRetrieval, judgment: 'UNREVIEWED' })) });
  }
  const hash = text => crypto.createHash('sha256').update(text).digest('hex');
  const sorted = rows.map(row => row.latencyMs).sort((a,b) => a-b);
  const output = process.argv[2] || 'docs/r07-19-local-results.json';
  await fs.writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), inputsHash: hash(JSON.stringify(inputs.rows)),
    catalogHash: hash(JSON.stringify(catalog.resources.map(item => [item.id, item.title, item.summary]))),
    codeHashes: Object.fromEntries(await Promise.all(["natural-request.js","discovery-search.js","discovery-intent.js","discovery-request.js","teacher-discovery.js","broadcast-semantic-index.js"].map(async name=>[name,hash(await fs.readFile(`server/${name}`))]))),
    useSemantic, paidApiCalls: 0, independentHumanReview: false, precisionAt5: null, knownAnswerRecallAt20: null,
    metricLimit: '미판정 결과 수를 의미 관련성으로 환산하지 않는다. latency는 상위20자료 조회 전체 시간이며 첫 질의는 메모리 색인 준비를 포함한다.',
    latencyMs: { median: sorted[Math.floor(sorted.length/2)], p95: sorted[Math.floor(sorted.length*.95)] },
    rows }, null, 2)+'\n');
  console.log(output, rows.length, 'requests', 'empty', rows.filter(row=>!row.total).length);
}
main().catch(error => { console.error(error); process.exitCode=1; });
