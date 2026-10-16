// 한글에는 JS의 \b를 쓸 수 없다. 다른 단어의 안쪽 일치 대신
// 독립 표현, 조사/활용형, 명시적으로 확인한 복합어만 허용한다.
const compounds = {
 미세플라스틱: ['미세 플라스틱'],
 연소: ['완전연소','불완전연소','연소반응','연소과정','연소실험','연소조건','연소생성물'],
 김제: ['김제평야'], 산소: ['산소농도','산소량'], 이산화탄소: ['이산화탄소농도'],
 선거: ['선거권','선거제도','선거운동'], 투표: ['투표권','투표용지','투표소'],
 산화: ['산화물','산화반응','산화작용'], 자전: ['자전축','자전주기'], 공전: ['공전궤도','공전주기'],
 영양: ['영양소','영양사','영양분','영양섭취','영양결핍'],
 기술: ['과학기술','적정기술','첨단기술','정보기술','기술자','기술력','해동기술','저장기술'],
 무역: ['자유무역','공정무역','무역로','무역회사','무역영어'],
 생산: ['생산자','생산량','생산성','생산현장','재생산','대량생산','식량생산','노동생산성'],
 소비: ['소비자','과소비','소비기한','소비습관','소비처'],
 음악: ['음악회','음악대','음악치료','전통음악'], 택배: ['택배원','택배놀이','우체국택배원']
};
const particles = '(?:에서|에게서|한테서|으로부터|로부터|에게|한테|으로|처럼|보다|까지|부터|마다|조차|밖에|뿐|의|을|를|은|는|이|가|와|과|에|로|도|만|들)';
const endings = '(?:하다|한다|하는|하고|하며|하면|하여|하기|한|할|했다|했던|해요|해내는|합니다|된다|되는|되고|되어|되었다|되면|되기|시키다|시키는|이다|이었다|입니다|인|이고|이며|이라는|이란)';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// 유니코드 경계/조사 규칙은 한 번만 컴파일한다. 단어마다 큰 경계 정규식을 만들지 않는다.
const wordCharacter = /[\p{L}\p{N}]/u;
const suffixChecks = {
 korean: new RegExp(`^(?:${particles}){0,3}(?:${endings})?(?![\\p{L}\\p{N}])`, 'iu'),
 english: /^(?:s|es)?(?![\p{L}\p{N}])/iu,
 other: /^(?![\p{L}\p{N}])/u
};
const cache = new Map();
function expressionPattern(expression, { inflections = true } = {}) {
 const value = String(expression || '').normalize('NFKC').trim();
 if (!value) return null;
 const key = `${inflections ? 'inflected' : 'exact'}:${value}`;
 if (!cache.has(key)) {
  const word = escape(value).replace(/\s+/g,'\\s*');
  const suffix = !inflections ? suffixChecks.other : /[가-힣]$/u.test(value) ? suffixChecks.korean : /[a-z]$/iu.test(value) ? suffixChecks.english : suffixChecks.other;
  const literal = new RegExp(word, 'giu');
  if (cache.size >= 2048) cache.delete(cache.keys().next().value);
  cache.set(key, { test(source) {
    literal.lastIndex = 0;
    let match;
    while ((match = literal.exec(source))) {
      const before = [...source.slice(Math.max(0, match.index - 2), match.index)].at(-1) || '';
      if (!wordCharacter.test(before) && suffix.test(source.slice(match.index + match[0].length))) return true;
    }
    return false;
  }, matches(source) {
    literal.lastIndex = 0;
    const found = []; let match;
    while ((match = literal.exec(source))) {
      const before = [...source.slice(Math.max(0, match.index - 2), match.index)].at(-1) || '';
      if (!wordCharacter.test(before) && suffix.test(source.slice(match.index + match[0].length))) found.push(match);
    }
    return found;
  } });
 }
 return cache.get(key);
}
function matchingTerms(term,text,aliases=[]) {
 const source = String(text || '').normalize('NFKC');
 return [...new Set([term,...aliases,...(compounds[term] || [])])].filter(word=>expressionPattern(word)?.test(source));
}
module.exports = { matchingTerms, expressionPattern, compounds };
