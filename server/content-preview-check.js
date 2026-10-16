const assert = require('node:assert/strict');
const fs = require('node:fs');
const { previewContent, plainText } = require('./content-preview');
const cases=[];
function check(name, operation) { operation(); cases.push({name,passed:true}); }
check('도입 문구보다 실제 콘텐츠의 핵심 문장·구체어 선택',()=>{
  const item={title:'딱 하루만',summary:'벌써 1월 중순이라니. 시간이 빨라도 너무 빠르다. 행성의 하루는 자전과 공전 때문에 태양일과 항성일로 나뉜다고 한다.'};
  const r=previewContent(item); assert.match(r.text,/자전과 공전/);assert.doesNotMatch(r.text,/1월/);assert.ok(r.keywords.includes('태양일'));assert.ok(r.keywords.includes('항성일'));
  for(const e of r.evidence)assert.ok(plainText(item[e.field]).includes(e.quote));
});
check('주제어 끝을 조사로 오인하지 않고 지명·고유 소재도 보존',()=>{
  const democracy=previewContent({title:'민주주의',summary:'인류 역사에서 민주주의가 발전해 온 과정을 알아본다.'});assert.ok(democracy.keywords.includes('민주주의'));assert.ok(!democracy.keywords.includes('민주주'));
  const mangrove=previewContent({title:'맹그로브의 눈물',summary:'맹그로브 숲과 그곳에 사는 사람들의 삶을 들여다본다. 맹그로브를 지키는 사람들.'});assert.ok(mangrove.keywords.includes('맹그로브'));
  const debris=previewContent({title:'우주는 주인이 없다',summary:'우주 인공위성 쓰레기를 치우는 일에는 관심이 없다.'});assert.ok(!debris.keywords.includes('없다'));
});
check('제목만 보유·제목 반복·추론 후보는 확인한 내용으로 채우지 않음',()=>{
  const bee=previewContent({title:'꿀벌의 하루',summary:'',inferredTags:[{label:'생태계'}]});assert.equal(bee.basis,'TITLE_ONLY');assert.ok(!bee.keywords.includes('생태계'));
  assert.equal(previewContent({title:'우주 관측',summary:'자막우주 관측'}).basis,'TITLE_ONLY');
  assert.deepEqual(previewContent({title:'자료를 활용해 보세요',summary:''}).keywords,[]);
});
check('소개문 HTML·자막 정리·잘린 연결어 보류·긴 완결 문장 보존',()=>{
  const r=previewContent({title:'우주 관측',summary:'자막행성과 자전, 공전, 태양일, 항성일을<br>소개합니다. '+('천체를 관측하는 과정과 기록을 살펴보고 ').repeat(30)});
  assert.match(r.text,/행성과 자전, 공전, 태양일, 항성일을 소개합니다\./);assert.doesNotMatch(r.text,/<br>|자막|기록을 살펴보고/);assert.ok(r.keywords.length<=5);
  const complete='천체 관측에서 '+('행성과 별의 위치를 기록하고 ').repeat(20)+'변화를 비교한다.';
  assert.equal(previewContent({title:'천체 관측',summary:complete}).text,complete);
});
fs.writeFileSync(process.env.CURI_REPORT_PATH||'docs/r07-content-preview-check.json',JSON.stringify({generatedAt:new Date().toISOString(),cases,note:'공개 텍스트의 키워드·핵심 문장 추출 검사. 영상 분석이나 사람 적합성 판단은 아님.'},null,2)+'\n');
console.log(`콘텐츠 소개 계약 ${cases.length}개 통과`);
