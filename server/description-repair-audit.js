const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { previewContent } = require('./content-preview');
const { assessSourceText } = require('./source-text-quality');

async function main() {
  const inventory = JSON.parse(await fs.readFile('docs/r12-description-repair-inventory.json', 'utf8'));
  const fetched = JSON.parse(await fs.readFile('docs/r12-description-repair-fetch.json', 'utf8'));
  assert.equal(fetched.processed, inventory.targets, '공식 페이지 대조가 끝난 후 실행합니다.');
  const catalog = await loadDiscoveryCatalog();
  const all = new Map([...catalog.resources, ...catalog.searchVariants].map(item => [item.id, item]));
  const methods = {}, qualities = {}, rows = [];
  let longer = 0, repeatedToDetailed = 0, evidenceChecks = 0;
  for (const original of inventory.rows) {
    const item = all.get(original.id);
    assert.ok(item, original.id);
    const before = JSON.stringify(item), preview = previewContent(item);
    assert.equal(JSON.stringify(item), before, '표시 안내는 원문을 바꾸지 않습니다.');
    assert.ok(preview.text && preview.text !== item.title, item.id);
    assert.equal(preview.reviewNote, '', item.id);
    for (const quote of preview.evidence || []) {
      assert.equal(item.summary.slice(quote.start, quote.end), quote.quote, item.id);
      evidenceChecks++;
    }
    for (const quote of preview.metadataEvidence || []) {
      assert.equal(item[quote.field].slice(quote.start, quote.end), quote.quote, item.id);
      evidenceChecks++;
    }
    const quality = assessSourceText(item.title, item.summary).category;
    methods[preview.method] = (methods[preview.method] || 0) + 1;
    qualities[quality] = (qualities[quality] || 0) + 1;
    if (item.summary.length > original.summary.length) longer++;
    if (original.quality === 'repeated' && quality === 'detailed') repeatedToDetailed++;
    rows.push({id:item.id, title:item.title, method:preview.method, quality,
      originalLength:original.summary.length, currentLength:item.summary.length,
      sourceNote:preview.sourceNote || '', sourceIssues:preview.sourceIssues || []});
  }
  const old = new DatabaseSync('/private/tmp/curi-description-repair-before.sqlite', {readOnly:true});
  const current = new DatabaseSync('server/data/broadcast-catalog.sqlite', {readOnly:true});
  let changed = 0, nonTargetChanges = 0, officialHistoryChecks = 0;
  const targets = new Set(inventory.rows.map(row => row.id));
  try {
    const previous = old.prepare('SELECT id,content_hash FROM episodes').all();
    const now = new Map(current.prepare('SELECT id,content_hash FROM episodes').all().map(row => [row.id,row]));
    assert.equal(previous.length, now.size);
    for (const row of previous) {
      assert.ok(now.has(row.id));
      if (now.get(row.id).content_hash !== row.content_hash) {
        changed++;
        if (!targets.has(row.id)) nonTargetChanges++;
      }
    }
    assert.equal(nonTargetChanges, 0);
    for (const result of fetched.rows) {
      const row=current.prepare('SELECT synopsis FROM episodes WHERE id=?').get(result.id);
      const record=current.prepare('SELECT record FROM source_enrichments WHERE source_id=? ORDER BY checked_at DESC,rowid DESC LIMIT 1').get(result.id);
      if (!record) continue;
      const event=JSON.parse(record.record);
      assert.equal(row.synopsis,event.next.synopsis,result.id);
      if (result.descriptionMatched) {
        assert.equal(row.synopsis,event.detail.description,result.id);
        assert.equal(current.prepare('SELECT status FROM link_checks WHERE id=?').get(result.id).status,'MATCHED',result.id);
        officialHistoryChecks++;
      }
    }
  } finally { old.close(); current.close(); }
  const prior = JSON.parse(await fs.readFile('docs/r12-03-figurative-catalog.json', 'utf8'));
  const protectedHashes = {};
  for (const name of ['curi-store.json','automatic-assets.sqlite','teacher-resources.sqlite']) {
    const file = 'server/data/' + name;
    protectedHashes[file] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
    assert.equal(protectedHashes[file], prior.protectedAfter[file], file);
  }
  const report = {date:'2026-10-15', total:all.size, targets:rows.length,
    completeDisplayDescriptions:rows.length, methods, qualities, longerOfficialDescriptions:longer,
    repeatedToDetailed, evidenceChecks, officialHistoryChecks, changedSourceRows:changed, nonTargetSourceChanges:nonTargetChanges,
    fetchCounts:fetched.counts, protectedHashes, paidApiCalls:0, rows};
  await fs.writeFile('docs/r12-description-repair-audit.json', JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,rows:undefined}));
}
main().catch(error => { console.error(error); process.exitCode=1; });
