(() => {
  "use strict";
  const core = CuriSegmentCore, store = CuriSegments;
  const escape = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function markup(item, folderId = "") {
    let records;
    try { records = store.forResource(item, folderId); }
    catch { return '<p role="status">구간 기록을 읽지 못했습니다. 저장 내용을 보존하고 새로고침해 주세요.</p>'; }
    const folderScenes=store.read().records.filter(record=>record.folderId===folderId);
    const url = item.navigation?.url || item.sourceUrl;
    if (!records.length && !core.identity(url)) return "";
    const manage = `/lesson.html?${new URLSearchParams({ resource: item.id, folder: folderId })}`;
    return `<section class="saved-segments" tabindex="0" aria-label="수업 장면 레일" data-segment-resource="${escape(item.id)}" data-segment-folder="${escape(folderId)}" data-segment-title="${escape(item.title || '')}" data-segment-program="${escape(item.program || '')}" data-segment-url="${escape(core.identity(url) ? url : "")}"><h4>수업용 구간</h4>${records.length ? records.map((r,index) => `<article class="segment-card" data-segment-card="${escape(r.id)}" draggable="${Boolean(folderId)}"><span class="scene-number">${Math.max(1,CuriTeacher.readFolders(false).folders.findIndex(f=>f.id===folderId)+1)}.${folderScenes.findIndex(record=>record.id===r.id)+1}</span><div class="scene-poster"><img draggable="false" src="/api/curi/discover/thumbnail?id=${encodeURIComponent(item.id)}" alt="${escape(item.program || '')} · ${escape(item.title || r.name)}" loading="lazy"><b>${escape(r.name)}</b></div><p class="scene-caption">${core.time(r.start)}–${core.time(r.end)} <strong>· ${core.time(r.end-r.start)}</strong><small>${escape(item.program || 'EBS')} · ${escape((item.broadcastDate || '').slice(0,4))}</small></p><div class="segment-card-actions"><a href="${escape(manage)}&segment=${encodeURIComponent(r.id)}">저장 구간 보기 ↗</a><button type="button" data-scene-up="${escape(r.id)}" aria-label="${escape(r.name)} 앞 장면으로" ${index?'':'disabled'}>←</button><button type="button" data-scene-down="${escape(r.id)}" aria-label="${escape(r.name)} 뒤 장면으로" ${index<records.length-1?'':'disabled'}>→</button>${folderId ? `<button type="button" data-playlist-add="${escape(r.id)}">리스트에 추가</button>` : ''}</div></article>`).join("") : `<a class="scene-empty" href="${escape(manage)}">＋ 구간을 지정해 장면 담기</a>`}${records.filter(r=>r.note).map(r=>`<aside class="scene-note-card"><span class="scene-number">메모</span><p class="scene-note">${escape(r.note)}</p></aside>`).join('')}<div class="scene-empty-card"><span class="scene-number">${Math.max(1,CuriTeacher.readFolders(false).folders.findIndex(f=>f.id===folderId)+1)}.${folderScenes.length+1}</span><a class="scene-empty" href="/?q=">＋ 자료 찾기에서 담기</a></div><a href="${escape(manage)}">구간 편집</a></section>`;
  }
  store.markup = markup;
  const memoDrafts = new Map();
  function clipMemo(record) {
    const draft = memoDrafts.get(record.id);
    return `<details class="clip-memo" ${draft ? 'open' : ''}><summary>클립 메모</summary><label class="clip-memo-field"><span class="sr-only">${escape(record.name)} 클립 메모</span><textarea data-clip-note data-saved-note="${escape(draft?.baseNote ?? record.note)}" maxlength="4000" rows="3" placeholder="클립 메모를 작성해 주세요.">${escape(draft?.note ?? record.note)}</textarea></label><div class="clip-memo-actions"><p data-clip-note-status role="status" aria-live="polite"></p><button type="button" data-save-clip-note>메모 저장</button></div></details>`;
  }
  function clipMarkup(item, folderId = '') {
    const url = core.publicUrl(item.navigation?.url || item.sourceUrl);
    let records;
    try { records = store.forResource(item, folderId); }
    catch { return '<p role="status">구간 클립 카드를 읽지 못했습니다. 새로고침해 주세요.</p>'; }
    const playlist = folderId ? (CuriTeacher.readFolders(false).folders.find(folder => folder.id === folderId)?.videoPlaylist || []) : [];
    return `<section class="lesson-clip-list" data-segment-layout="clips" data-segment-resource="${escape(item.id)}" data-segment-folder="${escape(folderId)}" data-segment-title="${escape(item.title)}" data-segment-program="${escape(item.program)}" data-segment-url="${escape(url || '')}"><h4>구간 클립 카드 목록</h4><button type="button" class="clip-create" data-create-clip ${url ? '' : 'disabled'}>구간 클립 카드 만들기 ↗</button><p data-clip-status role="status" aria-live="polite"></p><div class="lesson-clip-cards">${records.map(record => `<article class="lesson-clip-card${playlist.includes(record.id) ? ' is-in-playlist' : ''}" data-segment-card="${escape(record.id)}" draggable="${Boolean(folderId)}"><div class="clip-card-header"><div class="clip-card-info"><h5>${escape(record.name)}</h5><p class="clip-time">${core.time(record.start)}–${core.time(record.end)} <strong>· ${core.time(record.end - record.start)}</strong></p></div><a class="clip-open" href="${escape(core.publicUrl(record.sourceUrl) || url || '')}" target="_blank" rel="noopener noreferrer" data-clip-open="${escape(record.id)}">구간 확인</a><button type="button" class="clip-delete" data-delete-clip="${escape(record.id)}" aria-label="${escape(record.name)} 구간 클립 카드 삭제" title="구간 클립 카드 삭제"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>${clipMemo(record)}</article>`).join('')}</div>${records.length ? '' : '<p class="clip-empty">저장한 구간 클립 카드가 없습니다.</p>'}</section>`;
  }
  store.clipMarkup = clipMarkup;
  const report=message=>window.CuriUI?.notify(message);
  document.addEventListener('input', event => {
    const input = event.target.closest('[data-clip-note]');
    if (!input) return;
    const id = input.closest('[data-segment-card]').dataset.segmentCard;
    memoDrafts.set(id, { note: input.value, baseNote: memoDrafts.get(id)?.baseNote ?? input.dataset.savedNote });
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-save-clip-note]');
    if (!button) return;
    const card = button.closest('[data-segment-card]'), id = card.dataset.segmentCard;
    const input = card.querySelector('[data-clip-note]');
    const draft = memoDrafts.get(id) || { note: input.value, baseNote: input.dataset.savedNote };
    try {
      const state = store.read(), record = state.records.find(value => value.id === id);
      if (!record) throw new Error('클립이 삭제되었습니다. 작성한 메모는 복사해서 보관해 주세요.');
      if (record.note !== draft.baseNote && record.note !== draft.note) throw new Error('다른 창에서 메모가 변경되었습니다. 작성한 내용을 복사한 뒤 새로고침해 확인해 주세요.');
      memoDrafts.delete(id);
      try { store.write({ ...record, note: draft.note }, state.revision); }
      catch (error) { memoDrafts.set(id, draft); throw error; }
      const updated = document.querySelector(`.lesson-clip-card[data-segment-card="${CSS.escape(id)}"]`);
      if (updated) {
        updated.querySelector('.clip-memo').open = true;
        updated.querySelector('[data-clip-note-status]').textContent = '메모를 저장했습니다.';
        updated.querySelector('[data-save-clip-note]').focus({ preventScroll: true });
      }
    } catch (error) { card.querySelector('[data-clip-note-status]').textContent = error.message; }
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-scene-up],[data-scene-down]');if(!button)return;
    try{
      const state=store.read(),id=button.dataset.sceneUp||button.dataset.sceneDown,record=state.records.find(r=>r.id===id),siblings=state.records.filter(r=>r.folderId===record.folderId&&r.resourceId===record.resourceId),index=siblings.findIndex(r=>r.id===id);
      if(button.hasAttribute('data-scene-up')&&index>0)store.reorder(id,siblings[index-1].id,state.revision);
      else if(index<siblings.length-1)store.reorder(siblings[index+1].id,id,state.revision);
      const card=document.querySelector(`[data-segment-card="${CSS.escape(id)}"]`);card?.querySelector(button.hasAttribute('data-scene-up')?'[data-scene-up]':'[data-scene-down]')?.focus();
      report('장면 순서를 저장했어요.');
    }catch(error){report(error.message);}
  });
  document.addEventListener('dragstart',event=>{
    const card=event.target.closest('[data-segment-card]');if(!card)return;
    if(event.target.closest('button,input,textarea,summary')){event.preventDefault();return;}
    event.dataTransfer.setData('application/x-curi-scene',JSON.stringify({id:card.dataset.segmentCard,revision:store.read().revision}));
  });
  document.addEventListener('dragover',event=>{if(event.target.closest('.saved-segments')&&[...event.dataTransfer.types].includes('application/x-curi-scene'))event.preventDefault();});
  document.addEventListener('drop',event=>{
    const target=event.target.closest('[data-segment-card]');if(!target||!event.dataTransfer.getData('application/x-curi-scene'))return;
    event.preventDefault();try{const data=JSON.parse(event.dataTransfer.getData('application/x-curi-scene'));store.reorder(data.id,target.dataset.segmentCard,data.revision);report('장면 순서를 저장했어요.');}catch(error){report(error.message);}
  });
  let pan=null;
  document.addEventListener('pointerdown',event=>{const rail=event.target.closest('.saved-segments');if(!rail||event.pointerType!=='mouse'||event.button!==0||event.target.closest('button,a,input,textarea,[draggable=true]'))return;pan={rail,x:event.clientX,left:rail.scrollLeft};});
  document.addEventListener('pointermove',event=>{if(pan&&event.buttons===1)pan.rail.scrollLeft=pan.left+pan.x-event.clientX;});
  document.addEventListener('pointerup',()=>pan=null);
  document.addEventListener('keydown',event=>{if(event.target.matches('.saved-segments')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.target.scrollBy({left:event.key==='ArrowLeft'?-188:188,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}});
  const update = () => document.querySelectorAll("[data-segment-resource]").forEach(element => {
    element.outerHTML = (element.dataset.segmentLayout === 'clips' ? clipMarkup : markup)({ id: element.dataset.segmentResource, sourceUrl: element.dataset.segmentUrl, title:element.dataset.segmentTitle, program:element.dataset.segmentProgram }, element.dataset.segmentFolder);
  });
  window.addEventListener("curi-segments-changed", update);
  window.addEventListener("storage", e => { if (e.key === store.key) update(); });
})();
