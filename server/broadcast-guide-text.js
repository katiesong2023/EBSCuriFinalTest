// 표시 문장은 정리하되 근거의 위치·인용은 수집 원문 그대로 보존한다.
const entities = {nbsp:' ',amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',hellip:'…',middot:'·'};
function cleanGuideText(value) {
  return String(value || '').replace(/<\/?(?:span|strong|b|em|i|a)\b[^>]*>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
      if (key[0] !== '#') return entities[key.toLowerCase()] ?? entity;
      const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : Number(key.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }).replace(/\\(?=[~])/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^(?:(?:\[(?:자막|수어|HD|고화질)\]|자막(?!은|을|이|의|과|와|으로|에|제작|번역|기술|정보))\s*)+/u, '').trim();
}
function guideSentences(value) {
  const raw = String(value || '');
  // 같은 길이의 공백 치환이므로 문장 범위가 HTML을 포함한 원문과 일치한다.
  const indexed = raw.replace(/<[^>]*>|&(?:#x[\da-f]+|#\d+|[a-z]+);/gi, token => ' '.repeat(token.length));
  const sentences = [];
  function add(start,end) {
    while(start<end&&/\s/.test(indexed[start]))start++;
    while(end>start&&/\s/.test(indexed[end-1]))end--;
    const quote=raw.slice(start,end),text=cleanGuideText(quote);
    if(text)sentences.push({field:'summary',start,end,quote,text});
  }
  let start = 0;
  for(let i=0;i<indexed.length;i++) {
    if(!/[.!?。]/.test(indexed[i]))continue;
    if(indexed[i]==='.' && (/[\d]/.test(indexed[i-1])&&/[\d]/.test(indexed[i+1]) ||
      /[A-Za-z]/.test(indexed[i-1])&&/[A-Za-z]/.test(indexed[i+1]) || indexed[i-1]==='.'||indexed[i+1]==='.'))continue;
    let end=i+1;
    while(end<indexed.length&&/[.!?。”’"'）)]/.test(indexed[end]))end++;
    // 인용 뒤의 조사·동사는 같은 문장이다. ‘왜?’라는 질문을 살펴본다.
    if(/^(?:라는|라고|라며|을|를|의|이|가|은|는)/.test(indexed.slice(end)))continue;
    add(start,end);start=end;i=end-1;
  }
  add(start,raw.length);
  return sentences;
}
function guideIssues(value) {
  const text=cleanGuideText(value),issues=[];
  if(/(?:\.{2,}|…+)\s*$/.test(text))issues.push('TRUNCATED_END');
  if(/(?:[,，]|(?:을|를|에서|으로|하고|하며|보고|으며|면서|는데|지만|다면|때문에|통해|위해|하는|되는|있)[ ]*)$/.test(text))issues.push('UNFINISHED_END');
  if(text.includes('�'))issues.push('ENCODING_DAMAGE');
  return [...new Set(issues)];
}
module.exports={cleanGuideText,guideSentences,guideIssues};
