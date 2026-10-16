// 자료 단위·내용 형식·이동 대상을 분리한다. 원본의 유형과 주소는 변경하지 않는다.
function isListingResource(item) {
  return item.kind === 'collection' || ['LESSON_LIST', 'ANNOUNCEMENT'].includes(item.navigation?.kind);
}
function resourcePresentation(item) {
  return { unit: isListingResource(item) ? 'LISTING' : 'VIDEO',
    formats: [...new Set((item.genreEvidence || []).map(evidence => evidence.label))],
    destination: item.navigation?.kind || 'UNCONFIRMED' };
}
module.exports = { isListingResource, resourcePresentation };
