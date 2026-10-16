// 교육과정 단원을 교사용 공통 주제로 묶는다. 단원 대응은 영상의 학년 적합성·연계 승인이 아니다.
const { aliasRegex } = require('./semantic-pattern');
const { literalSource, literalText } = require('./source-literal');
const { searchableSupplements } = require('./supplement-search');
const { summaryContext, evaluateSummaryEvidence } = require('./keyword-context');
const groupDefinitions = [
  ['local', '사회 · 지역·지도·생활'], ['past', '사회 · 역사·문화유산'],
  ['society', '사회 · 문화·사회 변화'], ['civic', '사회 · 민주주의·법·인권'],
  ['economic', '사회 · 경제·교류'], ['world', '사회 · 세계·지구촌'],
  ['living', '과학 · 생물·건강·환경'], ['materials', '과학 · 물질·상태 변화'],
  ['physics', '과학 · 힘·빛·소리·에너지'], ['planet', '과학 · 지구·우주'],
  ['inquiry', '과학 · 탐구·기술·진로']
];
// 짧고 다의적인 '힘·열·물·법·달' 등은 단독 일치에 사용하지 않는다.
const rows = [
 ['local','places','우리 지역과 생활 환경','4사01 4사09 4사10','우리 지역|우리 동네|장소감|지역 문제|마을|도시|농촌|어촌|주거|한옥|인문환경'],
 ['local','maps','지도와 국토','4사05 6사01','지도|지리 정보|국토|산지|하천|해안 지형|갯벌|독도|동고서저'],
 ['local','transport','교통·통신과 생활 변화','4사04','교통|철도|전차|통신|정보 교류|의사소통|옛날 풍습'],
 ['past','past-life','옛 생활과 문화유산','4사02 4사06 6사04','옛날|옛 모습|옛 생활|문화유산|박물관|기념관|유물|유적|고인돌|선사 시대|고조선|삼국|고려'],
 ['past','modern','조선과 근현대의 변화','6사05 6사06','조선|유교|개항|일제|식민|독립운동|독립 운동|유관순|동학|광복|한국전쟁|6·25'],
 ['past','peace','분단·통일과 민주화','6사07','분단|평화 통일|남북|민주화|산업화|4·19|6월 민주항쟁'],
 ['society','culture','다문화와 문화 이해','4사03 9사(일사)02','다문화|문화 다양성|이주민|이주 배경|외국인 주민|문화|미디어'],
 ['society','identity','사회생활과 정체성','9사(일사)01','사회화|자아 정체성|사회적 지위|역할 갈등|사회적 역할|고정관념|차별'],
 ['civic','democracy','민주주의·자치·시민 참여','4사08 6사08 9사(일사)03 9사(일사)04','민주주의|민주 정치|시민 참여|주민 참여|지방 자치|학교 자치|선거|유권자|정당|국회|행정부'],
 ['civic','rights-law','법·헌법·인권','6사03 9사(일사)05 9사(일사)06','헌법|인권|기본권|법률|재판|법원|사회법|법의 역할|법의 의미|근로자|노동권|아동 권리'],
 ['economic','economy','생산·소비와 경제 교류','4사07 6사11','경제|희소성|합리적 선택|생산|소비|시장경제|가계|기업|무역|직업|일자리|물가'],
 ['world','global','세계 지도·자연환경·인구','6사02 6사09 6사10 6사12 9사(지리)01','세계지도|지구본|대륙|대양|자연환경|지형|기후|인구|세계화|지구촌|지속가능|사막|툰드라'],
 ['world','asia','아시아','9사(지리)02','아시아|중국|일본|인도|베트남|몽골|태국|인도네시아'],
 ['world','europe','유럽','9사(지리)03','유럽|유럽연합|영국|프랑스|독일|이탈리아|스페인'],
 ['world','africa','아프리카','9사(지리)04','아프리카|케냐|탄자니아|이집트|에티오피아|남아프리카'],
 ['world','america','아메리카','9사(지리)05','아메리카|미국|캐나다|브라질|멕시코|페루|칠레'],
 ['world','oceania','오세아니아와 극지방','9사(지리)06','오세아니아|호주|뉴질랜드|태평양|남극|북극|극지방'],
 ['living','animals','동물의 생활','4과02','동물|야생동물|포유류|조류|파충류|양서류|곤충|꿀벌'],
 ['living','plants','식물의 생활과 한살이','4과03 4과04 6과11','식물|한살이|씨앗|발아|광합성|증산|뿌리|줄기'],
 ['living','diversity','세포·미생물·생물다양성','4과12 9과02','세포|균류|원생생물|세균|미생물|생물다양성|생물 다양성|생물 분류|멸종위기|변이'],
 ['living','ecosystems','생태계와 환경 보호','4과14','생태계|생태|먹이사슬|먹이 사슬|먹이그물|서식지|환경오염|재활용|플라스틱|쓰레기'],
 ['living','health','우리 몸과 감염병 예방','4과08 6과04','인체|우리 몸|소화 기관|소화기관|호흡|순환|배설|근육|심장|면역|감염병|감염|질병|백혈구|항체'],
 ['living','climate','기후변화와 지속가능한 생활','4과16','기후변화|기후 변화|지구 온난화|기후 위기|탄소중립|탄소 중립'],
 ['materials','states','물질과 상태 변화','4과05 4과10 9과04','물질|고체|액체|상태 변화|상태변화|증발|응결|수증기|얼음|융해|응고|승화|확산'],
 ['materials','gas','기체의 성질','4과15 9과06','기체|압력|부피|공기 입자|기체 입자'],
 ['materials','solution','용해·용액·혼합물 분리','6과03 6과05','용해|용질|용매|용액|혼합물|거름|증류|소금물|설탕물|염전'],
 ['materials','acid','산과 염기','6과09','산성|염기성|지시약|산성화|산성비|중화 반응'],
 ['materials','combustion','연소와 물질의 변화','6과14','연소|연료|연소 생성물|소화기|이산화탄소|화학 변화'],
 ['physics','forces','힘과 물체의 운동','4과01 6과10 9과05','중력|마찰력|탄성력|부력|힘의 평형|힘의 작용|힘과 운동|수평잡기|무게|저울|지레|빗면|속력|물체의 운동'],
 ['physics','sound','소리의 성질','4과07','소리|진동|떨림|소음'],
 ['physics','light','빛의 성질','6과02','빛|렌즈|거울|반사|굴절'],
 ['physics','heat','온도와 열','6과07 9과03','온도|온도계|열평형|열전달|열팽창|단열|비열|열에너지|열의 전도|대류|복사열'],
 ['physics','electric','자석과 전기의 이용','4과09 6과15','자석|자기장|전자석|전기 회로|전기회로|전구|전지|전선|직렬연결|병렬연결'],
 ['physics','resources','자원과 에너지','6과08','자원|에너지|태양광|풍력|배터리|재생에너지'],
 ['planet','earth','지구·바다와 땅의 변화','4과06 4과11 6과01','지구|대기|바다|해양|해류|밀물|썰물|갯벌|지형|화산|화성암|지진|지층|퇴적암|화석'],
 ['planet','weather','날씨와 계절의 변화','6과06 6과13','날씨|기상|구름|안개|고기압|저기압|이슬|태양 고도|계절|기온'],
 ['planet','space','달·태양계와 지구의 운동','4과13 6과12 9과07','태양계|천체|행성|자전|공전|별자리|북극성|달의 모양|달의 위상|위상변화|보름달|초승달|일식|월식|천문|우주 탐사'],
 ['inquiry','inquiry','과학 탐구·기술과 진로','6과16 9과01','과학적 탐구|과학적 해결|과학기술|인공지능|과학자|엔지니어|공학자|과학 진로|과학 실험']
];
const topics = rows.map(([group, id, label, units, terms]) => ({
  id: `curriculum-${id}`, label, group: `curriculum-${group}`, units: units.split(' '),
  terms: terms.split('|'), patterns: terms.split('|').map(aliasRegex)
}));
const topicGroups = groupDefinitions.map(([id, label]) => ({ value: `curriculum-${id}`, label,
  ids: topics.filter(topic => topic.group === `curriculum-${id}`).map(topic => topic.id) }));
const topicIds = new Set(topics.map(topic => topic.id));
const resourceCache = new WeakMap();
function resourceTopics(item) {
  if (resourceCache.has(item)) return resourceCache.get(item);
  const source = literalSource(item);
  const sources = [item, { ...item, title: '', summary: source.title },
    ...searchableSupplements(item).map(s => ({ ...item, summary: s.text }))];
  const fields = [source.summary, source.title, ...sources.slice(2).map(s => literalText(s.summary))];
  const contexts = sources.map(summaryContext);
  const ids = topics.filter(topic => topic.patterns.some(pattern => fields.some(text => {
    pattern.lastIndex = 0; return pattern.test(text || '');
  })) && sources.some((entry, index) => evaluateSummaryEvidence(entry, topic.terms, contexts[index]).evidence)).map(topic => topic.id);
  resourceCache.set(item, ids);
  return ids;
}
module.exports = { topics, topicGroups, topicIds, resourceTopics };
