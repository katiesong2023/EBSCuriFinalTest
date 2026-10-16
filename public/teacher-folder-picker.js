(() => {
  "use strict";
  const { escape } = CuriTeacher;
  function setup(getResource, onSaved = () => {}, getSearchQuery = resource => resource.query || "") {
    const dialog = document.createElement("dialog");
    dialog.id = "folder-picker-dialog";
    dialog.setAttribute("aria-labelledby", "folder-picker-title");
    dialog.innerHTML = `<div class="dialog-header"><h2 id="folder-picker-title">교육과정 선택</h2><button type="button" data-close aria-label="가져가기 닫기">닫기</button></div><p id="folder-picker-resource"></p><div class="bring-content"><section data-bring-page="1" aria-label="1단계 교육과정 선택"><p class="bring-hint">수업에 연결할 교육과정을 선택해 주세요.</p><div id="folder-picker-curriculum"></div></section><section data-bring-page="2" aria-label="2단계 수업 폴더 선택" hidden><p id="folder-picker-selection"></p><fieldset id="folder-picker-options"><legend>가져갈 수업 폴더</legend></fieldset><label id="folder-picker-new-name">새 수업 폴더 이름<input id="folder-picker-name" maxlength="200" placeholder="예: 우리 동네 공공기관"></label></section><section data-bring-page="3" aria-label="가져오기 완료" hidden><p id="folder-picker-complete"></p></section></div><p id="folder-picker-status" role="status"></p><div class="bring-actions"><button type="button" data-skip>선택 안 함</button><button type="button" data-back hidden>이전</button><button type="button" id="folder-picker-confirm" hidden>가져가기</button><button type="button" data-find-more hidden>자료 더 찾기</button><a class="primary-link" data-open-lesson href="/lesson.html" hidden>내 수업으로 이동</a></div><p id="folder-picker-step" class="bring-step" aria-live="polite"></p><div class="bring-progress" aria-label="가져오기 진행 단계"><span data-step="1" aria-label="1단계 교육과정 선택" aria-current="step"></span><span data-step="2" aria-label="2단계 수업 폴더 선택"></span></div>`;
    document.body.append(dialog);
    let library, resource, opener, picker, target, newFolderId;
    const $ = selector => dialog.querySelector(selector);
    const status = message => { $("#folder-picker-status").textContent = message; };
    function updateNextLabel() {
      $('[data-skip]').textContent = picker?.values().length ? '선택 완료' : '선택 안 함';
    }
    function showPage(page, focus = true) {
      dialog.querySelectorAll('[data-bring-page]').forEach(panel => { panel.hidden = Number(panel.dataset.bringPage) !== page; });
      const complete = page === 3;
      $('[data-find-more]').hidden = !complete;
      $('[data-open-lesson]').hidden = !complete;
      $('.bring-progress').hidden = complete;
      $('#folder-picker-step').hidden = complete;
      $('[data-skip]').hidden = page !== 1;
      updateNextLabel();
      $('[data-back]').hidden = page !== 2;
      $('#folder-picker-confirm').hidden = page !== 2;
      $('#folder-picker-title').textContent = complete ? '가져오기 완료' : page === 1 ? '교육과정 선택' : '수업 폴더 선택';
      $('#folder-picker-step').textContent = page === 1 ? '1 / 2 교육과정' : '2 / 2 폴더';
      dialog.querySelectorAll('[data-step]').forEach(dot => {
        if (Number(dot.dataset.step) === page) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current');
      });
      $('#folder-picker-selection').textContent = picker?.values().length ? `교육과정 ${picker.values().length}개 선택 · 이전으로 돌아가 추가하거나 변경할 수 있습니다.` : '교육과정 선택 안 함';
      status(page !== 2 ? '' : library.loadError ? '기존 폴더를 읽지 못했습니다. 기존 기록은 변경하지 않습니다.' : '폴더를 선택한 뒤 저장해 주세요.');
      $('.bring-content').scrollTop = 0;
      if (focus) $(page === 2 ? '#folder-picker-options' : '#folder-picker-title').focus();
    }
    $('#folder-picker-title').tabIndex = -1;
    $('#folder-picker-options').tabIndex = -1;
    function render() {
      $("#folder-picker-options").innerHTML = '<legend>가져갈 수업 폴더</legend>' + library.folders.map(folder => `<label><input type="radio" name="bring-folder" value="${escape(folder.id)}" ${target === folder.id ? 'checked' : ''}><span>${escape(folder.title || "이름 없는 수업")} · ${folder.items.length}개 자료</span></label>`).join("") + `<label><input type="radio" name="bring-folder" value="new" ${target === 'new' ? 'checked' : ''}><span>새 수업 폴더 만들기</span></label>`;
      $("#folder-picker-new-name").hidden = target !== 'new';
      $("#folder-picker-confirm").disabled = Boolean(library.loadError);
    }
    function save() {
      if (library.loadError) return status("기존 폴더를 읽지 못했습니다. 기존 기록은 변경하지 않습니다.");
      const title = $("#folder-picker-name").value.trim();
      if (target === 'new' && !title) { status("새 수업 폴더 이름을 입력해 주세요."); $("#folder-picker-name").focus(); return; }
      try {
        // 저장 성공 전에는 새 폴더/자료를 실제 목록에 합치지 않는다. 실패 후 다른 폴더를 선택할 수도 있다.
        const before = structuredClone(library);
        const draft = structuredClone(library);
        let folder = draft.folders.find(item => item.id === target);
        if (target === 'new') {
          if (draft.folders.length >= 50) return status("폴더는 50개까지 만들 수 있습니다.");
          folder = { id: newFolderId, title, note: "", topic: "", targetGrade: "", items: [], curriculumStandards: picker.values() };
          draft.folders.push(folder);
        }
        if (!folder) return status("가져갈 수업 폴더를 선택하세요.");
        const existing = folder.items.find(entry => entry.resource.id === resource.id);
        const base = existing ? { ...existing.resource, selectionContexts: CuriTeacher.readShelf().some(item => item.id === resource.id) ? CuriTeacher.mergeSelectionContexts(existing.resource, resource) : existing.resource.selectionContexts } : resource;
        CuriTeacher.addResourceToFolder(folder, CuriTeacher.curriculumSelection.withStandards(base, picker.values()));
        folder.updatedAt = new Date().toISOString(); draft.selectedId = folder.id;
        if (!CuriTeacher.saveFolders(draft)) return status(CuriTeacher.folderSaveError || "저장하지 못했습니다. 폴더와 교육과정 선택은 유지됩니다. 다시 저장을 눌러 주세요.");
        library = draft;
        const savedRaw = localStorage.getItem(CuriTeacher.foldersKey);
        const saveOpener = opener, saveResourceId = resource.id;
        $('#folder-picker-complete').textContent = `‘${folder.title || "이름 없는 수업"}’ 폴더로 가져왔습니다. 다음 작업을 선택해 주세요.`;
        $('[data-open-lesson]').href = `/lesson.html?view=folder&folder=${encodeURIComponent(folder.id)}`;
        showPage(3);
        window.dispatchEvent(new CustomEvent('curi-material-saved', {detail:{resourceId:saveResourceId, folderId:folder.id, folderTitle:folder.title, number:folder.items.findIndex(e=>e.resource.id===saveResourceId)+1, opener:saveOpener, undo:()=>{
          if (localStorage.getItem(CuriTeacher.foldersKey) !== savedRaw) throw new Error('다른 변경이 있어 되돌리기를 멈췄어요. 내 수업 자료에서 확인해 주세요.');
          if (!CuriTeacher.saveFolders(before)) throw new Error(CuriTeacher.folderSaveError || '되돌리지 못했어요. 다시 시도해 주세요.');
          library = before;
          onSaved('담기를 되돌렸습니다.');
        }}}));
        onSaved(`‘${folder.title || "이름 없는 수업"}’ 폴더로 가져왔습니다.`);
      } catch (error) { status(error.message); }
    }
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-folder-save]");
      if (!button) return;
      resource = getResource(button.dataset.folderSave, button);
      if (!resource) return;
      library = CuriTeacher.readFolders(); opener = button; newFolderId = crypto.randomUUID();
      target = library.folders.some(folder => folder.id === library.selectedId) ? library.selectedId : library.folders[0]?.id || 'new';
      $("#folder-picker-resource").textContent = resource.title; $("#folder-picker-name").value = "";
      status(library.loadError ? "기존 폴더를 읽지 못했습니다. 기존 기록은 변경하지 않습니다." : "폴더를 지정한 뒤 가져가기를 누르세요.");
      render();
      const host = document.createElement("div"); $("#folder-picker-curriculum").replaceChildren(host);
      picker = CuriTeacher.curriculumSelection.mount(host, { resource, searchQuery: getSearchQuery(resource), onChange: updateNextLabel });
      showPage(1, false);
      dialog.showModal();
    });
    $('[data-skip]').addEventListener('click', () => showPage(2));
    $('[data-back]').addEventListener('click', () => showPage(1));
    $('[data-find-more]').addEventListener('click', () => dialog.close());
    $("[data-close]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { if (opener?.isConnected) opener.focus(); });
    $("#folder-picker-options").addEventListener("change", event => {
      if (event.target.name !== 'bring-folder') return;
      target = event.target.value; $("#folder-picker-new-name").hidden = target !== 'new';
    });
    $("#folder-picker-confirm").addEventListener("click", save);
  }
  CuriTeacher.folderPicker = { setup };
})();
