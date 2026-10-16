(() => {
  'use strict';
  const { escape } = CuriTeacher;
  function sourceMarkup(quote) {
    return `<blockquote>${escape(quote.text)}</blockquote><p class="filter-help">${escape(quote.sourceDocument)} · ${escape(quote.location)} · 원문 발췌·줄바꿈/공백 정리</p>`;
  }
  function guidanceMarkup(guidance) {
    if (!guidance) return '';
    return `<details class="official-guidance"><summary>공식 교육과정 해설 · 요구를 읽는 도움말</summary><p>${escape(guidance.unitTitle)}</p><h4>이 성취기준의 해설</h4>${guidance.explanation ? sourceMarkup(guidance.explanation) : '<p>이 기준에 별도로 제시된 해설이 없습니다. 기준 원문과 단원 적용 고려 사항을 함께 확인하세요.</p>'}<h4>단원 전체의 적용 시 고려 사항</h4>${sourceMarkup(guidance.application)}<p>${escape(guidance.reviewPrompt)}</p><p class="activity-boundary">공식 교육과정 설명입니다. 영상의 내용 인용·자동 비교 결과·사람 승인과 별도로 읽어 주세요.</p></details>`;
  }
  function placementMarkup(placement) {
    if (!placement) return '';
    return `<details class="official-placement"><summary>편성 안내의 공식 근거</summary><p>${escape(placement.officialGradeBand)}</p>${placement.citations.map(sourceMarkup).join('')}<p>${escape(placement.note)}</p></details>`;
  }
  function guidanceMarkdown(guidance, md) {
    if (!guidance) return [];
    const quoteLines = (label, quote) => quote ? [`- ${label}: ${md(quote.text)}`, `- 교육과정 출처: ${md(quote.sourceDocument)} · ${md(quote.location)}`] : [`- ${label}: 별도 해설 없음`];
    return ['- 공식 교육과정 설명 (영상 인용·자동 비교·승인과 별도):',
      ...quoteLines('성취기준 해설', guidance.explanation), ...quoteLines('단원 전체의 적용 시 고려 사항', guidance.application),
      `- 수업 보완 확인: ${md(guidance.reviewPrompt)}`];
  }
  Object.assign(CuriTeacher, { guidanceMarkup, placementMarkup, guidanceMarkdown });
})();
