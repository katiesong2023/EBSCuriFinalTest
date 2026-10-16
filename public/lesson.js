(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const { escape, sourceLink, destination, broadcastDateText } = CuriTeacher;
  let library = CuriTeacher.readFolders();
  let shelf = CuriTeacher.readShelf();
  for (const folder of library.folders) for (const entry of folder.items) entry.resource.selectionContexts = CuriTeacher.choicesFor(entry.resource);
  let dirty = false, shelfDirty = false, revision = 0, exporting = false;
  let view = new URLSearchParams(location.search).get('view') === 'folder' ? 'folder' : new URLSearchParams(location.search).get('view') === 'unfiled' ? 'unfiled' : 'all';
  const wantedFolder = new URLSearchParams(location.search).get('folder');
  if (view === 'folder' && library.folders.some(f => f.id === wantedFolder)) library.selectedId = wantedFolder;
  for (const item of shelf) item.selectionContexts = CuriTeacher.choicesFor(item);
  let shelfStored = localStorage.getItem('curi.discovery.shelf.v1');
  const sources = () => CuriTeacher.libraryView.sources(library, shelf);
  const ownerById = id => sources().find(owner => owner.id === id);
  const allRows = () => sources().flatMap(owner => owner.items.map((entry, index) => ({ owner, entry, index })));
  const segmentFolder = owner => owner.isUnfiled ? '' : owner.id;
  function saveOwner(owner) {
    if (!owner?.isUnfiled) return save();
    if (localStorage.getItem('curi.discovery.shelf.v1') !== shelfStored) { shelfDirty = true; status('다른 창에서 자료가 변경되어 저장을 멈췄습니다. 입력을 보존한 뒤 새로고침해 주세요.'); return false; }
    shelfDirty = !CuriTeacher.saveShelf(shelf);
    if (!shelfDirty) shelfStored = localStorage.getItem('curi.discovery.shelf.v1');
    status(shelfDirty ? '개인 기록을 저장하지 못했습니다. 입력은 유지됩니다. 다시 저장을 눌러 다시 시도하세요.' : dirty ? $('#save-status').textContent : '');
    return !shelfDirty;
  }
  const currentResources = new Map();
  let resourceRequest = 0;
  const resourceKey = (item) => `${item.id}:${item.title}`;
  document.addEventListener("input",event=>{if(event.target.matches("[data-folder-goal]")){const folder=library.folders.find(f=>f.id===library.selectedId);if(folder){folder.lessonGoal=event.target.value;changed();}}});
  function folderContext(item, folder) {
    // 여러 선택 이유는 각각 기준을 대조한다. 카드 상단은 자료 전체 현재 기록이다.
    const choices = item.selectionContexts || [];
    if (choices.length > 1) return null;
    if (choices[0]?.standardId) return CuriTeacher.choiceContext(choices[0]);
    if (item.teachingContext?.standardId || !folder?.targetGrade) return item.teachingContext;
    return CuriTeacher.teachingContext(folder.targetGrade, { subject: item.teachingContext?.subject || "" });
  }
  const displayResource = (item, folder) => CuriTeacher.withTeachingContext({ ...(currentResources.get(resourceKey(item)) || CuriTeacher.unconfirmedResource(item)), selectionContexts: item.selectionContexts, teachingContext: item.teachingContext }, folderContext(item, folder));
  async function refreshConfirmations() {
    const number = ++resourceRequest;
    const resources = [...new Map(sources().flatMap((folder) => folder.items.map((entry) => [resourceKey(entry.resource), entry.resource]))).values()];
    currentResources.clear();
    updateConfirmationMarkup();
    for (let offset = 0; offset < resources.length; offset += 100) {
      const batch = resources.slice(offset, offset + 100);
      let latest;
      try { latest = await CuriTeacher.refreshResources(batch.map((item) => ({ ...item, teachingContext: null }))); }
      catch { latest = batch.map((item) => CuriTeacher.unconfirmedResource(item, "FAILED")); }
      if (number !== resourceRequest) return;
      latest.forEach((item) => currentResources.set(resourceKey(item), item));
      updateConfirmationMarkup();
    }
  }
  function updateConfirmationMarkup() {
    // 비동기 확인이 메모 입력 영역·커서·사용자의 폴더 편집을 다시 렌더링하지 않게 한다.
    document.querySelectorAll(".folder-video").forEach((card) => {
      const owner = ownerById(card.dataset.owner);
      const entry = owner?.items.find((item) => item.resource.id === card.dataset.resource);
      if (entry) {
        const item = displayResource(entry.resource, owner);
        const clips = card.querySelector('.lesson-clip-list');
        if (clips) clips.outerHTML = CuriSegments.clipMarkup(item, segmentFolder(owner));
        const link = card.querySelector(".saved-video-link");
        if (link) {
          if (link.nextElementSibling?.matches(".saved-segments")) link.nextElementSibling.remove();
          link.outerHTML = CuriTeacher.savedVideoLink(item, segmentFolder(owner));
        }
        card.querySelector(".resource-evidence").innerHTML = CuriTeacher.evidenceMarkup(item, { hideStatus: true });
        card.querySelectorAll("[data-choice]").forEach((element) => {
          const choice = entry.resource.selectionContexts.find((value) => value.id === element.dataset.choice);
          if (choice) element.querySelector("[data-choice-current]").textContent = `${CuriTeacher.currentChoiceStatus(item, choice)} · 현재 재확인: ${item.evidenceCheckedAt || "현재 재확인 시점 미기록"}`;
        });
      }
    });
    const grouped = new Map(CuriTeacher.libraryView.groups(allRows()).map(group => [group.key, group.resource]));
    document.querySelectorAll('#folder-videos > .resource-card').forEach(card => {
      const owner = ownerById(card.dataset.owner);
      const resource = grouped.get(card.dataset.allKey) || owner?.items.find(entry => entry.resource.id === card.dataset.resource)?.resource;
      if (resource) CuriTeacher.updateCardNavigation(card, displayResource(resource, card.dataset.allKey ? null : owner));
    });
    window.CuriLessonPlaylist?.refresh();
  }
  const status = (message) => {
    $("#save-status").textContent = message;
    $('#save-folders').hidden = !(dirty || shelfDirty);
  };
  const current = () => view === "folder" ? library.folders.find(folder => folder.id === library.selectedId) : null;
  const searchText = () => $("#video-search").value.trim().toLocaleLowerCase();
  const label = (folder) => folder.title.trim() || "이름 없는 수업";
  const searchUrl = "/";
  $("#find-more").href = searchUrl;
  $("#find-more-dialog").href = searchUrl;

  function save() {
    if (library.loadError) return false;
    revision++;
    dirty = !CuriTeacher.saveFolders(library);
    status(dirty ? CuriTeacher.folderSaveError || "저장하지 못했습니다. 페이지를 닫기 전에 다시 저장하거나 폴더 목록을 내려받으세요." : shelfDirty ? $("#save-status").textContent : "");
    return !dirty;
  }
  function changed() {
    if (current()) current().updatedAt = new Date().toISOString();
    save();
  }
  function renderFolders() {
    $('#all-material-count').textContent = CuriTeacher.libraryView.groups(allRows()).length;
    $('#unfiled-material-count').textContent = shelf.length;
    $('#show-all-materials').setAttribute('aria-current', String(view === 'all'));
    $('#show-unfiled-materials').setAttribute('aria-current', String(view === 'unfiled'));
    $("#folder-count").textContent = library.folders.length;
    const folder = current(), headerColor = ['coral','sun','lilac','mint'].includes(folder?.labelColor) ? folder.labelColor : 'folder';
    $('.folder-main').style.setProperty('--detail-folder-color', `var(--curi-${headerColor})`);
    const focusedFolder = document.activeElement?.dataset.indexFolder;
    $('#index-folder-list').innerHTML = library.folders.map(folder => `<div class="index-folder-item"><button type="button" data-index-folder="${escape(folder.id)}" aria-current="${view === 'folder' && folder.id === library.selectedId}"><span class="folder-art index-folder-icon" style="--folder-label:var(--curi-${['coral','sun','lilac','mint'].includes(folder.labelColor)?folder.labelColor:'folder'})" aria-hidden="true">${folder.items.slice(-3).map(entry => `<img draggable="false" src="/api/curi/discover/thumbnail?id=${encodeURIComponent(entry.resource.id)}" alt="" loading="lazy">`).join('')}</span><span class="index-folder-name">${escape(label(folder))}</span><small>${folder.items.length}개 자료</small></button><button type="button" class="index-folder-delete" data-delete-folder="${escape(folder.id)}" aria-label="${escape(label(folder))} 폴더 삭제" title="${escape(label(folder))} 폴더 삭제"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>`).join('');
    if (focusedFolder) [...$('#index-folder-list').querySelectorAll('button')].find(button => button.dataset.indexFolder === focusedFolder)?.focus({ preventScroll: true });
  }
  function videoRecord(entry, folder) {
    const item = displayResource(entry.resource, folder);
    return `<div class="folder-video library-record" data-resource="${escape(item.id)}" data-owner="${escape(folder.id)}">
      ${CuriSegments.clipMarkup(item, segmentFolder(folder))}
      <div class="resource-evidence">${CuriTeacher.evidenceMarkup(item, { hideStatus: true })}</div>
      ${entry.legacy ? `<details><summary>이전 준비안 기록</summary><p>이전 구분: ${escape(entry.legacy.role)}</p><p>발문: ${escape(entry.legacy.question)}</p><p>활동: ${escape(entry.legacy.activity)}</p></details>` : ""}
    </div>`;
  }
  function libraryCard(resource, records, index, groupKey = null) {
    const owner = records[0].owner;
    const item = displayResource(resource, groupKey ? null : owner);
    const notes = records.map(({owner, entry}) => `<div class="material-note-record" data-resource="${escape(entry.resource.id)}" data-owner="${escape(owner.id)}">${records.length > 1 ? `<p class="material-note-owner">${escape(label(owner))}</p>` : ''}${CuriTeacher.materialCurriculum.markup(entry.resource, owner, entry.note, entry.videoName)}</div>`).join('');
    const details = `<div class="library-record-details">${records.map(({owner, entry}) => `<section class="library-location">${groupKey ? `<h4>${escape(label(owner))}</h4>` : ''}${videoRecord(entry, owner)}</section>`).join('')}</div>`;
    return CuriTeacher.card(item, index + 1, shelf, false, { library: true, ownerId: owner.id, segmentFolder: segmentFolder(owner), groupKey, hideSavedLocation: view === "folder", libraryActions: CuriTeacher.resourceActions.markup(records), libraryNotes: notes, libraryDetails: details });
  }
  function renderVideos() {
    const folder = current(), query = searchText(), searching = Boolean(query);
    const all = view !== 'folder';
    $('#folder-empty').hidden = true; $('#folder-content').hidden = false;
    $('#folder-settings').hidden = all || searching; $('#folder-actions').hidden = all || searching;
    $('#folder-detail-header').hidden = all || searching;
    $('.folder-main').classList.toggle('is-folder-detail', Boolean(folder) && !searching);
    $('#videos-heading').textContent = all ? view === 'unfiled' ? '폴더 미지정 자료' : '전체 자료' : '가져온 자료';
    const targets = all ? view === 'unfiled' ? sources().filter(owner => owner.isUnfiled) : sources() : folder ? [folder] : [];
    const rows = targets.flatMap(owner => owner.items.map((entry, index) => ({ owner, entry, index })));
    const groups = CuriTeacher.libraryView.groups(rows, query);
    const matches = groups.flatMap(group => group.records);
    $('#video-count').textContent = `${groups.length}개 자료${all ? ' · 위치별 개인 기록은 각 자료에서 확인' : ''}${searching ? ' · 현재 보기의 검색 결과' : ''}`;
    $('#folder-videos').innerHTML = groups.length ? all ? groups.map((group, index) => libraryCard(group.resource, group.records, index, group.key)).join('') : matches.map((record, index) => libraryCard(record.entry.resource, [record], index)).join('') : '<p class="folder-hint">이 보기에 자료가 없습니다. 자료 찾기에서 가져오거나 다른 보기를 선택하세요.</p>';
    $('#folder-videos').querySelectorAll('.material-note-record').forEach(record => {
      const owner = ownerById(record.dataset.owner);
      const entry = owner?.items.find(value => value.resource.id === record.dataset.resource);
      if (entry) CuriTeacher.materialCurriculum.mount(record, entry.resource, () => {
        if (!owner.isUnfiled && CuriTeacher.syncFolderCurriculum(owner) && owner.id === current()?.id) {
          folderCurriculum?.setSelected(owner.curriculumStandards);
          $('#folder-standard-count').textContent = `${owner.curriculumStandards.length}개`;
          renderSelectedStandards(owner);
        }
        owner.updatedAt = new Date().toISOString(); return saveOwner(owner);
      });
    });
    CuriLessonPlaylist.mount(folder, ids => {
      if (dirty || shelfDirty) { CuriTeacher.folderSaveError = '먼저 다시 저장을 눌러 편집 중인 내용을 저장해 주세요.'; return false; }
      const next = { ...library, folders: library.folders.map(value => value.id === folder.id ? { ...value, videoPlaylist: ids, updatedAt: new Date().toISOString() } : value) };
      if (!CuriTeacher.saveFolders(next)) return false;
      library = next; revision++;
      return true;
    });
    $("#export-folder").disabled = exporting;
  }
  function resetNewCurriculum() {
    const host = document.createElement('div'); $('#new-folder-curriculum').replaceChildren(host);
    return CuriTeacher.curriculumSelection.mount(host);
  }
  let newCurriculum = resetNewCurriculum();
  let folderCurriculum = null;
  $('#folder-selected-standards').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-standard]');
    if (button && folderCurriculum) CuriTeacher.materialCurriculum.removeAndFocus($('#folder-selected-standards'), button, id => folderCurriculum.remove(id), $('#folder-curriculum-panel>summary'));
  });
  function renderSelectedStandards(folder) {
    const standards = folder?.curriculumStandards || [], list = $('#folder-selected-standards');
    list.hidden = standards.length === 0;
    list.innerHTML = CuriTeacher.materialCurriculum.selectedMarkup(standards);
  }
  function render() {
    let relatedAdded = false;
    for (const owner of library.folders) if (CuriTeacher.syncFolderCurriculum(owner)) relatedAdded = true;
    if (relatedAdded) save();
    if (view === "folder" && !current()) { library.selectedId = library.folders[0]?.id || ""; if (!library.selectedId) view = "all"; }
    const folder = current();
    $('#folder-standard-count').textContent = `${folder?.curriculumStandards?.length || 0}개`;
    renderSelectedStandards(folder);
    // 필터를 다시 만들 때도 수업 대상 노드와 기존 이벤트 연결은 보존한다.
    const gradeField = $('#lesson-grade').closest('label');
    const curriculumHost = document.createElement('div'); $('#folder-curriculum').replaceChildren(curriculumHost);
    folderCurriculum = folder ? CuriTeacher.curriculumSelection.mount(curriculumHost, { selected: folder.curriculumStandards || [], leadingControl: gradeField, initialCourse: GradeContext.courseForGrade(folder.targetGrade) || '', onChange: selected => {
      CuriTeacher.setFolderCurriculum(folder, selected); $('#folder-standard-count').textContent = `${selected.length}개`; renderSelectedStandards(folder); changed();
    } }) : null;
    if (!folder) curriculumHost.before(gradeField);
    $("#lesson-grade").value = folder?.targetGrade || "all";
    $("#find-more").href = $("#find-more-dialog").href = "/";
    $("#lesson-title").value = folder?.title || "";
    $("#lesson-note").value = folder?.note || "";
    $("#lesson-goal").value = folder?.lessonGoal || "";
    $("#legacy-topic").hidden = !folder?.topic;
    $("#legacy-topic").textContent = folder?.topic ? `이전 준비안 주제: ${folder.topic}` : "";
    let palette=document.querySelector('#folder-label-colors');
    if(!palette){palette=document.createElement('div');palette.id='folder-label-colors';palette.setAttribute('role','group');palette.setAttribute('aria-label','폴더 라벨 색');$('#folder-detail-header').insertBefore(palette, $('#folder-detail-header .folder-title-edit'));palette.addEventListener('click',event=>{const button=event.target.closest('[data-label-color]');if(!button||!current())return;current().labelColor=button.dataset.labelColor;changed();renderFolders();palette.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});}
    palette.innerHTML=[['folder','기본'],['coral','살구'],['sun','연두'],['lilac','라일락'],['mint','블루']].map(([value,label])=>`<button type="button" data-label-color="${value}" aria-label="${label} 폴더 색" title="${label}" aria-pressed="${(folder?.labelColor||'folder')===value}"><i style="background:var(--curi-${value})" aria-hidden="true"></i></button>`).join('');
    renderFolders(); renderVideos();
  }
  function renderShelf() {
    const folder = current();
    $("#add-note").textContent = `${folder ? label(folder) : ""} 폴더에 담습니다. 같은 자료를 여러 수업 폴더에 담을 수 있습니다.`;
    $("#lesson-shelf-items").innerHTML = shelf.length ? shelf.map((item) => {
      const existing = folder?.items.find((entry) => entry.resource.id === item.id);
      const added = existing && CuriTeacher.choicesFor(item).every((choice) => existing.resource.selectionContexts.some((saved) => saved.id === choice.id));
      return `<article class="lesson-shelf-item"><p>${escape(item.program)}</p><h3>${escape(item.title)}</h3>${CuriTeacher.savedVideoLink(item, existing ? folder.id : "")}<p class="broadcast-date">${escape(CuriTeacher.resourceDateLabel(item))} <b>${escape(CuriTeacher.resourceDateText(item))}</b></p><button type="button" data-add="${escape(item.id)}" ${added ? "disabled" : ""}>${added ? "이 폴더에 담음" : existing ? "새 선택 이유 가져오기" : "폴더에 담기"}</button></article>`;
    }).join("") : '<p class="folder-hint">폴더 미지정 자료가 없습니다. 자료 찾기에서 원하는 폴더로 가져올 수 있습니다.</p>';
  }
  function openFolder(id) {
    view = "folder";
    library.selectedId = id;
    $("#video-search").value = "";
    history.replaceState(null, "", `?view=folder&folder=${encodeURIComponent(id)}`); render(); refreshConfirmations();
  }
  $("#create-folder").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#new-folder-title").value.trim();
    if (!title || library.loadError) return;
    if (library.folders.length >= 50) return status("폴더는 50개까지 만들 수 있습니다.");
    const folder = { id: crypto.randomUUID(), title, targetGrade: "", curriculumStandards: newCurriculum.values(), note: "", items: [], updatedAt: new Date().toISOString() };
    library.folders.push(folder);
    $("#new-folder-title").value = "";
    newCurriculum = resetNewCurriculum();
    save(); openFolder(folder.id);
    $("#videos-heading").focus();
  });
  $('#index-folder-list').addEventListener('click', event => {
    const remove = event.target.closest('[data-delete-folder]');
    if (remove) return requestFolderDeletion(remove.dataset.deleteFolder);
    const button = event.target.closest('[data-index-folder]');
    if (button) openFolder(button.dataset.indexFolder);
  });
  $("#video-search").addEventListener("input", () => { renderFolders(); renderVideos(); });
  $("#lesson-title").addEventListener("input", (event) => { if (current()) { current().title = event.target.value; changed(); renderFolders(); } });
  $("#lesson-grade").addEventListener("change", (event) => { if (current()) { current().targetGrade = event.target.value === "all" ? "" : event.target.value; folderCurriculum?.setCourse(GradeContext.courseForGrade(current().targetGrade)); changed(); renderVideos(); refreshConfirmations(); } });
  $("#lesson-note").addEventListener("input", (event) => { if (current()) { current().note = event.target.value; changed(); } });
  $('#show-all-materials').addEventListener('click', () => { view = 'all'; $('#video-search').value = ''; history.replaceState(null,'','?view=all'); render(); });
  $('#show-unfiled-materials').addEventListener('click', () => { view = 'unfiled'; $('#video-search').value = ''; history.replaceState(null,'','?view=unfiled'); render(); });
  $("#save-folders").addEventListener("click", () => {
    if (dirty) save();
    if (shelfDirty) saveOwner(ownerById(CuriTeacher.libraryView.unfiledId));
    if ((dirty || shelfDirty) && !$('#save-status').textContent) status('저장하지 못한 내용이 있습니다. 다시 저장하거나 목록을 내려받아 주세요.');
  });
  $("#add-videos").addEventListener("click", () => { if (!current()) return; if (shelfDirty) return status("먼저 개인 기록을 저장해 주세요."); shelf = CuriTeacher.readShelf(); shelfStored = localStorage.getItem("curi.discovery.shelf.v1"); for (const item of shelf) item.selectionContexts = CuriTeacher.choicesFor(item); renderShelf(); $("#add-dialog").showModal(); });
  $("#close-add").addEventListener("click", () => $("#add-dialog").close());
  $("#lesson-shelf-items").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]"), folder = current();
    const resource = shelf.find((item) => item.id === button?.dataset.add);
    if (!folder || !resource) return;
    try {
      CuriTeacher.addResourceToFolder(folder, resource);
    } catch (error) { $("#add-note").textContent = error.message; return; }
    changed(); renderVideos(); renderFolders(); renderShelf(); refreshConfirmations();
    $("#add-note").textContent = dirty ? "자료를 담았지만 브라우저에 저장하지 못했습니다. 닫은 뒤 다시 저장해 주세요." : `‘${resource.title}’ 자료를 폴더에 담았습니다.`;
    ($("#lesson-shelf-items [data-add]:not(:disabled)") || $("#close-add")).focus();
  });
  $("#folder-videos").addEventListener("input", (event) => {
    if (!event.target.matches("[data-note], [data-choice-field], [data-assessment]")) return;
    const card = event.target.closest("[data-owner]");
    const folder = ownerById(card.dataset.owner);
    const entry = folder?.items.find((item) => item.resource.id === card.dataset.resource);
    if (!entry) return;
    if (event.target.matches("[data-note]")) { entry.note = event.target.value; if (folder.isUnfiled) entry.resource.personalLibraryNote = event.target.value; }
    else {
      const container = event.target.closest("[data-choice]"), choice = entry.resource.selectionContexts.find((value) => value.id === container.dataset.choice);
      if (!choice) return;
      CuriTeacher.updateChoice(choice, event.target);
      if (event.target.dataset.choiceField === "standardId") {
        container.querySelector(".choice-standard").textContent = choice.standardText || "공식 기준 미지정";
        container.querySelector(".choice-grade").textContent = `학년군 연계: ${choice.officialGradeBand || choice.courseLabel || "미기록"}${choice.courses.includes("middle1") ? " · EBS 뉴런 중1 편성 참고 · 학교별 배치 미확인" : ""}`;
        container.querySelector("summary").textContent = `선택 이유 · ${GradeContext.standardLabel(choice) || "기준 미지정"}`;
        const difference = container.querySelector(".context-difference"), targetCourse = GradeContext.courseForGrade(folder.targetGrade);
        difference.hidden = !(targetCourse && choice.courses.length && !choice.courses.includes(targetCourse));
        difference.textContent = `선택한 기준의 과정(${choice.courseLabel})과 폴더 수업 대상(${folder.targetGrade})이 다릅니다. 원래 선택 이유는 보존됩니다.`;
        updateConfirmationMarkup();
      }
      if (event.target.dataset.assessment) {
        const key = event.target.dataset.assessment, record = choice.assessments[key];
        container.querySelector(`[data-assessment-time="${key}"]`).textContent = `확인 시점: ${record.checkedAt || "미기록"}`;
        event.target.closest("details").querySelector("summary").textContent = `${{ difficulty: "영상 난이도", prerequisites: "선수개념", scenes: "장면·사용 구간" }[key]} · ${record.status === "PERSONAL_REVIEW" ? "개인 확인 기록 있음" : "미확인"}`;
      }
    }
    folder.updatedAt = new Date().toISOString(); saveOwner(folder);
  });
  $("#folder-videos").addEventListener("click", (event) => {
    const deleteClip = event.target.closest('[data-delete-clip]');
    if (deleteClip) {
      try {
        if (dirty || shelfDirty) throw new Error('저장하지 못한 편집 내용이 있습니다. 먼저 저장한 뒤 삭제해 주세요.');
        const state = CuriSegments.read(), record = state.records.find(value => value.id === deleteClip.dataset.deleteClip);
        if (!record) throw new Error('삭제할 구간 클립 카드를 찾지 못했습니다.');
        if (!confirm(`‘${record.name}’ 구간 클립 카드를 삭제할까요? 수업 영상 리스트에서도 삭제됩니다. 원본 영상과 가져온 자료는 유지됩니다.`)) return;
        library = CuriTeacher.deleteClip(library, record.id, state.revision); revision++;
        renderVideos();
        window.dispatchEvent(new Event('curi-segments-changed'));
        const section = document.querySelector(`.lesson-clip-list[data-segment-resource="${CSS.escape(record.resourceId)}"][data-segment-folder="${CSS.escape(record.folderId)}"]`);
        (section?.querySelector('[data-delete-clip]') || section?.querySelector('[data-create-clip]'))?.focus({ preventScroll: true });
        status('구간 클립 카드를 삭제했습니다.');
      } catch (error) { status(error.message); }
      return;
    }
    const addChoice = event.target.closest("[data-add-choice]");
    if (addChoice) {
      const card = addChoice.closest("[data-owner]"), folder = ownerById(card.dataset.owner);
      const entry = folder?.items.find((item) => item.resource.id === card.dataset.resource);
      if (!entry) return;
      if (entry.resource.selectionContexts.length >= 20) return status("한 자료에는 선택 이유를 20개까지 보존할 수 있습니다.");
      entry.resource.selectionContexts.push(CuriTeacher.newChoice(displayResource(entry.resource, folder), true));
      folder.updatedAt = new Date().toISOString(); saveOwner(folder); renderVideos();
      const last = document.querySelector(`[data-owner="${CSS.escape(folder.id)}"][data-resource="${CSS.escape(entry.resource.id)}"] .selection-context:last-of-type`);
      if (last) { last.open = true; last.querySelector("textarea")?.focus(); }
      return;
    }
    const opener = event.target.closest("[data-open-folder]");
    if (opener) return openFolder(opener.dataset.openFolder);
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    const folder = ownerById(button.closest("[data-owner]").dataset.owner);
    if (folder.isUnfiled) shelf = shelf.filter(item => item.id !== button.dataset.remove);
    else folder.items = folder.items.filter((entry) => entry.resource.id !== button.dataset.remove);
    folder.updatedAt = new Date().toISOString(); saveOwner(folder); renderFolders(); renderVideos();
  });
  let deletingFolderId = "";
  function requestFolderDeletion(id) {
    const folder = library.folders.find(item => item.id === id);
    if (!folder || library.loadError) return;
    deletingFolderId = id;
    $("#delete-folder-name").textContent = `‘${label(folder)}’ · ${folder.items.length}개 자료`;
    $("#delete-folder-error").textContent = "";
    $("#delete-folder-dialog").showModal();
    $("#cancel-delete-folder").focus();
  }
  $("#cancel-delete-folder").addEventListener("click", () => $("#delete-folder-dialog").close());
  $("#confirm-delete-folder").addEventListener("click", () => {
    const folder = library.folders.find(item => item.id === deletingFolderId);
    if (!folder) { $("#delete-folder-dialog").close(); return; }
    const deletingCurrent = view === "folder" && library.selectedId === folder.id;
    try {
      library = CuriTeacher.deleteFolder(library, folder.id);
    } catch (error) {
      $("#delete-folder-error").textContent = error.message;
      return;
    }
    dirty = false; revision++;
    if (deletingCurrent) {
      view = "all";
      history.replaceState(null, "", "?view=all");
      $("#video-search").value = "";
    }
    $("#delete-folder-dialog").close();
    render(); refreshConfirmations();
    window.dispatchEvent(new Event("curi-segments-changed"));
    status(`‘${label(folder)}’ 폴더와 폴더에 저장된 자료를 삭제했습니다.`);
    $("#show-all-materials").focus();
  });
  $("#export-folder").addEventListener("click", async () => {
    if (!current() || exporting) return;
    exporting = true; $("#export-folder").disabled = true;
    const snapshot = structuredClone(current()), startedRevision = revision;
    try {
      const latest = await CuriTeacher.refreshResources(snapshot.items.map((entry) => ({ ...entry.resource, teachingContext: null })));
      snapshot.items.forEach((entry, index) => { entry.resource = { ...latest[index], teachingContext: entry.resource.teachingContext || null }; });
      if (revision === startedRevision) {
        const index = library.folders.findIndex((folder) => folder.id === snapshot.id);
        if (index >= 0) { library.folders[index] = snapshot; save(); render(); }
      }
      const md = (value) => String(value || "").replace(/[\\`*_[\]<>#]/g, "\\$&");
      const lines = [`# ${md(label(snapshot))}`, "", `수업 대상: ${md(snapshot.targetGrade || "미지정")}`, `수업 노트: ${md(snapshot.note)}`, "", "방송일은 EBS 공개 목록 표기 기준이며 최초 방송일과 다를 수 있습니다.", ""];
      for (const standard of snapshot.curriculumStandards || []) lines.push(`폴더 교육과정: ${md(GradeContext.standardLabel(standard))} · ${md(standard.courseLabel)} · ${md(standard.text)} · ${md(standard.curriculumVersion)}`);
      if (snapshot.topic) lines.push(`이전 준비안 주제: ${md(snapshot.topic)}`, "");
      for (const entry of snapshot.items) {
        const item = CuriTeacher.withTeachingContext(entry.resource, folderContext(entry.resource, snapshot)), nav = destination(item);
        lines.push(`## ${md(item.title)}`, `프로그램: ${md(item.program)}`, `방송일: ${broadcastDateText(item)}`, `자료 열기: ${sourceLink(nav.url)}`, `링크 확인: ${md(nav.note)}`, `메모: ${md(entry.note)}`, ...CuriTeacher.evidenceMarkdown(item, md), ...CuriTeacher.materialCurriculum.markdown(entry.resource, md), ...CuriTeacher.selectionContextsMarkdown(item, md, snapshot), ...CuriSegments.markdown(item, snapshot.id, md), "");
        if (entry.legacy) lines.push(`이전 준비안 구분: ${md(entry.legacy.role)}`, `이전 발문: ${md(entry.legacy.question)}`, `이전 활동: ${md(entry.legacy.activity)}`, "");
      }
      CuriTeacher.download("curi-수업폴더.md", lines);
      status(dirty ? "폴더 목록을 내려받았습니다. 브라우저 저장은 실패했습니다." : "최신 링크·방송일을 확인해 폴더 목록을 내려받았습니다.");
    } catch { status("최신 자료 정보를 확인하지 못해 다운로드하지 않았습니다. 연결을 확인하고 다시 시도하세요."); }
    finally { exporting = false; $("#export-folder").disabled = false; }
  });
  $('#close-create-folder').addEventListener('click', () => {
    const panel = document.querySelector('.new-folder-panel');
    panel.open = false; panel.querySelector('summary').focus();
  });
  CuriTeacher.resourceActions.setup(() => ({ library, shelf, shelfStored, dirty:dirty || shelfDirty }), result => {
    library = result.library; shelf = result.shelf; revision++;
    shelfStored = localStorage.getItem('curi.discovery.shelf.v1');
    render(); refreshConfirmations();
  }, status);
  CuriTeacher.folderPicker.setup((id, button) => {
    if (dirty || shelfDirty) { status('먼저 다시 저장을 눌러 개인 기록을 저장하세요.'); return null; }
    const owner = ownerById(button.closest('[data-owner]')?.dataset.owner);
    return owner?.items.find(entry => entry.resource.id === id)?.resource || null;
  }, message => { library = CuriTeacher.readFolders(); render(); refreshConfirmations(); status(message); });
  const moreMenu = $('#library-more');
  moreMenu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { moreMenu.open = false; moreMenu.querySelector('summary').focus(); }
  });
  document.addEventListener('click', event => { if (!moreMenu.contains(event.target)) moreMenu.open = false; });
  $('#export-library').addEventListener('click', async () => {
    moreMenu.open = false;
    const button = $('#export-library'); button.disabled = true;
    const snapshot = structuredClone(sources()), resources = [...new Map(snapshot.flatMap(owner => owner.items.map(entry => [resourceKey(entry.resource), entry.resource]))).values()];
    try {
      const latest = new Map();
      for (let offset = 0; offset < resources.length; offset += 100) {
        for (const item of await CuriTeacher.refreshResources(resources.slice(offset, offset + 100))) latest.set(resourceKey(item), item);
      }
      const md = value => String(value || '').replace(/[\\`*_[\]<>#]/g, '\\$&');
      const lines = ['# Curi 내 수업 자료', '', '자료별 저장 위치와 개인 기록을 각각 보존한 목록입니다.', ''];
      for (const group of CuriTeacher.libraryView.groups(snapshot.flatMap(owner => owner.items.map((entry,index) => ({owner,entry,index}))))) {
        lines.push(`## ${md(group.resource.title)}`);
        for (const {owner,entry} of group.records) {
          const item = { ...entry.resource, ...(latest.get(resourceKey(entry.resource)) || {}), selectionContexts: entry.resource.selectionContexts };
          lines.push(`### ${md(label(owner))}`, `수업 폴더 노트: ${md(owner.note)}`, `폴더 목표: ${md(owner.lessonGoal)}`, ...(owner.curriculumStandards || []).map(standard => `폴더 교육과정: ${md(GradeContext.standardLabel(standard))} · ${md(standard.text)} · ${md(standard.curriculumVersion)}`), `자료 열기: ${sourceLink(destination(item).url)}`, `개인 메모: ${md(entry.note)}`, ...CuriTeacher.materialCurriculum.markdown(entry.resource,md), ...CuriTeacher.selectionContextsMarkdown(item,md,owner), ...CuriSegments.markdown(item,segmentFolder(owner),md));
        }
      }
      CuriTeacher.download('curi-내수업자료.md', lines); status('전체 자료의 위치별 개인 기록을 내려받았습니다.');
    } catch { status('자료 링크를 확인하지 못했습니다. 입력은 유지됩니다. 다시 내려받아 주세요.'); }
    finally { button.disabled = false; }
  });
  window.addEventListener("beforeunload", (event) => { if (dirty || shelfDirty) { event.preventDefault(); event.returnValue = ""; } });
  window.addEventListener("focus", refreshConfirmations);
  function reloadExtensionLibrary() {
    if (dirty || shelfDirty) { status("확장에서 자료가 추가되었습니다. 저장하지 못한 편집이 있으므로 현재 입력을 먼저 확인하세요."); return; }
    const next = CuriTeacher.readFolders();
    if (next.loadError) { status("변경된 수업 폴더를 읽지 못했습니다."); return; }
    library = next; shelf = CuriTeacher.readShelf(); revision++;
    shelfStored = localStorage.getItem('curi.discovery.shelf.v1');
    for (const item of shelf) item.selectionContexts = CuriTeacher.choicesFor(item);
    for (const folder of library.folders) for (const entry of folder.items) entry.resource.selectionContexts = CuriTeacher.choicesFor(entry.resource);
    render(); refreshConfirmations();
  }
  window.addEventListener("curi-library-changed", reloadExtensionLibrary);
  window.addEventListener("storage", event => {
    if ([CuriTeacher.foldersKey, "curi.discovery.shelf.v1"].includes(event.key)) reloadExtensionLibrary();
  });
  render();
  refreshConfirmations();
  CuriTeacher.curriculumSelection.load().catch(() => status("공식 교육과정 목록을 불러오지 못했습니다. 저장한 교육과정과 메모는 유지되며 다른 입력은 저장할 수 있습니다."));
  if (library.loadError) {
    $("#new-folder-title").disabled = true;
    $("#create-folder button").disabled = true;
    $("#save-folders").disabled = true;
    status("저장한 폴더를 읽지 못했습니다. 기존 데이터는 덮어쓰지 않았습니다. 페이지를 새로고침해 주세요.");
  } else if (library.needsMigration) {
    const saved = save();
    if (saved) status("이전 준비안의 자료·메모를 수업 폴더로 가져왔습니다. 이전 원본도 보존했습니다.");
  } else status(CuriTeacher.notices.join(" ") || (library.folders.length ? "" : "자료 찾기에서 자료를 가져오거나 새 수업 폴더를 만드세요."));
})();
