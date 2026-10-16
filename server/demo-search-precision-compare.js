// 사람 정답 대신 고정된 에이전트 원문 라벨을 재사용한다. 검색어를 바꾸거나 결과에 정답을 주입하지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => {
  const bytes = fs.readFileSync(path.resolve(root, name));
  return JSON.parse(name.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes);
};
const beforePath = process.argv[2], afterPath = process.argv[3], labelPath = process.argv[4], outputPath = process.argv[5];
if (![beforePath, afterPath, labelPath, outputPath].every(Boolean)) throw Error('수정전JSON 수정후JSON 라벨JSON 새출력JSON 경로를 지정하세요.');
if (fs.existsSync(path.resolve(root, outputPath))) throw Error('비교 결과를 덮어쓰지 않습니다.');
const before = read(beforePath), after = read(afterPath), labelData = read(labelPath), labels = labelData.labels;
assert.equal(before.inputSha256, after.inputSha256);
assert.deepEqual(before.changedDuringRun, []);
assert.deepEqual(after.changedDuringRun, []);
for (const file of Object.keys(before.before).filter(file => file.includes('/data/'))) assert.equal(before.before[file], after.before[file], '저장소 판본 불일치: ' + file);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const key = (row, item) => `${row.set}-${row.id}:` + item.title.replace(/\((?:더빙|수어)\)/g, '') + ':' + sha(item.summary || '');
let quoteChecks = 0;
function inspect(item) {
  const quotes = [...(item.contentPreview?.evidence || []), ...(item.contentPreview?.keywordEvidence || []),
    ...(item.searchExplanation?.topicEvidence || []), ...(item.searchExplanation?.supplementEvidence || []),
    ...(item.searchExplanation?.details || []).flatMap(d => d.evidence || []), ...(item.meaningMatches || []).flatMap(m => m.evidence || []),
    ...(item.semanticTags || []).map(t => t.evidence), ...(item.contentKeywords || []).map(t => t.evidence),
    ...(item.relevanceEvidence?.focus?.evidence || [])];
  for (const q of quotes) {
    if (typeof q?.quote !== 'string' || !Number.isInteger(q.start) || !Number.isInteger(q.end)) continue;
    const text = q.field === 'sourceSupplement' ? (item.sourceSupplements || []).find(s => s.id === q.supplementId)?.text : item[q.field];
    assert.equal(typeof text, 'string', item.id + ': ' + q.field);
    assert.equal(text.slice(q.start, q.end), q.quote, item.id + ': 원문 위치 불일치');
    quoteChecks++;
  }
  for (const variant of item.alternatives || []) inspect(variant);
}
const judged = (row, stage) => {
  const candidates = row.top5.map((item, index) => {
    inspect(item);
    const score = labels[key(row, item)];
    assert.ok([0, 1, 2].includes(score), `새 후보 라벨 필요: ${stage} ${row.mode} ${row.set}-${row.id} ${item.id} ${item.title}`);
    return { rank: index + 1, id: item.id, title: item.title, sourceUrl: item.sourceUrl, summary: item.summary, score, evidence: item.searchExplanation?.topicEvidence || [], supplementEvidence: item.searchExplanation?.supplementEvidence || [] };
  });
  return { mode: row.mode, set: row.set, id: row.id, q: row.q, original: row.original, total: row.total, candidates, priorPositiveRetention: row.priorPositiveRetention };
};
const bRows = before.rows.map(r => judged(r, 'before')), aRows = after.rows.map(r => judged(r, 'after'));
assert.equal(bRows.length, aRows.length);
const metrics = [];
for (const [stage, rows] of [['before', bRows], ['after', aRows]]) for (const mode of ['final', 'original']) for (const set of [1, 2, 'all']) {
  const list = rows.filter(r => r.mode === mode && (set === 'all' || r.set === set));
  const scores = list.flatMap(r => r.candidates.map(c => c.score)), full = scores.filter(x => x === 2).length;
  metrics.push({ stage, mode, set, queries: list.length, nonempty: list.filter(r => r.total > 0).length,
    fullQueryCount: list.filter(r => r.candidates.some(c => c.score === 2)).length,
    top1FullQueryCount: list.filter(r => r.candidates[0]?.score === 2).length,
    full, partial: scores.filter(x => x === 1).length, irrelevant: scores.filter(x => x === 0).length,
    returned: scores.length, precisionReturned: scores.length ? Number((100 * full / scores.length).toFixed(1)) : null,
    fullPerFixedSlots: Number((100 * full / (list.length * 5)).toFixed(1)) });
}
const rows = aRows.map(a => {
  const b = bRows.find(r => r.mode === a.mode && r.set === a.set && r.id === a.id);
  assert.equal(a.q, b.q);
  const normalize = x => x.title.replace(/\((?:더빙|수어)\)/g, '') + ':' + sha(x.summary || '');
  const oldFull = b.candidates.filter(c => c.score === 2);
  const missingTop5 = oldFull.filter(old => !a.candidates.some(c => normalize(c) === normalize(old)));
  return { mode: a.mode, set: a.set, id: a.id, query: a.q, original: a.original, before: b, after: a,
    missingPriorFullFromTop5: missingTop5.map(c => ({ id: c.id, title: c.title, retention: a.priorPositiveRetention?.find(p => p.id === c.id) || null })) };
});
const codeDifferences = Object.keys(after.codeSnapshot?.files || {}).filter(file => before.codeSnapshot.files[file] !== after.codeSnapshot.files[file]);
const result = { date: '2026-10-16', scope: '고정 개발40개 검색어와 원문40개 진단. 같은 최신 공통 코드·같은6저장소에서 이번 수정10모듈만 비교. 원래 요청 기준의 에이전트 잠정 원문 평가이며 실제 영상/교사 정답률 아님.',
  before: beforePath, after: afterPath, labels: labelPath, inputSha256: before.inputSha256, codeDifferences,
  quoteChecks, paidApiCalls: 0, metrics, rows };
fs.writeFileSync(path.resolve(root, outputPath), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ quoteChecks, codeDifferences, metrics: metrics.filter(m => m.set === 'all') }, null, 2));
