(() => {
  'use strict';
  const $=s=>document.querySelector(s),core=CuriSegmentCore;
  let current={},folderSignature='',videoSignature='',timer;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function preview() {
    const {source,workspace,importMode}=current,folder=workspace?.folders.find(f=>f.id===$('#folder').value);
    const number=`${Math.max(1,workspace?.folders.findIndex(f=>f.id===folder?.id)+1 || 1)}.${(folder?.sceneCount||0)+1}`;
    $('#scene-preview').innerHTML=`<div class="small-poster"><span class="scene-tab">${number}</span>${source?.thumbnail?`<img src="${escape(source.thumbnail)}" alt="${escape(source.program)} · ${escape(source.title)}">`:''}<span>${escape(source?.program || 'EBS')}</span></div><div><strong>${escape(folder?.title || '폴더 선택')} ${number}</strong><p>${importMode==='whole'?'영상 전체':`${escape($('#start').value || '시작 미지정')}–${escape($('#end').value || '끝 미지정')}`}</p><small>${escape($('#name').value || source?.title || '영상과 폴더를 선택해 주세요.')}</small></div>`;
    $('#save').textContent=current.busy?'저장 중…':folder?`${folder.title}에 저장`:'폴더를 선택해 저장';
  }
  function renderFolders() {
    const {workspace,busy}=current,filter=$('#folder-search').value.trim().toLocaleLowerCase();
    $('#folder-search-label').hidden=(workspace?.folders.length||0)<6;
    let folders=workspace?.folders || [];
    if(filter)folders=folders.filter(f=>f.title.toLocaleLowerCase().includes(filter));
    else if(folders.length>5){const selected=folders.find(f=>f.id===$('#folder').value);folders=selected?[selected,...folders.filter(f=>f!==selected).slice(-2).reverse()]:folders.slice(-3).reverse();}
    const signature=JSON.stringify([Boolean(workspace),folders,$('#folder').value,busy]);
    if(signature===folderSignature)return;folderSignature=signature;
    $('#folder-cards').innerHTML=folders.map(f=>`<div class="mini-folder-item"><button class="mini-folder" style="--folder-label:var(--curi-${['coral','sun','lilac','mint'].includes(f.labelColor)?f.labelColor:'folder'})" type="button" data-panel-folder="${escape(f.id)}" aria-pressed="${f.id===$('#folder').value}" ${busy?'disabled':''}><strong>${escape(f.title)}</strong><small>${f.count}개 자료</small></button><button type="button" class="panel-folder-delete" data-panel-delete="${escape(f.id)}" aria-label="${escape(f.title)} 폴더 삭제" title="폴더 삭제" ${busy?'disabled':''}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>`).join('')+`<button type="button" class="mini-folder new-folder-trigger" data-new-folder aria-controls="folder-form" aria-expanded="${!$('#folder-form').hidden}" ${busy||!workspace?'disabled':''}><strong><span aria-hidden="true">+</span> 새폴더 만들기</strong></button>`+(filter&&!folders.length?'<p class="folder-search-empty help">일치하는 폴더가 없어요.</p>':'');
  }
  function render(state) {
    current=state;document.body.classList.toggle('is-busy',state.busy || !state.workspace);
    renderFolders();preview();
    const tabs=Array.from($('#video-tab').options),sig=JSON.stringify([tabs.map(o=>[o.value,o.textContent]),$('#video-tab').value,state.source?.identity,state.source?.thumbnail,state.source?.currentTime,state.busy]);
    if(sig!==videoSignature){videoSignature=sig;
      $('#video-cards').innerHTML=tabs.map(o=>`<button type="button" class="video-choice" data-video-choice="${escape(o.value)}" aria-pressed="${o.value===$('#video-tab').value}" ${state.busy?'disabled':''}><span class="video-thumb">${o.value===$('#video-tab').value&&state.source?.thumbnail?`<img src="${escape(state.source.thumbnail)}" alt="${escape(state.source.program)} · ${escape(state.source.title)}">`:'<span>EBS</span>'}${o.value===$('#video-tab').value&&Number.isFinite(state.source?.currentTime)?`<small class="play-position">${core.time(Math.floor(state.source.currentTime))}</small>`:''}</span><span>${escape(o.value===$('#video-tab').value&&state.source?[state.source.program,state.source.title].filter(Boolean).join(' · '):o.textContent)}</span></button>`).join('');
      $('#video-cards').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{$('#video-tab').value=button.dataset.videoChoice;$('#video-tab').dispatchEvent(new Event('change'));}));
    }
    $('#video').hidden=Boolean(state.source);
  }
  function notify(message,undo) {
    clearTimeout(timer);const toast=$('#panel-toast');toast.replaceChildren(document.createTextNode(message));toast.hidden=false;
    if(undo){const button=document.createElement('button');button.type='button';button.textContent='되돌리기';button.addEventListener('click',()=>{button.disabled=true;undo().catch(error=>{notify(error.message);});});toast.append(button);}
    const hide=()=>{if(toast.contains(document.activeElement)||toast.matches(':hover'))timer=setTimeout(hide,1000);else toast.hidden=true;};timer=setTimeout(hide,4000);
  }
  function connection(state) {
    $('#connection-state').dataset.state = state;
    $('#connection-state').textContent = { connected:'● 연결됨', connecting:'● 연결 중', failed:'● 연결 실패' }[state];
  }
  function status(text) {
    // 진행·오류는 고정 영역에 남기고, 완료는 토스트로 알린다.
    const success=/저장했습니다|생성했습니다|만들었습니다|연결 완료/.test(text);
    $('#status').hidden=success || !text;
    if(success)notify(text);
  }
  async function saved(result,withSegment) {
    const folder=current.workspace?.folders.find(f=>f.id===result.folderId);
    const number=`${Math.max(1,current.workspace?.folders.findIndex(f=>f.id===result.folderId)+1||1)}.${folder?.sceneCount || folder?.count || 1}`;
    notify(`${result.folderTitle} ${withSegment?number:'영상 전체'}로 담았어요.`,result.undoToken?async()=>{
      const response=await chrome.runtime.sendMessage({type:'UNDO_REGISTER',undoToken:result.undoToken});
      if(!response?.value?.undone)throw new Error(response?.error || '되돌리기 응답을 확인하지 못했어요. 다시 시도해 주세요.');
      if(response.value.folders){current.workspace={...current.workspace,...response.value};render(current);}
      notify('담기를 되돌렸어요.');$('#save-feedback').textContent='담기를 되돌렸어요.';
    }:null);
    const target=$(`#folder-cards [data-panel-folder="${CSS.escape(result.folderId)}"]`);
    if(target&&!matchMedia('(prefers-reduced-motion: reduce)').matches){target.animate([{transform:'translateY(0)'},{transform:'translateY(-5px)'},{transform:'translateY(0)'}],{duration:400,easing:'cubic-bezier(.2,.8,.2,1)'});}
    $('#save-feedback').hidden=true;
  }
  $('#folder-search').addEventListener('input',renderFolders);
  $('#folder-cards').addEventListener('click', event => {
    const button = event.target.closest('[data-panel-folder],[data-new-folder],[data-panel-delete]');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-new-folder')) {
      $('#folder-form').hidden = !$('#folder-form').hidden;
      button.setAttribute('aria-expanded', String(!$('#folder-form').hidden));
      if (!$('#folder-form').hidden) $('#new-folder-title').focus();
    } else if (button.hasAttribute('data-panel-delete')) {
      const folder = current.workspace?.folders.find(value => value.id === button.dataset.panelDelete);
      if (!folder) return;
      const dialog = $('#panel-delete-folder-dialog');
      dialog.dataset.folderId = folder.id;
      $('#panel-delete-folder-name').textContent = `‘${folder.title}’ · ${folder.count}개 자료`;
      $('#panel-delete-folder-error').textContent = '';
      dialog.showModal(); $('#panel-cancel-delete-folder').focus();
    } else { $('#folder').value=button.dataset.panelFolder;$('#folder').dispatchEvent(new Event('change')); }
  });
  $('#close-folder-form').addEventListener('click', () => {
    if (current.busy) return;
    $('#folder-form').hidden = true;
    const trigger = $('#folder-cards [data-new-folder]');
    trigger?.setAttribute('aria-expanded', 'false'); trigger?.focus();
  });
  $('#panel-cancel-delete-folder').addEventListener('click', () => $('#panel-delete-folder-dialog').close());
  $('#panel-delete-folder-dialog').addEventListener('close', () => {
    const id = $('#panel-delete-folder-dialog').dataset.folderId;
    ($('#folder-cards').querySelector(`[data-panel-delete="${CSS.escape(id)}"]`) || $('#folder-cards [data-new-folder]'))?.focus();
  });
  $('#toggle-connection').addEventListener('click', () => {
    const panel = $('#panel-connection');
    panel.hidden = !panel.hidden;
    $('#toggle-connection').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) $('#origin').focus();
  });
  document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)event.target.hidden=true;},true);
  globalThis.CuriPanel={render,status,saved,connection};
})();
