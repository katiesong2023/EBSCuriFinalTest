// 고정된 시연 개발 문장을 실제 교사 검색 함수로 실행한다. 검색 엔진에 정답을 주입하지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { discoverTeacherContents } = require('./teacher-discovery');
const root = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fingerprints() {
  const stores = ['broadcast-catalog.sqlite', 'semantic-layer.sqlite', 'broadcast-semantic-search.sqlite', 'automatic-assets.sqlite', 'teacher-resources.sqlite', 'curi-store.json'];
  const frozen = globalThis.curiEvaluationCodeSnapshot?.files;
  const files = [...stores.map(name => `server/data/${name}`), ...(frozen ? [] : fs.readdirSync(__dirname).filter(name => name.endsWith('.js')).map(name => `server/${name}`))];
  return { ...Object.fromEntries(files.map(name => [name, sha(fs.readFileSync(path.join(root, name)))])), ...(frozen || {}) };
}
async function main() {
  const stage = process.argv[2] || 'final', modes = (process.argv[3] || 'original,compact,final').split(',');
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(stage) || modes.some(mode => !['original', 'compact', 'final'].includes(mode))) throw Error('실행 이름/입력 모드를 확인하세요.');
  const output = path.join(root, `docs/r12-38-demo-search-${stage}.json`);
  const checkpoint = output.replace(/\.json$/u, '.partial.json');
  if (fs.existsSync(output)) throw Error('고정 결과를 덮어쓸 수 없습니다. 새 실행 이름을 쓰세요.');
  const bytes = fs.readFileSync(path.join(root, 'docs/r12-38-demo-search-input.json'));
  const input = JSON.parse(bytes);
  if (input.rows.length !== 40 || new Set(input.rows.map(r => `${r.set}-${r.id}`)).size !== 40) throw Error('두 세트40개를 확인하세요.');
  const before = fingerprints(), startedAt = new Date().toISOString(), catalog = await loadDiscoveryCatalog(), rows = [];
  const retentionFile = process.argv[4];
  const retentionBaseline = retentionFile ? JSON.parse(fs.readFileSync(path.resolve(root, retentionFile))) : null;
  const reviewLabels = retentionFile ? JSON.parse(fs.readFileSync(path.join(root, 'docs/r12-38-demo-search-review-labels.json'))).labels : {};
  const reviewKey = (request, item) => `${request.set}-${request.id}:` + item.title.replace(/\((?:더빙|수어)\)/g, '') + ':' + sha(item.summary || '');
  for (const mode of modes) for (const request of input.rows) {
    const q = request[mode], started = performance.now();
    try {
      const api = await discoverTeacherContents({ q, workspace: 'teacher' }, catalog);
      const previous = retentionBaseline?.rows.find(row => row.mode === mode && row.set === request.set && row.id === request.id);
      const positives = (previous?.top5 || []).filter(item => reviewLabels[reviewKey(request, item)] === 2);
      const ranks = new Map(api.results.map((item, i) => [reviewKey(request, item), i + 1]));
      if (positives.some(item => !ranks.has(reviewKey(request, item)))) {
        for (let page = 2; page <= api.pages; page++) {
          const next = await discoverTeacherContents({ q, workspace: 'teacher', page: String(page) }, catalog);
          next.results.forEach((item, i) => ranks.set(reviewKey(request, item), (page - 1) * api.pageSize + i + 1));
          if (positives.every(item => ranks.has(reviewKey(request, item)))) break;
        }
      }
      const priorPositiveRetention = retentionBaseline ? positives.map(item => {
        const rank = ranks.get(reviewKey(request, item));
        return { id: item.id, title: item.title, rank: rank || null, status: rank ? rank <= 5 ? 'TOP5' : 'LATER_RANK' : 'NOT_RETURNED' };
      }) : undefined;
      rows.push({ set: request.set, id: request.id, mode, original: request.original, q, total: api.total, ms: Math.round(performance.now() - started), terms: api.terms, understanding: api.understanding, top5: api.results.slice(0, 5), priorPositiveRetention });
    } catch (error) {
      rows.push({ set: request.set, id: request.id, mode, original: request.original, q, error: error.message });
    }
    if (request.id % 10 === 0) {
      fs.writeFileSync(checkpoint, JSON.stringify({ stage, startedAt, inputSha256: sha(bytes), before, completed: rows.length, rows }) + '\n');
      console.log(mode, request.set, request.id);
    }
  }
  const after = fingerprints();
  const changedDuringRun = Object.keys(before).filter(name => before[name] !== after[name]);
  const result = { stage, startedAt, finishedAt: new Date().toISOString(), scope: '동일 교사 검색 내부 함수·로컬 카탈로그. 실제 HTTP/UI/재생 또는 교사 효용 검증은 아님.', inputSha256: sha(bytes), catalogCount: catalog.resources.length, codeSnapshot: globalThis.curiEvaluationCodeSnapshot || null, before, after, changedDuringRun, paidApiCalls: 0, rows };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  fs.rmSync(checkpoint, { force: true });
  console.log(JSON.stringify({ output, changedDuringRun, metrics: modes.flatMap(mode => [1, 2].map(set => { const list = rows.filter(r => r.mode === mode && r.set === set); return { mode, set, nonempty: list.filter(r => r.total > 0).length, errors: list.filter(r => r.error).length, top5: list.reduce((n, r) => n + (r.top5?.length || 0), 0) }; })) }, null, 2));
  if (changedDuringRun.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
