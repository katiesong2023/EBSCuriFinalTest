// 결과 영상 평가에서 드러난 공통 해석·비유 경계를 합성 원문으로 확인한다.
const assert = require('node:assert/strict');
const { discoverTeacherContents } = require('./teacher-discovery');
const { parseDiscoveryIntent } = require('./discovery-intent');
const { analyseLiteralText } = require('./source-literal');
const make = (id, title, summary) => ({ id, title, summary, program: '합성 검증', kind: 'episode', sourceUrl: `https://www.ebs.co.kr/${id}` });
const resources = [
  make('quake', '지진 발생', '지진 발생의 원인을 설명한다.'),
  make('fire', '화재 발생', '화재 발생의 원인을 설명한다.'),
  make('flight', '철새 이동', '철새 이동을 관찰한다.'),
  make('seed', '식물의 씨앗', '식물의 씨앗을 퍼뜨리는 바람과 동물을 관찰한다.'),
  make('charity', '나눔', '나눔의 씨앗을 퍼뜨리는 선한 영향력.'),
  make('sleep', '수면 중의 뇌', '수면 동안 뇌 활동이 바뀌는 과정을 살펴본다.'),
  make('rest', '잠든 사람', '피곤한 사람이 잠을 잔다.')
  , make('moon', '달의 모양', '지구에서 보는 달의 모양은 달과 태양의 상대적인 위치에 따라 달라진다.')
  , make('bread', '초승달 모양 빵', '초승달 모양의 빵을 만든다.')
  , make('tray', '보름달 놀이', '보름달을 닮은 채반의 형태를 탐색한다.')
];
const catalog = { resources, concepts: [], searchVariants: [] };
const search = q => discoverTeacherContents({ q }, catalog, { verifiedAssets: [] }, { useSemantic: false });
(async () => {
  const before = JSON.stringify(catalog), cases = [];
  const check = async (name, fn) => { await fn(); cases.push(name); };
  await check('내용 동작의 활용형으로 주제를 잃지 않고 긍정 원문 발견', async () => {
    const r = await search('지진이 발생하는 원리');
    assert.ok(r.results.some(x => x.id === 'quake'));
    assert.ok(!r.results.some(x => x.id === 'fire'));
  });
  await check('다른 내용 동작에도 같은 정규화 적용', async () => {
    assert.ok((await search('철새가 이동하는 모습')).results.some(x => x.id === 'flight'));
  });
  await check('미지 내용어를 삭제하지 않음', async () => assert.equal((await search('지진이 발생하는 루미나특수현상')).total, 0));
  await check('명시 AND·제외 조건 보존', async () => {
    assert.equal((await search('지진이 발생하는 그리고 은빛가상금속')).total, 0);
    assert.equal((await search('지진 발생, 지진 제외')).total, 0);
  });
  await check('시청 요청과 다른 실제 수면·뇌 주제 보존', async () => {
    const r = await search('잠을 자는 동안 뇌에서 일어나는 일');
    assert.ok(r.results.some(x => x.id === 'sleep'));
    assert.ok(!r.results.some(x => x.id === 'rest'));
  });
  await check('생물 씨앗은 보존하고 추상적 씨앗은 제외', async () => {
    const r = await search('식물이 씨앗을 퍼뜨리는 방법');
    assert.ok(r.results.some(x => x.id === 'seed'));
    assert.ok(!r.results.some(x => x.id === 'charity'));
  });
  await check('새 비유 어휘에도 같은 길이·오프셋 보존', () => {
    for (const text of ['우정의 씨앗을 나누다.', '배려의 열매를 맺다.', '선행의 씨앗이 자란다.']) {
      const r = analyseLiteralText(text);
      assert.equal(r.text.length, text.length);
      assert.ok(r.spans.length);
      for (const span of r.spans) assert.equal(text.slice(span.start, span.end), span.quote);
    }
    assert.equal(analyseLiteralText('나눔 행사에서 해바라기 씨앗을 심는다.').spans.length, 0);
  });
  await check('원래 요청과 해석 변경을 추적', () => {
    const q = '철새가 이동하는 모습', r = parseDiscoveryIntent(q);
    assert.equal(r.naturalLanguage.original, q);
    assert.ok(r.expansions.some(x => x.quote === '이동하는' && x.term === '이동'));
  });
  await check('원천 객체 변경 없음', () => assert.equal(JSON.stringify(catalog), before));
  await check('달 모양의 천문 설명은 보존·음식과 닮은 놀이 제외', async () => {
    const r = await search('달의 모양');
    assert.ok(r.results.some(x => x.id === 'moon'));
    assert.ok(!r.results.some(x => ['bread', 'tray'].includes(x.id)));
  });
  console.log(JSON.stringify({ passed: cases.length, cases, paidApiCalls: 0 }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
