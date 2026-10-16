// 동일 검색 조건·승인 이력으로 원문 보강 전후를 집계하는 읽기 전용 기록.
const fs = require('node:fs');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { teacherCatalog } = require('./teacher-approvals');
const { readDataStore } = require('./data-store');
const { getEligibleStandards } = require('./data-quality');
const { sourceQualityStats } = require('./source-text-quality');
const { buildIndex, summarize } = require('./curriculum-discovery');
const { ruleVersion } = require('./automatic-relation-rules');
async function capture(destination) {
  const raw = await loadDiscoveryCatalog(), store = await readDataStore();
  const catalog = await teacherCatalog({ ...raw, liveSource: false }, store, []);
  const index = buildIndex(catalog, getEligibleStandards(store.curriculumStandards));
  const report = { checkedAt: new Date().toISOString(), phase: 'NEW_SEARCH_AFTER_SOURCE_ENRICHMENT', ruleVersion,
    comparisonNote: '소개문 품질은 보조문서와 별도. 비교용 자동 링크는 빈 배열로 고정하며 운영 공개 건수가 아닙니다.',
    baseCatalog: sourceQualityStats(raw.resources), allVariants: sourceQualityStats(catalog.resources),
    summary: summarize(index.rows, catalog.resources),
    supplements: { resources: catalog.resources.filter(item => item.sourceSupplements?.length).length,
      records: catalog.resources.reduce((count, item) => count + (item.sourceSupplements?.length || 0), 0) },
    standards: index.rows.map(row => ({ standardId: row.plan.standardId, candidates: row.candidates.length,
      groups: row.total, ruleSupported: row.plan.ruleSupported, counts: row.counts })), paidApiCalls: 0 };
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ summary: report.summary, minimum: report.allVariants.minimumPassed, supplements: report.supplements }));
}
if (require.main === module) capture(process.argv[2] || 'docs/r08-09-after.json').catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { capture };
