(() => {
  'use strict';
  const teacher = CuriTeacher;
  const toast = document.createElement('div');
  toast.className = 'curi-toast'; toast.hidden = true; toast.setAttribute('role','status');
  document.body.append(toast);
  let timer, lastMessage = '';
  function notify(message, undo) {
    clearTimeout(timer); toast.replaceChildren(document.createTextNode(message)); toast.hidden = false;
    if (undo) {
      const button = document.createElement('button');button.type='button';button.textContent='되돌리기';
      button.addEventListener('click',()=>{try {undo();syncCards();notify('담기를 되돌렸어요.');}catch(error){notify(error.message);}});
      toast.append(button);
    }
    const hide = () => { if (!toast.contains(document.activeElement) && !toast.matches(':hover')) toast.hidden = true; else timer=setTimeout(hide,1000); };
    timer=setTimeout(hide,4000);
  }
  function syncCards() {
    const library=teacher.readFolders(false),locations=new Map();
    for(const folder of library.folders) for(const id of new Set(folder.items.map(entry=>entry.resource.id))) {
      if(!locations.has(id))locations.set(id,[]);
      locations.get(id).push(folder.title);
    }
    document.querySelectorAll('.resource-card[data-id]').forEach(card=>{
      const saved=locations.get(card.dataset.id)||[];
      const meta=card.querySelector('.saved-meta');if(meta)meta.textContent=saved.length?'● '+saved.join(' · ')+'에 담김':'';
      const button=card.querySelector('[data-folder-save]');if(button)button.textContent=card.closest('.library-cards')?'다른 폴더로 가져가기':saved.length?'✓ 담김':'내 수업으로 가져가기';
    });
  }
  window.addEventListener('curi-material-saved',event=>{
    const d=event.detail;syncCards();notify(`${d.folderTitle} ${d.number}로 담았어요.`,d.undo);
  });
  window.addEventListener('storage',()=>{syncCards();});
  window.addEventListener('curi-library-changed',()=>{syncCards();});
  document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement && event.target.closest('.scene-poster,.folder-art'))event.target.hidden=true;},true);
  const cards=document.querySelector('#result-cards');
  if(cards) {
    let syncFrame=0;
    const observer=new MutationObserver(()=>{document.body.classList.toggle('is-curi-busy',cards.getAttribute('aria-busy')==='true');if(!syncFrame)syncFrame=requestAnimationFrame(()=>{syncFrame=0;syncCards();});});observer.observe(cards,{childList:true,attributes:true,attributeFilter:['aria-busy']});
    const close=document.createElement('button');close.type='button';close.textContent='닫기';close.setAttribute('aria-label','검색 결과 닫기');close.addEventListener('click',()=>{document.querySelector('.results-section').hidden=true;document.querySelector('#search-input').focus();});document.querySelector('.results-heading').append(close);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){document.querySelector('.results-section').hidden=true;document.querySelector('#search-input').focus();}});
    function revealResults() {
      const section=document.querySelector('.results-section');
      section.hidden=false;
      // 최신 결과/오류 표시와 로딩 종료를 반영한 뒤 결과 헤더로 이동한다.
      requestAnimationFrame(()=>{
        if (cards.getAttribute('aria-busy') === 'true' || !section.getClientRects().length) return;
        const heading=document.querySelector('.results-heading');
        heading.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      });
    }
    document.addEventListener('curi-search-complete',event=>{if(event.detail?.focusResults)revealResults();});
  }
  const saveStatus=document.querySelector('#save-status');
  if(saveStatus)new MutationObserver(()=>{const message=saveStatus.textContent;if(message && message!==lastMessage){lastMessage=message;notify(message);}}).observe(saveStatus,{childList:true,characterData:true,subtree:true});
  syncCards();
  window.CuriUI={notify};
})();
