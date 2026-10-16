// 고정 공개 카탈로그의 새 표현을 측정한다. 후보 수·표현 존재를 교육적 정답률로 쓰지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { gunzipSync } = require('node:zlib');
const { hash } = require('./semantic-layer');
const { discoverContents } = require('./discovery-search');
const { discoverTeacherContents } = require('./teacher-discovery');
const { teacherCatalog } = require('./teacher-approvals');
const { groupVariants, variantKey } = require('./teacher-curation');
const { readDataStore } = require('./data-store');
const root = path.resolve(__dirname, '..');
const protectedFiles = ['curi-store.json', 'broadcast-catalog.sqlite', 'semantic-layer.sqlite'];
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async name =>
  [name, hash(await fs.readFile(path.join(__dirname, 'data', name)))])));
const programs = items => {
  const counts = {};
  for (const item of items) counts[item.program] = (counts[item.program] || 0) + 1;
  return { sampleSize: items.length, counts, unique: Object.keys(counts).length,
    largestShare: items.length ? Math.max(...Object.values(counts)) / items.length : null };
};
const sample = item => ({ id: item.id, title: item.title, summary: item.summary, program: item.program,
  sourceUrl: item.sourceUrl, navigation: item.navigation, evidenceLevel: item.evidenceLevel,
  semanticTags: item.semanticTags, requestedDetails: item.requestedDetails, reason: item.reason,
  selectionReason: item.selectionReason, curriculumStatus: item.curriculumStatus, playbackStatus: item.playbackStatus,
  alternatives: (item.alternatives || []).map(({ id, title, program }) => ({ id, title, program })) });

async function main() {
  const before = await hashes();
  const bytes = gunzipSync(await fs.readFile(path.join(__dirname, 'data/quality-catalog-20260930.json.gz')));
  const queryBytes = await fs.readFile(path.join(__dirname, 'data/quality-workspace-queries.json'));
  const fixture = JSON.parse(queryBytes), catalog = JSON.parse(bytes), store = await readDataStore();
  const originals = new Map(catalog.resources.map(item => [item.id, item]));
  const report = { generatedAt: new Date().toISOString(), fixture, snapshotSha256: hash(bytes), querySha256: hash(queryBytes),
    codeHashes: {}, cases: [], rows: [], errors: [], networkAttempts: 0, protectedBefore: before,
    humanEvaluations: 0, playbackChecks: 0, paidApiCalls: 0,
    limits: ['에이전트 작성 새 표현의 기능·텍스트 검사. 실제 교사 효용·최종 정확도 평가가 아니다.',
      '함수 지연은 단일 프로세스 측정이며 서버·브라우저 시간 및 동시 부하를 포함하지 않는다.',
      '원문 대조는 저장된 스냅샷 대상이며 외부 EBS 재접속 검사가 아니다.'] };
  for (const name of ['discovery-search.js', 'discovery-intent.js', 'discovery-request.js', 'teacher-discovery.js', 'teacher-curation.js', 'semantic-layer.js']) {
    report.codeHashes[name] = hash(await fs.readFile(path.join(__dirname, name)));
  }
  const originalFetch = global.fetch, originalConnect = net.Socket.prototype.connect;
  const block = () => { report.networkAttempts++; throw new Error('R09 오프라인 검사: 외부 접속 금지'); };
  global.fetch = block; net.Socket.prototype.connect = block;
  try {
    assert.equal(fixture.queries.filter(q => q.subject === '사회').length, fixture.queries.filter(q => q.subject === '과학').length);
    const approvedCatalog = await teacherCatalog(catalog, store);
    for (const query of fixture.queries) {
      try {
        const start = performance.now();
        const teacher = await discoverTeacherContents({ q: query.query }, catalog, store);
        const firstMs = performance.now() - start;
        const raw = await discoverContents({ q: query.query }, approvedCatalog, { includeCandidates: true });
        const eligible = new Set(raw.candidates.map(item => item.id));
        const expectedGroups = groupVariants(raw.candidates);
        assert.ok(teacher.total <= expectedGroups.length);
        const allGroups = [];
        for (let page = 1; page <= teacher.pages; page++) {
          allGroups.push(...(await discoverTeacherContents({ q: query.query, page }, catalog, store)).results);
        }
        assert.equal(new Set(allGroups.map(variantKey)).size, teacher.total);
        assert.ok(allGroups.flatMap(item => [item, ...item.alternatives]).every(item => eligible.has(item.id)));
        for (const item of teacher.results) {
          assert.ok(eligible.has(item.id));
          const source = originals.get(item.id);
          for (const tag of item.semanticTags) {
            assert.equal(source[tag.evidence.field].slice(tag.evidence.start, tag.evidence.end), tag.evidence.quote);
            assert.equal(tag.status, 'SOURCE_MENTION');
          }
        }
        const selected = query.topic ? await discoverTeacherContents({ q: query.query, topic: query.topic }, catalog, store) : null;
        // 최초 측정에서 발견한 세 문맥 오류의 고정 원문 회귀. 교육적 정답 라벨은 아니다.
        if (query.id === 'S03') {
          assert.ok(teacher.results.some(item => item.id === 'BCAST-b7ea99f0dd385b579d34'));
          assert.ok(teacher.results.every(item => !['BCAST-4f089fedc7ab0e9c80b9', 'BCAST-d89bef31fba5ab6a323e'].includes(item.id)));
        }
        if (query.id === 'N02') {
          assert.ok(selected.total > 0);
          assert.ok(selected.results.every(item => item.id !== 'BCAST-d5f940dc8f8b92ab0677'));
        }
        if (query.id === 'S01') {
          assert.ok(selected.results.some(item => item.id === 'BCAST-ce1721b43f7741c59028'));
          assert.ok(selected.results.every(item => item.id !== 'BCAST-4091c34734ae75151231'));
        }
        const warmMs = [];
        for (let i = 0; i < 3; i++) {
          const started = performance.now();
          const repeat = await discoverTeacherContents({ q: query.query }, catalog, store);
          warmMs.push(+(performance.now() - started).toFixed(2));
          assert.deepEqual(repeat.results.map(item => item.id), teacher.results.map(item => item.id));
        }
        const keyword = await discoverTeacherContents({ q: query.keyword }, catalog, store);
        report.rows.push({ ...query, total: teacher.total, rawTotal: raw.total, terms: teacher.terms,
          understanding: teacher.understanding, keywordTotal: keyword.total, keywordTop: keyword.results.slice(0, 3).map(sample),
          firstMs: +firstMs.toFixed(2), warmMs, rawTopPrograms: programs(raw.results.slice(0, 4)),
          firstPagePrograms: programs(teacher.results), allPrograms: programs(allGroups),
          groupedAlternativeCount: raw.total - teacher.total, variantGroups: allGroups.filter(item => item.alternatives.length).map(sample),
          top: teacher.results.slice(0, 3).map(sample), firstPage: teacher.results.map(sample),
          selectedTopic: selected && { id: query.topic, total: selected.total, firstPage: selected.results.map(sample) },
          humanJudgment: null });
        report.cases.push({ name: `${query.id} 조건·근거·모든 페이지 판본 보존·반복 결정성`, passed: true });
      } catch (error) {
        report.errors.push({ id: query.id, error: error.stack });
        report.cases.push({ name: query.id, passed: false });
      }
    }
    report.summary = Object.fromEntries(['사회', '과학'].map(subject => {
      const rows = report.rows.filter(row => row.subject === subject);
      return [subject, { queries: fixture.queries.filter(row => row.subject === subject).length, measured: rows.length,
        withCandidates: rows.filter(row => row.total).length, empty: rows.filter(row => !row.total).map(row => row.id),
        singleProgramFirstPages: rows.filter(row => row.firstPagePrograms.unique === 1).map(row => row.id) }];
    }));
  } finally {
    global.fetch = originalFetch; net.Socket.prototype.connect = originalConnect;
    report.protectedAfter = await hashes();
    report.storesUnchanged = JSON.stringify(before) === JSON.stringify(report.protectedAfter);
    report.passed = report.cases.length === fixture.queries.length && report.cases.every(row => row.passed)
      && report.networkAttempts === 0 && report.storesUnchanged;
    await fs.writeFile(process.env.CURI_REPORT_PATH || path.join(root, 'docs/r09-workspace-quality.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ passed: report.passed, summary: report.summary, errors: report.errors }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
