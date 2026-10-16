(() => {
  'use strict';
  const folderKey = 'curi.teacher.folders.v1', shelfKey = 'curi.discovery.shelf.v1';
  const { escape } = CuriTeacher;
  const snapshot = () => [folderKey, shelfKey, CuriSegments.key].map(key => localStorage.getItem(key));
  function apply(state, ownerId, resourceId, targetId, expected = snapshot()) {
    if (targetId !== null && (typeof targetId !== 'string' || !targetId)) throw new Error('옮길 폴더를 선택해 주세요.');
    if (state.dirty) throw new Error('저장하지 못한 편집 내용이 있습니다. 먼저 저장해 주세요.');
    if (snapshot().some((raw, index) => raw !== expected[index]) || localStorage.getItem(shelfKey) !== state.shelfStored) throw new Error('다른 창에서 자료가 변경됐습니다. 다시 확인해 주세요.');
    const library = structuredClone(state.library), shelf = structuredClone(state.shelf);
    const unfiled = ownerId === CuriTeacher.libraryView.unfiledId;
    const source = library.folders.find(folder => folder.id === ownerId);
    const resource = unfiled ? shelf.find(item => item.id === resourceId) : null;
    const entry = unfiled ? resource && { resource, note:resource.personalLibraryNote || '' } : source?.items.find(item => item.resource.id === resourceId);
    if (!entry) throw new Error('현재 위치의 자료를 찾지 못했습니다.');
    const sourceId = unfiled ? '' : ownerId;
    const segments = CuriSegments.read(), moving = segments.records.filter(record => record.folderId === sourceId && record.resourceId === resourceId);
    const movingIds = new Set(moving.map(record => record.id));
    const listed = (source?.videoPlaylist || []).filter(id => movingIds.has(id));
    if (targetId) {
      const target = library.folders.find(folder => folder.id === targetId);
      if (!target || target.id === ownerId) throw new Error('옮길 폴더를 선택해 주세요.');
      if (target.items.some(item => item.resource.id === resourceId)) throw new Error('이미 자료가 있는 폴더입니다. 다른 폴더를 선택해 주세요.');
      if (target.items.length >= 100) throw new Error('한 폴더에는 자료를100개까지 담을 수 있습니다.');
      target.items.push(entry);
      if (listed.length) target.videoPlaylist = [...new Set([...(target.videoPlaylist || []), ...listed])];
      CuriTeacher.syncFolderCurriculum(target);
      target.updatedAt = new Date().toISOString();
    }
    if (unfiled) shelf.splice(shelf.findIndex(item => item.id === resourceId), 1);
    else {
      source.items = source.items.filter(item => item.resource.id !== resourceId);
      if (Array.isArray(source.videoPlaylist)) source.videoPlaylist = source.videoPlaylist.filter(id => !movingIds.has(id));
      source.updatedAt = new Date().toISOString();
    }
    const nextSegments = moving.length ? { ...segments, revision:segments.revision + 1, records:segments.records.flatMap(record => movingIds.has(record.id) ? targetId ? [{ ...record, folderId:targetId }] : [] : [record]) } : null;
    const restore = (key, raw) => raw === null ? localStorage.removeItem(key) : localStorage.setItem(key, raw);
    try {
      if (nextSegments) localStorage.setItem(CuriSegments.key, JSON.stringify(nextSegments));
      if (unfiled) localStorage.setItem(shelfKey, JSON.stringify(shelf));
      if (!CuriTeacher.saveFolders(library)) throw new Error(CuriTeacher.folderSaveError || '자료를 저장하지 못했습니다. 다시 시도해 주세요.');
    } catch (error) {
      if (nextSegments) restore(CuriSegments.key, expected[2]);
      if (unfiled) restore(shelfKey, expected[1]);
      throw error;
    }
    return { library, shelf };
  }
  function markup(records) {
    return `<details class="resource-action-menu"><summary aria-label="자료 옵션" title="자료 옵션"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></summary><div class="resource-action-options">${records.map(({owner,entry}) => `<div data-action-owner="${escape(owner.id)}" data-action-resource="${escape(entry.resource.id)}">${records.length > 1 ? `<p>${escape(owner.title || '폴더 미지정')}</p>` : ''}<button type="button" data-resource-delete>${owner.isUnfiled ? '폴더 미지정에서 삭제하기' : '폴더에서 삭제하기'}</button><button type="button" data-resource-move>폴더 옮기기</button></div>`).join('')}</div></details>`;
  }
  function setup(getState, onSaved, report) {
    let dialog, task;
    const closeMenus = except => document.querySelectorAll('.resource-action-menu[open]').forEach(menu => { if (menu !== except) menu.open = false; });
    function commit(ownerId, id, targetId, expected) {
      const result = apply(getState(), ownerId, id, targetId, expected);
      onSaved(result);
      window.dispatchEvent(new Event('curi-segments-changed'));
      report(targetId ? '자료와 저장한 클립을 선택한 폴더로 옮겼습니다.' : '폴더에서 자료와 저장한 클립을 삭제했습니다.');
    }
    document.addEventListener('click', event => {
      closeMenus(event.target.closest('.resource-action-menu'));
      const button = event.target.closest('[data-resource-delete],[data-resource-move]');
      if (!button) return;
      const row = button.closest('[data-action-owner]'), ownerId = row.dataset.actionOwner, id = row.dataset.actionResource;
      const state = getState();
      try {
        if (state.dirty) throw new Error('저장하지 못한 편집 내용이 있습니다. 먼저 저장해 주세요.');
        const expected = snapshot();
        if (button.hasAttribute('data-resource-delete')) {
          if (!confirm('이 위치에서 자료와 저장한 구간 클립을 삭제할까요? 원본 EBS 영상과 다른 폴더의 자료는 유지됩니다.')) return;
          commit(ownerId, id, null, expected); return;
        }
        if (!dialog) {
          dialog = document.createElement('dialog'); dialog.id = 'resource-move-dialog'; dialog.setAttribute('aria-labelledby','resource-move-title');
          dialog.innerHTML = '<div class="dialog-header"><h2 id="resource-move-title">폴더 옮기기</h2><button type="button" data-close aria-label="폴더 옮기기 닫기" title="닫기"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><label>옮길 폴더<select data-target-folder></select></label><p data-status role="status"></p><div class="bring-actions"><button type="button" data-confirm>옮기기</button></div>';
          document.body.append(dialog);
          dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
          dialog.querySelector('[data-confirm]').addEventListener('click',()=>{
            try { commit(task.ownerId, task.id, dialog.querySelector('[data-target-folder]').value, task.expected); dialog.close(); }
            catch(error) { dialog.querySelector('[data-status]').textContent=error.message; }
          });
          dialog.addEventListener('close',()=>{ if(task?.button.isConnected)task.button.closest('.resource-action-menu').querySelector('summary').focus(); });
        }
        task = {ownerId,id,expected,button};
        const folders = state.library.folders.filter(folder=>folder.id!==ownerId);
        dialog.querySelector('[data-target-folder]').innerHTML = folders.map(folder=>`<option value="${escape(folder.id)}" ${folder.items.some(entry=>entry.resource.id===id)||folder.items.length>=100?'disabled':''}>${escape(folder.title || '이름 없는 수업')}${folder.items.some(entry=>entry.resource.id===id)?' · 이미 자료 있음':folder.items.length>=100?' · 가득 참':''}</option>`).join('');
        const select = dialog.querySelector('[data-target-folder]'), available = [...select.options].find(option=>!option.disabled);
        if (available) select.value=available.value;
        dialog.querySelector('[data-confirm]').disabled=!available;
        dialog.querySelector('[data-status]').textContent=available?'':'옮길 수 있는 다른 폴더를 먼저 만들어 주세요.';
        dialog.showModal(); select.focus();
      } catch(error) { report(error.message); }
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=event.target.closest('.resource-action-menu');if(menu){menu.open=false;menu.querySelector('summary').focus();}}});
  }
  CuriTeacher.resourceActions = { markup, setup, apply };
})();
