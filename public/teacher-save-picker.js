(() => {
  'use strict';
  function setup(getShelf, onSave) {
    const dialog = document.createElement('dialog');
    dialog.id = 'teaching-save-dialog'; dialog.setAttribute('aria-labelledby', 'teaching-save-heading');
    dialog.innerHTML = `<div class="dialog-header"><h2 id="teaching-save-heading">내 수업 자료로 가져가기</h2><button type="button" data-close>닫기</button></div><p data-title></p><p data-existing></p><div data-curriculum></div><p data-status role="status"></p><button type="button" data-confirm>선택한 기준과 가져가기</button>`;
    document.body.append(dialog);
    let resource, picker, opener;
    const close = () => dialog.close();
    dialog.querySelector('[data-close]').addEventListener('click', close);
    dialog.addEventListener('close', () => opener?.isConnected && opener.focus());
    dialog.querySelector('[data-confirm]').addEventListener('click', () => {
      try {
        const latest = getShelf().find(item => item.id === resource.id);
        const prepared = CuriTeacher.curriculumSelection.withStandards(latest || resource, picker.values());
        if (onSave(prepared)) close(); else dialog.querySelector(':scope > [data-status]').textContent = '브라우저에 저장하지 못했습니다. 선택은 유지됩니다. 다시 가져가기를 누르거나 내 자료 목록을 내려받으세요.';
      } catch (error) { dialog.querySelector(':scope > [data-status]').textContent = error.message; }
    });
    return { open(item, button) {
      resource = item; opener = button;
      const existing = getShelf().find(value => value.id === item.id);
      dialog.querySelector('[data-title]').textContent = item.title;
      dialog.querySelector('[data-existing]').textContent = existing ? '기존 자료·선택 이유는 유지하고 선택한 교육과정을 추가합니다.' : '교육과정은 나중에 연결해도 됩니다.';
      dialog.querySelector(':scope > [data-status]').textContent = '';
      const host = document.createElement('div'); dialog.querySelector('[data-curriculum]').replaceChildren(host);
      picker = CuriTeacher.curriculumSelection.mount(host, {resource:item});
      dialog.showModal();
    } };
  }
  CuriTeacher.savePicker = { setup };
})();
