// 검색용 개념 묶음의 별칭은 동의어가 아니다. 명시된 하위 소재를 원문에서 다시 확인한다.
const { matchingExpressions } = require('./discovery-query-language');
const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/\s/g,'');
const equivalents = {
  저출산: ['저출산','저출생'], 저출생: ['저출산','저출생'],
  '먹이 사슬': ['먹이 사슬','먹이사슬','먹이 관계'], 먹이사슬: ['먹이 사슬','먹이사슬','먹이 관계'],
  '지구 온난화': ['지구 온난화','지구온난화'], 지구온난화: ['지구 온난화','지구온난화'],
  '기후 위기': ['기후 위기','기후위기'], 기후위기: ['기후 위기','기후위기']
};
function queryConcepts(found,text) {
  return found.filter(concept=>{
    // 신체 비유를 실제 신체 개념으로 태깅하지 않는다. 대상을 생성하지 않고 확인을 남긴다.
    if (!['respiration','heart','body'].includes(concept.id)) return true;
    return !/(?:지구|도시|경제|산업|나라)(?:의|에\s*있는)?\s*(?:허파|폐|심장|몸)/u.test(text);
  }).map(concept=>{
    const requestedAliases=concept.aliases.filter(alias=>matchingExpressions(alias,text).length && normalize(alias)!==normalize(concept.label));
    return { ...concept, requestedAliases: requestedAliases.filter(alias=>!requestedAliases.some(other=>other!==alias&&normalize(other).includes(normalize(alias)))) };
  });
}
function specificQueryTerms(concept,text) {
  const aliases=concept.requestedAliases || concept.aliases.filter(alias=>matchingExpressions(alias,text).length && normalize(alias)!==normalize(concept.label));
  return [...new Set([...(concept.specificAliases||[]).filter(alias=>matchingExpressions(alias,text).length),...aliases])];
}
function matchesSpecificTerm(term,text) {return (equivalents[term]||[term]).some(alias=>matchingExpressions(alias,text).length);}
module.exports={queryConcepts,specificQueryTerms,matchesSpecificTerm};
