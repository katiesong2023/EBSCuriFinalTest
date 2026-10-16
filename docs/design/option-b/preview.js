(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const resources = [
    {id:'water', title:'물은 어떻게 여행할까요?', subject:'science', label:'과학', program:'가상 EBS 자연 탐구', summary:'증발과 응결, 구름과 비를 따라 물의 여행을 살펴봅니다.', quote:'따뜻해진 물은 수증기로 변해 공기 중으로 올라갑니다.', graphic:'◒', color:'var(--b-science)'},
    {id:'town', title:'우리 동네를 바꾸는 작은 선택', subject:'social', label:'사회', program:'가상 EBS 시민 이야기', summary:'동네의 공공장소와 주민의 참여를 함께 생각합니다.', quote:'주민들은 함께 사용할 공간에 관해 의견을 나눕니다.', graphic:'▥', color:'var(--b-social)'},
    {id:'forest', title:'숲에서 만난 생태계의 연결', subject:'science', label:'과학', program:'가상 EBS 자연 탐구', summary:'숲에 사는 생물의 관계와 다양한 서식 환경을 살펴봅니다.', quote:'나무와 곤충은 서로 영향을 주며 살아갑니다.', graphic:'◎', color:'var(--b-cross)'}
  ];
  let subject='all', current=null, opener=null, busy=false, connected=true, mode='whole', failNext=false, toastTimer;
  const saved=[];
  function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,4000); }
  function render() {
    const query=$('#query').value.trim();
    const found=resources.filter(r=>(subject==='all'||r.subject===subject)&&(!query||(r.title+r.summary).includes(query)));
    $('#result-count').textContent=String(found.length).padStart(2,'0');
    $('#demo-result-status').textContent=query?`「${query}」의 가상 예시 결과입니다. 실제 EBS 검색 결과가 아닙니다.`:'가상 자료 3개로 구성한 화면 예시입니다.';
    $('#demo-results').innerHTML=found.map((r,i)=>`<article class="resource"><div class="visual" style="--topic:${r.color}" aria-hidden="true"><span class="count">0${i+1}</span><span class="graphic">${r.graphic}</span><span class="visual-label">CURIMAP / ${r.subject.toUpperCase()}</span></div><div class="resource-body"><span class="subject">${r.label} · 가상 예시</span><h5>${r.title}</h5><p class="meta">${r.program} · 원문 정보 시안</p><p>${r.summary}</p><blockquote>소개문 예시: “${r.quote}”</blockquote><p class="meta">요청과의 연결 예시 · 학년·장면 적합성은 별도 확인</p><details><summary>전체 제목·출처 확인</summary><p>${r.title}</p><p>실제 원문 링크가 없는 가상 자료입니다.</p></details><div class="resource-actions"><button type="button" data-source="${r.id}">원문 안내 ↗</button><button type="button" class="primary" data-bring="${r.id}">가져가기 ↗</button></div></div></article>`).join('');
    $('#demo-empty').hidden=found.length>0;
  }
  function showBringPage(page) {
    $('#bring-page-one').hidden=page!==1; $('#bring-page-two').hidden=page!==2;
    $('#bring-step').textContent=page===1?'1 / 2 · 교육과정':'2 / 2 · 폴더';
    $('#bring-title').textContent=page===1?'수업과 연결하기':'어느 수업에 가져갈까요?';
    document.querySelectorAll('.step-dots i').forEach((dot,i)=>dot.classList.toggle('current',i===page-1));
    $('#bring-status').textContent=''; updateSummary();
  }
  function updateSummary() {
    const folder=$('#bring-folder').value==='new'?$('#new-folder').value.trim()||'새 폴더 이름 필요':$('#bring-folder').value;
    $('#bring-summary').textContent=`대상: ${folder} · 교육과정 ${$('#bring-standard').checked?'예시 1개':'선택 안 함'} · 최종 가져가기 전에는 저장되지 않습니다.`;
  }
  $('#demo-search').addEventListener('submit',e=>{e.preventDefault();render();});
  document.querySelectorAll('[data-subject]').forEach(button=>button.addEventListener('click',()=>{subject=button.dataset.subject;document.querySelectorAll('[data-subject]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
  $('#reset-search').addEventListener('click',()=>{$('#query').value='';subject='all';document.querySelector('[data-subject=all]').click();});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('#discover-view').hidden=button.dataset.view!=='discover';$('#library-view').hidden=button.dataset.view!=='library';}));
  $('#demo-results').addEventListener('click',e=>{
    const source=e.target.closest('[data-source]'); if(source) return toast('가상 자료입니다. 운영 화면에서는 실제 EBS 원문을 엽니다.');
    const button=e.target.closest('[data-bring]');if(!button)return;
    current=resources.find(r=>r.id===button.dataset.bring);opener=button;
    $('#bring-resource').textContent=current.title;$('#bring-standard').checked=false;$('#bring-folder').value='물의 여행';$('#new-folder').value='';$('#new-folder-field').hidden=true;showBringPage(1);$('#bring-dialog').showModal();
  });
  $('#close-bring').addEventListener('click',()=>$('#bring-dialog').close());
  $('#bring-dialog').addEventListener('close',()=>{if(opener?.isConnected)opener.focus();});
  $('#bring-next').addEventListener('click',()=>{showBringPage(2);$('#bring-folder').focus();});
  $('#bring-skip').addEventListener('click',()=>{$('#bring-standard').checked=false;showBringPage(2);$('#bring-folder').focus();});
  $('#bring-back').addEventListener('click',()=>{showBringPage(1);$('#bring-standard').focus();});
  $('#bring-folder').addEventListener('change',()=>{$('#new-folder-field').hidden=$('#bring-folder').value!=='new';updateSummary();});
  $('#new-folder').addEventListener('input',updateSummary);
  $('#bring-save').addEventListener('click',()=>{
    const folder=$('#bring-folder').value==='new'?$('#new-folder').value.trim():$('#bring-folder').value;
    if(!folder){$('#bring-status').textContent='새 폴더 이름을 입력하세요. 선택은 유지됩니다.';$('#new-folder').focus();return;}
    if(!saved.some(r=>r.id===current.id&&r.folder===folder)) saved.push({...current,folder,standard:$('#bring-standard').checked});
    $('#library-count').textContent=String(new Set(saved.map(r=>r.id)).size);
    $('#library-folder').textContent=[...new Set(saved.map(r=>r.folder))].join(' / ');
    $('#library-items').innerHTML=saved.map(r=>`<article class="library-item"><b>${escape(r.title)}</b><p>폴더: ${escape(r.folder)} · 교육과정 ${r.standard?'예시 1개':'미선택'}</p><p>메모·구간은 실제 제품에서 위치별로 보존됩니다.</p></article>`).join('');
    $('#bring-dialog').close();toast(`시안: 「${folder}」에 가져왔어요. 실제 저장은 하지 않았습니다.`);
  });
  document.querySelectorAll('[data-compare]').forEach(b=>b.addEventListener('click',()=>$('#compare-feedback').textContent=`${b.dataset.compare}안 버튼을 선택했습니다. 실제 가져가기 동작은 아래 웹 시안에서 확인하세요.`));
  document.querySelectorAll('[data-component]').forEach(b=>b.addEventListener('click',()=>$('#component-status').textContent='기본·hover·focus·pressed 상태를 확인하는 스타일 예시입니다.'));
  $('[data-toggle]').addEventListener('click',e=>e.currentTarget.setAttribute('aria-pressed',String(e.currentTarget.getAttribute('aria-pressed')!=='true')));
  function connection() { $('#ext-connection').textContent=connected?'연결됨 · 예시 수업 폴더':'연결 필요 · 가져가기를 위해 Curi를 다시 연결하세요.';$('#ext-connect').hidden=connected;$('#ext-save').disabled=!connected||busy; }
  $('#toggle-connection').addEventListener('click',()=>{if(busy)return;connected=!connected;connection();});
  $('#ext-connect').addEventListener('click',()=>{connected=true;connection();});
  $('#simulate-failure').addEventListener('click',()=>{failNext=true;toast('확장의 다음 가져가기는 실패 예시를 보여줍니다.');});
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;$('#ext-segment').hidden=mode!=='segment';document.querySelectorAll('[data-mode]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));$('#ext-save').textContent=mode==='whole'?'영상 가져가기 ↗':'영상과 구간 가져가기 ↗';}));
  $('#ext-time').addEventListener('click',()=>{$('#ext-start').value='01:20';$('#ext-result').textContent='시안 현재 시간 01:20을 시작에 넣었습니다.';});
  const seconds=value=>{if(!/^\d{1,2}:[0-5]\d$/.test(value.trim()))return NaN;const [m,s]=value.trim().split(':').map(Number);return m*60+s;};
  $('#ext-save').addEventListener('click',()=>{
    if(busy||!connected)return;
    const result=$('#ext-result');result.classList.remove('error');
    if(mode==='segment'&&(!$('#ext-name').value.trim()||!Number.isFinite(seconds($('#ext-start').value))||!Number.isFinite(seconds($('#ext-end').value))||seconds($('#ext-end').value)<=seconds($('#ext-start').value)||seconds($('#ext-end').value)>510)){result.classList.add('error');result.textContent='구간 이름과 분:초를 입력하고 시작 < 끝 ≤ 08:30으로 설정하세요.';return;}
    busy=true;connection();$('#ext-save').textContent='가져오는 중…';result.textContent='저장 결과를 확인하는 시뮬레이션입니다.';
    const controls=[...document.querySelectorAll('.extension-body input,.extension-body select,.extension-body button')];controls.forEach(e=>e.disabled=true);
    setTimeout(()=>{busy=false;controls.forEach(e=>e.disabled=false);connection();$('#ext-save').textContent=mode==='whole'?'영상 가져가기 ↗':'영상과 구간 가져가기 ↗';if(failNext){failNext=false;result.classList.add('error');result.textContent='저장 실패 예시 · 입력은 유지했습니다. 다시 가져가기를 눌러보세요.';}else result.textContent=`시안 완료 · 「${$('#ext-folder').value}」에 ${mode==='whole'?'영상 1개':'영상 1개·구간 1개'}를 가져왔어요. 실제 저장은 하지 않았습니다.`;},650);
  });
  render();connection();
})();
