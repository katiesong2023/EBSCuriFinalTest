// 누락 보충의 내용 근거·은유/제작 경력·회차 식별·원문 불변을 확인한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { contentKeywords } = require('./content-keywords');
const { fingerprint } = require('./broadcast-store');
const cases = [];
function check(name, run) { run(); cases.push({ name, passed: true }); }
const labels = item => contentKeywords(item).map(w => w.label);
check('기존 어휘 밖 생물·질환·사회·언어 주제', () => {
  for (const [word, summary] of [['짝짓기','생명체가 짝짓기를 위해 벌이는 경쟁과 전략을 다룬다.'],['어깨관절','어깨관절 관련 질환과 치료법을 알아본다.'],['자유','자유라는 개념의 역설과 모순을 분석한다.'],['속담','속담을 읽고 뜻을 알아보는 활동이다.']]) assert.ok(labels({title:'방송 내용',summary}).includes(word), word);
});
check('조리명은 완전한 원문 어절로 추출', () => {
  const words=labels({title:'조리',summary:'연근우엉간장장아찌와 깻잎된장장아찌를 만든다.'});
  assert.ok(words.includes('연근우엉간장장아찌')); assert.ok(words.includes('깻잎된장장아찌'));
  assert.ok(!labels({title:'문학',summary:'역사의반전과 기억의재조림을 생각한다.'}).includes('재조림'));
});
check('사전에 없는 원문 주제 명사·제목 추측/제작자/부정 제외', () => {
  const words=labels({title:'바닷가 일터',summary:'해삼건조기의 제조 원리와 해삼건조기를 관찰한다.'});assert.ok(words.includes('해삼건조기'));
  assert.ok(labels({title:'기록',summary:'장승제에 대해 알아본다.'}).includes('장승제'));
  assert.ok(!labels({title:'은유의 등불',summary:'제작진에 관한 안내와 누구를 소개할 것인지 논의한다.'}).some(w=>['등불','제작진','누구'].includes(w)));
  assert.ok(!labels({title:'실험',summary:'소나무를 다루지 않는다.'}).includes('소나무'));
});
check('은유·부정·출연자 경력은 내용 키워드로 만들지 않음', () => {
  for (const item of [{title:'희망의 그림자',summary:'희망의 그림자를 표현한다.'},{title:'식탁',summary:'소나무를 다루지 않는다.'},{title:'방송',summary:'배우 김하늘은 평소 알츠하이머 캠페인을 후원했다. 춤을 배우는 무대를 보여준다.'}]) {
    assert.ok(!labels(item).some(w=>['그림자','소나무','알츠하이머'].includes(w)));
  }
});
check('사회 문제와 대안의 대비는 관련 주제로 보존', () => {
  assert.ok(labels({title:'공존',summary:'차별이 아닌 공존의 방법을 찾아야 할 때이다.'}).includes('인권'));
  assert.ok(labels({title:'평화의 길',summary:'전쟁이 아닌 평화의 길을 찾아 군인과 시민의 피해를 돌아본다.'}).includes('전쟁'));
  assert.ok(!labels({title:'안내',summary:'도시가 아닌 동네로 눈을 돌렸다.'}).includes('도시'));
});
check('소개문 없음·제목 복사·제작 안내는 억지 추출하지 않음', () => {
  for(const item of [{title:'도시 교통',summary:''},{title:'도시의 심장',summary:'도시의 심장'},{title:'자유',summary:'기존 프로그램을 재구성하여 제작'}]) assert.deepEqual(labels(item),[]);
});
const item={id:'keyword-fixture',title:'연구 기록',program:'자연 탐구',variant:'EPISODE',broadcastDate:'2026-10-15',sourceUrl:'https://www.ebs.co.kr/fixture',summary:''};
const identity={resourceId:item.id,title:item.title,program:item.program,broadcastDate:item.broadcastDate,variant:item.variant,sourceUrl:item.sourceUrl};
const supplement={id:'fixture-source',type:'PRESS_RELEASE',sourceUrl:'https://about.ebs.co.kr/fixture',text:'개미와 진딧물의 공생 관계와 번식 행동을 관찰한다.',identity,location:'본문'};
supplement.contentHash=fingerprint(JSON.stringify([supplement.type,supplement.sourceUrl,supplement.text,identity,supplement.location]));
check('공식 보조 원문의 회차·판본·지문과 인용 위치', () => {
  const resource={...item,sourceSupplements:[supplement]},before=JSON.stringify(resource),words=contentKeywords(resource);
  assert.ok(words.length);assert.equal(JSON.stringify(resource),before);
  for(const word of words){assert.equal(word.evidence.field,'sourceSupplement');assert.equal(word.evidence.supplementId,supplement.id);assert.equal(supplement.text.slice(word.evidence.start,word.evidence.end),word.evidence.quote);}
  for(const invalid of [{...supplement,identity:{...identity,resourceId:'other'}},{...supplement,text:'변조된 원문'},{...supplement,sourceUrl:'https://example.com/text'}]) assert.deepEqual(labels({...item,sourceSupplements:[invalid]}),[]);
});
check('기존 긍정 키워드·추론 상위 개념과 원문 보존', () => {
  const resource={title:'사찰음식',summary:'사찰음식은 요리와 수행의 과정이다. 신선한 식재료를 사용한다.'};
  const before=JSON.stringify(resource),words=contentKeywords(resource);assert.ok(words.some(w=>w.label==='사찰음식'));assert.equal(JSON.stringify(resource),before);
  assert.ok(!labels({title:'개미',summary:'개미의 번식 행동을 관찰한다.'}).includes('생태계'));
  for(const word of words)assert.equal(resource.summary.slice(word.evidence.start,word.evidence.end),word.evidence.quote);
});
fs.writeFileSync('docs/r12-25-keyword-check.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:cases.length,cases,paidApiCalls:0},null,2)+'\n');
console.log(cases.length,'missing keyword checks passed');
