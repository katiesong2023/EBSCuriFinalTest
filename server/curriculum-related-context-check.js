const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { discoverRelatedStandards } = require('./curriculum-related');
const { readDataStore } = require('./data-store');
(async () => {
  const store = await readDataStore(), cases = [];
  const check = async (name, fn) => { await fn(); cases.push(name); };
  const related = input => discoverRelatedStandards(input, store);
  await check('같은 자료라도 검색 의도에 따라 우선순위 변경', async () => {
    const q = '인구 분포와 건강, 질병을 조사한다';
    assert.equal((await related({q, searchQuery:'인체'})).related[0].id, '6과04-03');
    assert.ok(['6사02-02','6사12-01'].includes((await related({q, searchQuery:'인구 분포'})).related[0].id));
  });
  await check('검색어만 맞는 무관한 기준을 추가하지 않음', async () => {
    const q = '화산 활동과 화산 폭발';
    const before = await related({q}), after = await related({q,searchQuery:'민주주의'});
    assert.deepEqual(after.related.map(x=>x.id), before.related.map(x=>x.id));
    assert.ok(after.related.every(x=>x.searchScore===0));
    assert.equal((await related({q:'',searchQuery:'민주주의'})).related.length, 0);
  });
  await check('자료 근거가 있는 후보와 검색어의 교집합 우선', async () => {
    const d = await related({q:'기후 변화로 홍수 피해를 입는 인구가 늘었다',searchQuery:'기후 변화'});
    assert.ok(d.related[0].searchScore > 0);
    let other = false;
    for (const row of d.related) { if (!row.searchScore) other = true; else assert.equal(other, false); }
  });
  await check('접속 표현만으로 경제·민주화 기준을 추천하지 않음', async () => {
    const d = await related({q:'갯벌의 생명들이 개발로 인해 밀려났다',searchQuery:'갯벌 생태계'});
    assert.equal(d.related[0].id, '4과06-03');
    assert.ok(d.related.every(x=>!['4사03-01','4사07-01','6사07-02'].includes(x.id)));
    assert.equal((await related({q:'인해 해결책 움직이는 현상'})).related.length, 0);
  });
  await check('검색어 없는 기존 호출·공식 코드·최대8개 계약', async () => {
    const a = await related({q:'지구 자전'}), b = await related({q:'지구 자전',searchQuery:''});
    assert.deepEqual(a,b);
    assert.equal((await related({q:'6과12-02'})).related[0].id, '6과12-02');
    assert.ok((await related({q:'민주주의 기후 인구 건강 전기'})).related.length <= 8);
    assert.equal(a.paidApiCalls,0);
  });
  await check('부정 표현·교과/과정 조건·입력 검증', async () => {
    const d = await related({q:'화산 말고 지진',searchQuery:'지진',subject:'과학',grade:'elementary34'});
    assert.ok(d.related.length>0);
    assert.ok(d.related.every(x=>!x.matchedTerms.includes('화산')));
    for (const input of [{q:'화산',searchQuery:3},{q:'화산',searchQuery:'x'.repeat(201)},{q:'화산',unknown:1},{q:'화산',subject:'영어'},{q:'화산',grade:'고3'}]) await assert.rejects(()=>related(input));
  });
  await fs.writeFile('docs/r12-34-related-context-check.json',JSON.stringify({checkedAt:new Date().toISOString(),cases,passed:cases.length,paidApiCalls:0},null,2)+'\n');
  console.log(cases.length, '교육과정 검색 문맥 검증 통과');
})().catch(error=>{console.error(error);process.exitCode=1;});
