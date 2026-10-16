// R09 기술 검사: 고정 카탈로그·원문 오프셋·저장 재생성. 관련성 라벨은 사람이 별도 기록한다.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { gunzipSync } = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');
const { loadDiscoveryCatalog, catalogPaths } = require('./discovery-catalog');
const { discoverContents } = require('./discovery-search');
const { tagResource, getSemanticIndex, concepts, hash, ruleVersion } = require('./semantic-layer');
const { buildSemanticStore } = require('./semantic-build');
const root = path.resolve(__dirname, '..');
const args = new Map(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const snapshotPath = args.get('catalog') || path.join(__dirname, 'data/quality-catalog-20260930.json.gz');
const codeNames = ['discovery-search.js', 'discovery-intent.js', 'discovery-request.js', 'semantic-layer.js', 'semantic-context.js', 'semantic-build.js'];
async function main() {
  const originalFetch = global.fetch, originalConnect = net.Socket.prototype.connect;
  let networkAttempts = 0;
  const block = () => { networkAttempts++; throw new Error('R09 오프라인 검사 중 네트워크 금지'); };
  global.fetch = block; net.Socket.prototype.connect = block;
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'curi-semantic-quality-'));
  try {
    const approvalBefore = hash(await fs.readFile(catalogPaths.store));
    const codeHashes = Object.fromEntries(await Promise.all(codeNames.map(async name => [name, hash(await fs.readFile(path.join(__dirname, name)))])));
    const snapshotBytes = await fs.readFile(snapshotPath);
    const catalogBytes = snapshotPath.endsWith('.gz') ? gunzipSync(snapshotBytes) : snapshotBytes;
    const catalog = JSON.parse(catalogBytes);
    const cases = [];
    async function check(name, operation) { const detail = await operation(); cases.push({ name, passed: true, detail }); }
    const index = getSemanticIndex(catalog);
    await check('전체 자료 원문 태그의 구절·필드·지문·출처 및 추론 후보 분리', () => {
      let mentions = 0, inferred = 0;
      for (const resource of catalog.resources) {
        const row = index.get(resource.id);
        assert.equal(row.contentHash, tagResource(resource).contentHash);
        for (const tag of [...row.supported, ...row.candidates]) {
          const e = tag.evidence;
          assert.ok(['title', 'summary'].includes(e.field));
          assert.equal(resource[e.field].slice(e.start, e.end), e.quote);
          assert.equal(e.contentHash, row.contentHash);
          assert.equal(e.sourceUrl, e.field === 'title' ? resource.sourceUrl : resource.evidenceUrl || resource.sourceUrl);
          assert.equal(tag.ruleVersion, ruleVersion);
        }
        assert.ok(row.supported.every(t => t.status === 'SOURCE_MENTION'));
        assert.ok(row.candidates.every(t => t.status === 'INFERRED_CANDIDATE'));
        assert.equal(resource.curriculumStatus, 'NOT_ASSESSED');
        mentions += row.supported.length; inferred += row.candidates.length;
      }
      return { resources: index.size, mentions, inferred };
    });
    const dump = filename => {
      const db = new DatabaseSync(filename, { readOnly: true });
      try {
        assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        return { resources: db.prepare('SELECT * FROM resources ORDER BY id').all(),
          concepts: db.prepare('SELECT * FROM concepts ORDER BY id').all(),
          tags: db.prepare('SELECT * FROM tags ORDER BY resource_id,concept_id,status,from_concept_id').all() };
      } finally { db.close(); }
    };
    const firstPath = path.join(temporary, 'semantic.sqlite');
    const options = { filename: firstPath, reportFilename: path.join(temporary, 'build.json') };
    const first = await buildSemanticStore(catalog, options);
    const rows = dump(firstPath);
    await check('현재 디스크 시맨틱 DB는 고정 카탈로그와 동일', () => {
      assert.deepEqual(dump(path.join(__dirname, 'data/semantic-layer.sqlite')), rows);
      return { buildId: first.buildId, tagRowsHash: hash(JSON.stringify(rows)), foreignKeyErrors: 0 };
    });
    await check('같은 스냅샷 재생성의 buildId·전체 태그 행 일치', async () => {
      const second = await buildSemanticStore(catalog, options);
      assert.equal(second.buildId, first.buildId); assert.deepEqual(dump(firstPath), rows);
      return { buildId: second.buildId };
    });
    await check('변경 원문으로 저장 재생성 시 이전 태그·근거 무효화', async () => {
      const fixture = { resources: [{ id: 'CHANGE', title: '우주', summary: '', sourceUrl: 'https://www.ebs.co.kr/test' }] };
      const before = await buildSemanticStore(fixture, options);
      const oldHash = dump(firstPath).resources[0].content_hash;
      const changed = { resources: [{ ...fixture.resources[0], title: '면역' }] };
      const after = await buildSemanticStore(changed, options);
      const current = dump(firstPath);
      assert.notEqual(before.buildId, after.buildId); assert.notEqual(oldHash, current.resources[0].content_hash);
      assert.ok(current.tags.every(t => t.concept_id !== 'space'));
      assert.ok(current.tags.some(t => t.concept_id === 'immunity' && t.quote === '면역'));
      return { before: before.buildId, after: after.buildId, productionStoreChanged: false };
    });
    const regression = [];
    for (const q of ['설악산 또는 김제', '해안 지형 제외하고 우주', '김제 5분 이내']) {
      const r = await discoverContents({ q }, catalog);
      assert.ok(r.total > 0);
      if (q.includes('5분')) { assert.deepEqual(r.terms, ['김제']); assert.ok(r.understanding.warnings.some(w => w.includes('재생시간'))); }
      if (q.includes('제외')) { assert.deepEqual(r.understanding.excluded, ['해안 지형']); assert.equal(r.concepts.length, 0); }
      regression.push({ query: q, total: r.total, terms: r.terms, understanding: r.understanding, resultIds: r.results.map(i => i.id) });
    }
    await check('지정 세 질의의 실제 고정 카탈로그 후보·제외·시간 안내', () => ({ queries: regression.length }));
    await check('동고서저 기존 연결 자료는 모든 페이지에서 보존', async () => {
      const first = await discoverContents({ q: '동고서저' }, catalog);
      const items = [...first.results];
      for (let page = 2; page <= first.pages; page++) items.push(...(await discoverContents({ q: '동고서저', page }, catalog)).results);
      for (const id of ['GEO-SEORAK', 'GEO-GIMJE', 'ECLIP-046']) assert.ok(items.some(i => i.id === id), id);
      return { total: first.total, pages: first.pages, firstPageAssumption: false };
    });
    await check('유형·프로그램·개별 링크·페이지 경계·빈 결과 회귀', async () => {
      const all = await discoverContents({}, catalog);
      assert.equal(all.total, catalog.stats.individual);
      const last = await discoverContents({ page: String(all.pages) }, catalog);
      assert.equal(new Set([...all.results, ...last.results].map(i => i.id)).size, all.results.length + last.results.length);
      assert.equal((await discoverContents({ page: '99999' }, catalog)).page, all.pages);
      assert.equal((await discoverContents({ kind: 'collection' }, catalog)).total, catalog.stats.collections);
      assert.equal((await discoverContents({ q: '양자중력' }, catalog)).total, 0);
      const direct = await discoverContents({ q: '우주', access: 'direct' }, catalog);
      assert.ok(direct.results.every(i => i.navigation.status === 'MATCHED'));
      const program = await discoverContents({ q: '우주', program: '지식채널e' }, catalog);
      assert.ok(program.results.every(i => i.program === '지식채널e'));
      for (const input of [{ kind: 'bad' }, { page: '-1' }, { q: 'x'.repeat(201) }]) await assert.rejects(discoverContents(input, catalog));
      return { pages: all.pages, directSpaceCandidates: direct.total };
    });
    // 이전 개발 질문을 재사용한다. 독립 최종 평가로 해석하지 않는다.
    const scenarios = JSON.parse(await fs.readFile(path.join(root, 'docs/subject-simulation.json'))).rows;
    const sampleKeywords = new Set(['동고서저', '민주주의', '다문화', '고인돌', '생태', '기후 변화', '인체', '우주']);
    const scenarioRows = [];
    for (const row of scenarios) {
      const started = performance.now();
      const result = await discoverContents({ q: row.query }, catalog);
      const keyword = await discoverContents({ q: row.keyword }, catalog);
      const direct = await discoverContents({ q: row.keyword, access: 'direct' }, catalog);
      scenarioRows.push({ id: row.id, subject: row.subject, keyword: row.keyword, query: row.query, use: 'DEVELOPMENT_RECHECK',
        requestTotal: result.total, keywordTotal: keyword.total, directTotal: direct.total,
        terms: result.terms, warnings: result.understanding.warnings,
        elapsedMs: +(performance.now() - started).toFixed(2),
        topProgramShare: result.results.length ? Math.max(...Object.values(result.results.reduce((counts, i) => { counts[i.program] = (counts[i.program] || 0) + 1; return counts; }, {}))) / result.results.length : null,
        sourceAuditSelected: sampleKeywords.has(row.keyword) && (row.keyword !== '기후 변화' || row.subject === '과학'),
        top: result.results.slice(0, 3).map((i, rank) => ({ rank: rank + 1, id: i.id, title: i.title, summary: i.summary,
          program: i.program, url: i.navigation.url, evidenceUrl: i.evidenceUrl, evidenceLevel: i.evidenceLevel,
          linkStatus: i.navigation.status, sourceMentions: i.semanticTags, reason: i.reason,
          curriculumStatus: i.curriculumStatus, playbackStatus: i.playbackStatus })) });
    }
    const summary = Object.fromEntries(['사회', '과학'].map(subject => {
      const rows = scenarioRows.filter(r => r.subject === subject);
      return [subject, { scenarios: rows.length, requestsWithCandidates: rows.filter(r => r.requestTotal).length,
        keywordsWithCandidates: rows.filter(r => r.keywordTotal).length, emptyRequests: rows.filter(r => !r.requestTotal).map(r => r.query) }];
    }));
    const approvalAfter = hash(await fs.readFile(catalogPaths.store));
    assert.equal(approvalAfter, approvalBefore); assert.equal(networkAttempts, 0);
    for (const name of codeNames) assert.equal(hash(await fs.readFile(path.join(__dirname, name))), codeHashes[name]);
    const liveCatalog = await loadDiscoveryCatalog();
    const report = { generatedAt: new Date().toISOString(), method: '고정 실데이터에서 24개 개발 가상 요청을 문장·핵심어·개별 링크 조건으로 재검사. 관련성과 원문 접근은 별도 표본 기록.',
      snapshotPath, snapshotSha256: hash(catalogBytes), codeHashes, ruleVersion, catalog: catalog.stats,
      liveCatalogMatchesSnapshot: hash(JSON.stringify(liveCatalog)) === hash(catalogBytes),
      cases, technicalChecksPassed: cases.length, persistedBuild: first, summary, regression, rows: scenarioRows,
      approvalSha256Before: approvalBefore, approvalSha256After: approvalAfter, approvalUnchanged: true, networkAttempts, paidApiCalls: 0,
      limits: ['가상 개발 질문이며 실제 교사 요청·독립 최종 성능 평가가 아니다.', '원문 태그는 표현의 존재 확인이며 요청한 관계·방법·설명 충족의 보장이 아니다.', '학년·교육과정 적합성과 재생·자막·시간은 미확인.'] };
    await fs.writeFile(process.env.CURI_REPORT_PATH || path.join(root, 'docs/r4-quality-check.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ technicalChecksPassed: cases.length, summary, approvalUnchanged: true, networkAttempts }, null, 2));
  } finally { global.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; await fs.rm(temporary, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
