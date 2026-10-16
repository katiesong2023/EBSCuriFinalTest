(() => {
  "use strict";
  const $ = selector => document.querySelector(selector), core = CuriSegmentCore;
  let source = null, workspace = null, busy = false, draft = {id:crypto.randomUUID()}, capture = 'MANUAL', folderRead = 0, sourceNeedsRefresh = false, importMode = 'whole';
  let clipTargets = new Map(), launchTab = null, initialized = false;
  const appliedClipTabs = new Set();
  let resumeTarget = null, resumeChecking = false;
  let connectionState = 'connecting', connectionErrorText = '';
  function connection(state) { connectionState = state; globalThis.CuriPanel?.connection?.(state); controls(); }
  const status = text => { $('#status').textContent = text; globalThis.CuriPanel?.status(text,workspace); };
  const send = async message => {
    const checksConnection = ['CONFIGURE','WORKSPACE'].includes(message.type);
    if (message.type === 'CONFIGURE' || (checksConnection && connectionState !== 'connected')) connection('connecting');
    try {
      const result = await chrome.runtime.sendMessage({...message,tabId:message.tabId ?? Number($('#video-tab').value)});
      if (!result || result.error) throw new Error(result?.error || 'Curi 응답을 확인하지 못했습니다. 입력은 유지됩니다.');
      if (checksConnection) {
        connection('connected');
        if (connectionErrorText && $('#status').textContent === connectionErrorText) status('');
        connectionErrorText = '';
      }
      return result.value;
    } catch (error) {
      if (checksConnection) { connectionErrorText = error.message; connection('failed'); }
      throw error;
    }
  };
  function controls() {
    $('#create-folder').disabled = busy || !workspace || connectionState !== 'connected';
    $('#folder').disabled = $('#video-tab').disabled = $('#refresh-source').disabled = busy;
    for(const selector of ['#name','#start','#end','#note','#new-folder-title','#new','#connect','#close-folder-form','#retry-playback']) $(selector).disabled=busy;
    const folder = workspace?.folders.some(f=>f.id === $('#folder').value);
    $('#save').disabled = busy || !folder || !source || connectionState !== 'connected';
    $('#whole-mode').disabled = $('#segment-mode').disabled = busy;
    $('#set-start').disabled = $('#set-end').disabled = busy || !$('#video-tab').value;
    globalThis.CuriPanel?.render({source,workspace,busy,importMode});
  }
  function applyWorkspace(value, selected = $('#folder').value) {
    workspace = value;
    $('#folder').replaceChildren(...value.folders.map(folder => {
      const option = document.createElement('option'); option.value = folder.id; option.textContent = `${folder.title} · ${folder.count}개 자료`; return option;
    }));
    if (value.folders.some(f=>f.id===selected)) $('#folder').value = selected;
    controls();
  }
  async function refreshWorkspace() {
    const number = ++folderRead, value = await send({type:'WORKSPACE'});
    if (number !== folderRead || busy) return;
    applyWorkspace(value, $('#folder').value || draft.folder);
  }
  async function persist() {
    draft = {...draft,folder:$('#folder').value,newFolderTitle:$('#new-folder-title').value,name:$('#name').value,start:$('#start').value,end:$('#end').value,note:$('#note').value,capture,importMode};
    const identity = source?.identity || resumeTarget?.identity;
    await chrome.storage.local.set({folderPreferences:{folder:draft.folder,newFolderTitle:draft.newFolderTitle},...(identity ? {['draft:'+identity]:draft} : {}),clipResume:resumeTarget});
  }
  function playbackHelp(waiting, message = '') {
    $('#playback-help').hidden = !waiting || !resumeTarget;
    if (resumeTarget) {
      resumeTarget.waiting = waiting;
    }
    $('#playback-help-status').textContent = message || '‘EBS 로그인’ 후 ‘영상으로 돌아가기’를 눌러 본편을 재생하세요. 재생이 확인되면 자동으로 이어갑니다. 폴더와 입력 내용은 유지됩니다.';
  }
  function restoreDraftFields() {
    for (const key of ['name','start','end','note']) {
      let value = draft[key] || '';
      if (value && ['start','end'].includes(key)) { try { value=core.time(core.boundary(value,key)); } catch { /* 미완성 입력은 보존한다. */ } }
      $('#'+key).value=value;
    }
    capture=draft.capture || 'MANUAL';
    setImportMode(draft.importMode === 'segment' ? 'segment' : 'whole');
  }
  async function sourceTabs(preferredTab) {
    const tabs = await send({type:'VIDEOS'}), previous = $('#video-tab').value;
    clipTargets = new Map(tabs.filter(tab => typeof tab.clipFolderId === 'string').map(tab => [String(tab.id), tab.clipFolderId]));
    $('#video-tab').hidden = tabs.length <= 1;
    $('#video-tab').replaceChildren(...tabs.map(tab => {
      const option = document.createElement('option'); option.value=tab.id; option.textContent=tab.title || tab.sourceUrl; return option;
    }));
    const selected=tabs.find(t=>t.id===preferredTab) || tabs.find(t=>t.active && clipTargets.has(String(t.id))) || (resumeTarget?.waiting ? tabs.find(t=>core.sameSource(t.sourceUrl,resumeTarget.sourceUrl)) : tabs.find(t=>String(t.id)===previous) || tabs.find(t=>t.active));
    if (selected) $('#video-tab').value=String(selected.id);
    else if (resumeTarget?.waiting) $('#video-tab').value='';
    return tabs;
  }
  async function loadSource(expectedSourceUrl) {
    sourceNeedsRefresh = false;
    source = null; controls();
    if (!$('#video-tab').value) { $('#video').textContent='EBS 공개 프로그램·영상 페이지를 열면 여기에 표시됩니다. 폴더는 지금 만들 수 있습니다.'; return; }
    try {
      source = await send({type:'METADATA'});
      if (expectedSourceUrl && !core.sameSource(source.sourceUrl,expectedSourceUrl)) throw new Error('회차가 바뀌었습니다. 원래 EBS 영상을 열어 다시 확인해 주세요.');
      const resuming = resumeTarget?.waiting && core.sameSource(resumeTarget.sourceUrl,source.sourceUrl);
      resumeTarget = source.kind === 'episode' ? {identity:source.identity,sourceUrl:source.sourceUrl,title:source.title,tabId:Number($('#video-tab').value),waiting:false} : null;
      playbackHelp(false);
      draft = (await chrome.storage.local.get('draft:'+source.identity))['draft:'+source.identity] || {id:crypto.randomUUID()};
      const preferences=(await chrome.storage.local.get('folderPreferences')).folderPreferences || {};
      draft.folder ||= preferences.folder;
      const tabId = $('#video-tab').value;
      const matchingFolders = (workspace?.folders || []).filter(folder => (folder.sourceUrls || []).some(url => core.sameSource(url, source.sourceUrl)));
      if (matchingFolders.length && !(resuming && workspace.folders.some(folder=>folder.id===draft.folder))) {
        const preferred = [clipTargets.get(tabId), draft.folder, workspace.selectedFolderId];
        draft.folder = preferred.find(id => matchingFolders.some(folder => folder.id === id)) || matchingFolders[0].id;
      }
      if (clipTargets.has(tabId) && !appliedClipTabs.has(tabId)) {
        draft.importMode = 'segment';
        if (!resuming && clipTargets.get(tabId) && (!matchingFolders.length || matchingFolders.some(folder => folder.id === clipTargets.get(tabId)))) draft.folder = clipTargets.get(tabId);
        appliedClipTabs.add(tabId);
      }
      restoreDraftFields();
      if (!$('#new-folder-title').value) $('#new-folder-title').value=draft.newFolderTitle || preferences.newFolderTitle || '';
      if (workspace) applyWorkspace(workspace,draft.folder || $('#folder').value);
      const videoLabel = [source.program, source.title].filter(Boolean).join(' · ');
      const selectedOption = Array.from($('#video-tab').options).find(option => String(option.value) === $('#video-tab').value);
      if (selectedOption) selectedOption.textContent = videoLabel;
      $('#video-tab').title = videoLabel;
      $('#video').textContent = [source.program, source.title].filter(Boolean).join('\n');
      $('#player-status').textContent='시간을 직접 입력하거나 영상의 현재 시간을 가져오세요.';
      if (source.kind==='episode') {
        try { const player=await send({type:'INSPECT'}); source.currentTime=player.time; if(!draft.start)$('#start').value=core.time(core.boundary(player.time)); $('#player-status').textContent=`현재 ${core.time(Math.floor(player.time))} · 전체 ${core.time(Math.ceil(player.duration))} · 자동 시간 지정 가능`; }
        catch { $('#player-status').textContent='본편 재생을 확인하지 못했습니다. 로그인·광고 종료·본편 재생을 확인한 뒤 다시 확인해 주세요.'; playbackHelp(true); }
      } else $('#player-status').textContent='프로그램 페이지에서는 자료를 담거나 폴더를 만드세요. 실제 회차를 열면 구간을 설정할 수 있습니다.';
      await persist();
    } catch (error) { source=null; $('#video').textContent=error.message; }
    if (sourceNeedsRefresh) invalidateSource();
    controls();
  }
  async function operation(action, feedback) {
    if (busy) return;
    busy=true; folderRead++; controls();
    try { await action(); } catch(error) { status(error.message); if (feedback) $(feedback).textContent = error.message; }
    finally { busy=false; if (sourceNeedsRefresh) invalidateSource(); controls(); void launchClip(); }
  }
  async function launchClip() {
    if (!initialized || busy || launchTab === null) return;
    const tab = launchTab; launchTab = null;
    await operation(async () => { applyWorkspace(await send({type:'WORKSPACE'})); await sourceTabs(tab); await loadSource(); });
  }
  chrome.runtime.onMessage?.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message?.type === 'CLIP_READY') { launchTab = message.tabId; void launchClip(); }
  });
  $('#folder-form').addEventListener('submit',event=>{
    event.preventDefault(); void operation(async()=>{
      const title=$('#new-folder-title').value.trim(); if(!title) throw new Error('새 폴더 이름을 입력하세요.');
      if(draft.folderTitle!==title) {draft.folderTitle=title;draft.newFolderId=crypto.randomUUID();}
      await persist(); status('내 수업에 새 폴더를 만드는 중입니다…');
      const result=await send({type:'CREATE_FOLDER',value:{id:draft.newFolderId,title,libraryRevision:workspace.libraryRevision}});
      if(!result.created) throw new Error('폴더 생성 완료를 확인하지 못했습니다.');
      applyWorkspace(result,result.folderId); draft.folder=result.folderId;
      $('#new-folder-title').value=''; delete draft.newFolderId; await persist();
      $('#folder-form').hidden = true;
      const addFolder = document.querySelector('[data-new-folder]');
      addFolder?.setAttribute('aria-expanded', 'false');
      addFolder?.focus();
      status(`‘${result.folderTitle}’ 폴더를 내 수업 자료에 만들었습니다. 이제 자료를 담거나 구간을 저장하세요.`);
    }).then(() => { if ($('#folder-form').hidden) document.querySelector('[data-new-folder]')?.focus(); });
  });
  $('#panel-confirm-delete-folder').addEventListener('click', () => {
    void operation(async () => {
      const dialog = $('#panel-delete-folder-dialog'), folderId = dialog.dataset.folderId;
      const confirm = $('#panel-confirm-delete-folder');
      confirm.disabled = true;
      $('#panel-delete-folder-error').textContent = '';
      try {
        const result = await send({type:'DELETE_FOLDER', value:{folderId,libraryRevision:workspace.libraryRevision}});
        if (!result.deleted) throw new Error('폴더 삭제 완료를 확인하지 못했습니다.');
        applyWorkspace(result, $('#folder').value === folderId ? result.selectedFolderId : $('#folder').value);
        if (draft.folder === folderId) { draft.folder = $('#folder').value; delete draft.registrationFolder; delete draft.registrationId; }
        await persist(); dialog.close(); status('수업 폴더를 삭제했습니다.');
      } catch (error) { $('#panel-delete-folder-error').textContent = error.message; }
      finally { confirm.disabled = false; }
    }).then(() => {
      if (!$('#panel-delete-folder-dialog').open) {
        const selectedFolder = [...document.querySelectorAll('[data-panel-folder]')].find(button => button.dataset.panelFolder === $('#folder').value);
        (selectedFolder || document.querySelector('[data-new-folder]'))?.focus();
      }
    });
  });
  async function save(withSegment) {
    if (busy) return;
    const feedback = '#save-feedback', button = $('#save');
    await operation(async()=>{
      if(!source || !$('#folder').value) throw new Error('EBS 페이지와 수업 폴더를 선택하세요.');
      if(withSegment && source.kind==='collection') throw new Error('현재 페이지는 프로그램 목록입니다. 실제 영상 회차를 열고 구간을 설정하세요.');
      if(withSegment) for(const [key,label] of [['name','구간 이름'],['start','시작 시간'],['end','끝 시간']]) if(!$('#'+key).value.trim()) throw new Error(`${label}을 입력하세요. 영상 전체를 가져가려면 ‘영상 전체’ 탭을 선택하세요.`);
      await persist();
      if(draft.registrationFolder!==$('#folder').value || !draft.registrationId || !draft.registrationPending) {draft.registrationFolder=$('#folder').value;draft.registrationId=crypto.randomUUID();}
      draft.registrationPending = true;
      await persist();
      const segment=withSegment ? core.validate({...draft,id:draft.registrationId,resourceId:'pending',folderId:$('#folder').value,sourceUrl:source.sourceUrl,duration:source.duration,variant:source.kind==='collection'?'PROGRAM':'EPISODE',capture}) : null;
      if (segment) { $('#start').value=core.time(segment.start); $('#end').value=core.time(segment.end); await persist(); }
      button.textContent = '가져오는 중…';
      $(feedback).textContent = '저장 결과를 확인하는 중입니다…';
      status(withSegment?'영상과 구간 클립 카드를 Curi에 저장하는 중입니다…':'자료를 내 수업과 CuriBase에 저장하는 중입니다…');
      const result=await send({type:'REGISTER',expectedIdentity:source.identity,value:{folderId:$('#folder').value,libraryRevision:workspace.libraryRevision,revision:workspace.revision,segment,...(!withSegment ? {wholeVideo:{id:draft.registrationId,name:$('#name').value.trim() || source.title.slice(0,200),note:$('#note').value}} : {})}});
      if(!result.saved || !result.curibaseStored) throw new Error('내 수업/CuriBase 저장 완료를 확인하지 못했습니다.');
      delete draft.registrationId; delete draft.registrationFolder; delete draft.registrationPending;
      applyWorkspace(result,result.folderId); await persist();
      const notice = `‘${result.folderTitle}’에 ${result.segmentId || withSegment?'영상과 구간 클립 카드':'자료'}을 저장했습니다. 내 수업 자료에 반영되었고 CuriBase 검색에서 재사용할 수 있습니다.`;
      status(notice); $(feedback).textContent = notice;
      globalThis.CuriPanel?.saved(result,Boolean(result.segmentId) || withSegment);
    }, feedback);
    button.textContent = withSegment ? '영상과 구간 가져가기' : '영상 전체 가져가기';
    globalThis.CuriPanel?.render({source,workspace,busy,importMode});
  }
  function setImportMode(mode) {
    importMode = mode;
    $('#new').hidden = mode !== 'segment';
    for (const value of ['whole','segment']) {
      const selected = value === mode, tab = $('#'+value+'-mode');
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $('#'+value+'-panel').hidden = !selected;
    }
    controls();
    $('#save').textContent = mode === 'segment' ? '영상과 구간 가져가기' : '영상 전체 가져가기';
    globalThis.CuriPanel?.render({source,workspace,busy,importMode});
  }
  for (const mode of ['whole','segment']) {
    const tab = $('#'+mode+'-mode');
    tab.addEventListener('click',()=>{if(busy)return;setImportMode(mode);persist().catch(error=>status(error.message));});
    tab.addEventListener('keydown',event=>{
      if(busy || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'whole' : event.key === 'End' ? 'segment' : importMode === 'whole' ? 'segment' : 'whole';
      $('#'+next+'-mode').focus();setImportMode(next);persist().catch(error=>status(error.message));
    });
  }
  $('#save-form').addEventListener('submit',event=>{event.preventDefault();void save(importMode === 'segment');});
  for(const [button,field] of [['set-start','start'],['set-end','end']]) $('#'+button).addEventListener('click',()=>operation(async()=>{
    // 영상 정보 읽기가 늦거나 탭이 이동했어도 명시적 시간 지정 클릭으로 다시 확인한다.
    if (!source || sourceNeedsRefresh) await loadSource();
    if (!source) throw new Error($('#video').textContent || '저장할 영상을 다시 선택해 주세요.');
    const expected=source, tab=$('#video-tab').value;
    const player=await send({type:field==='start'?'SET_START':'SET_END',expectedIdentity:source.identity,expectedSourceUrl:source.sourceUrl});
    if (sourceNeedsRefresh || source!==expected || $('#video-tab').value!==tab || (player.identity!==expected.identity && !core.sameSource(player.sourceUrl,expected.sourceUrl))) throw new Error('회차가 바뀌었습니다. 저장할 EBS 페이지를 다시 선택하세요.');
    if (!Number.isFinite(player.time) || player.time<0) throw new Error('현재 재생 시간을 읽지 못했습니다. EBS 본편을 재생한 뒤 다시 지정해 주세요.');
    const time=core.boundary(player.time,field);
    $('#'+field).value=core.time(time); source.duration=player.duration; source.currentTime=player.currentTime ?? player.time; capture='PLAYER';
    playbackHelp(false);
    $('#player-status').textContent=`${field==='start'?'시작':'끝'} ${core.time(time)} 지정 · 전체 ${core.time(Math.ceil(player.duration))}`;
    await persist(); globalThis.CuriPanel?.render({source,workspace,busy,importMode});status('현재 영상의 시간을 지정했습니다.');
  }, '#player-status'));
  for (const field of ['start','end']) $('#'+field).addEventListener('change', () => {
    if (!$('#'+field).value.trim()) return;
    try { $('#'+field).value=core.time(core.boundary($('#'+field).value,field)); capture='MANUAL'; globalThis.CuriPanel?.render({source,workspace,busy,importMode});persist().catch(error=>status(error.message)); }
    catch(error) { $('#player-status').textContent=error.message; }
  });
  $('#video-tab').addEventListener('change',()=>operation(async()=>{ await persist(); await loadSource(); }));
  $('#refresh-source').addEventListener('click',()=>operation(async()=>{
    await persist(); await sourceTabs(); await loadSource();
    if (!sourceNeedsRefresh) status('영상 목록을 새로 불러왔습니다. 선택한 영상과 저장 위치를 확인하세요.');
  }));
  async function checkResumePlayback() {
    if (busy || resumeChecking || !resumeTarget?.waiting) return;
    resumeChecking = true;
    const target = resumeTarget;
    try {
      const tabs = await send({type:'VIDEOS'});
      const matching = tabs.filter(tab=>core.sameSource(tab.sourceUrl,target.sourceUrl));
      const tab = matching.find(tab=>tab.id===target.tabId) || matching.find(tab=>tab.active) || matching[0];
      if (!tab) return;
      const player = await send({type:'INSPECT',tabId:tab.id});
      if (!Number.isFinite(player.time) || !Number.isFinite(player.duration) || player.duration <= 0 || (player.identity!==target.identity && !core.sameSource(player.sourceUrl,target.sourceUrl))) return;
      // 대기 중 다른 영상을 선택했다면 이전 응답을 사용하지 않는다.
      if (busy || resumeTarget !== target || !target.waiting) return;
      await operation(async()=>{
        await persist();
        await sourceTabs(tab.id);
        await loadSource(target.sourceUrl);
        if (source && !sourceNeedsRefresh && $('#playback-help').hidden) status('본편을 확인했습니다. 폴더와 입력 내용을 이어서 구간을 지정하세요.');
      });
    } catch { /* 본편이 준비될 때까지 입력을 유지하고 대기한다. */ }
    finally { resumeChecking = false; }
  }
  $('#retry-playback').addEventListener('click',()=>operation(async()=>{
    if (!resumeTarget) return;
    await persist();
    const target = resumeTarget;
    const tabs = await sourceTabs();
    const matching = tabs.filter(tab=>core.sameSource(tab.sourceUrl,target.sourceUrl));
    const tab = matching.find(tab=>tab.id===target.tabId) || matching.find(tab=>tab.active) || matching[0];
    if (tab) { $('#video-tab').value=String(tab.id); await loadSource(target.sourceUrl); }
    const waiting = !tab || !source || sourceNeedsRefresh || !$('#playback-help').hidden;
    const opened = await send({type:'RESUME_CLIP',sourceUrl:target.sourceUrl,preferredTabId:tab?.id,reload:waiting});
    if (resumeTarget) resumeTarget.tabId = opened.tabId;
    if (waiting) {
      source=null;
      playbackHelp(true,'원래 EBS 영상을 열었습니다. 로그인 후 본편을 재생하면 자동으로 이어갑니다. 폴더와 입력 내용은 유지됩니다.');
    } else status('본편을 확인했습니다. 폴더와 입력 내용을 이어서 구간을 지정하세요.');
    await persist();
  }));
  function invalidateSource() {
    sourceNeedsRefresh = true;
    if (resumeTarget) playbackHelp(true, source ? '' : $('#playback-help-status').textContent);
    source = null;
    $('#video').textContent = '선택한 페이지가 이동하거나 닫혔습니다. 영상 목록을 새로고침해 저장 대상을 다시 확인하세요. 입력은 보존됩니다.';
    $('#player-status').textContent = '페이지를 다시 확인하기 전에는 이전 영상의 시간을 사용하지 않습니다.';
    controls();
    void persist().catch(error=>status(error.message));
  }
  function sourceTabChanged(tabId) {
    if (String(tabId) !== $('#video-tab').value) return;
    sourceNeedsRefresh = true;
    if (!busy) { void persist().catch(error=>status(error.message)); invalidateSource(); }
  }
  // 열린 패널은 탭 이동 후에도 남으므로 이전 영상의 저장 동작을 잠근다.
  chrome.tabs?.onUpdated?.addListener((tabId, change) => {
    if (change.url || change.status === 'loading') sourceTabChanged(tabId);
  });
  chrome.tabs?.onRemoved?.addListener(tabId => {
    sourceTabChanged(tabId);
    if (String(tabId) === $('#video-tab').value) { $('#video-tab').value=''; controls(); }
  });
  $('#folder').addEventListener('change',()=>{controls();persist().catch(e=>status(e.message));});
  $('#new-folder-title').addEventListener('input',()=>persist().catch(e=>status(e.message)));
  $('#save-form').addEventListener('input',event=>{if(['start','end'].includes(event.target.id))capture='MANUAL';globalThis.CuriPanel?.render({source,workspace,busy,importMode});persist().catch(e=>status(e.message));});
  $('#new').addEventListener('click',()=>{if(busy)return;draft={id:crypto.randomUUID(),folder:$('#folder').value};capture='MANUAL';$('#save-form').reset();$('#player-status').textContent='시간을 직접 입력하거나 영상의 현재 시간을 가져오세요.';controls();$('#name').focus();persist().catch(e=>status(e.message));status('새 구간을 지정하세요.');});
  $('#connect').addEventListener('click',()=>operation(async()=>{
    await send({type:'CONFIGURE',origin:$('#origin').value}); const value=await send({type:'WORKSPACE'});applyWorkspace(value);await sourceTabs();await loadSource();status('Curi 연결 완료 · 수업 폴더를 불러왔습니다.');
  }));
  (async()=>{
    $('#origin').value=(await chrome.storage.local.get('curiOrigin')).curiOrigin || 'http://localhost:3000';
    const savedResume = (await chrome.storage.local.get('clipResume')).clipResume;
    if (savedResume?.waiting && core.publicUrl(savedResume.sourceUrl) && savedResume.identity === core.identity(savedResume.sourceUrl)) {
      resumeTarget = savedResume;
      draft = (await chrome.storage.local.get('draft:'+resumeTarget.identity))['draft:'+resumeTarget.identity] || {id:crypto.randomUUID()};
      restoreDraftFields();
      if (!$('#new-folder-title').value) $('#new-folder-title').value=draft.newFolderTitle || '';
      playbackHelp(true);
    }
    let connectionError = '';
    try { await refreshWorkspace(); } catch (error) { connectionError = error.message; }
    // Curi 연결이 지연돼도 EBS 시간 읽기/구간 초안은 사용할 수 있게 한다.
    await sourceTabs(); await loadSource();
    const receipt=workspace?.lastSave || (await chrome.storage.local.get('lastSave')).lastSave;
    status((connectionState === 'failed' ? connectionError : '') || (receipt && (!receipt.identity || receipt.identity===source?.identity) ? `마지막 저장 결과: ${receipt.notice}` : ''));
  })().catch(error=>status(error.message)).finally(() => { initialized = true; void launchClip(); });
  const refresh=setInterval(()=>{if(!busy){refreshWorkspace().catch(error=>status(error.message));void checkResumePlayback();}},3000);
  window.addEventListener('pagehide',()=>clearInterval(refresh));
})();
