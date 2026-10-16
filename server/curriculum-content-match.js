// 교육과정과 자료의 공통 소재·의미를 대조한다. 코드별 추천 목록이나 문장별 예외는 두지 않는다.
const { concepts } = require('./semantic-layer');
const { matchingExpressions } = require('./discovery-query-language');
const { literalSource } = require('./source-literal');
const { maskEditorial } = require('./source-editorial');
const { aliasRegex } = require('./semantic-pattern');

const families = [
  ...concepts.filter(c => !['environment','energy','matter','space','population','ocean'].includes(c.id)).map(c => ({ id:c.id, aliases:c.aliases })),
  {id:'cultural-diversity',aliases:['다문화','다문화주의','이주배경','이주 배경','문화 다양성','다양한 문화','서로 다른 문화','다른 사람이나 집단의 문화','문화의 공존']},
  {id:'anti-colonial',aliases:['독립운동','독립 운동','항일','항일투쟁','항일운동','항일 운동','국권 회복','일제의 식민 통치','일제 강점','일제강점기','식민 지배','일제에 대한 저항','나라를 되찾는','국권을 되찾는']},
  {id:'body-health',aliases:['요로결석','신장결석','요로 결석','신장 결석','신체 기관','우리 몸','몸속','인체','질병','건강']},
  {id:'food-web',aliases:['먹이그물','먹이 그물','먹이 사슬','먹이사슬','먹고 먹히는','천적','포식자','피식자']},
  {id:'evaporation',aliases:['증발','물이 마르는','물의 기화','수증기로 변하는']},
  {id:'electric-magnet',aliases:['전자석','전자기','전자기학','자기장','자석','전류가 만드는 자기장']},
  {id:'population-change',aliases:['인구 분포','인구 증가','인구 감소','인구 구조','인구 밀도','저출산','고령화','출생률']},
  {id:'historical-evidence',aliases:['오래된 물건','오래된 사진','옛 물건','옛 사진','과거의 모습']},
  {id:'representation',aliases:['선거','투표','유권자','대표를 뽑는','대표를 선출하는']},
  {id:'combustion',aliases:['연소','불에 타는','불이 타는','산불','화재']}
];
const broad = new Set('사회 과학 생활 자료 방법 과정 관계 활동 역할 이해 설명 탐구 조사 관찰 비교 실천 참여 문제 변화 인해 해결책 움직이 현상 우리 우리나라 세계 역사 과거 문화 환경 지구 생물 물질 힘 인구 바다 국가 사람 시간 사례 특징 의미 모습 영향 필요 종류 자연 다양한 관심 결과 이용 원리 실험 다른 주변 성질 어떻게 무엇 때문 방식 관련 조건 또한 새로운 기능 하여'.split(' '));
const regions = [
  ['아시아',['아시아','한국','중국','일본','인도','인도네시아','베트남','태국','캄보디아','히말라야']],
  ['유럽',['유럽','프랑스','독일','영국','이탈리아','스페인','유럽연합']],
  ['아프리카',['아프리카','케냐','에티오피아','사하라']],
  ['아메리카',['아메리카','미국','캐나다','멕시코','브라질','아마존']],
  ['오세아니아',['오세아니아','호주','뉴질랜드']],
  ['극지방',['극지방','북극','남극']],
  ['고대',['고대','고조선','삼국','고구려','백제','신라']],
  ['조선',['조선','한양','경복궁']], ['고려',['고려','개경']], ['고조선',['고조선']], ['삼국',['삼국','고구려','백제','신라']]
];
const literal = (term,text) => matchingExpressions(term,text).length > 0;
function sourceView(resource) {
  const original = { title:String(resource.title || ''), summary:String(resource.summary || ''), program:'' };
  const view = literalSource(original);
  const fields = ['title','summary'].map(field => ({field,raw:original[field],text:maskEditorial(view[field],original.title)
    .replace(/<[^>]*>/gu, tag=>' '.repeat(tag.length))
    .replace(/작은\s*지구촌/gu, text=>' '.repeat(text.length))
    .replace(/(?:어린이\s*)?프로그램\s*제작\s*경력[^.!?\n]*/gu,text=>' '.repeat(text.length))}));
  const cache = new Map();
  function find(term) {
    if (cache.has(term)) return cache.get(term);
    const pattern = aliasRegex(term, {declarations:true});
    let evidence = null, denied = false;
    for (const field of [...fields].reverse()) {
      if (field.field === 'title' && denied) continue;
      pattern.lastIndex = 0;
      for (const m of field.text.matchAll(pattern)) {
        const after = field.text.slice(m.index+m[0].length,m.index+m[0].length+40);
        if (/^\s*(?:을|를|이|가|은|는)?\s*(?:아닌|아니라|다루지\s*않|제외|말고|없는|없다|에\s*비유|로\s*비유)/u.test(after)) { denied = true; continue; }
        const start=m.index,end=start+m[0].length;
        evidence={field:field.field,start,end,quote:field.raw.slice(start,end)};break;
      }
      if (evidence) break;
    }
    cache.set(term,evidence);return evidence;
  }
  const text = fields.map(f=>f.text).join('\n');
  return {text,find,topics:families.filter(f=>f.aliases.some(find))};
}
// 단원의 중심 대상/범위를 빠뜨린 채 주변 단어만 공유하는 후보를 제외한다.
const scopeRules = [
  [/인구/u, /인구.{0,12}(?:분포|증가|감소|밀도|구조|고령|도시|이동)|(?:저출산|고령화|출생률|인구수|인구가\s*(?:늘|줄|증가|감소))/u, 'POPULATION_CONTEXT'],
  [/지구촌을\s*위협/u, /(?:기아|빈곤|기후\s*(?:변화|위기)|난민|분쟁|전쟁|환경\s*오염|식량\s*(?:문제|위기))/u, 'GLOBAL_ISSUE_CONTEXT'],
  [/오래된\s*물건/u, /(?:오래된\s*(?:물건|자료|사진)|옛\s*(?:물건|사진)|유물|유적|문화재|고고학)/u, 'HISTORICAL_OBJECT'],
  [/해안\s*지형/u, /지형|해안선|산지|하천|침식|퇴적/u, 'LANDFORM_CONTEXT'],
  [/육지와\s*바다/u, /육지|지구\s*표면/u, 'EARTH_SURFACE'],
  [/화석/u, /화석|공룡|고생물|발굴|퇴적암/u, 'FOSSIL_CONTEXT'],
  [/연소/u, /연소|불에\s*타|불이\s*타|산불|화재/u, 'COMBUSTION_CONTEXT'],
  [/우리\s*몸/u, /우리\s*몸|몸속|인체|신체|질병|건강|요로|혈관|혈액|소화\s*(?:기관|작용|과정)|호흡\s*기관|배설|심장|장기/u, 'HUMAN_BODY_CONTEXT'],
  [/감염병/u, /감염|전염|바이러스|세균|백신|면역|항체/u, 'INFECTION_CONTEXT'],
  [/학교\s*자치/u, /학교\s*자치|학생\s*자치|학생회|학급\s*회의|학교\s*선거/u, 'SCHOOL_AUTONOMY'],
  [/주민\s*자치|지방\s*자치/u, /주민|지방\s*자치|지역\s*사회|주민\s*참여|지역\s*문제/u, 'LOCAL_AUTONOMY'],
  [/선거/u, /선거|투표|유권자|대의|주권/u, 'ELECTION_CONTEXT'],
  [/미디어/u, /미디어|언론|뉴스|신문|정보\s*판별|가짜\s*정보/u, 'MEDIA_CONTEXT'],
  [/전기를\s*효율적/u, /감전|누전|절전|전기\s*안전|전기\s*절약|전기료|에너지\s*(?:효율|절약)|전력\s*(?:효율|절약)/u, 'ELECTRICITY_USE'],
  [/기후변화\s*대응/u, /대응|감축|탄소\s*중립|대책|온실가스|해결|재생\s*에너지|기후.{0,20}실천/u, 'CLIMATE_ACTION'],
  [/전기\s*회로/u, /회로|전지|전구|전선|직렬|병렬|배터리/u, 'CIRCUIT_CONTEXT'],
  [/중력,\s*탄성력|힘의\s*평형/u, /중력|탄성력|마찰력|부력|힘의\s*평형|알짜힘|물체를\s*(?:밀|당)/u, 'MECHANICAL_FORCE'],
  [/기상\s*요소/u, /기온|강수|습도|풍향|풍속|기압|기상\s*요소/u, 'WEATHER_ELEMENT'],
  [/문화\s*혼종성/u, /문화\s*혼종|혼합\s*문화|다문화|민족|인종/u, 'CULTURAL_MIX']
];
function scopeRejection(plan, source) {
  for (const [name,aliases] of regions) if (literal(name,plan.standardText) && !aliases.some(alias=>source.find(alias))) return `MISSING_SCOPE:${name}`;
  if (/일제/u.test(plan.standardText) && ['미국','인도','베트남','아프리카','프랑스'].some(alias=>source.find(alias)) && !['일제','일본','한국','우리나라','한반도','조선'].some(alias=>source.find(alias))) return 'DIFFERENT_COLONIAL_CONTEXT';
  const foreign = regions.slice(0,5).flatMap(([,aliases])=>aliases).filter(name=>!['한국'].includes(name));
  if (/우리나라/u.test(plan.standardText) && foreign.some(alias=>source.find(alias)) && !['우리나라','한국','한반도','서울','제주'].some(alias=>source.find(alias))) return 'DIFFERENT_COUNTRY_SCOPE';
  for (const [standard,content,reason] of scopeRules) if (standard.test(plan.standardText) && !content.test(source.text)) return reason;
  return '';
}
function matchStandard(plan, source) {
  const code=source.find(plan.standardId);
  if (code) return {score:1000,matchedTerms:[plan.standardId],semanticMatches:[],evidence:[code],reason:'공식 기준 코드와 일치'};
  if (scopeRejection(plan,source)) return null;
  const topics=source.topics.filter(f=>f.aliases.some(alias=>literal(alias,plan.standardText)));
  const terms=[...new Set([...plan.anchors,...plan.terms,...plan.conceptAliases,...plan.relationTerms])]
    .filter(term=>term.length>=2&&!broad.has(term));
  const direct=terms.map(term=>({term,evidence:source.find(term)})).filter(hit=>hit.evidence);
  const anchorHit = direct.some(hit=>plan.anchors.includes(hit.term) || plan.conceptAliases.includes(hit.term));
  if (!topics.length && !anchorHit && direct.length < 2) return null;
  const semantic=topics.map(topic=>({id:topic.id,evidence:topic.aliases.map(source.find).find(Boolean),standardExpression:topic.aliases.find(alias=>literal(alias,plan.standardText))}));
  const evidence=[...new Map([...direct.map(x=>x.evidence),...semantic.map(x=>x.evidence)].map(e=>[`${e.field}:${e.start}:${e.end}`,e])).values()].slice(0,6);
  const score=topics.length*12+direct.reduce((n,x)=>n+(plan.anchors.includes(x.term)?8:4)+(x.evidence.field==='title'?5:0),0);
  return {score,matchedTerms:direct.map(x=>x.term),semanticMatches:semantic.map(x=>({concept:x.id,standardExpression:x.standardExpression})),evidence,
    reason:[direct.length?`자료와 기준의 공통 소재: ${direct.slice(0,3).map(x=>x.term).join(' · ')}`:'',semantic.length?`같은 의미의 표현: ${semantic.map(x=>x.standardExpression).join(' · ')}`:''].filter(Boolean).join(' / ')};
}
module.exports={sourceView,matchStandard,scopeRejection};
