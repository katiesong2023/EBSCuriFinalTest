// 내용 명사·고유명과 활용된 동작 표현을 구분한다. 미지의 명사를 의미 점수로 우회하지 않는다.
const { vocabulary } = require('./keyword-vocabulary');
const { isMeaningNoun } = require('./source-meaning');
const nouns = new Set(vocabulary);
// 활용 표지는 문법 범주다. 특정 테스트 주제/정답/콘텐츠 ID를 포함하지 않는다.
const predicate = /(?:하|되|지|리|이|치|르|추|두|내|놓|들|오|가|사|받|먹|쓰|찾|보|읽|듣|붙|녹|줄어드)(?:는|던|고|며|면|기)$/u;
function isContentPredicate(term) {
  return term.length >= 2 && !nouns.has(term) && !isMeaningNoun(term) && (predicate.test(term) || /는지$/u.test(term));
}
module.exports = { isContentPredicate };
