// 공식 목록의 각 링크 안에서만 제목·설명을 읽어 다른 회차의 본문을 섞지 않는다.
// DOMParser가 있는 브라우저 문맥에서 실행하며 원문 HTML의 스크립트는 실행하지 않는다.
function parseBroadcastList({ html, sourceUrl, type, program }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const selector = type === 'travel' ? "a[href*='replayView?']" : type === 'jisike' ? ".vodmeta a[href*='vodReplayView']" : "#itemList a[href*='vodReplayView']";
  const clean = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const found = [...doc.querySelectorAll(selector)].map(a => {
    const title = clean(a.querySelector(type === 'travel' ? '.cnt' : type === 'jisike' ? '.tit' : '.tit_info'));
    const summary = clean(a.querySelector(type === 'jisike' ? '.con' : '.stit_info'));
    const rawDate = clean(a.querySelector(type === 'travel' ? '.data' : type === 'jisike' ? '.view' : '.item_info'));
    const date = rawDate.match(/(\d{4})[.년-]\s*(\d{2})[.월-]\s*(\d{2})/)?.slice(1).join('-') || null;
    return { title, summary, program: type === 'travel' ? clean(a.querySelector('.tit')) : program, date,
      url: new URL(a.getAttribute('href'), sourceUrl).href };
  }).filter(item => item.title && item.program);
  return [...new Map(found.map(item => [item.url, item])).values()];
}
function validateSeriesEpisodes(sourceUrl, items) {
  const { officialUrl } = require('./source-enrichment');
  const parent = officialUrl(sourceUrl);
  if (parent?.hostname !== 'docuprime.ebs.co.kr' || !parent.pathname.endsWith('/newReplayList') || !parent.searchParams.get('courseId') || !parent.searchParams.get('stepId') || !Array.isArray(items) || !items.length || items.length > 100) throw Error('공식 회차 목록 미확인');
  for (const item of items) {
    const url = officialUrl(item.url);
    if (!url || url.searchParams.get('courseId') !== parent.searchParams.get('courseId') || url.searchParams.get('stepId') !== parent.searchParams.get('stepId') || !url.searchParams.get('lectId') || !item.title?.trim() || !item.program?.trim() || typeof item.summary !== 'string') throw Error('다른 시리즈 또는 식별 없는 회차 연결 차단');
  }
}
module.exports = { parseBroadcastList, validateSeriesEpisodes };
