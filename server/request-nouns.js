const { vocabulary } = require('./keyword-vocabulary');
const { concepts } = require('./semantic-layer');
const { isMeaningNoun } = require('./source-meaning');
const { specificTerms } = require('./content-preview');
const { unitAnchors } = require('./curriculum-expansion-anchors');
const { additionalTerms } = require('./content-keywords');
const { expressionPattern } = require('./search-term-matching');
// 내용 추출과 검색은 같은 원천 어휘를 사용한다. 낯선 명사의 끝 글자를 조사로 추측하지 않는다.
const nouns = new Set([...vocabulary, ...additionalTerms, ...specificTerms, ...Object.values(unitAnchors).flat(), ...concepts.flatMap(c => c.aliases)]);
const catalogWords = new WeakMap();
function sourceVocabulary(resources) {
  // 전체 소개문의 어절을 복제해 보관하지 않는다. 요청에 실제 등장한 형태만 제한적으로 조회한다.
  if (!catalogWords.has(resources)) {
    const found = new Map();
    const lookup = (term, inflections) => {
      if (!term) return false;
      const key = `${inflections ? 'stem' : 'exact'}:${term}`;
      if (!found.has(key)) {
        const pattern = expressionPattern(term, { inflections });
        const hit = resources.some(item => pattern.test(String(item.title || '').normalize('NFKC')) || pattern.test(String(item.summary || '').normalize('NFKC')));
        if (found.size >= 512) found.delete(found.keys().next().value);
        found.set(key, hit);
      }
      return found.get(key);
    };
    catalogWords.set(resources, { has: term => lookup(term, false), hasStem: term => lookup(term, true) });
  }
  return catalogWords.get(resources);
}
function normalizeRequestNoun(term, sourceWords, isGrammar = () => false) {
  const known = value => nouns.has(value) || isMeaningNoun(value);
  if (known(term)) return term;
  // 명사형 동작에 붙은 활용형도 같은 표제어로 검색한다. 확인 가능한 기본형만 복원한다.
  const action = /^(.*?)(?:하는|하고|하며|하여|해서|되어|되는|되고|하기|했던|하던|된|한|할|해)$/u.exec(term)?.[1];
  if (action?.length > 1 && (known(action) || sourceWords?.has(action) || sourceWords?.hasStem?.(action))) return action;
  // 여러 음절의 명시적 격 표지는 미등록 고유명에도 붙는다. 한 글자 끝음절 추측과 구분한다.
  // '우크라이나'처럼 온전한 고유명도 '이나'로 끝난다. 선택 조사는 기본형 근거가 필요하다.
  const alternative = /^(.*?)(?:이나|이랑)$/u.exec(term)?.[1];
  if (alternative?.length > 1 && (known(alternative) || isGrammar(alternative) || sourceWords?.has(alternative) || sourceWords?.hasStem?.(alternative))) return alternative;
  const explicit = term.replace(/(?:들)?(?:에게서|한테서|으로부터|로부터|에서는|에서도|에게는|한테는|으로는|처럼|에게|한테|에서|으로|마다|까지|부터)$/u, '');
  if (explicit !== term && explicit.length > 1) return explicit;
  const base = term.replace(/(?:들)?(?:에서는|에서|으로|처럼|에게|한테|의|을|를|은|는|이|가|와|과|에|로)$/u, '');
  if (base !== term && (known(base) || isGrammar(base))) return base;
  // 같은 원천에 '가족'과 '가족은'이 함께 있어도 검색 표제어는 가족이다.
  // 온전한 등록 명사는 위에서 먼저 보존하고, 둘 이상의 글자인 원천 명사만 복원한다.
  if (base !== term && base.length > 1 && (sourceWords?.has(base) || sourceWords?.hasStem?.(base))) return base;
  return term;
}
module.exports = { normalizeRequestNoun, sourceVocabulary };
