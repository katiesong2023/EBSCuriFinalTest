const fs = require('node:fs'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { teacherCatalog } = require('./teacher-approvals');
const { supplementSearchStatus } = require('./supplement-search');
async function main() {
  const baseline = JSON.parse(zlib.gunzipSync(fs.readFileSync('docs/r12-40-final.json.gz')));
  const sha = v => crypto.createHash('sha256').update(v).digest('hex');
  const unchanged = () => Object.entries(baseline.before).every(([p, hash]) => sha(fs.readFileSync(p)) === hash);
  if (!unchanged()) throw Error('SOURCE_STORES_CHANGED');
  const catalog = await teacherCatalog(await loadDiscoveryCatalog());
  const fingerprint = sha(JSON.stringify(catalog.resources.map(r => ({ id: r.id, title: r.title, program: r.program, summary: r.summary, kind: r.kind, sourceSupplements: r.sourceSupplements }))));
  if (fingerprint !== baseline.catalogFingerprint) throw Error('RAW_CATALOG_CHANGED');
  const reasons = {}, excluded = []; let examined = 0;
  for (const item of catalog.resources) {
    const identity = { resourceId: item.id, title: item.title, program: item.program, broadcastDate: item.broadcastDate, variant: item.variant, sourceUrl: item.sourceUrl };
    for (const s of item.sourceSupplements || []) {
      examined++; const result = supplementSearchStatus(s, identity); reasons[result.reason] = (reasons[result.reason] || 0) + 1;
      if (!result.eligible) excluded.push({ resourceId: item.id, title: item.title, program: item.program, broadcastDate: item.broadcastDate, summary: item.summary, supplementId: s.id, supplementTitle: s.title, sourceUrl: s.sourceUrl, reason: result.reason });
    }
  }
  if (!unchanged()) throw Error('SOURCE_STORES_CHANGED');
  const result = { resources: catalog.resources.length, examined, searchable: examined - excluded.length, excludedCount: excluded.length, reasons, excluded,
    rawCatalogFingerprint: fingerprint, changedStores: [], caveat: '프로그램명·임시 제목뿐인 자료에는 정확한 회차 페이지 또는 명시된 방송일 일치를 요구한다. 제외는 검색 근거 보류이며 원문 데이터·첨부 기록 삭제나 오류 확정이 아니다.' };
  fs.writeFileSync('docs/r12-40-anchored-supplement-identity-audit.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, excluded: undefined }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
