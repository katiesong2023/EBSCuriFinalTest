(() => {
  'use strict';
  const { escape } = CuriTeacher;
  // 기존 선택 이유는 보존하고 자료별 교육과정 선택만 별도로 편집한다.
  function selected(resource) {
    return CuriTeacher.resourceCurriculum(resource);
  }
  const trashIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
  function selectedMarkup(standards, trash = false) {
    return standards.map(standard => `<li><button type="button" class="selected-standard-remove" data-remove-standard="${escape(standard.id)}" aria-label="${escape(GradeContext.standardLabel(standard))} 연관 교육과정 삭제">${trash ? trashIcon : "×"}</button><div class="selected-standard-meta"><b>${escape(GradeContext.standardLabel(standard))}</b><span>${escape([standard.subject, standard.courseLabel || standard.gradeBand].filter(Boolean).join(' · '))}</span></div><p>${escape(standard.text)}</p></li>`).join('');
  }
  function removeAndFocus(list, button, remove, fallback) {
    const index = [...list.querySelectorAll('[data-remove-standard]')].indexOf(button);
    remove(button.dataset.removeStandard);
    const buttons = list.querySelectorAll('[data-remove-standard]');
    (buttons[index] || buttons[buttons.length - 1] || fallback)?.focus({ preventScroll: true });
  }
  let dialog;
  function openPicker(resource, button, record, commit) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'material-curriculum-dialog';
      dialog.setAttribute('aria-labelledby', 'material-curriculum-title');
      dialog.innerHTML = `<div class="dialog-header"><h2 id="material-curriculum-title">교육과정 선택</h2><button type="button" data-close aria-label="교육과정 선택 닫기">닫기</button></div><p data-resource-title></p><div class="bring-content"><p class="bring-hint">수업에 연결할 교육과정을 선택해 주세요.</p><div data-curriculum></div></div><p data-save-status role="status" aria-live="polite"></p><div class="bring-actions"><button type="button" data-cancel>취소</button><button type="button" data-confirm>교육과정 가져오기</button></div>`;
      document.body.append(dialog);
      dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    }
    const host = document.createElement('div');
    dialog.querySelector('[data-curriculum]').replaceChildren(host);
    dialog.querySelector('[data-resource-title]').textContent = resource.title;
    dialog.querySelector('[data-save-status]').textContent = '';
    // 영상 가져오기 첫 페이지와 같은 선택기·관련 후보·필터를 재사용한다.
    const picker = CuriTeacher.curriculumSelection.mount(host, { resource, selected: selected(resource) });
    dialog.querySelector('[data-confirm]').onclick = () => {
      if (!record.isConnected) {
        dialog.querySelector('[data-save-status]').textContent = '자료 목록이 변경되었습니다. 닫은 뒤 다시 선택해 주세요.';
        return;
      }
      if (commit(picker.values()) === false) {
        dialog.querySelector('[data-save-status]').textContent = '저장하지 못했습니다. 선택은 유지됩니다. 다시 가져오기를 눌러 주세요.';
        return;
      }
      dialog.close();
    };
    dialog.onclose = () => { if (button.isConnected) button.focus({ preventScroll: true }); };
    dialog.showModal();
  }
  function markup(resource, owner, note = '', videoName = '') {
    const standards = selected(resource);
    const noteId = `note-${owner.id}-${resource.id}`;
    return `<div class="folder-curriculum-box material-video-note"><details data-video-note><summary>영상 노트</summary><div class="material-video-note-content">${videoName ? `<p class="material-video-name">${escape(videoName)}</p>` : ''}<details class="material-curriculum-box" data-material-curriculum><summary>연관 교육과정 <span data-material-count>${standards.length}개</span></summary><div class="folder-curriculum-content"><button type="button" class="material-curriculum-import" data-import-curriculum>교육과정 가져오기</button><ul class="folder-selected-standards" data-material-selected aria-label="자료의 선택한 교육과정" ${standards.length ? '' : 'hidden'}>${selectedMarkup(standards, true)}</ul></div></details><label class="material-note-field" for="${escape(noteId)}"><span>메모</span><textarea id="${escape(noteId)}" data-note="${escape(resource.id)}" maxlength="4000" rows="4" placeholder="예: 사용할 장면과 시간, 수업에서 던질 질문">${escape(note)}</textarea></label></div></details></div>`;
  }
  function mount(record, resource, save) {
    const details = record.querySelector('[data-material-curriculum]');
    const list = record.querySelector('[data-material-selected]');
    function commit(standards) {
      resource.personalCurriculumStandards = standards;
      list.hidden = standards.length === 0;
      list.innerHTML = selectedMarkup(standards, true);
      record.querySelector('[data-material-count]').textContent = `${standards.length}개`;
      return save();
    }
    list.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-standard]');
      if (button) removeAndFocus(list, button, id => commit(selected(resource).filter(standard => standard.id !== id)), details.querySelector('summary'));
    });
    record.querySelector('[data-import-curriculum]').addEventListener('click', event => {
      openPicker(resource, event.currentTarget, record, commit);
    });
  }
  function markdown(resource, md) {
    return [
      ...(resource.personalTargetGrade ? [`자료 수업 대상: ${md(resource.personalTargetGrade === 'all' ? '미지정' : resource.personalTargetGrade)}`] : []),
      ...(Array.isArray(resource.personalCurriculumStandards) ? resource.personalCurriculumStandards.map(standard => `자료 연관 교육과정: ${md(GradeContext.standardLabel(standard))} · ${md(standard.text)}`) : [])
    ];
  }
  CuriTeacher.materialCurriculum = { selected, selectedMarkup, markup, mount, markdown, removeAndFocus };
})();
