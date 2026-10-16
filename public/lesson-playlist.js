(() => {
  'use strict';
  const core = CuriSegmentCore, store = CuriSegments;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = selector => document.querySelector(selector);
  const dragType = 'application/x-curi-segment';
  let context = null;
  const desktop = window.matchMedia('(min-width:1280px)');
  let layoutFrame = 0;
  function fitViewport() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      const panel = $('#lesson-playlist');
      if (!desktop.matches || panel.hidden) {
        panel.style.removeProperty('--playlist-viewport-height');
        return;
      }
      const main = panel.parentElement, bounds = main.getBoundingClientRect(), style = getComputedStyle(main);
      const inset = parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth);
      const top = Math.max(20, bounds.top + inset);
      const height = `${Math.max(0, window.innerHeight - top - 20)}px`;
      if (panel.style.getPropertyValue('--playlist-viewport-height') !== height) {
        panel.style.setProperty('--playlist-viewport-height', height);
      }
    });
  }
  const ids = () => Array.isArray(context?.folder.videoPlaylist) ? context.folder.videoPlaylist : [];
  function available(record) {
    return record && record.folderId === context?.folder.id && context.folder.items.some(entry => entry.resource.id === record.resourceId);
  }
  function syncCards() {
    document.querySelectorAll('.lesson-clip-card[data-segment-card]').forEach(card => {
      if (card.closest('[data-segment-folder]')?.dataset.segmentFolder !== context?.folder.id) return;
      card.classList.toggle('is-in-playlist', ids().includes(card.dataset.segmentCard));
    });
    document.querySelectorAll('[data-playlist-add]').forEach(button => {
      const added = ids().includes(button.dataset.playlistAdd);
      button.disabled = added;
      button.textContent = added ? '리스트에 담김' : '리스트에 추가';
    });
  }
  function render() {
    const panel = $('#lesson-playlist');
    panel.hidden = !context;
    $('.folder-main').classList.toggle('has-playlist', Boolean(context));
    document.body.classList.toggle('has-lesson-playlist', Boolean(context));
    fitViewport();
    if (!context) return;
    try {
      const records = new Map(store.read().records.map(record => [record.id, record]));
      let totalMillis = 0, missing = 0;
      $('#lesson-playlist-items').innerHTML = ids().map((id, index) => {
        const record = records.get(id), valid = available(record);
        if (valid) totalMillis += Math.round((record.end - record.start) * 1000);
        else missing++;
        const title = valid ? context.folder.items.find(entry => entry.resource.id === record.resourceId).resource.title : '';
        return `<li class="playlist-card" data-playlist-row="${escape(id)}" draggable="true" tabindex="-1"><div class="playlist-card-heading"><span class="playlist-number">${index + 1}</span><h3>${escape(valid ? record.name : '사용할 수 없는 구간')}</h3><button type="button" class="playlist-remove" data-playlist-remove="${escape(id)}" aria-label="${escape(valid ? record.name : '구간')} 리스트에서 삭제" title="리스트에서 삭제" draggable="false"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button><span class="drag-grip" aria-hidden="true">⠿</span></div>${valid ? `<p class="playlist-source">${escape(title)}</p><p>${core.time(record.start)}–${core.time(record.end)} <b>· ${core.time(record.end - record.start)}</b></p>` : '<p>구간 또는 연결 자료가 삭제되었습니다. 휴지통으로 리스트에서 삭제해 주세요. 합계에서 제외됩니다.</p>'}<div class="playlist-card-actions"><button type="button" data-overview-play="${escape(id)}" ${valid ? '' : 'disabled'}>시청하기</button></div></li>`;
      }).join('');
      $('#lesson-playlist-empty').hidden = ids().length > 0;
      $('#lesson-playlist-count').textContent = `${ids().length}개 구간`;
      $('#lesson-playlist-total').textContent = core.time(totalMillis / 1000);
      $('#lesson-playlist-total-note').textContent = missing ? `사용할 수 없는 ${missing}개 구간은 합계에서 제외됩니다.` : '담긴 구간의 재생시간 합계입니다.';
      syncCards();
    } catch (error) { $('#lesson-playlist-status').textContent = error.message; }
  }
  function commit(next, message, focusId) {
    try {
      if (!context || next.length > 2000 || new Set(next).size !== next.length) throw new Error('수업 영상 리스트를 확인하세요.');
      const saved = context.save(next);
      if (!saved) throw new Error(CuriTeacher.folderSaveError || '리스트를 저장하지 못했습니다. 기존 순서는 유지됩니다. 다시 시도해 주세요.');
      context.folder.videoPlaylist = next;
      render();
      $('#lesson-playlist-status').textContent = message;
      if (focusId) $('#lesson-playlist-items').querySelector(`[data-playlist-row="${CSS.escape(focusId)}"]`)?.focus();
    } catch (error) { $('#lesson-playlist-status').textContent = error.message; }
  }
  function add(id, beforeId = '') {
    try {
      if (!context) return;
      const record = store.read().records.find(record => record.id === id);
      if (!available(record)) throw new Error('현재 폴더에 저장한 구간만 담을 수 있습니다.');
      if (id === beforeId) return;
      const next = ids().filter(value => value !== id), index = next.indexOf(beforeId);
      next.splice(index < 0 ? next.length : index, 0, id);
      commit(next, '수업 영상 리스트를 저장했습니다.', id);
    } catch (error) { $('#lesson-playlist-status').textContent = error.message; }
  }
  function remove(id) {
    const next = [...ids()], index = next.indexOf(id);
    if (index < 0) return;
    next.splice(index, 1);
    commit(next, '리스트에서 삭제했습니다. 원래 저장 구간은 유지됩니다.', next[Math.min(index, next.length - 1)]);
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-playlist-add], [data-playlist-remove]');
    if (!button || !context) return;
    if (button.hasAttribute('data-playlist-add')) return add(button.dataset.playlistAdd);
    remove(button.dataset.playlistRemove);
  });
  document.addEventListener('dragstart', event => {
    const card = event.target.closest('[data-segment-card], [data-playlist-row]');
    if (!card || !context) return;
    if (event.target.closest('button,input,textarea,summary')) { event.preventDefault(); return; }
    const id = card.dataset.segmentCard || card.dataset.playlistRow;
    event.dataTransfer.setData(dragType, JSON.stringify({ id, folderId: context.folder.id }));
    event.dataTransfer.effectAllowed = card.dataset.playlistRow ? 'move' : 'copyMove';
  });
  $('#lesson-playlist').addEventListener('dragover', event => {
    if (!context || ![...event.dataTransfer.types].includes(dragType)) return;
    event.preventDefault(); $('#lesson-playlist').classList.add('is-drop-target');
  });
  $('#lesson-playlist').addEventListener('dragleave', event => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('is-drop-target');
  });
  $('#lesson-playlist').addEventListener('drop', event => {
    event.preventDefault(); event.currentTarget.classList.remove('is-drop-target');
    try {
      const data = JSON.parse(event.dataTransfer.getData(dragType));
      if (data.folderId !== context?.folder.id) return;
      add(data.id, event.target.closest('[data-playlist-row]')?.dataset.playlistRow);
    } catch { $('#lesson-playlist-status').textContent = '구간 클립 카드를 다시 가져와 주세요.'; }
  });
  // 리스트 밖에 놓거나 드래그를 취소하면 기존 목록과 순서를 유지한다.
  document.addEventListener('dragend', () => $('#lesson-playlist').classList.remove('is-drop-target'));
  window.addEventListener('curi-segments-changed', render);
  window.addEventListener('scroll', fitViewport, { passive: true });
  window.addEventListener('resize', fitViewport);
  window.addEventListener('storage', event => { if (event.key === store.key) render(); });
  window.CuriLessonPlaylist = {
    mount(folder, save) { context = folder ? { folder, save } : null; $('#lesson-playlist-status').textContent = ''; render(); },
    refresh: render
  };
})();
