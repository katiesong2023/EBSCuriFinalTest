const { matchingLiteralExpressions: matchingExpressions } = require('./source-literal');
// 장소를 알아낼 근거가 없으면 국내로 추정하지 않는다. 목록은 검색 범위 단서이며 영상의 위치 판정이 아니다.
const domesticPlaces = ['대한민국','한국','한반도','우리나라','국내','제주도','제주','한라산','성산일출봉','울릉도','독도','서울','부산','인천','대구','대전','광주','강원도','경기도','전라도','경상도','충청도','고창','신안','무안','순천','태안','백령도','울진','포항'];
const foreignPlaces = ['과테말라','파카야','아티틀란','일본','중국','몽골','미국','캐나다','인도네시아','필리핀','이탈리아','시칠리아','몰타','에티오피아','다나킬','뉴질랜드','아이슬란드','해외','외국'];
function extractGeographicScope(text) {
  const quotes=[], scopes=[];
  let remaining=text;
  remaining=remaining.replace(/(?<![\p{L}\p{N}])(?:국내|우리나라|한국|대한민국)(?:의|에서|는|은)?\s*(?:제외(?:하고|한|해줘)?|빼고|말고)(?![\p{L}\p{N}])/gu,quote=>{quotes.push(quote);scopes.push('FOREIGN');return ' ';});
  remaining=remaining.replace(/(?<![\p{L}\p{N}])(?:해외|외국)(?:의|에서|는|은)?\s*(?:사례(?:는|은)?\s*)?(?:제외(?:하고|한|해줘)?|빼고|말고)(?![\p{L}\p{N}])/gu,quote=>{quotes.push(quote);scopes.push('DOMESTIC');return ' ';});
  remaining=remaining.replace(/(?<![\p{L}\p{N}])(?:국내|우리나라|한국|대한민국)(?:의|에서|에|는|은)?(?![\p{L}\p{N}])/gu,quote=>{quotes.push(quote);scopes.push('DOMESTIC');return ' ';});
  remaining=remaining.replace(/(?<![\p{L}\p{N}])(?:해외|외국)(?:의|에서|에|는|은)?(?![\p{L}\p{N}])/gu,quote=>{quotes.push(quote);scopes.push('FOREIGN');return ' ';});
  return { text:remaining, required:[...new Set(scopes)], quotes };
}
function geographicScopeEvidence(item, requested) {
  if (!requested?.required.length) return { matches:true,evidence:[] };
  const evidence=[];
  for (const scope of requested.required) {
    const names=scope==='DOMESTIC'?domesticPlaces:foreignPlaces;
    for(const field of ['title','summary'])for(const name of names){
      const quote=matchingExpressions(name,item[field]).at(0);
      if(quote){const start=require('./source-literal').literalText(item[field]).indexOf(quote);if(start<0)continue;evidence.push({scope,field,start,end:start+quote.length,quote});}
    }
  }
  const domestic=evidence.some(e=>e.scope==='DOMESTIC'),foreign=foreignPlaces.some(name=>['title','summary'].some(field=>matchingExpressions(name,item[field]).length));
  // 국내와 해외가 섞인 회차는 ‘국내만’의 충족을 보장하지 않아 보류한다.
  const matches=requested.required.every(scope=>scope==='DOMESTIC'?domestic && (!foreign || requested.required.includes('FOREIGN')):evidence.some(e=>e.scope==='FOREIGN'));
  return {matches,evidence,status:matches?'SOURCE_LOCATION_CUE':'SCOPE_UNCONFIRMED'};
}
function matchesPlaceTerm(term,item) {
  const equivalents={제주도:['제주도','제주','한라산','성산일출봉'],제주:['제주','제주도','한라산','성산일출봉']};
  return (equivalents[term] || []).some(name=>['title','summary'].some(field=>matchingExpressions(name,item[field]).length));
}
module.exports={extractGeographicScope,geographicScopeEvidence,matchesPlaceTerm,domesticPlaces,foreignPlaces};
