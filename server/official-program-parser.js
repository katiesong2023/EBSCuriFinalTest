// DOMParser를 제공하는 수집 브라우저에서 실행한다. 미디어를 요청하거나 실행하지 않는다.
function parseOfficialPage({ html, url, mode, program }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const clean = node => (node?.textContent || '').replace(/\s+/g,' ').trim();
  const absolute = value => { try { const u=new URL(value,url); if(u.hostname.endsWith('.ebs.co.kr'))u.protocol='https:'; return u.href; } catch { return ''; } };
  if (mode === 'inventory') return [...doc.querySelectorAll('li')].filter(li=>li.querySelector('.mainTit')).map(li=>({name:clean(li.querySelector('.mainTit')),homeUrl:absolute(li.querySelector('.mainTit a')?.getAttribute('href')),episodeUrl:absolute(li.querySelector('.col2 a')?.getAttribute('href')),listedEpisodes:Number(clean(li.querySelector('.col2')).replace(/,/g,'')),category:clean(li.querySelector('.col3'))}));
  if (mode === 'news-list') return [...new Set([...doc.querySelectorAll('a[href]')].map(a=>absolute(a.getAttribute('href'))).filter(link=>/^https:\/\/news\.ebs\.co\.kr\/ebsnews\/menu1\/newsAllView\/\d+\/H(?:\?|$)/.test(link)).map(link=>{const u=new URL(link);return u.origin+u.pathname;}))];
  if (mode === 'news-detail') {
    const lect = new URL(url).pathname.match(/newsAllView\/(\d+)\/H/)?.[1];
    const config = html.match(/courseId\s*:\s*['"]([^'"]+)['"][\s\S]{0,150}?stepId\s*:\s*['"]([^'"]+)['"][\s\S]{0,150}?lectId\s*:\s*['"]([^'"]+)['"]/);
    const title = clean(doc.querySelector('.view_head .title h4')), summary=clean(doc.querySelector('.view_con .txt'));
    const video = doc.querySelector('#vodUrl')?.value || doc.querySelector('#vodUrl')?.getAttribute('value') || '';
    const hasVideo = Boolean(doc.querySelector('video#vod_player') && /^https:\/\/[^/]+\.ebs\.co\.kr\/.*\.(?:mp4|m3u8)(?:\?|$)/.test(video));
    const date = clean(doc.querySelector('.view_head .date')).match(/(\d{4})\.\s*(\d{2})\.\s*(\d{2})/);
    return {title,summary,hasVideo,isFullBroadcast:/^\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*EBS\s*뉴스(?:12)?$/.test(title),identityMatched:Boolean(config&&config[3]===lect),newsIdentity:config?{courseId:config[1],stepId:config[2],lectId:config[3]}:null,publishedDate:date?`${date[1]}-${date[2]}-${date[3]}`:null,url,program:'EBS 뉴스'};
  }
  const items=[];
  for(const a of doc.querySelectorAll("a[href*='lectId=']")) {
    const target=absolute(a.getAttribute('href'));let u;try{u=new URL(target)}catch{continue}
    if(u.searchParams.get('courseId')!==program.courseId||!u.searchParams.get('stepId'))continue;
    const li=a.closest('.half-list__item')||a.closest('li')||a;
    const title=clean(li.querySelector('.half-list__title,.vod_title,.tit_info,.tit,.cnt'))||clean(a.querySelector('p'));
    if(!title)continue;
    const date=clean(li.querySelector('.half-list__date,.vod_date,.date_info,.date,.data')).match(/\d{4}[.-]\d{2}[.-]\d{2}/)?.[0];
    items.push({title:title.replace(/^\d+\.\s*/,''),summary:clean(li.querySelector('.vod_disk,.stit_info,.con')),url:target,program:program.name,date:date?.replaceAll('.','-')||null});
  }
  const course=html.match(/var COURSE_ID\s*=\s*'([^']+)'/)?.[1], step=html.match(/var STEP_ID\s*=\s*'([^']+)'/)?.[1];
  if(course===program.courseId&&step)for(const a of doc.querySelectorAll("a[onclick*='fn_view(']")){
    const lect=a.getAttribute('onclick').match(/fn_view\('([^']+)'/)?.[1],li=a.closest('li'),title=clean(li?.querySelector('.tit_info'));
    if(lect&&title)items.push({title,summary:clean(li.querySelector('.stit_info')),program:program.name,date:clean(li.querySelector('.date_info')).replaceAll('.','-')||null,url:`https://www.ebs.co.kr/tv/show?${new URLSearchParams({courseId:course,stepId:step,lectId:lect})}`});
  }
  return {items:[...new Map(items.map(item=>[new URL(item.url).searchParams.get('lectId'),item])).values()],menus:[...new Set([...doc.querySelectorAll("a[href*='/replay/'][href*='/list']")].map(a=>absolute(a.getAttribute('href'))).filter(link=>new URL(link).searchParams.get('courseId')===program.courseId))]};
}
module.exports = { parseOfficialPage };
