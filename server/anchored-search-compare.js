const fs = require('node:fs'), crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const read = p => JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p));
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const fp = r => sha(JSON.stringify(stable([r.title, r.summary, r.sourceSupplements || []])));
const base = read('docs/r12-40-final.json.gz'), old = read('docs/r12-40-semantic-merged-results.json.gz'), after = read('docs/r12-40-anchored-results.json.gz');
const final = read('docs/r12-40-anchored-entailment-results.json.gz');
const snapshot = read('docs/r12-40-anchored-candidates.json.gz');
const labels = Object.assign({}, ...['docs/r12-40-relevance-labels.json', 'docs/r12-40-llm-dollar-relevance-labels.json', 'docs/r12-40-semantic-source-relevance-labels.json', 'docs/r12-40-requirement-relevance-labels.json', 'docs/r12-40-anchored-relevance-labels.json'].filter(fs.existsSync).map(p => read(p).labels));
const labelFor = (row, item) => { const label = labels[row.set + '/' + row.id + '/' + item.id]; if (!label || label.fingerprint !== fp(item)) return null; assert.equal(label.query, row.query); return label; };
const missing = [], metrics = [];
for (const [stage, report] of [['local', base], ['previousLlmSupplement', old], ['anchoredConditions', after], ['independentEntailment', final]]) {
  assert.equal(report.rows.length, 370); assert.deepEqual(report.inputs, base.inputs); assert.equal(report.catalogFingerprint, base.catalogFingerprint); assert.deepEqual(report.before, base.before); assert.deepEqual(report.changedStores, []);
  const metric = { stage, queries: 370, nonempty: 0, top1: { relevant: 0, partial: 0, irrelevant: 0, unjudged: 0 }, top3: { relevant: 0, partial: 0, irrelevant: 0, unjudged: 0 }, queriesWithRelevantTop3: 0 };
  report.rows.forEach((row, index) => {
    assert.equal(row.query, base.rows[index].query); assert.equal(row.set, base.rows[index].set); assert.equal(row.id, base.rows[index].id); metric.nonempty += row.total > 0; let relevant = false;
    row.top5.slice(0, 3).forEach((item, rank) => {
      const label = labelFor(row, item), category = label ? ['irrelevant', 'partial', 'relevant'][label.score] : 'unjudged'; metric.top3[category]++; if (!rank) metric.top1[category]++;
      relevant ||= !!label && label.score === 2;
      if (!label && ['anchoredConditions', 'independentEntailment'].includes(stage) && !missing.some(r => r.key === row.set + '/' + row.id + '/' + item.id)) missing.push({ key: row.set + '/' + row.id + '/' + item.id, fingerprint: fp(item), query: row.query, rank: rank + 1, candidate: item });
    });
    metric.queriesWithRelevantTop3 += relevant;
  });
  metric.empty = 370 - metric.nonempty;
  if (metric.top3.unjudged) metric.queriesWithRelevantTop3 = null;
  for (const level of ['top1', 'top3']) { const m = metric[level], n = m.relevant + m.partial + m.irrelevant + m.unjudged; m.exposures = n; m.relevantShare = m.unjudged || !n ? null : m.relevant / n; }
  metrics.push(metric);
}
let knownRelevant = 0, missingCandidates = 0, lostAll = 0, lostTop3 = 0, quotesChecked = 0, metadataChecked = 0;
const losses = [];
for (let i = 0; i < base.rows.length; i++) {
  const row = base.rows[i], current = after.rows[i], batch = snapshot.rows[i];
  for (const item of row.top5.slice(0, 3)) if (labelFor(row, item)?.score === 2) {
    knownRelevant++; const lost = !current.returnedIds.includes(item.id);
    missingCandidates += !current.candidateIds.includes(item.id); lostAll += lost; lostTop3 += !current.top5.slice(0, 3).some(r => r.id === item.id);
    if (lost) { const ci = batch.candidates.findIndex(c => c.item.id === item.id); losses.push({ set: row.set, id: row.id, query: row.query, resourceId: item.id, title: item.title,
      stage: !batch.contract.accepted || batch.contract.unresolved ? 'QUERY_CONTRACT' : ci < 0 ? 'CANDIDATE_RETRIEVAL' : !current.accepted ? 'SOURCE_RESPONSE_CONTRACT' : 'SOURCE_REQUIREMENTS', states: current.assessments?.find(a => a.i === ci)?.state }); }
  }
  for (const item of current.top5) for (const condition of item.semanticConditionReview.conditions) for (const p of condition.evidence) {
    if (['title', 'summary', 'sourceSupplement'].includes(p.field)) { const text = p.field === 'sourceSupplement' ? item.sourceSupplements.find(s => s.id === p.supplementId)?.text : item[p.field]; assert.equal(text.slice(p.start, p.end), p.quote); quotesChecked++; }
    else { if (p.field === 'catalogProgram') assert.equal(p.value, item.program); else if (p.field === 'catalogResourceType') assert.equal(p.value, item.kind); else if (p.field === 'verifiedDuration') { assert.equal(p.value, item.durationSeconds); assert.equal(p.sourceUrl, item.durationSourceUrl); } else assert.equal(p.field, 'derivedGenre'); metadataChecked++; }
  }
}
const ledger = read('docs/r12-40-llm-dollar-ledger.json'); assert.equal(ledger.pending.length, 0); assert.equal(ledger.approvedBudgetUsd, 2); assert(ledger.chargedUpperUsd <= 2);
let verifiedCalls = 0;
const audit = (file, rows, requestedModel, maxOutputTokens = 4096) => {
  const records = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(new Set(records.map(r => r.set + '/' + r.id)).size, records.length);
  for (const record of records) {
    const row = rows.find(r => r.set === record.set && r.id === record.id); assert(row); assert.equal(row.query, record.query);
    assert.equal(record.promptHash, sha(JSON.stringify(row.prepared.payload)));
    const payload = { ...row.prepared.payload, model: requestedModel, max_output_tokens: maxOutputTokens };
    const calls = ledger.calls.filter(c => c.requestHash === sha(JSON.stringify(payload))), measured = calls.filter(c => c.usage);
    assert.equal(measured.length, 1); assert(calls.filter(c => !c.usage).every(c => c.status === 'TRANSPORT_OR_RESPONSE_UNKNOWN' && c.chargedUpperUsd === c.upperUsd));
    assert.equal(record.response.model, requestedModel); assert.deepEqual(measured[0].usage, record.response.usage); verifiedCalls++;
  }
};
const initial = read('docs/r12-40-anchored-contracts.json.gz'), repaired = read('docs/r12-40-anchored-contracts-final.json.gz'), strong = read('docs/r12-40-anchored-contracts-strong.json.gz');
audit('docs/r12-40-anchored-query-responses.jsonl', initial.rows, 'gpt-6-luna');
audit('docs/r12-40-anchored-repair-responses.jsonl', repaired.rows.filter(r => r.compilation === 'REPAIR'), 'gpt-6-luna');
audit('docs/r12-40-anchored-strong-responses.jsonl', strong.rows.filter(r => r.compilation === 'STRONG_REPAIR'), 'gpt-4.1-2025-04-14');
audit('docs/r12-40-anchored-source-responses.jsonl', snapshot.rows, 'gpt-6-luna');
audit('docs/r12-40-anchored-entailment-responses.jsonl', read('docs/r12-40-anchored-entailment-candidates.json.gz').rows, 'gpt-4.1-2025-04-14', 1024);
for (const [p, hash] of Object.entries(base.before)) assert.equal(sha(fs.readFileSync(p)), hash);
const result = { generatedAt: new Date().toISOString(), metrics, knownRelevant, missingCandidates, lostAll, lostTop3, losses, quotesChecked, metadataChecked, verifiedCalls,
  sourceResponses: after.responses, expectedSourceResponses: after.expectedResponses, incomplete: after.incomplete, missingLabels: missing.length,
  entailmentResponses: final.responses, expectedEntailmentResponses: final.expectedResponses, entailmentIncomplete: final.incomplete,
  previousConservativeUsd: old.budget.chargedUpperUsd, additionalConservativeUsd: ledger.chargedUpperUsd - old.budget.chargedUpperUsd, totalConservativeUsd: ledger.chargedUpperUsd, remainingApprovedUsd: 2 - ledger.chargedUpperUsd,
  changedStores: [], queryOnly: after.rows.filter(r => !r.contract.accepted || r.contract.unresolved).map(r => ({ set: r.set, id: r.id, query: r.query, reason: r.reason })),
  caveat: '동일370 원문·원천 고정. 후보 독립 질문 조건·내용/선호 분리·원문 번호 대조. 미평가를 관련으로 세지 않는다. 에이전트의 잠정 텍스트 평가이며 교사/실제 영상 정답률·학년 적합성·전체 재현율이 아니다. 비용은 캐시 할인을 제외한 과대 추산이고 계정 잔액/실청구액이 아니다.' };
fs.writeFileSync('docs/r12-40-anchored-comparison.json', JSON.stringify(result, null, 2) + '\n');
fs.writeFileSync('docs/r12-40-anchored-unjudged.json', JSON.stringify(missing, null, 2) + '\n');
const esc = s => String(s || '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const table = ['# 동일370 고정 조건·원문 구절 검증 비교', '', '관련2/부분1/무관0. 미평가?를 관련으로 세지 않는다. 학년·수업 목적·난이도는 순위 문맥이며 필수 단어가 아니다.', '', '|세트/ID|원문 질문|이전 결과/상위3 판정|새 결과/상위3 판정|새 첫 자료|', '|---|---|---|---|---|'];
for (let i = 0; i < after.rows.length; i++) { const a = old.rows[i], b = after.rows[i]; const scores = r => r.top5.slice(0, 3).map(c => labelFor(r, c)?.score ?? '?').join(',') || '-'; table.push(`|${b.set}/${b.id}|${esc(b.query)}|${a.total}/${scores(a)}|${b.total}/${scores(b)}|${esc(b.top5[0]?.title)}|`); }
fs.writeFileSync('docs/r12-40-anchored-query-comparison.md', table.join('\n') + '\n');
console.log(JSON.stringify({ ...result, losses: losses.length, queryOnly: result.queryOnly.length }));
