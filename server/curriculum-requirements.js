const { concepts } = require('./semantic-layer');
const { ruleScope } = require('./automatic-relation-rules');
const { standardCourse, gradeLabel } = require('../public/grade-context');
const { expansionAnchors } = require('./curriculum-expansion-anchors');
const { guidanceFor, placementFor } = require('./curriculum-guidance');
const stop = new Set('우리나라 세계 여러 가지 다양한 특징 의미 역할 이유 사례 자료 활동 과정 방법 관계 모습 생활 통해 위한 대한 따라 따른 인한 알고 알아보고 이해하고 이해한다 파악하고 탐구한다 탐구하고 탐색한다 탐색하고 설명하고 설명할 비교할 관찰하여 관찰하고 조사하고 조사하여 제안하고 공유할 공유하고 인식할 추론한다 추론할 추리하는 수행하여 활용하여 이용하여 말할 만들고 만들 생각 있다 한다 것을 하는 일에 대해 수 있는 알고 공유한다 위해 기른다 태도 대해 미친 미치는 따른 필요한 이용 쓰임새 미친 영향을 만드는 이루어짐 하는 일이 관심 느낄 가지고 이용하는 변화함 일상생활 우리 사람 사람들 시간 때문 배우는 있는지 행사 생기 참여하 생성되 관련된 조사한 결과 실천할 침해되 찾아 해결 방안 보호하 위협하 문제 일상 여러 각 서로 기본 원인 공통적인 특징'.split(' '));
// 단원별 탐색 어휘이며 의미 충족 규칙이 아니다. 현재 기준 문장에 실제 있는 중심어만 고른다.
const topicAnchors = {
 "사회:1":"산지 하천 해안 지형 독도", "사회:2":"기후 기후변화 자연재해 인구", "사회:3":"법 헌법 인권",
 "사회:4":"선사 고조선 유적 유물 고대 고려", "사회:5":"조선 유교 개항기", "사회:6":"일제 식민 광복 전쟁",
 "사회:7":"분단 통일 민주화 산업화", "사회:8":"민주주의 선거 시민 주권 국회 행정부 법원 미디어",
 "사회:9":"지구본 세계지도 대륙 대양 국가 영토", "사회:10":"지형 경관 기후", "사회:11":"시장경제 가계 기업 경제성장 무역",
 "사회:12":"인구 지구촌 지속가능", "과학:1":"지층 화석 퇴적암", "과학:2":"빛 거울 렌즈", "과학:3":"용해 용질 용매 용액",
 "과학:4":"뼈 근육 소화 순환 호흡 배설 몸 기관 질병", "과학:5":"혼합물 용해 분리", "과학:6":"기상 날씨 이슬 안개 구름 고기압 저기압",
 "과학:7":"온도 온도계 열 단열", "과학:8":"자원 재생에너지 에너지", "과학:9":"산성 염기성 용액 산성화",
 "과학:10":"운동 물체 위치 속력 교통안전", "과학:11":"세포 현미경 식물", "과학:12":"태양 별 지구 자전 공전 별자리",
 "과학:13":"태양 고도 그림자 기온 계절 자전축 공전", "과학:14":"물질 연소 생태계", "과학:15":"전지 전구 전선 전기 회로 전자석",
 "과학:16":"과학 진로"
};
// 일상 표현의 후보 발견만 보완한다. 용해량 비교·고체 분리 관계의 자동 규칙은 추가하지 않는다.
const conceptAliases = {
 '6과03-01': { requirement: '용해 현상의 의미를 알고, 용질의 종류와 물의 온도에 따라 물에 녹는 용질의 양이 달라짐을 비교할 수 있다.', terms: ['소금물', '설탕물'] },
 '6과05-02': { requirement: '물에 용해되는 성질을 이용하여 고체 혼합물을 분리하고, 물을 증발시켜 물에 용해된 고체 물질을 분리할 수 있다.', terms: ['소금물', '설탕물', '염전'] }
};
function requirementPlan(standard) {
 const m=standard.metadata,text=m.achievementStandard;
 const conceptTerms=concepts.flatMap(c=>c.aliases.filter(a=>text.includes(a)));
 const tokens=text.split(/[^\p{L}\p{N}]+/u).map(w=>w.replace(/(?:에서|으로|들을|들이|의|을|를|은|는|이|가|와|과|에|로)$/u,''))
  .filter(w=>w.length>=2&&!stop.has(w)&&!/(?:하고|하여|한다|하기|하는|지는|되는|이나|하며|하게|면서|알리는|기르는)$/.test(w));
 const expanded=expansionAnchors(standard);
 const terms=expanded?.terms||[...new Set([...conceptTerms,...tokens])].slice(0,24);
 const focused={"6사08-01":"선거 투표 주권", "6과12-02":"자전 낮과\u00a0밤", "6사06-02":"광복 6⋅25 6·25 한국전쟁", "6과12-03":"공전 별자리"};
 // 같은 단원 번호라도 학교급·공식 코드가 다른 기준에는 초등5~6 어휘를 적용하지 않는다.
 const legacyAnchors = /^[6][사과]/.test(m.achievementStandardId) ? topicAnchors[`${m.subject}:${m.unitNo}`] : '';
 const anchors=expanded?.anchors||(focused[m.achievementStandardId]||legacyAnchors||"").split(" ").map(w=>w.replace("\u00a0"," ")).filter(w=>w&&(focused[m.achievementStandardId]||text.includes(w)));
 const rule=standard.curriculumVersion==='2022 개정'&&ruleScope().rules.find(r=>r.standardId===m.achievementStandardId&&r.standardText===text&&r.subject===m.subject);
 const aliases=standard.curriculumVersion==='2022 개정'&&m.subject==='과학'&&conceptAliases[m.achievementStandardId]?.requirement===text?conceptAliases[m.achievementStandardId].terms:[];
 const clauses=text.split(/[,，]\s*|(?<=하고)\s+/u).filter(Boolean);
 const components=[
  {kind:'대상',text:terms.join(' · ')||text,method:'공식 문장의 탐색어 추출'},
  {kind:'관계',text:rule?.requirements.map(r=>r.text).join(' / ')||clauses.join(' / '),method:rule?'제한 규칙의 요구':'공식 요구 원문 · 관계 분해 미지원'},
  {kind:'조건',text:clauses.filter(c=>/통해|따라|인한|이용|활용|모형|실험|근거|에서|때/.test(c)).join(' / ')||'별도 조건 분해 미지원 · 전체 기준 확인',method:'공식 조건 구절'},
  {kind:'학습 행동',text:clauses.filter(c=>/탐구|탐색|조사|관찰|설명|분석|제안|공유|비교|추론|이해|태도|실천|파악|표현/.test(c)).join(' / ')||text,method:'학생 수행은 방송 소개문으로 확인할 수 없음'}
 ];
 return {standardId:m.achievementStandardId,standardText:text,subject:m.subject,gradeBand:m.gradeBand,
  schoolLevel:m.schoolLevel,courseId:standardCourse(standard),courseLabel:gradeLabel(standard),placement:standard.placement||null,
  officialCheck:{classification:standard.provenance?.classification,status:standard.review?.status,humanConfirmed:standard.review?.humanConfirmed===true||standard.review?.status==='HUMAN_APPROVED'},
  guidance:guidanceFor(standard),placementGuidance:placementFor(standard),
  terms,anchors,relationTerms:rule?.discoveryTerms||[],conceptAliases:aliases,components,requirements:rule?.requirements||[],ruleSupported:Boolean(rule),
  scope:rule?'일부 명시적 관계만 자동 비교':'후보 발견용 요구 분해 · 관계 자동 판정 미지원'};
}
module.exports={requirementPlan};
