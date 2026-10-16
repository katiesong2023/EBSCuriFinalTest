const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { contentKeywords } = require('./content-keywords');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { tagResource } = require('./semantic-layer');
const names = ['curi-store.json', 'broadcast-catalog.sqlite', 'semantic-layer.sqlite', 'automatic-assets.sqlite'];
const hashes = () => Object.fromEntries(names.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync('server/data/' + name)).digest('hex')]));
const labels = item => contentKeywords(item, tagResource(item).supported).map(word => word.label);
async function main() {
  const before = hashes(), cases = [];
  function check(name, run) { run(); cases.push({name, passed:true}); console.log('통과:', name); }
  check('비유적 제목에서 본문에 없는 용어·자유 제목 단어 제외', () => {
    const food=labels({title:'바다의 우유, 굴 따러가세',summary:'겨울철 별미, 굴을 따고 담는 작업 현장을 소개한다.'});
    assert.ok(food.includes('굴'));assert.ok(!food.includes('우유'));assert.ok(!food.includes('바다'));
    assert.ok(!labels({title:'심장으로 듣는 아이돌',summary:'청각 장애인 아이돌의 음악과 공연을 소개한다.'}).includes('심장'));
    assert.ok(!labels({title:'역사의 빛',summary:'유일한 박사의 생애와 독립운동을 소개한다.'}).includes('빛'));
    assert.deepEqual(labels({title:'도시의 심장',summary:'도시의 심장'}), []);
    assert.deepEqual(labels({title:'도시 교통',summary:''}), []);
  });
  check('소개문의 비유·인명·부정·동명이의 의미 보류', () => {
    for (const summary of ['일본의 심장이라 불리는 기후현의 음식과 전통을 소개한다.', '고성 어장의 경쟁은 전쟁을 방불케 한다.', '화석 씨는 가족과 함께 요리한다.', '빛을 다루지 않는다. 가족 이야기를 소개한다.', '솜사탕 구름을 타고 숲속 친구들이 모험한다.']) {
      const tags=labels({title:'비유 제목',summary});
      assert.ok(!tags.some(tag=>['심장','화석','빛','구름','전쟁','기후'].includes(tag)), summary);
    }
  });
  check('문자 그대로 다루는 과학 개념·부정 뒤 긍정 문장 근거', () => {
    for (const [label, summary] of [['심장','심장의 구조와 혈액 순환 과정을 알아본다.'], ['빛','빛의 반사와 굴절을 렌즈로 관찰한다.'], ['구름','구름의 무게와 수증기의 응결 과정을 알아본다.'], ['화석','지층에서 발견한 공룡 화석을 관찰한다.'], ['전쟁','한국전쟁의 역사와 전쟁의 피해를 알아본다.']]) assert.ok(labels({title:'수업',summary}).includes(label), label);
    const words=contentKeywords({title:'실험',summary:'빛을 다루지 않는다. 렌즈로 빛의 굴절을 관찰한다.'});
    assert.ok(words.find(word=>word.label==='빛').evidence.context.includes('굴절'));
  });
  check('교육 탐색 대표 어휘 정리·추정 상위 개념 금지·원문 위치와 문장', () => {
    const item={title:'누리호',summary:'인공위성과 우주 탐사에 대해 알아본다.<br>철도와 교통의 변화를 소개한다. 꿀벌의 활동을 관찰한다.',sourceUrl:'https://www.ebs.co.kr/test'};
    const words=contentKeywords(item);
    assert.ok(words.some(word=>word.label==='교통'));
    assert.ok(words.some(word=>word.label==='우주'));
    assert.ok(!words.some(word=>word.label==='생태계'));
    for (const word of words) { assert.equal(word.evidence.field,'summary'); assert.equal(item.summary.slice(word.evidence.start,word.evidence.end),word.evidence.quote);assert.ok(word.evidence.context.includes(word.evidence.quote)); }
  });
  check('긴 소개문 도입의 단발성 주변 소재 제외', () => {
    const item={title:'냉동 보존',summary:'미국의 한 학자는 암이 폐로 전이되었다. '+ '냉동 보존 기술의 가능성과 한계를 설명한다. '.repeat(30)};
    assert.ok(!labels(item).includes('호흡 기관'));
  });
  const catalog=await loadDiscoveryCatalog(), items=[...catalog.resources,...catalog.searchVariants];
  const actual=[];
  const expectations=[['바다의 우유, 굴 따러가세',['우유','바다']],['심장으로 듣는 아이돌 빅오션! 그 매니저가 되다',['심장','빅오션']],['역사의 빛, 청년 제6부 억만장자의 독립운동',['빛']],['심장이 뛴다, 화성',['심장']],['이지연의 일본 소도시 기행-일본의 심장, 기후',['심장','기후']],['머구리의 바다',['전쟁']]];
  check('실제 카탈로그 비유 사례6건 확인', () => {
    for(const [title,rejected] of expectations){const item=items.find(item=>item.title===title);assert.ok(item,title);const words=contentKeywords(item,tagResource(item).supported);assert.ok(!words.some(word=>rejected.includes(word.label)),title);actual.push({id:item.id,title,summary:item.summary,keywords:words.map(word=>({label:word.label,evidence:word.evidence}))});}
  });
  let withKeywords=0,keywordCount=0,withoutSummary=0;
  check('전체 원문 대조·제목 인용 태그0·보호 저장소 동일', () => {
    for(const item of items){const words=contentKeywords(item);if(words.length)withKeywords++;keywordCount+=words.length;if(!item.summary.trim())withoutSummary++;for(const word of words){const evidence=word.evidence;assert.ok(['summary','sourceSupplement'].includes(evidence.field));const source=evidence.field==='summary'?item.summary:require('./supplement-search').searchableSupplements(item).find(s=>s.id===evidence.supplementId&&s.contentHash===evidence.contentHash)?.text;assert.equal(typeof source,'string');assert.equal(source.slice(evidence.start,evidence.end),evidence.quote);}}
    assert.deepEqual(hashes(),before);
  });
  fs.writeFileSync('docs/r07-15-contextual-keywords-check.json',JSON.stringify({date:'2026-10-12',cases,actual,coverage:{total:items.length,withKeywords,keywordCount,withoutSummary},protectedHashes:before,paidApiCalls:0,limitations:'명시적 소개문·문장 규칙 기반. 모델의 전체 맥락 이해·교육과정 적합성 판정은 아님. 검색용 기존 태그 색인은 보존.'},null,2)+'\n');
  console.log({withKeywords,keywordCount});
}
main().catch(error=>{console.error(error);process.exitCode=1;});
