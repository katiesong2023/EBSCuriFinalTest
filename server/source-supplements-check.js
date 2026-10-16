const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openBroadcastStore, saveBroadcastPage } = require('./broadcast-store');
const { attachOfficialSupplement, readSupplements, identityFor } = require('./source-supplements');
const { buildQueue, gapTopics } = require('./curriculum-source-queue');
const { buildIndex } = require('./curriculum-discovery');
const { comparisonFor } = require('./curriculum-evidence');
const { assessSourceText } = require('./source-text-quality');
const { createAutomaticEvidence } = require('./automatic-evidence');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curi-supplement-'));
const db = openBroadcastStore(path.join(directory, 'broadcast.sqlite'));
const cases = [];
function check(name, run) { run(); cases.push(name); }
try {
  saveBroadcastPage(db, { job: 'fixture', sourceUrl: 'https://www.ebs.co.kr/fixture', fetchedAt: '2026-10-11' }, [
    { title: '합성 소금 1부', program: '합성 과학', date: '2026-01-02', summary: '', url: 'https://www.ebs.co.kr/fixture?courseId=1&stepId=2&lectId=3' }
  ]);
  const row = db.prepare('SELECT * FROM episodes').get();
  const document = { type: 'PRESS_RELEASE', title: '합성 과학 - 합성 소금 1부', publishedAt: '2026-01-01',
    sourceUrl: 'https://about.ebs.co.kr/fixture', responseHash: 'fixture-response', location: '1부 문단',
    identity: identityFor(row), identityEvidence: ['합성 소금', '1부', '2026년 1월 2일'],
    sourceText: '합성 소금 1부 2026년 1월 2일. 소금물의 물을 증발시켜 소금을 얻는다.', text: '소금물의 물을 증발시켜 소금을 얻는다.' };
  const options = { expectedHash: row.content_hash, checkedAt: '2026-10-11' };
  check('공식 회차별 보조 발췌 연결과 소개문 불변', () => {
    assert.equal(attachOfficialSupplement(db, row.id, document, options).status, 'ATTACHED');
    const after = db.prepare('SELECT * FROM episodes').get();
    assert.equal(after.synopsis, row.synopsis); assert.equal(after.content_hash, row.content_hash);
    const record = readSupplements(after)[0];
    assert.equal(document.sourceText.slice(record.originalStart, record.originalEnd), record.text);
  });
  check('반복 연결은 이력 중복 없음', () => {
    assert.equal(attachOfficialSupplement(db, row.id, document, options).status, 'UNCHANGED');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM source_supplement_events').get().n, 1);
  });
  check('다른 회차·방송일·판본 거절', () => {
    for (const key of ['title', 'broadcastDate', 'variant']) assert.throws(() => attachOfficialSupplement(db, row.id,
      { ...document, identity: { ...document.identity, [key]: 'OTHER' } }, options), /식별 불일치/);
  });
  check('허위 인용·회차 대조·비공식 주소·stale source 거절', () => {
    assert.throws(() => attachOfficialSupplement(db, row.id, { ...document, text: '없는 문장' }, options), /실제 공개/);
    assert.throws(() => attachOfficialSupplement(db, row.id, { ...document, identityEvidence: ['없는 방송', '1부', '2026년'] }, options), /실제 공개/);
    assert.throws(() => attachOfficialSupplement(db, row.id, { ...document, sourceUrl: 'https://example.com' }, options), /식별 불일치/);
    assert.throws(() => attachOfficialSupplement(db, row.id, document, { ...options, expectedHash: 'old' }), /현재 회차/);
  });
  check('연결 뒤 제목·판본 변경 및 저장된 발췌 변조 무효', () => {
    const current = db.prepare('SELECT * FROM episodes').get();
    assert.equal(readSupplements({ ...current, title: '합성 소금 2부' }).length, 0);
    const payload = JSON.parse(current.payload); payload.sourceSupplements[0].text += '변조';
    assert.equal(readSupplements({ ...current, payload }).length, 0);
  });
  const item = { id: 'A', sourceSystem: 'EBS_BROADCAST', sourceQuality: { category: 'detailed', detailedMappingAllowed: true }, semantic: { status: 'HELD', supportedRequirements: [] } };
  const rowFor = (supported, candidates = [item], subject = '사회') => ({ total: candidates.length, candidates,
    plan: { standardId: supported ? 'supported' : 'unsupported', ruleSupported: supported, subject, anchors: [], terms: ['용해'], courseId: 'elementary56', courseLabel: '초등 5~6학년군' } });
  check('규칙만 미지원인 충분한 원문을 보강 부족으로 분류하지 않음', () => assert.equal(buildQueue([rowFor(false)]).length, 0));
  check('상세 원문이어도 지원 관계 설명 공백은 보강 목록에 포함', () => assert.match(buildQueue([rowFor(true)])[0].reasons[0].reason, /관계 설명/));
  check('보조 원문이 있는 회차를 제목뿐으로 보강 분류하지 않음', () => {
    const candidate = { ...item, sourceQuality: { category: 'none', detailedMappingAllowed: false }, sourceSupplements: [{ text: '실제 보조 설명' }] };
    assert.match(buildQueue([rowFor(false, [candidate])])[0].reasons[0].reason, /소개문 부족/);
  });
  check('후보 없는 과학 주제 우선·공식 탐색 링크', () => {
    const topics = gapTopics([rowFor(false, [], '사회'), rowFor(false, [], '과학')]);
    assert.equal(topics[0].subject, '과학'); assert.match(topics[0].sourceSearchUrl, /^https:\/\/www.ebs.co.kr\/search/);
  });
  const standards = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/curi-store.json'), 'utf8')).curriculumStandards;
  const fixtureResource = { id: row.id, title: row.title, program: row.program, summary: '', kind: 'episode', sourceSystem: 'EBS_BROADCAST',
    variant: row.variant, sourceUrl: row.url, evidenceUrl: row.url, sourceSupplements: readSupplements(db.prepare('SELECT * FROM episodes').get()) };
  const selectedStandard = standards.find(standard => standard.metadata.achievementStandardId === '6과05-02');
  check('보조 원문으로만 후보를 발견하고 소개문 품질·미지원 경계는 유지', () => {
    const before = buildIndex({ resources: [{ ...fixtureResource, sourceSupplements: [] }] }, [selectedStandard]).rows[0];
    const after = buildIndex({ resources: [fixtureResource] }, [selectedStandard]).rows[0];
    assert.equal(before.total, 0); assert.equal(after.total, 1);
    const found = after.candidates[0];
    assert.deepEqual(found.sourceQuality, assessSourceText(fixtureResource.title, ''));
    assert.equal(found.semantic.status, 'UNSUPPORTED'); assert.equal(found.ranking.relationRank, 0);
    assert.ok(found.candidateStates.includes('DESCRIPTION_LOW')); assert.ok(!found.candidateStates.includes('TITLE_ONLY'));
    const comparison = comparisonFor(found, after.plan, selectedStandard);
    assert.equal(comparison.requirementComparisons[0].status, 'UNSUPPORTED');
    assert.equal(comparison.requirementComparisons[0].quotes.length, 0);
    assert.equal(comparison.supplementEvidence.length, 1);
    const quote = comparison.supplementEvidence[0], source = fixtureResource.sourceSupplements[0];
    assert.equal(quote.field, 'supplement'); assert.equal(quote.sourceContentId, row.id);
    assert.equal(source.text.slice(quote.start, quote.end), quote.quote);
    assert.equal(document.sourceText.slice(quote.originalStart, quote.originalEnd), quote.quote);
    assert.equal(quote.contentHash, source.contentHash); assert.equal(quote.sourceUrl, document.sourceUrl);
    assert.equal(quote.evidencePurpose, 'DISCOVERY_ONLY');
  });
  check('보조 원문의 지원 규칙 문장도 소개문 대신 자동 공개하지 않음', () => {
    const rotationDocument = { ...document, sourceText: '합성 소금 1부 2026년 1월 2일. 지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.',
      text: '지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.', location: '격리된 원문 경계 검사 문단' };
    const attached = attachOfficialSupplement(db, row.id, rotationDocument, options);
    const resource = { ...fixtureResource, sourceSupplements: [attached.supplement] };
    const standard = standards.find(standard => standard.metadata.achievementStandardId === '6과12-02');
    const found = buildIndex({ resources: [resource] }, [standard]).rows[0].candidates[0];
    assert.ok(found); assert.equal(found.semantic.supportedRequirements.length, 0);
    const report = createAutomaticEvidence({ ...resource, sourceContentId: resource.id, synopsis: resource.summary, sourceVersion: 'fixture',
      textSourceUrl: resource.sourceUrl, active: true }, standards, { standardId: '6과12-02', subject: '과학', gradeBand: '5~6학년군' });
    assert.equal(report.summary.publishable, 0);
  });
  fs.writeFileSync('docs/r08-09-source-contract-check.json', JSON.stringify({ checkedAt: new Date().toISOString(), cases, passed: cases.length, paidApiCalls: 0 }, null, 2) + '\n');
  console.log(`원문 보강 계약 ${cases.length}개 통과`);
} finally { db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
