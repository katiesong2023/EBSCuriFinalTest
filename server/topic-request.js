// 주제 선택 요청의 문법만 제거한다. 내용어·제외·시간 조건은 유지한다.
function removeTopicRequest(text) {
  return text
    .replace(/수업(?:을)?\s*(?:하고\s*싶(?:어요|어|습니다)|하려고(?:\s*해요)?)/gu, " ")
    .replace(/주제(?:를|는)?\s*(?:선정|추천|정)(?:해\s*주세요|해줘|해주세요|해줄래)?/gu, " ")
    .replace(/수업\s*주제|수업을|주제를/gu, " ");
}
module.exports = { removeTopicRequest };
