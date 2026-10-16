// '주제의 부재'만을 말한 소개를 그 주제를 실제로 다루는 긍정 근거로 승격하지 않는다.
// 마스크는 검사에만 쓰며 저장 원문·인용 오프셋은 변경하지 않는다.
const { matchingLiteralExpressions: matches } = require('./source-literal');
const patterns = new Map();
function positiveText(text, alias) {
  if (!patterns.has(alias)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    if (patterns.size >= 512) patterns.delete(patterns.keys().next().value);
    // '차별이 아닌 공존' 같은 대조는 주제 부재가 아니다. 명시적인 부재 표현만 가린다.
    patterns.set(alias, new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?:의|이|가|은|는|을|를)?\\s*(?:(?:과정|작용|활동|반응)(?:이|가|은|는)?\\s*)?(?:없이|없는|없다|없어|없고)(?![\\p{L}\\p{N}])`, 'gu'));
  }
  return text.replace(patterns.get(alias), quote => ' '.repeat(quote.length));
}
function negativeOnlyTopics(fields, groups) {
  return groups.filter(group => {
    const mentioned = fields.some(s => group.aliases.some(a => matches(a, s.text).length));
    if (!mentioned) return false;
    return !fields.some(s => group.aliases.some(a => matches(a, positiveText(s.text, a)).length));
  }).map(g => g.requested);
}
module.exports = { negativeOnlyTopics };
