// 내용 관계를 문장 단위로 보존한다. 요청/교실 문법을 원문의 필수 명사로 검색하지 않는다.
const { literalText } = require('./source-literal');
const { sourceSentences } = require('./source-explanation');
const { searchableSupplements } = require('./supplement-search');
const definitions = [
  { id:'CONTACT_COMPARISON', label:'붙는 것과 붙지 않는 것', negativeQuery:/끌리지\s*않는|안\s*붙는|붙지\s*않는/u, query:/(?:끌리는|끌리지\s*않는|붙는|안\s*붙는|붙지\s*않는)\s*(?:물체|물건)/u,
    positive:/(?:붙(?:어|었|는|지요)|끌어당)/u, negative:/(?:안\s*붙|붙지\s*않|붙지\s*못)/u },
  { id:'FEEDING', label:'생물이 먹고 먹히는 관계', query:/먹이\s*관계|먹고\s*먹히/u,
    positive:/먹이|먹(?:고|으며|는다|는다)/u, domain:/생물|동물|식물|플랑크톤|물고기|생태/u }
];
function prepareContentRequest(text) {
  const historical = require('./historical-place').prepareHistoricalPlace(text);
  const original=text; text=historical.text;
  const scenes=[], removed=[], classroom=[];
  const qualifierPhrases=[...text.matchAll(/(?<![\p{L}\p{N}])지역\s+([\p{L}\p{N}]+)/gu)].filter(m=>!/^(?:(?:수업|학습|교육)?자료|영상|방송|콘텐츠|설명|소개)$/u.test(m[1])).map(m=>m[0]);
  const relations=definitions.filter(d=>d.query.test(original) && (!d.negativeQuery || d.negativeQuery.test(original))).map(d=>({id:d.id,label:d.label,quote:original.match(d.query)[0]}));
  if(relations.some(r=>r.id==='CONTACT_COMPARISON')) {
    // 장소+에 붙는 물건이라는 예시 상황은 보존하고, 구체 장소 확인을 따로 남긴다.
    text=text.replace(/(?<![\p{L}\p{N}])([\p{L}\p{N}]+)(?:에|에서)\s*(?=붙는\s*물건)/gu,(quote,place,offset)=>{
      if(/반드시|꼭|필수/u.test(original.slice(Math.max(0,offset-12),offset)))return quote;
      scenes.push({quote,label:place,status:'SCENE_NOT_CONFIRMED'});return ' ';
    });
    text=text.replace(/(?:끌리는|끌리지\s*않는|붙는|안\s*붙는|붙지\s*않는)\s*(?:물체|물건)(?:이랑|과|와|을|를)?/gu,quote=>{removed.push(quote);return ' ';});
    text=text.replace(/(?:아이들|학생들)(?:이|은)?\s*(?:뭐가\s*)?붙고\s*안\s*붙는지\s*맞혀\s*보게\s*하려고요/gu,quote=>{removed.push(quote);classroom.push(quote);return ' ';});
  }
  text=text.replace(/(?:그리는|그려\s*보는|정리하는|정리해\s*보는|분류하는)\s*활동\s*전에/gu,quote=>{removed.push(quote);classroom.push(quote);return ' ';});
  text=text.replace(/먹고\s*먹히는\s*모습(?:을)?/gu,quote=>{removed.push(quote);return ' 먹이 관계 ';});
  text=text.replace(/(?<![\p{L}\p{N}])(?:한\s*곳의|하나만|하나라도|둘\s*중|중\s*한\s*곳|자료면\s*돼요|같이|소개하는|싶어요|원하는|있어야\s*해요)(?![\p{L}\p{N}])/gu,quote=>{removed.push(quote);return ' ';});
  return {text,relations,scenes,removed,classroom,qualifierPhrases,historicalPlace:historical.request};
}
function contentRelationEvidence(item,plan) {
  if(!plan?.relations?.length)return {status:'NOT_REQUESTED',evidence:[],matched:false};
  const sources=[{field:'summary',text:item.summary||''},...searchableSupplements(item).map(s=>({field:'sourceSupplement',text:s.text,supplementId:s.id,sourceUrl:s.sourceUrl}))];
  const evidence=[],states=[];
  for(const req of plan.relations){
    const rule=definitions.find(d=>d.id===req.id);let found=false;
    for(const source of sources){
      const searchable = literalText(source.text);
      const positiveText = rule.negative ? searchable.replace(/안\s*붙[\p{L}]*|붙지\s*(?:않|못)[\p{L}]*/gu, ' ') : searchable;
      if(!rule.positive.test(positiveText)||rule.negative&&!rule.negative.test(searchable)||rule.domain&&!rule.domain.test(searchable))continue;
      found=true;
      for(const sentence of sourceSentences(source.text,source.field))if(!/[?？]$/u.test(sentence.quote.trim()) && (rule.positive.test(literalText(sentence.quote))||rule.negative?.test(literalText(sentence.quote))))evidence.push({...sentence,...(source.supplementId?{supplementId:source.supplementId,sourceUrl:source.sourceUrl}:{}),relationId:req.id});
    }
    states.push({label:req.label,status:found?'PREDICATE_TEXT_CUE':'UNKNOWN'});
  }
  return {status:states.every(s=>s.status==='PREDICATE_TEXT_CUE')?'PREDICATE_TEXT_CUE':'UNKNOWN',matched:states.every(s=>s.status==='PREDICATE_TEXT_CUE'),states,evidence:[...evidence.filter(e=>/안\s*붙|붙지\s*않|붙지\s*못/u.test(e.quote)).slice(0,2),...evidence.filter(e=>!/안\s*붙|붙지\s*않|붙지\s*못/u.test(e.quote)).slice(0,4)],sceneContexts:plan.scenes};
}
module.exports={prepareContentRequest,contentRelationEvidence};
