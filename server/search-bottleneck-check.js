const assert = require('node:assert/strict');
const fs = require('node:fs');
const { normalizeRequestNoun, sourceVocabulary } = require('./request-nouns');
const { vocabulary } = require('./keyword-vocabulary');
const { parseDiscoveryIntent } = require('./discovery-intent');
const { negativeOnlyTopics } = require('./source-polarity');
const { sourceContext, contextRequest } = require('./source-context');
let morphology = 0;
for (const noun of vocabulary) {
  assert.equal(normalizeRequestNoun(noun), noun);
  for (const particle of ['의','을','를','은','는','에서']) {
    const normalized = normalizeRequestNoun(noun + particle);
    // 복수의 온전한 등록 명사로 해석되는 경우는 억지로 자르지 않는다.
    if (!vocabulary.includes(noun + particle)) assert.equal(normalized, noun, noun + particle);
    morphology++;
  }
}
const raw = '루미나규약을 소개한다. 루미나규약은 공개됐다.';
const words = sourceVocabulary([{ title: '원천 검사', summary: raw }]);
assert.equal(words.has('루미나규약'), false);
assert.equal(words.hasStem('루미나규약'), true);
assert.equal(normalizeRequestNoun('루미나규약의', words), '루미나규약');
assert.equal(normalizeRequestNoun('미확인비밀조약을', words), '미확인비밀조약을');
assert.equal(normalizeRequestNoun('우크라이나'), '우크라이나');
const polarity = [];
for (const noun of vocabulary.filter(n => /^[가-힣]{2,}$/u.test(n)).slice(0,100)) {
  const group = [{ requested: noun, aliases: [noun] }];
  assert.deepEqual(negativeOnlyTopics([{text:`${noun} 과정 없이 진행한다.`}], group), [noun]);
  assert.deepEqual(negativeOnlyTopics([{text:`${noun} 과정 없이 진행한다. ${noun} 실험도 별도로 관찰한다.`}], group), []);
  polarity.push(noun);
}
// 원래 복합 표현과 본문 연결을 보존한다. 조사 제거로 다른 별칭을 강제하지 않는다.
assert.equal(parseDiscoveryIntent('달의 모양').concepts[0].label, '달의 모양');
const local = text => sourceContext({title:'원천 검사',summary:text}, {sourceContext:contextRequest('우리 고장의 모습'),terms:['고장']});
assert.equal(local('아라호가 고장 나자 범인을 찾는다. 고장 낸 범인은 누구인가?').matched, false);
assert.equal(local('전통 문화의 고장 나주를 찾아 주민들의 삶을 소개한다.').matched, true);
const change = text => sourceContext({title:'우리 동네',summary:text}, {sourceContext:contextRequest('우리 동네에서 바뀐 모습'),terms:['동네']});
assert.equal(change('동네 지도를 그려 본다.').matched,false);
assert.equal(change('과거 동네의 풍경과 지금 달라진 모습을 살펴본다.').matched,true);
assert.equal(contextRequest('나라마다 시간이 다른 이유는 무엇일까').comparisonSubject,'시간');
assert.equal(contextRequest('우리 지역 특산물은 어떻게 다른 지역으로 갈까').comparisonSubject,undefined);
assert.deepEqual(negativeOnlyTopics([{text:'차별이 아닌 공존과 인권 보호를 이야기한다.'}],[{requested:'인권',aliases:['인권','차별','평등']}]),[]);
const report = { registeredNouns:vocabulary.length,particleChecks:morphology,polarityPairs:polarity.length,passed:true,paidApiCalls:0 };
fs.writeFileSync('docs/r12-40-structural-checks.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
