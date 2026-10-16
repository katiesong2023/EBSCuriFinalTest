const fs = require('node:fs'), crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const read = p => JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p));
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const fp = r => sha(JSON.stringify(stable([r.title, r.summary, r.sourceSupplements || []])));
const base = read('docs/r12-40-final.json.gz'), old = read('docs/r12-40-semantic-merged-results.json.gz'), after = read('docs/r12-40-anchored-results.json.gz');
const final = read(fs.existsSync('docs/r12-40-teacher-model-results.json.gz') ? 'docs/r12-40-teacher-model-results.json.gz' : 'docs/r12-40-teacher-model-progress.json.gz');
const snapshot = read('docs/r12-40-anchored-candidates.json.gz');
const labels = Object.assign({}, ...['docs/r12-40-relevance-labels.json', 'docs/r12-40-llm-dollar-relevance-labels.json', 'docs/r12-40-semantic-source-relevance-labels.json', 'docs/r12-40-requirement-relevance-labels.json', 'docs/r12-40-anchored-relevance-labels.json', 'docs/r12-40-teacher-model-relevance-labels.json'].filter(fs.existsSync).map(p => read(p).labels));
const labelFor = (row, item) => { const label = labels[row.set + '/' + row.id + '/' + item.id]; if (!label || label.fingerprint !== fp(item)) return null; assert.equal(label.query, row.query); return label; };
const missing = [], metrics = [];
for (const [stage, report] of [['local', base], ['previousLlmSupplement', old], ['anchoredConditions', after], ['teacherRuntime', final]]) {
  if (stage !== 'teacherRuntime' || final.inputs) { assert.equal(report.rows.length, 370); assert.deepEqual(report.inputs, base.inputs); assert.equal(report.catalogFingerprint, base.catalogFingerprint); assert.deepEqual(report.before, base.before); assert.deepEqual(report.changedStores, []); }
  const metric = { stage, queries: report.rows.length, nonempty: 0, top1: { relevant: 0, partial: 0, irrelevant: 0, unjudged: 0 }, top3: { relevant: 0, partial: 0, irrelevant: 0, unjudged: 0 }, queriesWithRelevantTop3: 0 };
  report.rows.forEach((row, index) => {
    assert.equal(row.query, base.rows[index].query); assert.equal(row.set, base.rows[index].set); assert.equal(row.id, base.rows[index].id); metric.nonempty += row.total > 0; let relevant = false;
    row.top5.slice(0, 3).forEach((item, rank) => {
      const label = labelFor(row, item), category = label ? ['irrelevant', 'partial', 'relevant'][label.score] : 'unjudged'; metric.top3[category]++; if (!rank) metric.top1[category]++;
      relevant ||= !!label && label.score === 2;
      if (!label && ['teacherRuntime'].includes(stage) && !missing.some(r => r.key === row.set + '/' + row.id + '/' + item.id)) missing.push({ key: row.set + '/' + row.id + '/' + item.id, fingerprint: fp(item), query: row.query, rank: rank + 1, candidate: item });
    });
    metric.queriesWithRelevantTop3 += relevant;
  });
  metric.empty = report.rows.length - metric.nonempty;
  if (metric.top3.unjudged) metric.queriesWithRelevantTop3 = null;
  for (const level of ['top1', 'top3']) { const m = metric[level], n = m.relevant + m.partial + m.irrelevant + m.unjudged; m.exposures = n; m.relevantShare = m.unjudged || !n ? null : m.relevant / n; }
  metrics.push(metric);
}

let quotesChecked = 0, metadataChecked = 0;
for (const row of final.rows) for (const item of row.top5) for (const condition of item.semanticConditionReview?.conditions || []) for (const p of condition.evidence) {
 if (['title','summary','sourceSupplement'].includes(p.field)) {
  const text = p.field === 'sourceSupplement' ? item.sourceSupplements.find(s=>s.id===p.supplementId)?.text : item[p.field];
  assert.equal(text.slice(p.start,p.end),p.quote); quotesChecked++;
 } else {
  if(p.field==='catalogProgram') assert.equal(p.value,item.program);
  else if(p.field==='catalogResourceType') assert.equal(p.value,item.kind);
  else if(p.field==='verifiedDuration') { assert.equal(p.value,item.durationSeconds); assert.equal(p.sourceUrl,item.durationSourceUrl); }
  else assert.equal(p.field,'derivedGenre'); metadataChecked++;
 }
}
if(final.codeHashes) for(const [p,hash] of Object.entries(final.codeHashes)) assert.equal(sha(fs.readFileSync(p)),hash);
const ledger = read('docs/r12-40-llm-dollar-ledger.json');
for (const [p, hash] of Object.entries(base.before)) assert.equal(sha(fs.readFileSync(p)), hash);
let knownRelevant = 0, lostAll = 0, lostTop3 = 0;
const losses = [];
for (let i=0; i<final.rows.length; i++) {
 const row=base.rows[i], current=final.rows[i];
 for (const item of row.top5.slice(0,3)) if(labelFor(row,item)?.score===2) {
  knownRelevant++; const lost=!current.returnedIds.includes(item.id); lostAll+=lost;
  lostTop3+=!current.top5.slice(0,3).some(r=>r.id===item.id);
  if(lost) losses.push({set:row.set,id:row.id,query:row.query,resourceId:item.id,title:item.title});
 }
}
const report={complete:final.rows.length===370 && final.incomplete===false,metrics,missingLabels:missing.length,knownRelevant,lostAll,lostTop3,losses,quotesChecked,metadataChecked,
 totalConservativeUsd:ledger.chargedUpperUsd,remainingApprovedUsd:2-ledger.chargedUpperUsd,pending:ledger.pending.length,changedStores:[],
 caveat:'동일370 원문·원천 고정. 상위3개 전체의 에이전트 원문 잠정 평가이며 교사/영상 정답률·전체 재현율이 아니다. 비용은 불명 예약 유지·캐시 할인 미적용 보수적 집계다.'};
fs.writeFileSync('docs/r12-40-teacher-model-comparison.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('docs/r12-40-teacher-model-unjudged.json',JSON.stringify(missing,null,2)+'\n');
console.log(JSON.stringify({...report,losses:losses.length}));

const esc = s=>String(s||'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
const table=['# 실제 교사 검색 함수 동일370 비교','','관련2/부분1/무관0/미평가?. 학교급·학년·용도·난이도는 순위 문맥. 전체 검색 재현율이나 영상 적합성 평가는 아님.','','|세트/ID|원문 질문|이전 보충 결과/상위3 판정|현재 교사 검색/상위3 판정|현재 첫 자료|','|---|---|---|---|---|'];
for(let i=0;i<final.rows.length;i++) {
 const a=old.rows[i],b=final.rows[i],scores=r=>r.top5.slice(0,3).map(c=>labelFor(r,c)?.score??'?').join(',')||'-';
 table.push(`|${b.set}/${b.id}|${esc(b.query)}|${a.total}/${scores(a)}|${b.total}/${scores(b)}|${esc(b.top5[0]?.title)}|`);
}
fs.writeFileSync('docs/r12-40-teacher-model-query-comparison.md',table.join('\n')+'\n');
