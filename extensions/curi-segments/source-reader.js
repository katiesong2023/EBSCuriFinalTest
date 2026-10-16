// 공개 페이지의 제목/소개/회차 링크만 읽는다. 로그인·개인정보 페이지에는 연결하지 않는다.
(() => {
  "use strict";
  if (globalThis.CuriSourceReader?.version === '1.2.2') return;
  const core = CuriSegmentCore;
  function metadata() {
    let sourceUrl = core.publicUrl(location.href);
    if (!sourceUrl) throw new Error('EBS 공개 프로그램·영상 페이지에서 사용하세요.');
    const scripts = Array.from(document.scripts).filter(s => !s.src);
    const declaration = scripts.find(s => /var\s+vodCommonIDs\s*=/.test(s.textContent))?.textContent || '';
    const block = declaration.match(/var\s+vodCommonIDs\s*=\s*\{([^}]+)\}/)?.[1] || '';
    const parts = ['courseId','stepId','lectId'].map(k => block.match(new RegExp(k + '\\s*:\\s*["\x27]([A-Za-z0-9_-]+)["\x27]'))?.[1]);
    if (parts.every(Boolean) && core.identity(sourceUrl) !== parts.join(':')) {
      const matching = Array.from(document.querySelectorAll('a[href]')).map(a => core.publicUrl(a.href)).find(url => url && core.identity(url) === parts.join(':'));
      if (matching) sourceUrl = matching;
      else {
        const original = new URL(sourceUrl);
        if (original.searchParams.get('lectId') === parts[2]) {
          ['courseId','stepId','lectId'].forEach((key,index)=>original.searchParams.set(key,parts[index]));
          sourceUrl=core.publicUrl(original.href);
        }
      }
    }
    const value = selector => document.querySelector(selector)?.textContent.trim() || '';
    const meta = key => document.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content?.trim() || '';
    const videos = Array.from(document.querySelectorAll('video'));
    const title = value('#mpv-title-text') || value('.player_title_wrap > strong') || meta('og:title') || value('h1') || document.title;
    const summary = value('.player_title_wrap > p') || meta('og:description') || meta('description');
    const program = value('#mpv-program-text') || value('.list_curriculum h4 a') || meta('og:site_name') || 'EBS';
    const duration = videos.length === 1 && Number.isFinite(videos[0].duration) && videos[0].duration > 0 ? videos[0].duration : null;
    const embedded = Array.from(document.querySelectorAll('iframe[src]')).some(frame => {
      try { const u=new URL(frame.src); return (u.hostname.endsWith('.ebs.co.kr') && /player|vod|video/i.test(u.pathname)) || (['www.youtube.com','www.youtube-nocookie.com'].includes(u.hostname) && u.pathname.startsWith('/embed/')); } catch { return false; }
    });
    const episode = !core.identity(sourceUrl).startsWith('PAGE:') || videos.length > 0 || embedded;
    return { thumbnail: (()=>{try { const image=new URL(meta('og:image'),location.href); return image.protocol==='https:' && (image.hostname==='ebs.co.kr' || image.hostname.endsWith('.ebs.co.kr')) ? image.href : ''; }catch{return '';}})(), title: title.slice(0,300), summary: summary.slice(0,4000), program: program.slice(0,200), sourceUrl, identity: core.identity(sourceUrl), duration, kind: episode ? 'episode' : 'collection' };
  }
  globalThis.CuriSourceReader = { metadata, version:'1.2.2' };
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'METADATA') return;
    try { reply({value:metadata()}); } catch (error) { reply({error:error.message}); }
  });
})();
