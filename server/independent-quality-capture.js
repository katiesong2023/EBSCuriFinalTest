const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { teacherCatalog } = require('./teacher-approvals');
const { readDataStore } = require('./data-store');
const { createEvidenceContextLoader } = require('./automatic-evidence-service');
const { validateAsset } = require('./automatic-asset-validity');
const { ruleVersion } = require('./automatic-relation-rules');
const { qualityVersion } = require('./source-text-quality');

const root = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const protectedFiles = ['server/data/broadcast-catalog.sqlite', 'server/data/automatic-assets.sqlite', 'server/data/curi-store.json'];
function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? entry.name === 'data' ? [] : filesUnder(filename) : [filename];
  });
}
function fileHashes(files) {
  return Object.fromEntries(files.map(filename => [filename, hash(fs.readFileSync(path.join(root, filename)))]));
}
function writeGzip(filename, value) {
  const data = Buffer.from(JSON.stringify(value));
  fs.writeFileSync(path.join(root, filename), zlib.gzipSync(data));
  return { path: filename, uncompressedSha256: hash(data), bytes: data.length };
}
async function readLinksWithoutMutation() {
  const db = new DatabaseSync(path.join(root, 'server/data/automatic-assets.sqlite'), { readOnly: true });
  try {
    const rows = db.prepare(`SELECT r.evidence,u.request,p.payload FROM assets a
      JOIN relations r ON r.id=a.relation_id JOIN runs u ON u.id=r.run_id
      JOIN search_projection p ON p.asset_id=a.id WHERE a.state='CURRENT' AND a.search_state='READY'`).all();
    const loadContext = createEvidenceContextLoader(), links = [];
    for (const row of rows) {
      const context = await loadContext(JSON.parse(row.request));
      if (validateAsset(JSON.parse(row.evidence), context).valid) links.push(JSON.parse(row.payload));
    }
    return links;
  } finally { db.close(); }
}
async function capture() {
  const target = path.join(root, 'docs/r09-02-frozen-input.json.gz');
  if (fs.existsSync(target)) throw new Error('고정 기준선은 덮어쓰지 않습니다.');
  const before = fileHashes(protectedFiles);
  const codeFiles = ['package.json', ...['server', 'public'].flatMap(folder => filesUnder(path.join(root, folder)))
    .filter(filename => /\.(?:js|mjs|css|html|py)$/.test(filename) && !filename.includes('independent-quality-'))
    .map(filename => path.relative(root, filename))];
  const code = Object.fromEntries(codeFiles.map(filename => [filename, fs.readFileSync(path.join(root, filename), 'utf8')]));
  const store = await readDataStore(), automaticLinks = await readLinksWithoutMutation();
  const raw = await loadDiscoveryCatalog();
  const catalog = await teacherCatalog({ ...raw, liveSource: false }, store, automaticLinks);
  // 판본은 이미 개별 resources에 확장되어 있으며 재생 시 다시 덧붙이지 않는다.
  catalog.searchVariants = [];
  const existingEvidenceFiles = [...filesUnder(path.join(root, 'docs')),
    ...filesUnder(path.join(root, 'server')).filter(filename => /check|queries|scenarios/.test(filename)),
    ...['teacher-queries.json', 'quality-workspace-queries.json', 'classroom-scenarios.json'].map(filename => path.join(root, 'server/data', filename))]
    .filter(filename => /\.(?:js|mjs|json|md)$/.test(filename) && !/r09-02|independent-quality/.test(filename));
  const evidenceText = existingEvidenceFiles.map(filename => fs.readFileSync(filename, 'utf8')).join('\n');
  const developmentIds = [...new Set(evidenceText.match(/BCAST-[a-z0-9]{20}/g) || [])];
  const after = fileHashes(protectedFiles);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('기준선 읽기 동안 원본 저장소가 변경되었습니다.');
  const createdAt = new Date().toISOString();
  const input = writeGzip('docs/r09-02-frozen-input.json.gz', { createdAt, catalog, store, automaticLinks, developmentIds });
  const source = writeGzip('docs/r09-02-frozen-code.json.gz', { createdAt, files: code });
  const manifest = { createdAt, phase: 'CAPTURED_BEFORE_PRODUCT_CHANGES', node: process.version,
    ruleVersion, qualityVersion, input, source, originalStoreHashes: before,
    codeHashes: Object.fromEntries(Object.entries(code).map(([filename, content]) => [filename, hash(content)])),
    counts: { resourcesIncludingVariants: catalog.resources.length, standards: store.curriculumStandards.length,
      currentHumanAssets: store.verifiedAssets.length, currentAutomaticLinks: automaticLinks.length, knownDevelopmentResources: developmentIds.length },
    constraints: { originalDatabasesWritten: false, paidCalls: 0, networkCalls: 0, teacherEvaluation: 'NOT_PERFORMED' } };
  fs.writeFileSync(path.join(root, 'docs/r09-02-capture.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ captured: true, counts: manifest.counts, originalDatabasesWritten: false }));
}
if (require.main === module) capture().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { capture, hash, writeGzip, fileHashes, readLinksWithoutMutation };
