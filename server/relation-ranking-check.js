const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readDataStore } = require('./data-store');
const { assessRelation, ruleScope, ruleVersion } = require('./automatic-relation-rules');
const { createAutomaticEvidence } = require('./automatic-evidence');
const { discoverCurriculum } = require('./curriculum-discovery');
const { readBroadcastResources } = require('./broadcast-store');

async function run() {
  const store = await readDataStore(), cases = [];
  const check = async (name, fn) => { await fn(); cases.push({ name, passed: true }); };
  const standard = id => store.curriculumStandards.find(entry => entry.metadata.achievementStandardId === id);
  const assess = (id, synopsis) => assessRelation({ synopsis }, standard(id));
  const election = '시민은 투표로 대표를 선출한다. 시민은 선거 참여를 통해 주권을 행사한다.';
  const rotation = '지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.';
  const resource = (id, title, summary) => ({ id, title, summary, program: '격리된 개발 검사', kind: 'episode',
    sourceSystem: 'EBS_BROADCAST', variant: 'ORIGINAL', sourceUrl: 'https://www.ebs.co.kr/test', evidenceUrl: 'https://www.ebs.co.kr/test', navigation: { status: 'PUBLISHED' } });
  const discover = (id, resources, state) => discoverCurriculum({ standard: id, grade: 'elementary56', ...(state ? { state } : {}) }, { resources, stats: {} }, store);

  await check('단어가 많은 나열보다 요구 관계가 있는 짧은 원문을 먼저 제공', async () => {
    const many = resource('MANY-WORDS', '민주주의 시민 선거 주권 참여 의미 역할', '민주주의 시민 선거 주권 참여 투표 대표 의미 역할이라는 단어를 나열한다. 시민의 일상과 다양한 도시 풍경을 길게 둘러본다. 정치 분야에 쓰이는 여러 단어의 철자를 자료에 모아 놓았다. 선거와 주권이라는 이름이 책에도 등장한다.');
    const relation = resource('RELATION', '시민의 선택', election);
    const result = await discover('6사08-01', [many, relation]);
    assert.equal(result.results[0].id, relation.id); assert.ok(result.results[0].ranking.relationRank > result.results[1].ranking.relationRank);
    assert.ok(many.summary.length > relation.summary.length);
  });
  await check('동의 표현이 기존 발견 필수어 없이도 후보와 자동 근거에 도달', async () => {
    const text = '국민은 표를 던져 대표자를 뽑는다. 사람들은 다음에 함께 일할 사람을 선택하는 과정을 지켜본다.';
    const result = await discover('6사08-01', [resource('SYNONYM', '우리의 선택', text)]);
    assert.equal(result.results.length, 1); assert.equal(result.results[0].curriculumComparison.connectedParts.length, 1);
    const report = createAutomaticEvidence({ sourceSystem: 'EBS_BROADCAST', sourceContentId: 'SYNONYM', title: '우리의 선택', synopsis: text,
      variant: 'ORIGINAL', kind: 'episode', active: true, sourceVersion: 'fixture', sourceUrl: 'https://www.ebs.co.kr/test', textSourceUrl: 'https://www.ebs.co.kr/test' },
    store.curriculumStandards, { standardId: '6사08-01', subject: '사회', gradeBand: '5~6학년군' });
    assert.equal(report.summary.publishable, 1); assert.equal(report.relations[0].semantic.standardCoverage, 'PARTIAL');
  });
  await check('자전의 다른 표현도 동일 대상·원인·결과를 문장 안에서 확인', () => {
    const result = assess('6과12-02', '지구는 스스로 돈다. 지구가 스스로 돌기 때문에 낮과 밤이 번갈아 나타난다.');
    assert.equal(result.status, 'SUPPORTED'); assert.equal(result.supportedRequirements.length, 2);
    assert.equal(result.standardCoverage, 'PARTIAL');
  });
  await check('폭력 사용의 부정은 독립된 선거·주권 인용을 지우지 않음', () => {
    const result = assess('6사08-01', `${election} 선거는 폭력을 사용하지 않고도 분쟁을 해결하는 방법이다.`);
    assert.equal(result.status, 'SUPPORTED'); assert.equal(result.evidence.length, 2);
    assert.equal(result.ignoredNegations[0].target, '폭력 사용');
  });
  await check('실제 알려진 선거 자료의 폭력 부정은 상충 해제하되 직접 요구 없는 자동 공개는 보류', () => {
    const source = readBroadcastResources().find(entry => entry.summary.includes('폭력을 사용하지 않고도'));
    assert.ok(source);
    const result = assess('6사08-01', source.summary);
    assert.equal(result.status, 'HELD'); assert.equal(result.explicitConflicts.length, 0); assert.equal(result.supportedRequirements.length, 0);
  });
  await check('같은 관계를 명시적으로 부정하면 상충을 유지하고 다른 요구의 유효 인용 보존', async () => {
    const text = `${rotation} 지구의 자전과 낮과 밤은 관계가 없다.`;
    const result = assess('6과12-02', text);
    assert.equal(result.status, 'CONFLICT'); assert.deepEqual(result.supportedRequirements.map(entry => entry.id), ['rotation']);
    assert.equal(result.explicitConflicts[0].id, 'day-night-cause'); assert.equal(result.evidence[0].quote, '지구는 자전한다.');
    const listed = await discover('6과12-02', [resource('CONFLICT', '지구의 자전', text)], 'EXPLICIT_CONFLICT');
    assert.equal(listed.results.length, 1);
    const rows = listed.results[0].curriculumComparison.requirementComparisons;
    assert.equal(rows.find(row => row.id === 'rotation').status, 'SUPPORTED');
    assert.equal(rows.find(row => row.id === 'day-night-cause').status, 'EXPLICIT_CONFLICT');
  });
  await check('의문·추측·가정·인용된 부정은 해석 보류로 구분하고 다른 인용을 보존', () => {
    for (const sentence of ['지구의 자전 때문에 낮과 밤이 생길까?', '지구가 자전하므로 낮과 밤이 생길 수 있다.',
      '만약 지구가 자전한다면 낮과 밤이 생긴다.', '“지구의 공전 때문에 낮과 밤이 생긴다”라는 주장이다.',
      '‘지구의 자전과 낮과 밤은 관계가 없다’라는 주장이다.']) {
      const result = assess('6과12-02', `지구는 자전한다. ${sentence}`);
      assert.equal(result.status, 'HELD', sentence); assert.equal(result.explicitConflicts.length, 0, sentence);
      assert.deepEqual(result.supportedRequirements.map(entry => entry.id), ['rotation'], sentence);
    }
  });
  await check('받지 못하는 쪽이라는 조건 설명은 낮·밤 원인의 부정으로 읽지 않음', () => {
    const result = assess('6과12-02', '지구는 자전한다. 지구가 자전하면서 햇빛을 받는 쪽은 낮이 되고 받지 못하는 쪽은 밤이 된다.');
    assert.equal(result.status, 'SUPPORTED'); assert.equal(result.explicitConflicts.length, 0);
  });
  await check('앞의 잘못된 설명을 뒤에서 취소한 문맥은 단정 상충이 아닌 해석 보류', () => {
    const result = assess('6과12-02', '지구의 공전 때문에 낮과 밤이 생긴다. 이 설명은 틀렸다.');
    assert.equal(result.status, 'HELD'); assert.equal(result.explicitConflicts.length, 0); assert.equal(result.interpretationHeld, true);
  });
  await check('다른 연소 생성물의 문장을 합쳐 피해 관계를 만들지 않음', () => {
    const result = assess('6과14-04', '석탄을 태우면 이산화탄소가 발생한다. 배출된 황산화물은 산성비를 일으켜 산림의 생태계에 피해를 준다.');
    assert.equal(result.status, 'HELD'); assert.equal(result.supportedRequirements.length, 1);
    assert.equal(result.requirementResults.find(row => row.id === 'emissions-damage').status, 'NOT_CONFIRMED');
  });
  await check('원문 인용 위치·요구별 연결은 부정/보류 여부와 함께 실존', () => {
    const text = `🌍 소개 자료다.\n  ${rotation} 지구의 자전과 낮과 밤은 관계가 없다.`;
    const result = assess('6과12-02', text);
    for (const row of result.requirementResults) for (const quote of row.evidence) assert.equal(text.slice(quote.start, quote.end), quote.quote);
    assert.ok(result.requirementResults.every(row => row.reason));
  });
  await check('용해 일상 표현은 후보 발견만 확대하고 미지원 상태·건조 오탐 경계 유지', async () => {
    const resources = [resource('SALT', '바다의 선물', '소금물을 담은 작은 그릇을 햇볕 아래 두고 시간이 지난 뒤 남은 알갱이를 관찰한다.'),
      resource('SUGAR', '주방의 작은 변화', '설탕물에 든 여러 물질을 자세히 살펴보며 물이 줄어드는 동안의 모습을 소개한다.'),
      resource('LAUNDRY', '화창한 날', '햇볕에 옷을 말리는 가족의 일상과 말린 과일로 음식을 만드는 모습을 소개한다.')];
    for (const id of ['6과03-01', '6과05-02']) {
      const result = await discover(id, resources);
      assert.ok(result.results.some(row => row.id === 'SALT')); assert.ok(result.results.some(row => row.id === 'SUGAR'));
      assert.ok(result.results.every(row => row.id !== 'LAUNDRY' && row.curriculumComparison.semanticState === 'UNSUPPORTED' && row.ranking.relationRank === 0));
    }
    assert.equal(ruleScope().rules.length, 4);
  });
  await check('같은 제목 판본도 관계 근거의 순서와 각자 인용을 유지', async () => {
    const result = await discover('6사08-01', [resource('SHORT-RELATION', '선택', election), resource('LONG-MENTION', '선택', '민주주의 선거 주권 시민 참여의 여러 단어를 나열하고 일상을 소개한다. 선거와 투표의 단어가 기사에 쓰이는 여러 모습을 오래 살펴보며 도시에서 만난 시민들의 소소한 하루를 따라간다.')]);
    assert.equal(result.results[0].id, 'SHORT-RELATION'); assert.equal(result.results[0].alternatives[0].id, 'LONG-MENTION');
    assert.equal(result.results[0].alternatives[0].curriculumComparison.connectedParts.length, 0);
  });
  const baselinePath = 'docs/r08-08-development-before.json';
  const comparison = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')).map(entry => {
    const current = assess(entry.standardId, entry.synopsis);
    return { id: entry.id, standardId: entry.standardId, synopsis: entry.synopsis,
      before: { status: entry.assessment.status, supported: entry.assessment.supportedRequirements.length },
      after: { status: current.status, supported: current.supportedRequirements.length, standardCoverage: current.standardCoverage } };
  }) : [];
  const report = { checkedAt: new Date().toISOString(), passed: cases.length, cases, ruleVersion, scope: ruleScope(), comparison,
    note: '알려진 실제 개발 사례와 합성 회귀입니다. 독립 표본·사람 의미 평가가 아니며 원문 보강 전 같은 텍스트를 비교합니다.', paidApiCalls: 0 };
  fs.writeFileSync(process.env.CURI_REPORT_PATH || 'docs/r08-08-relation-ranking-check.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: cases.length, comparison, ruleVersion }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });
