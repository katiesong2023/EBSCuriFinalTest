// 요청 동사와 원하는 관계는 검색 주제와 분리하되 원래 구절을 보존한다.
const { expandRequestPhrases } = require("./discovery-query-language");
const presentation = /(?:설명해\s*주(?:는|세요|십시오|면)|알려\s*주(?:는|세요|십시오|면)|소개해\s*주(?:는|세요)|보여\s*주(?:는|세요|십시오)|설명하는|다룬|다루는|해당하는|비교하는|관찰하는|보여주는|보여줄|보여줘|찾아\s*주(?:는|세요)|추천해\s*주(?:는|세요)|알려줘|설명해줘|활용하고\s*싶(?:어요|습니다)|찾고\s*있(?:어요|습니다))/gu;
const relationPatterns = [
  [/뜻|정의|의미|필요성/gu, '의미·필요성 설명'],
  [/필요한\s*조건|필요한지|타려면|타는\s*조건/gu, '필요 조건'],
  [/원인(?:과|을)?\s*결과|까닭|원인|때문|이유/gu, '원인·결과'],
  [/변화\s*과정|바뀌는|생기는|돌아서|변화하는/gu, '변화·과정'],
  [/형성|만들어진|만든|특징/gu, '형성·특징 설명'],
  [/폭발.*피해/gu, '폭발 피해'],
  [/활동하는|비교하는/gu, '활동·비교'],
  [/서로\s*이해하며|함께\s*결정하는|함께\s*살아가는|살아가는/gu, '공존·참여 사례']
];
const paraphrases = [
  [/물질(?:이|을)?\s*(?:타려면|타는\s*조건)/gu, '연소', '물질이 타는 조건'],
  [/낮(?:과|이)?\s*밤(?:이|의|은|는)?(?=\s*(?:생기|바뀌|까닭|원인|자전|변화))/gu, '지구 자전', '낮과 밤의 변화'],
  [/지구(?:가|는)?\s*(?:돌아서|도는)/gu, '지구 자전', '지구의 회전'],
  [/이주민(?:과|이)?\s*주민(?:이|들이)?/gu, '다문화', '이주민과 주민']
];
function naturalRequest(text, original = text) {
  const relations = [], purposes = [];
  const syntax = require("./request-language").requestLanguage(text, original);
  text = syntax.text; purposes.push(...syntax.removed);
  const expanded = expandRequestPhrases(text);
  text = expanded.text;
  const expansions = [...syntax.expansions, ...expanded.expansions];
  for (const [pattern,label] of relationPatterns) {
    pattern.lastIndex=0;const quotes=[...original.matchAll(pattern)].map(match=>match[0]);
    if(quotes.length)relations.push({label,quotes,status:'UNCONFIRMED'});
  }
  for(const [pattern,term,label] of paraphrases)text=text.replace(pattern,quote=>{
    expansions.push({quote,term,label,status:'QUERY_EXPANSION'});return ` ${term} `;
  });
  const requestVerb = new RegExp(`(?<![\\p{L}\\p{N}])(?:${presentation.source})(?![\\p{L}\\p{N}])`, "gu");
  text=text.replace(requestVerb,quote=>{purposes.push(quote);return ' ';});
  text = text.replace(/(?<![\p{L}\p{N}])(?:자료(?:요|인데|가)?|영상(?:인데|이요)?|찾(?:는데|되|습니다)|필요(?:해요|합니다)|소개하는|하는|이해시킬|예시인데|있어야|나와야|해요|걸로요|거)(?![\p{L}\p{N}])/gu, quote=>{purposes.push(quote); return ' ';});
  const active=syntax.active || purposes.length>0 || relations.length>0 || /설명(?:하는|할)|보여\s*주(?:는|세요)|수업\s*자료|해당하는|다룬|찾아줘|비교하는/.test(original);
  text=text.replace(/(?<![\p{L}\p{N}])(?:수업자료|학습자료)(?![\p{L}\p{N}])/gu,quote=>{purposes.push(quote);return ' ';});
  if(active) {
    // ‘필요한’은 요청 관계로 남긴다. 산소·연소 같은 내용명과 미지의 고유명은 제거하지 않는다.
    text=text.replace(/(?<![\p{L}\p{N}])(?:필요한지|필요한|무엇(?:이|을)?|까닭|서로\s*이해하며|살아가는|생기는|바뀌는|변화하는|돌아서|알려주|설명해주)(?![\p{L}\p{N}])/gu,' ');
  }
  return {text, original, active, relations, purposes, expansions,
    explicitConjunction:/그리고|모두|동시에|\bAND\b/iu.test(original)};
}
const relationTerms = new Set(['조건','원인','결과','과정','변화','비교','까닭','이유','부족할','때','문제','이해','함께','결정하','특징','형성','만들어진','만든','활동하','뜻','정의','의미','필요성']);
function softRelationTerm(term) { return relationTerms.has(term); }
const topicAlternatives = {
  연소: ['불완전연소', '산화', '불이 타', '불을 피', '화목 보일러'],
  자전: ['회전', '낮과 밤', '지구가 도는'],
  다문화: ['이주민', '이주배경', '이민자', '문화의 공존'],
  선거: ['투표', '대표를 뽑', '대표를 선출'],
  광합성: ['빛에너지', '양분을 만드는'],
  증발: ['수증기', '물이 마르는'],
  마찰력: ['미끄러', '접촉면'],
  중력: ['끌어당기', '낙하'],
  생태계: ['먹이사슬', '먹이 관계', '서식지']
};
module.exports={naturalRequest,softRelationTerm,topicAlternatives};
