const assert = require('node:assert/strict');
const fs = require('node:fs');
const { discoverTeacherContents } = require('./teacher-discovery');
const { interpretQuery } = require('./discovery-search');
const { parseDiscoveryIntent } = require('./discovery-intent');
const { sourceContext, contextRequest, maskEditorial } = require('./source-context');
const { fingerprint } = require('./broadcast-store');
const item = (id, title, summary, program = '합성 프로그램') => ({ id, title, summary, program, kind: 'episode', sourceUrl: `https://www.ebs.co.kr/${id}` });
const resources = [
  item('ENV','환경오염의 원인','환경오염과 쓰레기 문제를 다룬다. 플라스틱이 생물에 미치는 영향을 알아본다.'),
  item('LOCAL','도자기의 고장','도자기의 고장 이천에서 도자기를 만드는 사람들의 생활을 살펴본다.'),
  item('FAULT','고장 난 승강기','엘리베이터 고장을 수리한다.'),
  item('POLICY','도시 문제와 해결','도시의 주거 문제와 교통 문제를 해결하는 정책을 살펴본다.'),
  item('NUMBER','큰 수의 비밀','어느 도시의 인구와 맞먹는 수의 방문자가 있었다. 이 문제를 인터넷 서버가 해결한다.'),
  item('HABITAT','숲에 사는 곤충','숲에 사는 곤충의 보금자리와 생활을 소개한다.'),
  item('SCATTER','숲과 광학','숲의 나무는 햇빛을 받는다. 도시의 카메라가 곤충 사진을 촬영한다.'),
  item('DAY','지구와 낮과 밤','지구가 자전하며 태양빛을 받는 곳은 낮이고 받지 못하는 곳은 밤이 된다.'),
  item('SPEED','지구 자전','지구의 자전 속도가 느려지는 원리를 설명한다.'),
  item('SCHOOL','학교와 사회화','학교는 개인이 사회적 역할을 배우는 사회화 과정의 공간이다.'),
  item('NORM','국제 규범의 확산','국제 인권은 사회화 과정을 통해 국가 간에 확산된다.'),
  item('SALT','염전과 소금','바닷물을 증발시키면 소금이 남는다. 소금 생산 과정과 염전을 살펴본다.')
];
const catalog = { resources, concepts: [], searchVariants: [] }, store = { verifiedAssets: [] };
const search = input => discoverTeacherContents(typeof input === 'string' ? { q: input } : input, catalog, store, { useSemantic: false });
const cases = [], check = async (name, fn) => { await fn(); cases.push(name); };
(async () => {
 const before = JSON.stringify(catalog);
 await check('새 문장의 질문·학습 대상·설명 요청 분리', async () => { const r = await search('환경오염이 뭔지 학생들한테 설명하기 좋은 거'); assert.ok(r.results.some(x => x.id === 'ENV')); assert.ok(r.terms.every(t => ['환경오염'].includes(t))); });
 await check('새 문장의 질문 동작은 내용 명사와 구분', async () => { const r = await search('바닷물에서 소금은 어떻게 얻을까'); assert.ok(r.results.some(x => x.id === 'SALT')); assert.ok(!r.terms.includes('얻을까')); });
 await check('다른 지역·기계에도 동음이의어 대조', async () => { const r = await search('우리 고장의 모습'); assert.ok(r.results.some(x => x.id === 'LOCAL')); assert.ok(!r.results.some(x => x.id === 'FAULT')); });
 await check('도시 문제의 같은 맥락은 유지·통계 비교는 제외', async () => { const r = await search('도시 문제'); assert.ok(r.results.some(x => x.id === 'POLICY')); assert.ok(!r.results.some(x => x.id === 'NUMBER')); });
 await check('서식 장소와 대상 연결·분산된 단어 제외', async () => { const r = await search('숲에 사는 곤충 영상'); assert.ok(r.results.some(x => x.id === 'HABITAT')); assert.ok(!r.results.some(x => x.id === 'SCATTER')); });
 await check('원리 요청을 자전 소재로 대체하지 않음', async () => { const r = await search('낮과 밤이 생기는 까닭'); assert.ok(r.results.some(x => x.id === 'DAY')); assert.ok(!r.results.some(x => x.id === 'SPEED')); });
 await check('사회화의 개인·국제 맥락 구분', async () => { const r = await search('사회화 과정과 기관'); assert.ok(r.results.some(x => x.id === 'SCHOOL')); assert.ok(!r.results.some(x => x.id === 'NORM')); });
 await check('보조 원문의 배우 경력/첨부 안내는 검색 내용과 분리', () => {
  const r=item('PRESS','산업의 변화','공장의 변화를 기록한다.');const text='배우 김하늘이 내레이션을 맡았다. 김하늘은 평소 독립운동가 후손을 돕는 캠페인에 참여해 왔다. 공장에서 생산되는 도자기를 기록한다. (관련 사진 별첨)';
  const identity={resourceId:r.id,title:r.title,program:r.program,broadcastDate:r.broadcastDate,variant:r.variant,sourceUrl:r.sourceUrl};
  const s={id:'S',type:'PRESS_RELEASE',sourceUrl:'https://global.ebs.co.kr/board/bbs?postId=1',text,identity,location:'본문'};s.contentHash=fingerprint(JSON.stringify([s.type,s.sourceUrl,s.text,s.identity,s.location]));r.sourceSupplements=[s];
  assert.equal(maskEditorial(text,r.title).length,text.length);assert.ok(!sourceContext(r,{sourceContext:contextRequest('독립운동가 사진'),terms:['독립운동가','사진']}).matched);assert.ok(sourceContext(r,{terms:['도자기']}).matched);
 });
 await check('본문 속 출연자의 실제 이야기와 인물 주제는 보존', () => { const r=item('ACTOR','배우 김하늘의 캠페인','배우 김하늘의 삶과 캠페인 활동을 소개한다.'); assert.ok(sourceContext(r,{terms:['캠페인']}).matched); });
 await check('낮밤이 다른 현상의 조건이면 자전을 주입하지 않음', () => { const r=interpretQuery('낮과 밤에 바람이 바뀌는 이유',[]); assert.ok(!r.terms.includes('자전')); assert.equal(r.understanding.sourceContext.dayNight,false); });
 await check('대상 명사는 유지하고 시청 목적만 분리', () => { assert.ok(parseDiscoveryIntent('어린이 인권').terms.includes('어린이')); const r=parseDiscoveryIntent('아이들이 줄어들면 동네는 어떻게 될까'); assert.ok(r.terms.includes('아이')); });
 await check('미지 고유명과 추가 내용은 필수로 보존', async () => { assert.equal((await search('환경오염 뭔지 루미나비밀조약')).total,0); assert.ok(parseDiscoveryIntent('루미나비밀조약인가요').terms.includes('루미나비밀조약')); });
 await check('명시 AND/OR·프로그램·장르·시간·제외 보존', async () => {
  assert.equal((await search('환경오염 그리고 자석')).total,0); assert.ok((await search('환경오염 또는 소금')).total>=2);
  const r=parseDiscoveryIntent('환경오염 7분 이내 다큐, 전쟁 제외');assert.equal(r.constraints.durationMinutes,7);assert.ok(r.constraints.requiredGenres.includes('다큐멘터리'));assert.ok(r.excluded.includes('전쟁'));assert.equal((await search('환경오염 다큐')).total,0);
 });
 await check('복합 제목의 주제와 다른 표현의 의미 근거 연결 보존', () => { const r=item('SEMANTIC','자막숲의 산책','숲을 소개한다. 철새의 번식지를 관찰한다.'); const start=r.summary.indexOf('철새'); assert.ok(sourceContext(r,{terms:['숲'],concepts:[{label:'생태계',aliases:['생태계']}]},[],[{requested:'생태계',evidence:[{field:'summary',start,end:start+2,quote:'철새'}]}]).matched); });
 await check('사진 첨부 안내만 가리고 같은 문장의 방송 내용 보존', () => { const text='갯벌 생태계를 소개한다 (관련 사진 별첨)'; const masked=maskEditorial(text); assert.ok(masked.includes('갯벌 생태계')); assert.ok(!masked.includes('사진')); assert.equal(masked.length,text.length); });
 await check('생성 대상과 재료로 쓰인 대상을 구분', () => { const req={sourceContext:contextRequest('안개는 어떻게 생길까'),terms:['안개']}; assert.ok(sourceContext(item('FOG','안개의 생성','안개는 작은 물방울이 모여 생긴다.'),req).matched); assert.ok(!sourceContext(item('STAGE','무대 효과','안개를 이용해 무대 풍경이 만들어진다.'),req).matched); });
 await check('필요성 질문의 주제 언급과 기능 설명 구분', () => { const req={sourceContext:contextRequest('안전벨트는 왜 필요한가요'),terms:['안전벨트']}; assert.ok(sourceContext(item('BELT','안전벨트','안전벨트는 사람을 보호하기 위해 필요하다.'),req).matched); assert.ok(!sourceContext(item('EXHIBITION','안전벨트 전시','안전벨트의 디자인을 전시한다.'),req).matched); });
 await check('수치 비교의 대상 속성은 다른 특징 비교로 대체하지 않음', () => { const req={sourceContext:contextRequest('새의 무게 비교'),terms:['새']}; assert.ok(sourceContext(item('WEIGHT','새','새의 무게는 종류에 따라 다르다.'),req).matched); assert.ok(!sourceContext(item('WING','새','새의 날개 모양이 종류에 따라 다르다.'),req).matched); });
 await check('의문형 동작 표현 확장과 추상적 그림자 제외', () => { const r=parseDiscoveryIntent('숨을 쉬면 몸속에서 무슨 일이 일어날까'); assert.ok(r.terms.includes('호흡')); assert.ok(!r.terms.some(t=>['일','일이','무슨'].includes(t))); assert.ok(!sourceContext(item('SHADOW','마음의 그림자','마음의 그림자가 생긴다.'),{terms:['그림자']}).matched); });
 await check('서식 대상을 생략한 모습 요청은 가짜 대상 조건을 만들지 않음', () => assert.deepEqual(contextRequest('습지 지역에서 살아가는 모습을 보여주는 다큐').habitat,[]));
 await check('생물 관계와 경제 비유의 먹이사슬을 구분', () => { const req={sourceContext:contextRequest('생물 관계 다큐'),terms:['먹이사슬']}; assert.ok(sourceContext(item('FOOD','생물','동물들은 먹이사슬을 이룬다.'),req).matched); assert.ok(!sourceContext(item('TRADE','세계 시장','세계 무역의 거대한 먹이사슬을 소개한다.'),req).matched); });
 await check('사회적 역할 갈등과 일반 분쟁 구분', () => { const req={sourceContext:contextRequest('역할 갈등 사례'),terms:['갈등']}; assert.ok(sourceContext(item('ROLE','개인의 선택','가정과 직장의 역할이 충돌하며 갈등을 겪는다.'),req).matched); assert.ok(!sourceContext(item('WAR','경제 갈등','두 나라의 경제 갈등이 커진다.'),req).matched); });
 await check('계절 변화와 이야기의 계절 배경 구분', () => { const req={sourceContext:contextRequest('계절의 변화 영상'),terms:['계절']}; assert.ok(sourceContext(item('SEASON','계절','지구의 공전에 따라 계절이 변화한다.'),req).matched); assert.ok(!sourceContext(item('STORY','짝짓기','짝짓기의 계절을 맞아 공룡들이 다툰다.'),req).matched); });
 await check('감정의 에너지를 물리적 에너지로 보지 않음', () => assert.ok(!sourceContext(item('ANGER','분노의 에너지','분노의 에너지를 전환한다.'),{terms:['에너지']}).matched));
 await check('원문 객체와 인용을 변경하지 않음', () => assert.equal(JSON.stringify(catalog),before));
 fs.writeFileSync('docs/r12-common-request-quality-check.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:cases.length,cases,paidApiCalls:0},null,2)+'\n');console.log(cases.length,'common request quality checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
