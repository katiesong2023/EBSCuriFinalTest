// NEWS는 개별 기사 경로와 공식 페이지의 회차 식별을 함께 대조한다.
function newsIdentity(item) {
  let url; try { url = new URL(item.url); } catch { return null; }
  const match = url.pathname.match(/^\/ebsnews\/menu1\/newsAllView\/(\d+)\/H$/);
  const identity = item.newsIdentity;
  if (url.protocol !== 'https:' || url.hostname !== 'news.ebs.co.kr' || url.port || url.username || url.password || !match || !identity ||
      !['courseId','stepId','lectId'].every(key => typeof identity[key] === 'string' && /^[A-Za-z0-9]{1,80}$/.test(identity[key])) || identity.lectId !== match[1]) return null;
  return identity;
}
module.exports = { newsIdentity };
