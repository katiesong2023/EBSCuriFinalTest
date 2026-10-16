// 조건의 문장 범위를 먼저 분리한다. 모르는 요구를 삭제하거나 충족했다고 추정하지 않는다.
const { matchingExpressions } = require('./discovery-query-language');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const negation = /(?:제외(?:해\s*주세요|해주세요|해줘|하고|한|하세요)?|빼\s*(?:주세요|줘|고(?:요)?)|말고)(?:\s*싶어요)?/gu;
const boundary = /[.!?。]\s*|,\s*|(?:자료|영상|방송)(?:요|인데|을\s*찾되|를\s*찾되|\s*중)\s*|찾(?:고\s*있어요|아\s*주세요|아주세요|아요|는데|습니다)\s*/gu;
function clauseStart(prefix, vocabulary) {
  const matches = [...prefix.matchAll(boundary)];
  if (matches.length) return matches.at(-1).index + matches.at(-1)[0].length;
  // 짧은 '우주 다큐 말고'는 뒤의 형태만 제외한다. 복합어는 긴 어휘부터 보존한다.
  const ending = prefix.replace(/(?:은|는|을|를)?\s*$/u, '').trimEnd();
  const scope = /(?<![\p{L}\p{N}])(?:국내|우리나라|한국|대한민국|해외|외국)(?:의)?\s*(?:사례)?$/u.exec(ending);
  if (scope) return scope.index;
  for (const word of [...vocabulary].sort((a,b)=>b.length-a.length)) {
    const match = new RegExp(`(?<![\\p{L}\\p{N}])${escape(word).replace(/ /g,'\\s*')}$`, 'u').exec(ending);
    if (match) return match.index;
  }
  const words = ending.trim().split(/\s+/u);
  if (words.length === 2 && vocabulary.includes(words[0])) return prefix.lastIndexOf(words[1]);
  return 0;
}
function splitRequestClauses(value, vocabulary = [], programNames = []) {
  let text = value;
  const exclusions = [], preferences = [], classroom = [];
  // 이 단계에서는 원문 구절을 보존한다. 형식·프로그램 제외는 기존 전용 해석기로 넘긴다.
  const edits = [];
  for (const match of value.matchAll(negation)) {
    const prefix = value.slice(edits.at(-1)?.end || 0, match.index);
    const start = (edits.at(-1)?.end || 0) + clauseStart(prefix, vocabulary);
    const quote = value.slice(start, match.index + match[0].length).trim();
    const label = value.slice(start, match.index).trim().replace(/(?:은|는|을|를)$/u,'').replace(/^실제\s*/u,'').trim().replace(/^["'“](.*)["'”]$/u,'$1');
    if (!label) continue;
    const simple = !/\s/u.test(label) || vocabulary.some(word => word === label);
    const format = /^(?:다큐멘터리|다큐|강연|강의|특강|드라마|애니메이션|애니|만화|실험|시연|인터뷰|토론|뉴스|보도)$/u.test(label);
    const geography = /^(?:국내|우리나라|한국|대한민국|해외|외국)(?:의)?\s*(?:사례)?$/u.test(label);
    if (format || geography || programNames.includes(label)) continue;
    exclusions.push({ label, quote, simple, status: 'NOT_VIDEO_VERIFIED' });
    edits.push({ start, end: match.index + match[0].length });
  }
  for (const edit of edits.reverse()) text = text.slice(0,edit.start)+' '+text.slice(edit.end);
  const rememberPreference = (quote, label) => { preferences.push({ label: label.trim(), quote, status: 'PREFERENCE_NOT_REQUIRED' }); return ' '; };
  // 쉼표 뒤의 '반드시/꼭'은 선택적 요구에 흡수하지 않는다.
  text = text.replace(/가능하면\s*([^.!?。]+?)(?=,\s*(?:반드시|꼭)|$|[.!?。])/gu, (quote,body)=>rememberPreference(quote,body));
  text = text.replace(/(?:있으면\s*좋겠는\s*건)\s*([^.!?。]+?)(?:인데|이고)(?:,\s*[^.!?。]*?괜찮아요)?/gu,(quote,body)=>rememberPreference(quote,body));
  text = text.replace(/(?:[\p{L}\p{N}]+(?:이나|나)?\s*){1,8}(?:예시|사례|화면|설명|장면)(?:가|이)?\s*(?:있으면\s*좋겠(?:고|어요)|나오는\s*자료면\s*좋겠어요)/gu,quote=>rememberPreference(quote,quote));
  text = text.replace(/[^.!?。,]+?\s*(?:더\s*)?좋(?:고요|겠어요)(?=$|[.!?。])/gu,quote=>{
    // 앞 절의 필수 주제를 삼키지 않도록 '되면/있으면/나오면'이 있는 문장에만 적용한다.
    if (!/되면|있으면|나오면/u.test(quote)) return quote;
    return rememberPreference(quote,quote);
  });
  text = text.replace(/(?:영상|자료|방송)(?:은|이)?\s*(?:찾아요|찾습니다|찾아\s*주세요)/gu,' ');
  // 실험·토론이 교실에서 이뤄지는 경우, 영상의 전달 형식 조건으로 보내지 않는다.
  text = text.replace(/(?:실험|토론)(?:을|를|에)?\s*(?:수업\s*)?(?:전에|시작할\s*때|수업\s*도입|수업|자료로\s*쓸|자료로|자료|하려고\s*해요)/gu,quote=>{classroom.push(quote);return ' ';});
  text = text.replace(/(?:[\p{L}\p{N}]+\s*){0,3}(?:실험|관찰|조사|선거)(?:를|을)?\s*(?:하기\s*)?전에|(?:모둠별로\s*토론하려고\s*해요|학생들이?\s*[^.!?。]*?(?:글쓰기를|표로\s*정리하는\s*활동에)[^.!?。]*?(?:하려고요|쓰려고요)|관찰\s*기록\s*과제로\s*내기\s*전에|동기\s*유발용으로|도입으로|도입\s*자료|도입\s*자료로|(?:단원|수업)\s*(?:마무리|도입)(?:로|에)?)/gu,quote=>{classroom.push(quote);return ' ';});
  return { text, exclusions, preferences, classroom };
}
function clauseEvidence(clause,item) {
  const { searchableSupplements } = require('./supplement-search');
  const sources=[{field:'title',text:item.title||''},{field:'summary',text:item.summary||''},...searchableSupplements(item).map(s=>({field:'sourceSupplement',text:s.text,supplementId:s.id,sourceUrl:s.sourceUrl}))];
  const evidence=[];
  for(const source of sources)if(matchingExpressions(clause.label,require('./source-literal').literalText(source.text)).length){
    const pattern=new RegExp(escape(clause.label).replace(/\s+/g,'\\s*'),'iu');const match=pattern.exec(require('./source-literal').literalText(source.text));
    if(match)evidence.push({field:source.field,quote:match[0],start:match.index,end:match.index+match[0].length,...(source.supplementId?{supplementId:source.supplementId,sourceUrl:source.sourceUrl}:{})});
  }
  return { ...clause, status: evidence.length ? 'EXCLUDED_TEXT_FOUND' : 'UNKNOWN', evidence };
}
module.exports = { splitRequestClauses, clauseEvidence };
