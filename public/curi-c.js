// C 공통: 브랜드 헤더·명령형 검색 팔레트. 데이터 쓰기는 기존 기능에 맡긴다.
(() => {
  'use strict';
  const panel=document.body.classList.contains('curi-c-panel');
  const asset=panel?'brand/':'/brand/';
  let header=document.querySelector('.site-header,.popup-header');
  if (!header) {
    header=document.createElement('header');header.className='magazine-header';
    const brand=document.createElement('a');brand.className='brand';brand.href='/';brand.setAttribute('aria-label','curi 홈');
    brand.innerHTML=`<img class="wordmark" src="${asset}curi-wordmark.svg" alt="curi" width="92" height="48">`;
    header.append(brand);document.body.prepend(header);
  }
  const brand=header.querySelector('.brand');
  if(brand) {
    brand.replaceChildren();const logo=document.createElement('img');logo.className='wordmark';logo.src=asset+'curi-wordmark.svg';logo.alt='curi';logo.width=92;logo.height=48;
    const symbol=document.createElement('img');symbol.className='brand-symbol';symbol.src=asset+'curi-symbol.svg';symbol.alt='curi';symbol.width=40;symbol.height=40;brand.append(logo,symbol);
  }
  const chip=document.createElement('button');chip.type='button';chip.className='magazine-search-chip';chip.setAttribute('aria-label','자료 검색 열기, Command 또는 Control K');chip.setAttribute('aria-keyshortcuts','Meta+K Control+K');chip.innerHTML='<span class="chip-label">자료 검색</span><kbd>⌘K</kbd>';
  const nav=header.querySelector('nav');if(nav)header.insertBefore(chip,nav);else if(panel)header.insertBefore(chip,header.querySelector('#close-panel'));else header.append(chip);
  const dialog=document.createElement('dialog');dialog.className='magazine-palette';dialog.setAttribute('aria-labelledby','magazine-palette-title');
  dialog.innerHTML='<div class="magazine-palette-header"><h2 id="magazine-palette-title">자료 검색</h2><button type="button" data-palette-close aria-label="검색 닫기">×</button></div><form><label class="sr-only" for="magazine-palette-input">수업 주제나 질문</label><input id="magazine-palette-input" type="search" maxlength="200" placeholder="어떤 수업을 준비하세요?" autocomplete="off" aria-controls="magazine-palette-options"><button type="submit">자료 찾기 →</button></form><div id="magazine-palette-options" class="magazine-palette-options" role="listbox" aria-label="바로가기"></div><p class="magazine-palette-help">↑ ↓ 선택 · Enter 열기 · Esc 닫기</p>';
  document.body.append(dialog);
  const input=dialog.querySelector('input'),options=dialog.querySelector('[role=listbox]');
  const entries=[{label:'생태계 자료 찾기',query:'생태계'},{label:'인구 구조 자료 찾기',query:'인구 구조'},{label:'기후 변화 자료 찾기',query:'기후 변화'},{label:'내 수업 자료',url:'/lesson.html'}];
  if(!panel)entries.push({label:'관리자 작업공간',url:'/admin.html'});
  let selected=0,opener=chip;
  entries.forEach((entry,index)=>{const b=document.createElement('button');b.type='button';b.role='option';b.id='magazine-command-'+index;b.textContent=entry.label;b.addEventListener('click',()=>activate(entry));options.append(b);});
  function select(index) {selected=(index+entries.length)%entries.length;Array.from(options.children).forEach((b,i)=>b.setAttribute('aria-selected',String(i===selected)));input.setAttribute('aria-activedescendant',options.children[selected].id);}
  function close() {dialog.close();}
  async function navigate(path) {
    if(!panel){location.assign(path);return;}
    try {const stored=await chrome.storage.local.get('curiOrigin');const origin=new URL(stored.curiOrigin||'http://localhost:3000');if(!['localhost','127.0.0.1'].includes(origin.hostname)||origin.protocol!=='http:')throw new Error('연결 설정에서 Curi 주소를 확인하세요.');await chrome.tabs.create({url:new URL(path,origin.origin).href});}
    catch(error){dialog.querySelector('.magazine-palette-help').textContent=error.message;}
  }
  function runQuery(query) {
    const q=query.trim();if(!q){input.focus();return;}
    const target=document.querySelector('#search-input');
    if(target&&!panel){close();target.value=q;document.querySelector('#search-form').requestSubmit();}
    else {close();navigate('/?q='+encodeURIComponent(q));}
  }
  function activate(entry) {if(entry.query)runQuery(entry.query);else{close();navigate(entry.url);}}
  function open() {
    if(dialog.open){close();return;}
    if(document.querySelector('dialog[open]'))return;
    opener=document.activeElement;input.value=document.querySelector('#search-input')?.value||'';select(0);dialog.showModal();input.focus();
  }
  chip.addEventListener('click',open);dialog.querySelector('[data-palette-close]').addEventListener('click',close);
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
  dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});
  dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();input.value.trim()?runQuery(input.value):activate(entries[selected]);});
  input.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();select(selected+(event.key==='ArrowDown'?1:-1));}});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();open();}});
  let previousCards=new Map(),previousScroll=0;
  window.addEventListener('curi-results-pending',()=>{
    previousScroll=scrollY;previousCards=new Map(Array.from(document.querySelectorAll('#result-cards>.resource-card')).map(e=>[e.dataset.id,e.getBoundingClientRect()]));
  });
  window.addEventListener('curi-results-rendered',()=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(scrollY-previousScroll)>2)return;
    for(const element of document.querySelectorAll('#result-cards>.resource-card')) {
      const before=previousCards.get(element.dataset.id);if(!before)continue;
      const after=element.getBoundingClientRect(),x=before.x-after.x,y=before.y-after.y;
      if(x||y)element.animate([{transform:`translate(${x}px,${y}px)`},{transform:'none'}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
    previousCards.clear();
  });
  const compact=()=>document.body.classList.toggle('is-compact',scrollY>80);
  if(!panel){window.addEventListener('scroll',compact,{passive:true});compact();}
})();
