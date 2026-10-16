// C 홈은 실제 방송 메타데이터와 현재 브라우저의 개인 폴더만 읽는다.
(() => {
  'use strict';
  const host=document.querySelector('#magazine-home');if(!host)return;
  const teacher=CuriTeacher,{escape}=teacher;
  const resources=new Map();
  window.CuriMagazine={find:id=>resources.get(id)};
  function folders() {
    const library=teacher.readFolders(false),root=document.querySelector('#magazine-folders');root.replaceChildren();
    if(!library.folders.length){const p=document.createElement('p');p.textContent='수업 폴더를 만들고 필요한 자료와 장면을 모아보세요.';root.append(p);}
    for(const folder of library.folders.slice(0,6)) {const a=document.createElement('a');a.href='/lesson.html?view=folder&folder='+encodeURIComponent(folder.id);a.textContent=folder.title+' · '+folder.items.length;root.append(a);}
    const more=document.createElement('a');more.href='/lesson.html';more.textContent='내 수업 자료 열기 →';root.append(more);
  }
  async function load() {
    const recent=document.querySelector('#magazine-recent');
    try {
      const response=await fetch('/api/curi/discover?workspace=teacher&sort=newest&page=1');if(!response.ok)throw new Error('방송 자료를 불러오지 못했어요.');const data=await response.json();
      for(const resource of data.results||[])resources.set(resource.id,resource);
      const items=Array.from(resources.values());
      if(!items.length){recent.querySelector('p').textContent='표시할 방송 자료가 없습니다.';return;}
      document.querySelector('#magazine-feature').innerHTML='<p class="magazine-section-label">새로 살펴볼 자료</p>'+teacher.card(items[0],1,teacher.readShelf());
      recent.replaceChildren();const heading=document.createElement('h2');heading.textContent='최근 방송 자료';recent.append(heading);
      // 제공 날짜는 EBS 공개 방송일이며 수집일이나 추천 점수가 아니다.
      for(const item of items.slice(1,4)) {
        const a=document.createElement('a');a.className='magazine-recent-item';const destination=teacher.destination(item);a.href=teacher.sourceLink(destination.url);a.target='_blank';a.rel='noopener noreferrer';
        a.innerHTML=`<span class="type-tag">${escape(item.kindLabel||'방송 자료')}</span><strong>${escape(item.title)}</strong><small>${escape(item.program||'EBS')} · ${escape(teacher.resourceDateText(item))}</small>`;recent.append(a);
      }
    } catch(error) {recent.querySelector('p')?.remove();const p=document.createElement('p');p.role='status';p.textContent=error.message;recent.append(p);const retry=document.createElement('button');retry.type='button';retry.textContent='다시 불러오기';retry.addEventListener('click',()=>{retry.remove();p.remove();load();});recent.append(retry);}
  }
  window.addEventListener('storage',folders);window.addEventListener('curi-library-changed',folders);window.addEventListener('curi-material-saved',folders);folders();load();
})();
