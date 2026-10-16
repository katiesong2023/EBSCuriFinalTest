// 장소와 과거 풍경/생활의 관계를 대조한다. 방송일·실제 장면으로 추정하지 않는다.
const { matchingLiteralExpressions: matches, literalText, literalSource } = require('./source-literal');
const { sourceSentences } = require('./source-explanation');
const { searchableSupplements } = require('./supplement-search');
const { domesticPlaces, foreignPlaces } = require('./search-geographic-scope');
const names = [...new Set([...domesticPlaces,...foreignPlaces,'울산','세종','전주','목포','군산','경주','춘천','수원','공주','파리','런던','도쿄','베이징','뉴욕','우리 동네'])].filter(name=>!['대한민국','한국','한반도','우리나라','국내','해외','외국'].includes(name));
// 역사 지명은 과거 장소 요청 안에서만 연결한다. 현대 행정 경계의 동일성 판정이 아니다.
const aliases = {서울:['서울','한양','경성','한성부','경성부']};
const aliasSource = 'https://history.seoul.go.kr/archive/content.do?key=2211240006';
const temporal = /옛날|예전|과거(?!\s*(?:시험|제도))|옛\s*(?=[가-힣])|조선\s*(?:시대|후기|전기)|일제\s*강점기|근대/u;
const setting = /거리|골목|풍경|도시|생활|시내|주거|주택|도성|시가지|마을|모습|한옥|농촌|교통|전차|버스|다리|대교|나루터|경관|지명/u;
const pastCue = /옛날|예전|과거(?!\s*(?:시험|제도))|옛\s*(?:모습|풍경|거리|골목|도시|생활|서울|부산|인천)|당시|조선\s*(?:시대|후기|전기)?|일제\s*강점기|근대|(?:1[5-9]\d{2}|20\d{2}|\d{2})\s*년대|(?:1[5-9]\d{2}|20\d{2})\s*년|올드\s*앤\s*뉴/u;
function prepareHistoricalPlace(text) {
  if (!temporal.test(text) || /(?:방송|방영|제작|업로드)(?:된|한|했던|한\s*날)/u.test(text)) return {text,request:null};
  const places=names.filter(name=>matches(name,text.replace(/과거|예전|옛날|옛/gu,' $& ').replace(/의(?=모습|풍경|생활상)/gu,' ')).length).filter(name=>name!=='제주'||!text.includes('제주도'));
  if (!places.length) return {text,request:null};
  const request={places:places.map(name=>({name,aliases:aliases[name]||[name],...(aliases[name]?{aliasSource}: {})})),operator:/또는|아니면|혹은/u.test(text)?'OR':'AND',quote:text,status:'HISTORICAL_SETTING_REQUEST'};
  // 주제는 남기고, 과거라는 단일 단어 대신 관계 근거를 필수로 대조한다.
  const spaced=text.replace(/의(?=모습|풍경|생활상)/gu,' ');
  const remaining=spaced.replace(/옛날|예전|과거(?!\s*(?:시험|제도))|옛(?=\s*[가-힣])/gu,' ').replace(/(?<![\p{L}\p{N}])(?:모습|풍경|생활상)(?:을|이|의|은|는)?(?![\p{L}\p{N}])/gu,' ');
  return {text:remaining,request};
}
function historicalPlaceEvidence(item, request) {
  if (!request) return {requested:false,matched:false,evidence:[],places:[],rank:0};
  const title=literalSource(item).title, sources=[{field:'summary',text:item.summary||''},...searchableSupplements(item).map(s=>({field:'sourceSupplement',text:s.text,supplementId:s.id,sourceUrl:s.sourceUrl}))];
  const evidence=[],places=[];let rank=0;
  for (const place of request.places) {
    const titlePlace=place.aliases.some(alias=>matches(alias,title).length), historicTitle=titlePlace&&pastCue.test(title)&&setting.test(title);
    const found=[];
    for (const source of sources) for (const sentence of sourceSentences(source.text,source.field)) {
      const body=literalText(sentence.quote), bodyPlace=place.aliases.some(alias=>matches(alias,body).length);
      // 서로 다른 문장의 과거·현재나 대학 이름만으로 과거 장소의 모습으로 판정하지 않는다.
      const historicalName=place.aliases.slice(1).some(alias=>matches(alias,body).length||matches(alias,title).length);
      if (!bodyPlace && !titlePlace) continue;
      const units = body.split(/[,，;；]|하지만|반면/u);
      const connected = units.some(unit => place.aliases.some(alias=>matches(alias,unit).length) &&
        (pastCue.test(unit)||historicTitle||historicalName) && setting.test(unit+' '+(titlePlace?title:'')));
      if (!connected && !historicTitle) continue;
      // 다른 지역 여행의 출발점과 과거/미래를 오가는 제작 설명은 제외한다.
      if (/과거와\s*현재\s*미래|과거.*미래.*(?:영상기법|스토리텔링)/u.test(body)) continue;
      if (bodyPlace && /(?:서울|부산|인천|대구|대전|광주|제주)(?:에서|을\s*출발)[^.!?]{0,40}(?:도착|향해|출발)/u.test(body) && !/옛\s*모습|당시\s*(?:생활|풍경)/u.test(body)) continue;
      const direct=bodyPlace&&/(?:옛\s*(?:모습|풍경|생활)|당시\s*(?:모습|풍경|생활)|년대[^.!?]{0,35}(?:풍경|생활|거리))/u.test(body);
      const quoted={...sentence,...(source.supplementId?{supplementId:source.supplementId,sourceUrl:source.sourceUrl}:{}),requestedPlace:place.name};
      found.push(quoted);rank=Math.max(rank,direct?3:2);
    }
    // 표제 자체가 명시한 역사 지명과 도시 모습도 발췌 위치를 보존한다.
    if (!found.length && titlePlace && (pastCue.test(title)||place.aliases.slice(1).some(alias=>matches(alias,title).length)) && setting.test(title)) {
      found.push({field:'title',start:0,end:item.title.length,quote:item.title,requestedPlace:place.name});rank=Math.max(rank,2);
    }
    if (found.length) { places.push(place.name); evidence.push(...found.slice(0,3)); }
  }
  const matched=request.operator==='OR'?places.length>0:places.length===request.places.length;
  return {requested:true,matched,status:matched?'HISTORICAL_SETTING_TEXT_CUE':'HISTORICAL_SETTING_UNCONFIRMED',places,rank:matched?rank:0,evidence:matched?evidence:[],note:'원문의 장소·시대·풍경/생활 단서입니다. 실제 옛 영상·기록 화면 포함 여부는 미확인입니다.'};
}
module.exports={prepareHistoricalPlace,historicalPlaceEvidence};
