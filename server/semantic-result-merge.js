// 원문 검증의 성공은 기존 검색 결과를 교체할 권한이 아니다.
// 새 경로의 실패·빈 응답에서도 기존 결과와 순서를 보존한다.
function mergeReviewedCandidates(localResults, review) {
  const results = [...localResults], seen = new Set(results.map(r => r.id));
  if (!review?.accepted || !Array.isArray(review.results)) return results;
  for (const item of review.results) {
    const proof = item.semanticRequirementReview;
    if (seen.has(item.id) || proof?.status !== 'MODEL_TEXT_CONDITIONS_SUPPORTED_NOT_VIDEO_APPROVAL' || !proof.conditions?.length || proof.conditions.some(c => !c.evidence?.length)) continue;
    seen.add(item.id); results.push(item);
  }
  return results;
}
module.exports = { mergeReviewedCandidates };
