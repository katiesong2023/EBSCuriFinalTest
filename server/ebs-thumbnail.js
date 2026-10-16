const { loadDiscoveryCatalog } = require('./discovery-catalog');

const cache = new Map();
const waiting = [];
let active = 0;

function officialUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
        !(url.hostname === 'ebs.co.kr' || url.hostname.endsWith('.ebs.co.kr'))) return null;
    url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

function meta(html, property) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(match => [match[1].toLowerCase(), match[3]]));
    if (attributes.property?.toLowerCase() === property) return (attributes.content || '').replace(/&amp;/g, '&');
  }
  return '';
}

function parseThumbnail(html, sourceUrl) {
  const source = new URL(sourceUrl), page = officialUrl(meta(html, 'og:url'));
  const lectId = source.searchParams.get('lectId');
  if (!lectId) return null;
  // 애니키즈 등은 og:url이 사이트 홈이다. 이때 회차 ID가 포함된 JSON-LD 이미지로 대조한다.
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis)) {
    try {
      const data = JSON.parse(script[1]);
      const candidates = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const video of candidates) {
        if (![].concat(video['@type'] || []).includes('VideoObject')) continue;
        for (const value of [].concat(video.thumbnailUrl || [])) {
          const image = officialUrl(value);
          if (image && new URL(image).pathname.split('/').includes(lectId)) return image;
        }
      }
    } catch { /* 구문이 잘못된 메타데이터는 다음 공식 메타를 대조한다. */ }
  }
  // 회차가 다른 페이지나 프로그램 공통 이미지를 해당 방송 썸네일로 표시하지 않는다.
  if (!page || new URL(page).searchParams.get('lectId') !== lectId ||
      new URL(page).searchParams.get('courseId') !== source.searchParams.get('courseId')) return null;
  return officialUrl(meta(html, 'og:image'));
}

async function fetchThumbnail(sourceUrl) {
  let url = officialUrl(sourceUrl);
  const signal = AbortSignal.timeout(10000);
  for (let redirects = 0; url && redirects <= 3; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      url = location ? officialUrl(new URL(location, url).href) : null;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); return null; }
    // 외부 스크립트·플레이어 실행 없이 공개 HTML 메타데이터만 읽는다.
    return parseThumbnail(await response.text(), sourceUrl);
  }
  return null;
}

function drain() {
  while (active < 4 && waiting.length) {
    const { url, resolve } = waiting.shift();
    active++;
    (async () => {
      const image = await fetchThumbnail(url).catch(() => null);
      if (image || new URL(url).hostname === 'www.ebs.co.kr') return image;
      const source = new URL(url);
      const parameters = new URLSearchParams();
      for (const key of ['courseId', 'stepId', 'lectId']) if (source.searchParams.has(key)) parameters.set(key, source.searchParams.get(key));
      return fetchThumbnail('https://www.ebs.co.kr/tv/show?' + parameters).catch(() => null);
    })().then(resolve).finally(() => { active--; drain(); });
  }
}

function thumbnailFor(url) {
  const previous = cache.get(url);
  if (previous && previous.expires > Date.now()) return previous.promise;
  if (waiting.length >= 60) return Promise.resolve(null);
  const entry = { expires: Date.now() + 60000 };
  entry.promise = new Promise(resolve => { waiting.push({ url, resolve }); drain(); }).then(image => {
    entry.expires = Date.now() + (image ? 86400000 : 60000);
    return image;
  });
  cache.delete(url); cache.set(url, entry);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return entry.promise;
}

async function sendThumbnail(request, response) {
  if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
  const id = new URL(request.url, 'http://localhost').searchParams.get('id');
  const catalog = await loadDiscoveryCatalog();
  const item = [...catalog.resources, ...catalog.searchVariants].find(resource => resource.id === id);
  const url = officialUrl(item?.sourceUrl);
  const image = url && new URL(url).searchParams.get('lectId') ? await thumbnailFor(url) : null;
  if (image) {
    response.writeHead(302, { Location: image, 'Cache-Control': 'public, max-age=86400' });
  } else {
    response.writeHead(404, { 'Cache-Control': 'no-store' });
  }
  response.end();
}

module.exports = { sendThumbnail, officialUrl, parseThumbnail };
