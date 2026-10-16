// 제목·소개문·질문에서 같은 단어 경계를 사용한다.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 조사·복수형을 허용하되 '활용해'의 '용해', '빛나는'의 '빛' 같은 부분 일치는 제외한다.
function aliasRegex(alias, { declarations = false } = {}) {
  const declaration = declarations ? '|(?:이라는|라는|이라고|라고|이란|란|이다|이며|이고|인)(?=$|[^\\p{L}\\p{N}])' : '';
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(alias).replace(/ /g, "\\s*")}(?=$|[^\\p{L}\\p{N}]|(?:들|의|을|를|은|는|이|가|와|과|에|에서|으로|로|도|만|처럼|까지|부터)(?=$|[^\\p{L}\\p{N}]|의|을|를|은|는|이|가|와|과|에)${declaration})`, "giu");
}
module.exports = { aliasRegex };
