// 교사의 요청 표현만 확장한다. 원문 태그나 교육과정 관계를 새로 만들어 붙이지 않는다.
const rewrites = [
 {pattern:/(?<![\p{L}\p{N}])미세\s+플라스틱(?=$|[^\p{L}\p{N}]|(?:의|을|를|은|는|이|가|과|와)(?=$|[^\p{L}\p{N}]))/gu,to:'미세플라스틱',label:'미세 플라스틱 표기 정규화'},
 {pattern:/(?<![\p{L}\p{N}])지키는(?![\p{L}\p{N}])/gu,to:'보호',label:'지키는 → 보호'},
 {pattern:/(?<![\p{L}\p{N}])잠(?:을)?\s*자는\s*동안(?![\p{L}\p{N}])/gu,to:'수면',label:'잠을 자는 동안 → 수면'},
 {pattern:/(?<![\p{L}\p{N}])뇌에서\s*일어나는\s*일(?![\p{L}\p{N}])/gu,to:'뇌 활동',label:'뇌에서 일어나는 일 → 뇌 활동'},
 {pattern:/(?<![\p{L}\p{N}])(발생|보존|보전|이동|생산|소비|증발|적응)(?:하는|하고|하며|하여|해서|되어|되는|되고|된)(?![\p{L}\p{N}])/gu,to:'$1',label:'내용 동작의 활용형 → 동작 명사'},
 {pattern:/만들어\s*낸(?![\p{L}\p{N}])/gu,to:'만든',label:'만들어 낸 → 만든'},
 {pattern:/(?<![\p{L}\p{N}])(사람|생물|동물|식물|주민|학생)들(?![\p{L}\p{N}])/gu,to:'$1',label:'내용 대상의 복수형 → 단수형'},
 {pattern:/(?<![\p{L}\p{N}])일제\s+강점기/gu,to:'일제강점기',label:'일제 강점기 표기 정규화'},
 {pattern:/(?:다양한|서로\s*다른|여러)\s*문화(?:가|의)?\s*(?:(?:사람들?|주민들?)(?:이|가|은|는)?\s*)?(?:함께\s*(?:사는|살아가는|생활하는)|공존하는)/gu,to:'다문화',label:'여러 문화의 공존 → 다문화'},
 {pattern:/대표(?:자)?(?:를|을)?\s*(?:뽑(?:다|는|기|아요|습니다)|선출(?:하다|하는|하기))/gu,to:'선거',label:'대표를 뽑는 과정 → 선거'}
];
function expandRequestPhrases(value) {
 let text=value;const expansions=[];
 for(const {pattern,to,label} of rewrites)text=text.replace(pattern,(quote,...args)=>{const term=to.replace(/\$(\d+)/g,(_,index)=>args[Number(index)-1]);expansions.push({quote,term,label});return ` ${term} `;});
 return {text,expansions};
}
const aliases={선거:['선거','투표']};
const { matchingTerms } = require('./search-term-matching');
function matchingExpressions(term,text) {return matchingTerms(term,text,aliases[term]||[]);}
module.exports={expandRequestPhrases,matchingExpressions};
