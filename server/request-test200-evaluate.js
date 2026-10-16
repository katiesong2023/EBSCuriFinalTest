// 사용자 제공200문장 고정 기준선. 참고 학년/주제/자료 유형을 검색 조건에 주입하지 않는다.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { discoverTeacherContents } = require('./teacher-discovery');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const root = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function hashes() {
  const paths = ['server/data/broadcast-catalog.sqlite', 'server/data/semantic-layer.sqlite',
    'server/data/automatic-assets.sqlite', 'server/data/broadcast-semantic-search.sqlite', 'server/data/curi-store.json',
    'public/grade-context.js', 'EBS_Curi_FINAL_PACKAGE_v1.4/curi-search-test-200.xlsx'];
  for (const name of await fs.readdir(__dirname)) if (name.endsWith('.js')) paths.push('server/' + name);
  return Object.fromEntries(await Promise.all(paths.map(async name => [name, sha(await fs.readFile(path.join(root, name)))])));
}
async function main() {
  const stage = process.argv[2];
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(stage || '')) throw Error('새 실행 이름을 입력하세요.');
  const output = path.join(root, `docs/r12-search-test-200-${stage}.json`);
  try { await fs.access(output); throw Error('고정 결과를 덮어쓸 수 없습니다.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const inputBytes = await fs.readFile(path.join(root, 'docs/r12-search-test-200-input.json'));
  const input = JSON.parse(inputBytes), before = await hashes();
  if (input.rows.length !== 200 || new Set(input.rows.map(r => r.id)).size !== 200 || input.rows.some(r => !r.query)) throw Error('200문장 입력을 확인하세요.');
  if (sha(await fs.readFile(path.join(root, input.source))) !== input.sourceSha256) throw Error('입력 엑셀이 변경됐습니다.');
  const catalog = await loadDiscoveryCatalog(), rows = [], startedAt = new Date().toISOString();
  for (const request of input.rows) {
    const start = performance.now();
    try {
      const api = await discoverTeacherContents({ q: request.query, workspace: 'teacher' }, catalog);
      rows.push({ request, total: api.total, latencyMs: Math.round(performance.now() - start), api, top5: api.results.slice(0, 5) });
    } catch (error) {
      rows.push({ request, total: null, latencyMs: Math.round(performance.now() - start), error: { name: error.name, message: error.message } });
    }
    if (rows.length % 20 === 0) console.log(stage, rows.length, '/200');
  }
  const after = await hashes();
  await fs.writeFile(output, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), stage,
    inputSha256: sha(inputBytes), inputSourceSha256: input.sourceSha256, sourceCatalogCount: catalog.resources.length,
    codeAndStoreBefore: before, codeAndStoreAfter: after,
    changedFiles: [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(name => before[name] !== after[name]),
    requestProvenance: '사용자 제공 테스트 문장. 실제 교사 요청 여부 미확인.',
    scope: '검색 문장 원문만 같은 교사 GET API의 내부 함수로 실행. 표의 학년/교과/기대 유형/정답을 검색 조건에 주입하지 않는다. 영상 재생/학년 적합성 검증 아님.',
    paidApiCalls: 0, rows }, null, 2) + '\n');
  console.log('SAVED', stage, 'errors', rows.filter(r => r.error).length, 'empty', rows.filter(r => r.total === 0).length,
    'top5', rows.reduce((n, r) => n + (r.top5?.length || 0), 0));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
