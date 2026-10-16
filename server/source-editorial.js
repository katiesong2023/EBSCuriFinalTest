// 검색·키워드 추출에서 제작 안내를 같은 길이로 보류한다. 원문은 보존한다.
const { sourceSentences } = require('./source-explanation');
function maskEditorial(text, title = '') {
  const names = [...text.matchAll(/(?:배우|진행자|내레이터)\s+([가-힣]{2,5})/gu)].map(m => m[1].replace(/(?:은|는|이|가|을|를)$/u, '')).filter(name => !title.includes(name));
  let masked = text;
  // 한 보도자료에 여러 회차가 소개되면 명시적으로 다른 회차를 설명하는 구간을 보류한다.
  // 현재 회차의 정확한 제목이 머리말에 있는 경우에만 경계를 적용한다.
  const namesInHeader = [...text.slice(0, 260).matchAll(/[‘“"']([^‘’“”"'\n]{3,70})[’”"']/gu)].map(m => m[1].trim());
  const ownTitle = namesInHeader.find(name => name === title.trim());
  const siblings = ownTitle ? namesInHeader.filter(name => name !== ownTitle) : [];
  let otherEpisode = false;
  for (const sentence of sourceSentences(text)) {
    const s = sentence.quote;
    if (ownTitle && s.includes(ownTitle)) otherEpisode = false;
    else if (siblings.some(name => s.includes(name))) otherEpisode = true;
    const attachment = /(?:관련\s*)?사진\s*(?:별첨|첨부|제공)|보도자료\s*(?:문의|담당)|문의\s*[:：]|무단\s*전재|재배포\s*금지/u.test(s);
    const biography = (names.some(name => s.includes(name)) || /배우|내레이터|진행자/u.test(s)) && /캠페인|후원|평소|데뷔|수상\s*경력|출연\s*경력/u.test(s);
    if (biography || otherEpisode) masked = masked.slice(0, sentence.start) + ' '.repeat(sentence.end - sentence.start) + masked.slice(sentence.end);
    else if (attachment) {
      for (const m of s.matchAll(/(?:관련\s*)?사진\s*(?:별첨|첨부|제공)|보도자료\s*(?:문의|담당)|문의\s*[:：]|무단\s*전재|재배포\s*금지/gu)) {
        const start = sentence.start + m.index;
        masked = masked.slice(0,start) + ' '.repeat(m[0].length) + masked.slice(start + m[0].length);
      }
    }
  }
  return masked;
}
module.exports = { maskEditorial };
