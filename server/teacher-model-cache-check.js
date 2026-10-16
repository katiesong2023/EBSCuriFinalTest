const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createResponseCache } = require('./model-response-cache');
const { supplementSearchStatus } = require('./supplement-search');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curi-teacher-cache-')), cases = [];
const check = (name, run) => { run(); cases.push(name); };
try {
 const cache = createResponseCache(dir), p = { model: 'fixture-model', store: false, input: ['query', 'source'] }, response = { status: 'completed', model: 'fixture-model', output: [] };
 check('실제 완료 응답만 저장·키 순서에 무관하게 같은 요청 재사용', () => { cache.put(p, response); assert.deepEqual(cache.get({ input: p.input, store: false, model: p.model }), response); });
 check('질문·원문·모델 변경 시 캐시 무효', () => { for (const changed of [{ ...p, model: 'different' }, { ...p, input: ['other', 'source'] }, { ...p, input: ['query', 'new source'] }]) assert.equal(cache.get(changed), null); });
 check('미완료·모델 불일치 응답은 저장 안 함', () => { for (const r of [{ ...response, status: 'incomplete' }, { ...response, model: 'other' }]) { const q = { ...p, input: ['new'] }; cache.put(q, r); assert.equal(cache.get(q), null); } });
 const identity = { resourceId: 'fixture', title: '합성 자연', program: '합성 자연', broadcastDate: '2026-01-25', variant: 'original', sourceUrl: 'https://www.ebs.co.kr/fixture?lectId=25' };
 const record = (text, sourceUrl = 'https://about.ebs.co.kr/fixture') => { const r = { type: 'PRESS_RELEASE', sourceUrl, text, identity, location: '문단' }; r.contentHash = crypto.createHash('sha256').update(JSON.stringify([r.type, r.sourceUrl, r.text, r.identity, r.location])).digest('hex'); return r; };
 check('프로그램명뿐인 회차는 근접 게시일만으로 보조 원문 연결하지 않음', () => assert.equal(supplementSearchStatus(record('* 방송일시: 2026년 1월 18일. 다른 주제.'), identity).eligible, false));
 check('명시된 같은 방송일·개별 회차 URL은 인정', () => { assert.equal(supplementSearchStatus(record('* 방송일시: 2026년 1월 25일. 자기 회차.'), identity).eligible, true); assert.equal(supplementSearchStatus(record('자기 회차 공식 페이지', identity.sourceUrl), identity).eligible, true); });
 fs.writeFileSync('docs/r12-40-teacher-model-cache-checks.json', JSON.stringify({ passed: cases.length, failed: 0, cases, paidCalls: 0 }, null, 2) + '\n');
 console.log(JSON.stringify({ passed: cases.length, failed: 0, paidCalls: 0 }));
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
