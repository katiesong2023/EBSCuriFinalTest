const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const readFrozen = filename => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(projectRoot, 'docs', filename))));
const readSnapshot = filename => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve(projectRoot, filename))));
const writeReport = (filename, data) => fs.writeFileSync(path.join(projectRoot, 'docs', filename), zlib.gzipSync(JSON.stringify(data)), { flag: 'wx' });
function validateFrozenFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'docs/r09-02-capture.json'), 'utf8'));
  for (const entry of [manifest.input, manifest.source]) {
    const actual = sha256(zlib.gunzipSync(fs.readFileSync(path.join(projectRoot, entry.path))));
    if (actual !== entry.uncompressedSha256) throw new Error('고정 스냅샷 해시 불일치');
  }
  const labelLock = JSON.parse(fs.readFileSync(path.join(projectRoot, 'docs/r09-02-label-lock.json'), 'utf8'));
  if (sha256(zlib.gunzipSync(fs.readFileSync(path.join(projectRoot, 'docs/r09-02-independent-labels.json.gz')))) !== labelLock.uncompressedSha256) {
    throw new Error('독립 판단 기록 해시 불일치');
  }
  const preparation = JSON.parse(fs.readFileSync(path.join(projectRoot, 'docs/r09-02-preparation.json'), 'utf8'));
  if (sha256(zlib.gunzipSync(fs.readFileSync(path.join(projectRoot, preparation.holdout.path)))) !== preparation.holdout.uncompressedSha256) {
    throw new Error('독립 표본 해시 불일치');
  }
  return manifest;
}
function currentCodeFiles() {
  const files = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(path.join(projectRoot, directory), { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'data') visit(filename); continue; }
      if (/\.(?:js|mjs|css|html|py)$/.test(filename) && !filename.includes('independent-quality-')) files[filename] = fs.readFileSync(path.join(projectRoot, filename), 'utf8');
    }
  }
  visit('server'); visit('public');
  files['package.json'] = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
  return files;
}
function isolatedCodeDirectory(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curi-r09-02-baseline-'));
  for (const [filename, content] of Object.entries(files)) {
    const destination = path.join(directory, filename);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
  return directory;
}
function evidenceUi(directory) {
  const scope = { URL, URLSearchParams, GradeContext: require(path.join(directory, 'public/grade-context.js')) };
  scope.window = scope;
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(directory, 'public/teacher-storage.js'), 'utf8'), scope);
  const guidanceFile = path.join(directory, 'public/teacher-guidance.js');
  if (fs.existsSync(guidanceFile)) vm.runInContext(fs.readFileSync(guidanceFile, 'utf8'), scope);
  vm.runInContext(fs.readFileSync(path.join(directory, 'public/teacher-evidence.js'), 'utf8'), scope);
  return scope.CuriTeacher;
}
function summarize(records, topK) {
  const exposed = records.filter(record => record.rank && record.rank <= topK);
  const relevant = records.filter(record => record.judgment.retrievalRelevant);
  return {
    sampleRelations: records.length, observedTopK: topK, sampledExposures: exposed.length,
    wrongLinkExposure: { count: exposed.filter(record => record.errors.length).length, denominator: exposed.length,
      authority: 'AGENT_SOURCE_JUDGMENT_AND_RENDERED_CONFIRMATION', wholeCatalogPrecision: null },
    suitableMaterialMissed: { confirmedRelevantInSample: relevant.length,
      notRetrieved: relevant.filter(record => !record.candidate).length,
      retrievedBelowTopK: relevant.filter(record => record.candidate && record.rank > topK).length,
      inTopK: relevant.filter(record => record.rank && record.rank <= topK).length,
      purposeOnlyCandidates: records.filter(record => record.judgment.purposeOnly).length, wholeCatalogRecall: null },
    sourceInsufficiency: { minimumTextInsufficient: records.filter(record => !record.minimumTextPassed).length,
      substantiveRequirementEvidenceNotEstablished: records.filter(record => !record.judgment.retrievalRelevant).length,
      denominator: records.length, fullVideoContentJudged: false },
    automaticComparisonUnsupported: { relations: records.filter(record => !record.ruleSupported).length,
      standards: new Set(records.filter(record => !record.ruleSupported).map(record => record.standardId)).size,
      denominator: records.length, countedAsUnsuitable: false },
    unsupportedMisrepresentedAsMissing: { count: exposed.filter(record => record.unsupportedAsMissing).length,
      denominator: exposed.filter(record => !record.ruleSupported).length },
    authority: 'AGENT_ONLY', teacherResponses: 0, teacherEvaluation: 'NOT_PERFORMED'
  };
}
async function run(mode = 'baseline') {
  if (!['baseline', 'same-source', 'enriched'].includes(mode)) throw new Error('모드는 baseline, same-source, enriched 중 하나입니다.');
  const manifest = validateFrozenFiles();
  const holdout = readFrozen('r09-02-holdout.json.gz');
  const labels = new Map(readFrozen('r09-02-independent-labels.json.gz').labels.map(label => [label.sampleId, label]));
  const frozen = readFrozen('r09-02-frozen-input.json.gz');
  const codeFiles = mode === 'baseline' ? readFrozen('r09-02-frozen-code.json.gz').files
    : process.env.CURI_QUALITY_CODE_SNAPSHOT ? readSnapshot(process.env.CURI_QUALITY_CODE_SNAPSHOT).files : currentCodeFiles();
  const runtime = isolatedCodeDirectory(codeFiles);
  let catalog = frozen.catalog, store = frozen.store;
  try {
    const approvalModule = require(path.join(runtime, 'server/teacher-approvals.js'));
    if (mode === 'enriched') {
      if (process.env.CURI_QUALITY_INPUT_SNAPSHOT) {
        const savedInput = readSnapshot(process.env.CURI_QUALITY_INPUT_SNAPSHOT);
        catalog = savedInput.catalog;
        store = savedInput.store;
        if (JSON.stringify(savedInput.automaticLinks) !== JSON.stringify(frozen.automaticLinks)) throw new Error('재현 입력의 관계 이력이 고정 입력과 다릅니다.');
      } else {
        store = await require(path.join(projectRoot, 'server/data-store.js')).readDataStore();
        const current = await require(path.join(projectRoot, 'server/discovery-catalog.js')).loadDiscoveryCatalog();
        // 보강 효과만 비교하므로 관계 승인 이력은 같은 고정 입력을 사용한다. DB 무효화 경로는 호출하지 않는다.
        catalog = await approvalModule.teacherCatalog({ ...current, liveSource: false }, store, frozen.automaticLinks);
        catalog.searchVariants = [];
      }
    }
    // 카탈로그는 이미 검수/자동 관계를 포함한 고정 읽기 사본이다. 자동 자산 DB 쓰기 없이 표시 경로를 재현한다.
    const originalTeacherCatalog = approvalModule.teacherCatalog;
    approvalModule.teacherCatalog = async (givenCatalog, givenStore) => givenCatalog === catalog && givenStore === store
      ? catalog : originalTeacherCatalog(givenCatalog, givenStore, frozen.automaticLinks);
    const { buildIndex, discoverCurriculum } = require(path.join(runtime, 'server/curriculum-discovery.js'));
    const { getEligibleStandards } = require(path.join(runtime, 'server/data-quality.js'));
    const { assessSourceText } = require(path.join(runtime, 'server/source-text-quality.js'));
    const index = buildIndex(catalog, getEligibleStandards(store.curriculumStandards));
    if (mode === 'baseline') {
      const capturedRows = readFrozen('r09-02-baseline-search.json.gz');
      for (const row of index.rows) {
        const previous = capturedRows.find(entry => entry.standardId === row.plan.standardId);
        if (!previous || JSON.stringify(previous.candidates.map(item => item.id)) !== JSON.stringify(row.candidates.map(item => item.id)) ||
            JSON.stringify(previous.groups.map(item => [item.id, item.alternatives])) !== JSON.stringify(row.grouped.map(item => [item.id, item.alternatives.map(alt => alt.id)]))) {
          throw new Error('고정 코드에서 기준선 후보/순위를 재현하지 못했습니다.');
        }
      }
    }
    const ui = evidenceUi(runtime), pages = new Map();
    for (const standardId of new Set(holdout.samples.map(sample => sample.standardId))) {
      pages.set(standardId, await discoverCurriculum({ standard: standardId, page: 1 }, catalog, store));
    }
    const records = holdout.samples.map(sample => {
      const row = index.rows.find(row => row.plan.standardId === sample.standardId);
      const candidate = row.candidates.find(item => item.id === sample.resourceId);
      const groupIndex = row.grouped.findIndex(item => item.id === sample.resourceId || item.alternatives?.some(alt => alt.id === sample.resourceId));
      const rank = groupIndex < 0 ? null : groupIndex + 1;
      const page = pages.get(sample.standardId);
      const displayed = page.results.flatMap(item => [item, ...(item.alternatives || [])]).find(item => item.id === sample.resourceId);
      const source = catalog.resources.find(item => item.id === sample.resourceId);
      const judgment = labels.get(sample.sampleId), errors = [];
      const confirmation = displayed ? ui.confirmation(displayed) : null;
      if (displayed) {
        const selectedApproved = (displayed.approvedLinks || []).some(link => link.standardId === sample.standardId);
        const selectedAutomatic = (displayed.automaticLinks || []).some(link => link.standardId === sample.standardId);
        if (/사람 검수 완료|부분 연계 · 사람 확인/.test(confirmation) && !selectedApproved) errors.push('OTHER_STANDARD_HUMAN_CONFIRMATION');
        if (/자동 근거 검사 통과/.test(confirmation) && !selectedAutomatic) errors.push('OTHER_STANDARD_AUTOMATIC_CONFIRMATION');
        if (displayed.curriculumComparison?.state === 'PARTIAL_SUPPORTED' && !judgment.retrievalRelevant) errors.push('UNSUPPORTED_PARTIAL_CLAIM');
        for (const requirement of displayed.curriculumComparison?.requirementComparisons || []) {
          if (requirement.status !== 'SUPPORTED') continue;
          if (!requirement.quotes?.length || requirement.quotes.some(quote => source.summary.slice(quote.start, quote.end) !== quote.quote)) {
            errors.push('MISSING_OR_INEXACT_REQUIREMENT_QUOTE');
          }
        }
      }
      return { ...sample, candidate: Boolean(candidate), rank, judgment,
        ruleSupported: row.plan.ruleSupported, minimumTextPassed: source ? assessSourceText(source.title, source.summary).detailedMappingAllowed : false,
        sourceHash: source ? sha256(JSON.stringify([source.title, source.summary, source.sourceUrl])) : null,
        semanticStatus: candidate?.semantic?.status || null, candidateState: candidate?.candidateState || null,
        confirmation, comparison: displayed?.curriculumComparison || null, errors,
        unsupportedAsMissing: Boolean(displayed && !row.plan.ruleSupported && displayed.curriculumComparison?.state === 'RELATION_MISSING') };
    });
    const summary = summarize(records, holdout.topK);
    const report = { createdAt: new Date().toISOString(), mode, frozenInputSha256: manifest.input.uncompressedSha256,
      ruleVersion: require(path.join(runtime, 'server/automatic-relation-rules.js')).ruleVersion,
      codeHashes: Object.fromEntries(Object.entries(codeFiles).map(([filename, content]) => [filename, sha256(content)])),
      source: mode === 'enriched' ? 'CURRENT_CATALOG_WITH_FROZEN_RELATION_HISTORY' : 'FROZEN_CATALOG_AND_RELATION_HISTORY',
      replayCodeSnapshot: process.env.CURI_QUALITY_CODE_SNAPSHOT || null,
      replayInputSnapshot: mode === 'enriched' ? process.env.CURI_QUALITY_INPUT_SNAPSHOT || null : null,
      originalDatabasesWritten: false, paidCalls: 0, networkCalls: 0, summary,
      segments: [...new Set(records.map(record => `${record.courseId}:${record.subject}`))].map(segment => ({ segment,
        ...summarize(records.filter(record => `${record.courseId}:${record.subject}` === segment), holdout.topK) })), records };
    const stage = process.env.CURI_QUALITY_STAGE || '';
    if (stage && !/^[a-z0-9-]+$/.test(stage)) throw new Error('평가 단계 이름 형식 오류');
    const prefix = `r09-02-${stage ? stage + '-' : ''}${mode}`;
    report.codeSnapshot = `${prefix}-code.json.gz`;
    writeReport(report.codeSnapshot, { createdAt: report.createdAt, files: codeFiles });
    if (mode === 'enriched') {
      report.inputSnapshot = `${prefix}-input.json.gz`;
      const input = { catalog, store, automaticLinks: frozen.automaticLinks };
      report.evaluationInputSha256 = sha256(JSON.stringify(input));
      writeReport(report.inputSnapshot, input);
    }
    writeReport(`${prefix}-details.json.gz`, report);
    fs.writeFileSync(path.join(projectRoot, `docs/${prefix}-summary.json`), JSON.stringify({ ...report, records: undefined, codeHashes: undefined }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ mode, summary }));
    return report;
  } finally {
    fs.rmSync(runtime, { recursive: true, force: true });
  }
}
if (require.main === module) run(process.argv[2]).catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { run, summarize, validateFrozenFiles };
