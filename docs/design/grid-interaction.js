(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const lab=$('.lab'), menu=$('#chapter-menu');
  const resources=[
    {title:'물의 세 가지 모습',quote:'가열과 냉각에 따라 물의 상태가 달라집니다.'},
    {title:'우리 주변의 작은 변화',quote:'차가운 컵 주변에 나타나는 작은 변화를 관찰합니다.'},
    {title:'동네에서 함께 쓰는 물',quote:'지역 주민은 물을 함께 사용하고 아끼는 방법을 생각합니다.'}
  ];
  const chapters={discover:['01','자료 발견'],evidence:['02','근거 확인'],organize:['03','수업 정리']};
  let profile='a',size='desktop',selected=0,aPanel=false,bChapter='discover';
  function metrics() {
    const style=getComputedStyle(lab),cols=Number(style.getPropertyValue('--cols')),gap=parseFloat(style.getPropertyValue('--gap'));
    const plane=$('.grid-plane'),width=plane.hidden ? $('.stage').clientWidth-2*parseFloat(style.getPropertyValue('--pad')) : plane.getBoundingClientRect().width;
    if(plane.children.length!==cols) plane.replaceChildren(...Array.from({length:cols},()=>document.createElement('i')));
    const col=(width-(cols-1)*gap)/cols;
    $('#metrics').textContent=`실제 프레임 ${Math.round(lab.getBoundingClientRect().width)}px · 내부 ${Math.round(width)}px · ${cols}열 · gutter ${gap}px · 열폭 약${col.toFixed(1)}px · ${profile==='a'?'패널240ms':'장/메뉴220ms'}${$('#motion-toggle').checked?' → 시안0ms':''}`;
  }
  function render() {
    lab.classList.toggle('profile-a',profile==='a');lab.classList.toggle('profile-b',profile==='b');
    lab.dataset.size=size;lab.dataset.panel=String(aPanel);lab.dataset.chapter=bChapter;
    const evidence=profile==='a'?aPanel:bChapter==='evidence';
    $('#evidence-panel').hidden=!evidence;$('.organize').hidden=profile!=='b'||bChapter!=='organize';
    $('.chapter-context').hidden=profile!=='b';$('#chapter-menu-open').hidden=profile!=='b';
    $('#lab-brand').textContent=profile==='a'?'curi':'CURI';
    $('#lab-caption').textContent=profile==='a'?'같은 목록 안에서 근거 읽기':'자료·근거·정리의 리듬';
    $('#stage-title').textContent=profile==='a'?'원문과 연결 이유를 살펴보세요.':'보이지 않던 연결을, 수업의 장면으로.';
    $('#stage-copy').textContent=profile==='a'?'선택한 자료는 유지하고, 근거 패널만 열어 비교합니다.':'큰 문장과 프레임, 밝은 읽기 면으로 구역을 구분합니다.';
    $('#panel-toggle').textContent=profile==='a'?(aPanel?'근거 패널 닫기':'근거 패널 열기'):'선택 자료의 근거 장 열기';
    $('#panel-toggle').setAttribute('aria-expanded',String(evidence));
    $('#selected-title').textContent=$('#evidence-title').textContent=resources[selected].title;
    $('#evidence-quote').textContent=resources[selected].quote;
    $('#organize-title').textContent=`선택 자료: ${resources[selected].title} · 예시 메모와 폴더 선택은 단계 이동 후에도 유지됩니다.`;
    document.querySelectorAll('[data-select]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.select)===selected)));
    document.querySelectorAll('[data-card]').forEach(card=>card.dataset.selected=String(Number(card.dataset.card)===selected));
    document.querySelectorAll('#chapter-menu [data-chapter]').forEach(button=>{if(button.dataset.chapter===bChapter)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    $('#chapter-number').textContent=chapters[bChapter][0];$('#chapter-label').textContent=chapters[bChapter][1];
    $('#lab-state').textContent=profile==='a'?(aPanel?'A · 목록을 재배치하고 근거를 열었습니다. 글자 크기와 선택은 유지됩니다.':'A · 근거 패널을 열어 같은 작업공간의 재배치를 비교하세요.'):`B · ${chapters[bChapter][1]} 장. 선택 자료·예시 메모·폴더는 유지됩니다.`;
    metrics();
  }
  document.querySelectorAll('[data-profile]').forEach(button=>button.addEventListener('click',()=>{profile=button.dataset.profile;document.querySelectorAll('[data-profile]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
  document.querySelectorAll('[data-size]').forEach(button=>{if(button.tagName!=='BUTTON')return;button.addEventListener('click',()=>{size=button.dataset.size;document.querySelectorAll('button[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();});});
  document.querySelectorAll('[data-select]').forEach(button=>button.addEventListener('click',()=>{selected=Number(button.dataset.select);render();}));
  $('#grid-toggle').addEventListener('click',()=>{const shown=$('.grid-plane').hidden;$('.grid-plane').hidden=!shown;$('#grid-toggle').setAttribute('aria-pressed',String(shown));metrics();});
  $('#motion-toggle').addEventListener('change',()=>{lab.classList.toggle('reduce-motion',$('#motion-toggle').checked);menu.classList.toggle('reduce-motion-dialog',$('#motion-toggle').checked);metrics();});
  $('#panel-toggle').addEventListener('click',()=>{if(profile==='a')aPanel=!aPanel;else bChapter='evidence';render();});
  $('#panel-close').addEventListener('click',()=>{if(profile==='a')aPanel=false;else bChapter='discover';render();$('#panel-toggle').focus();});
  $('#chapter-menu-open').addEventListener('click',()=>{$('#chapter-menu-open').setAttribute('aria-expanded','true');menu.showModal();});
  $('#chapter-menu-close').addEventListener('click',()=>menu.close());
  menu.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...menu.querySelectorAll('button')].filter(button=>!button.disabled);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  menu.addEventListener('close',()=>{$('#chapter-menu-open').setAttribute('aria-expanded','false');$('#chapter-menu-open').focus();});
  document.querySelectorAll('#chapter-menu [data-chapter]').forEach(button=>button.addEventListener('click',()=>{bChapter=button.dataset.chapter;render();menu.close();}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.open&&profile==='a'&&aPanel){aPanel=false;render();$('#panel-toggle').focus();}});
  new ResizeObserver(metrics).observe($('.stage'));
  render();
})();
