// 요청의 문법만 분리한다. 미지의 명사·숫자·명시 조건을 추측으로 삭제하지 않는다.
const grammar = new Set(('뭔지 무슨 무엇 어떤 어떻게 왜 얼마나 인가요 있나요 있을까 있을까요 없나요 없을까 없을까요 ' +
  '좋은 좋을 좋아할 만한 괜찮은 쓸 재밌는 재미있는 흥미로운 쉽게 설명하기 이해하기 공감할 눈높이로 ' +
  '거 걸로 거요 정리용 도입용 마무리용 차시용 수업용 단원 차시 토론용 활동용 예시 정리 개념 시간에 전에 뒤에 짧은 짧게 얘기 관련해서 짜리 ' +
  '하나요 하는가 했을까 했을까요 할까 할까요 하나요 하는지 되나요 될까 될까요 무슨일 일어날까 일어나나요 ' +
  '살까 살까요 살았을까 필요할까 필요한가요 다를까 다른가요 달라질까 달라졌을까 바뀌었는지 바뀌었을까 ' +
  '같은 함께 같이 따라 대해 관해 때문 때문에 된 보는 담은 소개한 편').split(' '));
const predicate = /^(?:생기|생길|생긴|생겼|만들어|만들었|전달될|전달되|살아남|적응하|적응해|쓰이나|쓰일|쓰이|기여하|기여한|기여해|주는|주고받|달라지|바뀌|변하|지켜야|뜨거워질|부풀|배우)(?:[가-힣]*(?:나요|까요|을까|는가|는지|할까|을까요|나|까))$/u;
const question = /[?？]|어떻게|왜|무엇|무슨|뭔지|(?:인가요|은가요|는가요|나요|까요|을까|일까|할까)(?:\s|$)/u;
// 요청 동사의 활용형은 내용 명사가 아니다. 내용 동작/부정 표현 전체를 지우지는 않는다.
const requestVerb = /^(?:소개|설명|추천)(?:하(?:는|고|면|기|러)|한|할|해(?:주(?:는|실|면|세요)|줘|주세요)?)$|^(?:다루(?:는|고|면)|다룬|다룰|보여\s*주(?:는|실|면|세요)|보여줄|찾아주(?:는|실|면|세요))$/u;
function isRequestGrammarToken(token) { return grammar.has(token) || requestVerb.test(token); }
function requestLanguage(value, original = value) {
  let text = value; const removed = [], expansions = [];
  const remove = pattern => { text = text.replace(pattern, quote => { removed.push(quote); return ' '; }); };
  remove(/(?<![\p{L}\p{N}])(?:수업\s*)?(?:도입|정리|마무리|토론|분류|조사|탐구)\s*(?:활동\s*)?(?:차시|시간)?\s*(?:전에|전|용|에\s*쓸|때\s*보여줄)(?![\p{L}\p{N}])/gu);
  remove(/(?<![\p{L}\p{N}])(?:관찰\s*일지\s*쓰기|조사\s*활동|토의할\s*때)\s*(?:전에|전)?/gu);
  remove(/(?<![\p{L}\p{N}])(?:보기|보여주기|설명하기|이해하기)\s*(?:좋은|좋을|쉬운|쉽게|좋게)(?![\p{L}\p{N}])/gu);
  // '관련 편'은 편성 단위 요청이다. 편견·편서풍처럼 내용 명사의 일부는 건드리지 않는다.
  remove(/(?<![\p{L}\p{N}])관련(?:된)?\s*편(?:을|이|은|좀)?(?![\p{L}\p{N}])/gu);
  text = text.replace(/([가-힣]+?)(?:에|에서)\s*(?:사는|서식하는|살아가는)\s+([가-힣]+)/gu, (quote, place, entity) => { removed.push(quote); return ` ${place} ${entity} `; });
  remove(/무슨\s*일(?:이|을)?\s*(?=일어나|일어날|생기|하나)/gu);
  const isQuestion = question.test(original);
  text = text.replace(/[\p{L}\p{N}]+/gu, token => {
    if (isRequestGrammarToken(token) || isQuestion && (predicate.test(token) || /^(?:읽|쓰|찾|보|얻|만들|생기|생길|달라|바뀌|변하|일어나|벌어지|퍼지|퍼졌|높|낮|이롭|해롭|뜨|녹|다르|더우|덥|부풀|적응|기여|순환하|잡|하|되|가|갈|올)[가-힣]*(?:나요|까요|까|는가|는지)$/u.test(token))) { removed.push(token); return ' '; }
    if (isQuestion) return token.replace(/(?:인가요|은가요|는가요|이었나요|일까)$/u, '');
    return token;
  });
  // 내용 동작의 일상 표현은 분야 개념으로 확장하고 원래 구절을 기록한다.
  const paraphrases = [
    [/(?:숨(?:을)?\s*쉬(?:면|는|기|면서|고)|숨쉬(?:면|는|기|면서|고))/gu, '호흡', '숨을 쉬는 동작'],
    [/먹고\s*먹히는\s*(?:관계|모습)/gu, '먹이 관계', '먹고 먹히는 관계']
  ];
  for (const [pattern, term, label] of paraphrases) text = text.replace(pattern, quote => {
    expansions.push({ quote, term, label, status: 'QUERY_EXPANSION' }); return ` ${term} `;
  });
  return { text, removed, expansions, isQuestion, active: isQuestion || removed.length > 0 };
}
module.exports = { requestLanguage, isRequestGrammarToken };
