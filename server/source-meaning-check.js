const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {discoverContents}=require('./discovery-search');
const {meaningEvidence}=require('./source-meaning');
const {explainRequest}=require('./source-explanation');
const {parseDiscoveryIntent}=require('./discovery-intent');
const item=(id,title,summary)=>({id,title,summary,program:'의미 대조 검사',kind:'episode',sourceUrl:'https://www.ebs.co.kr/'+id});
const resources=[
  item('FAMILY','마을의 작은 가게','전라북도 순창군 작은 시골 마을. 결혼 13년 차인 남은 씨는 필리핀 아내 배티 씨와 부부의 연을 맺고 세 딸을 얻었다.'),
  item('CHILD','함께 배우는 교실','초등학교에서 이주배경 학생들이 함께 배우고 서로의 언어와 생활 문화를 이해하는 과정을 살펴본다.'),
  item('CULTURE','문화의 공존','다문화 사회에서 차이를 인정하고 서로의 문화를 존중하는 방안을 살펴본다.'),
  item('ADULT','늦깎이 배움','이주배경 대학생들이 성인 교육에 참여하고 새로운 직업을 준비하는 과정을 소개한다.'),
  item('HOME','우리 동네 부부','마을에서 만난 부부가 자녀를 키우며 일하는 이야기를 소개한다.'),
  item('TRAVEL','가족 여행','한국 부부가 필리핀으로 여행을 떠나 음식과 풍경을 즐기는 과정을 소개한다.'),
  item('OVERSEAS','섬나라의 하루','필리핀 아내와 남편이 현지 마을에서 일하고 부부의 생활을 이어가는 모습을 소개한다.'),
  item('PRODUCTION','제작자의 기록','어린이 프로그램 제작 경험을 가진 성인 제작자가 이주민을 위한 성인 강좌를 제작한다.'),
  item('EVAP','물의 변화','물은 시간이 지나면 수증기로 변하며 줄어든다. 주변 환경에 따라 달라지는 속도를 관찰한다.'),
  item('COND','차가운 표면','수증기가 차가운 표면에서 물방울로 바뀌는 현상을 관찰하고 변화를 기록한다.'),
  item('PHOTO','잎의 활동','식물은 햇빛을 이용해 양분을 만든다. 잎에서 일어나는 과정을 관찰하고 설명한다.'),
  item('NOPHOTO','빛을 쓸 수 없을 때','식물은 햇빛이 없어서 양분을 만들지 않는다. 주변 조건과 생장 변화를 살펴본다.'),
  item('GRAVITY','떨어지는 물체','지구가 물체를 끌어당기는 힘으로 물체가 떨어진다. 낙하하는 물체의 움직임을 살펴본다.'),
  item('VOTE','마을의 결정','주민들이 대표자를 뽑는 과정을 살펴보고 공동의 문제를 함께 결정하는 모습을 소개한다.'),
  item('ELDER','마을의 하루','어르신들이 마을에서 생활하며 서로를 돌보고 일상의 어려움을 해결하는 모습을 소개한다.')
];
const catalog={version:'source-meaning-fixture',concepts:[],resources,stats:{}};
const cases=[];
async function check(name,run){await run();cases.push(name);}
const search=async q=>(await discoverContents({q},catalog,{useSemantic:false}));
const ids=async q=>(await search(q)).results.map(row=>row.id);
(async()=>{
  await check('다문화 가족: 국적·지역·부부 관계 조합, 문화 강의·국내 부부·여행·해외 일상 제외',async()=>assert.deepEqual(await ids('다문화 가족'),['FAMILY']));
  await check('다문화 어린이: 이주배경·초등학생 조합, 대학생·제작 대상 표기 제외',async()=>assert.deepEqual(await ids('다문화 어린이'),['CHILD']));
  await check('동일 의미 대조를 자연어 요청에도 적용',async()=>assert.deepEqual(await ids('다문화 어린이를 보여주는 자료를 찾아주세요'),['CHILD']));
  await check('가정·가족 요청 표현 모두 관계 근거로 발견',async()=>assert.deepEqual(await ids('다문화 가정'),['FAMILY']));
  await check('알려진 의미 단위의 붙여쓰기·조사형도 동일하게 검색',async()=>{assert.deepEqual(await ids('다문화가족'),['FAMILY']);assert.deepEqual(await ids('다문화어린이를 보여주는 자료'),['CHILD']);assert.deepEqual(await ids('다문화가족유니콘'),[]);});
  await check('조사로 끝나는 실제 명사 어린이·고양이·종이 보존',()=>{for(const term of ['어린이','고양이','종이']){assert.deepEqual(parseDiscoveryIntent(term).terms,[term]);assert.deepEqual(parseDiscoveryIntent(term+'를').terms,[term]);}});
  await check('알려진 대상의 복수형도 같은 의미로 대조',async()=>{assert.deepEqual(await ids('다문화 어린이들'),['CHILD']);assert.deepEqual(await ids('다문화가족들'),['FAMILY']);});
  await check('다른 분야: 증발 설명과 응결 설명 구분',async()=>{assert.deepEqual(await ids('증발'),['EVAP']);assert.deepEqual(await ids('응결'),['COND']);});
  await check('상태 변화의 방향을 명사 동시 등장으로 뒤집지 않음',()=>{const i=item('REVERSE','차가워진 수증기','수증기가 냉각되면서 액체로 변하는 과정을 관찰하고 변화의 원리를 알아본다.');assert.equal(meaningEvidence(i,'증발'),null);assert.ok(meaningEvidence(i,'응결'));});
  await check('다른 국적 부모의 표현 조합도 공통 대상 관계로 대조',()=>{assert.ok(meaningEvidence(item('PARENTS','멀리 사는 손주','미국 남자 라이언 아빠와 한국 여자 민지 엄마는 부부다. 두 사람은 아이들과 함께 일상을 보낸다.'),'다문화'));});
  await check('다른 분야: 광합성 설명과 부정 문장 구분',async()=>assert.deepEqual(await ids('광합성'),['PHOTO']));
  await check('다른 분야: 중력·선거·노인의 다른 표현',async()=>{assert.deepEqual(await ids('중력'),['GRAVITY']);assert.deepEqual(await ids('선거'),['VOTE']);assert.deepEqual(await ids('노인'),['ELDER']);});
  await check('다의어·비유를 관련 의미로 재유입하지 않음',()=>{
    assert.equal(meaningEvidence(item('REFLECTION','반성의 시간','실패한 정책을 돌아보고 자성의 목소리를 내는 정치인들의 태도를 살펴본다.'),'자석'),null);
    assert.equal(meaningEvidence(item('MONEY','사라진 매출','온라인 판매가 늘면서 오프라인 매출이 증발하는 유통 시장의 변화를 살펴본다.'),'기화'),null);
    assert.equal(meaningEvidence(item('TOPTEN','여행의 목적지','세계 10대 명소를 여행하며 아름다운 자연 경관과 사람들의 삶을 소개한다.'),'청소년'),null);
    assert.equal(meaningEvidence(item('BUY','책 나눔','책을 사서 친구에게 빌려 주는 사람들의 일상을 소개한다.'),'도서관'),null);
    assert.ok(meaningEvidence(item('MAGNET','금속의 성질','금속의 자성을 이용해 자석이 철가루를 끌어당기는 과정을 관찰한다.'),'자석'));
  });
  await check('미지의 고유명·소재를 의미 유사도 때문에 삭제하지 않음',async()=>assert.deepEqual(await ids('다문화 가족 유니콘'),[]));
  await check('서로 다른 문서의 조건을 합치거나 명시 AND를 완화하지 않음',async()=>assert.deepEqual(await ids('다문화 가족 그리고 광합성'),[]));
  await check('OR 분기별 대조·의미 단서 보존',async()=>assert.deepEqual(new Set(await ids('다문화 가족 또는 증발')),new Set(['FAMILY','EVAP'])));
  await check('의미가 같은 제외 표현도 유지',async()=>{const result=await ids('다문화 어린이 제외');assert.ok(!result.includes('CHILD'));assert.ok(result.includes('FAMILY'));});
  await check('원문 없는 자료와 제목 반복을 의미 추론 근거로 승격하지 않음',()=>{assert.equal(meaningEvidence(item('EMPTY','초등학교 이주배경 학생',''),'어린이'),null);assert.equal(meaningEvidence(item('REPEAT','초등학교 이주배경 학생','초등학교 이주배경 학생'),'어린이'),null);});
  await check('모든 확장 인용은 자기 원문 위치와 일치·설명은 후보 수준·원본 불변',async()=>{
    const before=JSON.stringify(resources);
    for(const q of ['다문화 가족','다문화 어린이','광합성','증발','중력','선거','노인']) {
      const result=await search(q);
      for(const row of result.results){assert.ok(row.meaningMatches.length);for(const match of row.meaningMatches){assert.equal(match.status,'RELATED_SOURCE_CUE');for(const evidence of match.evidence)assert.equal(row[evidence.field].slice(evidence.start,evidence.end),evidence.quote);}const explained=explainRequest(row,result.understanding);assert.match(explained.text,/의미 확장 후보/);for(const evidence of explained.topicEvidence)assert.equal(row[evidence.field].slice(evidence.start,evidence.end),evidence.quote);}
    }
    assert.equal(JSON.stringify(resources),before);
  });
  await fs.writeFile('docs/r12-03-meaning-check.json',JSON.stringify({date:'2026-10-15',passed:cases.length,cases,paidApiCalls:0},null,2)+'\n');
  console.log(cases.length,'공통 의미 대조 검사 통과');
})().catch(error=>{console.error(error);process.exitCode=1});
