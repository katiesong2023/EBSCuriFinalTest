(() => {
  "use strict";
  const $ = s => document.querySelector(s), core = CuriSegmentCore, store = CuriSegments;
  const escape = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  let targets = [], revision = null, editing = null, busy = false;
  const pending = new Map();
  const targetKey = t => `${t.folderId}/${t.resourceId}`;
  const selected = () => targets.find(t => targetKey(t) === $("#segment-target").value);
  const status = text => {
    $("#segment-status").textContent = $("#lesson-segment-status").textContent = text;
    // 구간 목록이 접혀 있어도 재생 요청과 연결 실패를 바로 확인할 수 있다.
    if ($("#save-status")) $("#save-status").textContent = text;
  };
  const receiptKey = "curi.teacher.extension-save.v1";
  function readReceipt() { try { return JSON.parse(localStorage.getItem(receiptKey) || "null"); } catch { return null; } }
  function rememberSave(value, notice, identity) {
    const receipt = { ...value, notice, identity, origin: location.origin, savedAt: new Date().toISOString() };
    try { localStorage.setItem(receiptKey, JSON.stringify(receipt)); } catch { /* 저장 자체의 성공은 유지하고 안내 기록만 보류한다. */ }
  }
  async function loadTargets() {
    // 기존 저장 형식을 변경하지 않고 현재 회차 URL·판본을 재확인한다.
    const shelf = JSON.parse(localStorage.getItem("curi.discovery.shelf.v1") || "[]");
    const library = JSON.parse(localStorage.getItem("curi.teacher.folders.v1") || '{"folders":[]}');
    if (!Array.isArray(shelf) || !Array.isArray(library.folders)) throw new Error("기존 개인 자료를 읽지 못했습니다.");
    const rows = [...shelf.map(item => ({ item, folderId: "", folderTitle: "내 자료" })), ...library.folders.flatMap(f => f.items.map(e => ({ item: e.resource, folderId: f.id, folderTitle: f.title || "이름 없는 수업" })))];
    const ids = [...new Set(rows.map(r => r.item?.id).filter(id => /^[A-Za-z0-9_-]{1,100}$/.test(id)))];
    const current = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      const response = await fetch(`/api/curi/discover/resources?${new URLSearchParams({ ids: ids.slice(i,i+100).join(",") })}`, { signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.resources)) throw new Error("현재 회차를 재확인하지 못했습니다. 입력을 유지하고 다시 시도하세요.");
      data.resources.forEach(r => current.set(r.id, r));
    }
    targets = rows.flatMap(({ item, folderId, folderTitle }) => {
      const fresh = current.get(item.id), url = fresh?.navigation?.url;
      const oldUrl = item.navigation?.url || item.sourceUrl;
      if (!fresh || !core.identity(url) || core.identity(url) !== core.identity(oldUrl) || (item.variant || "") !== (fresh.variant || "") || fresh.title !== item.title) return [];
      return [{ resourceId: item.id, folderId, folderTitle, title: fresh.title, sourceUrl: url, variant: fresh.variant || "" }];
    });
    const previous = $("#segment-target").value;
    $("#segment-target").innerHTML = targets.map(t => `<option value="${escape(targetKey(t))}">${escape(t.folderTitle)} · ${escape(t.title)}</option>`).join("");
    const wanted = targets.find(t => t.resourceId === params.get("resource") && t.folderId === (params.get("folder") || ""));
    if (targets.some(t => targetKey(t) === previous)) $("#segment-target").value = previous;
    else if (wanted) $("#segment-target").value = targetKey(wanted);
    if (!targets.length) status("연결할 지원 EBS 회차가 개인 자료에 없습니다. 먼저 자료 찾기에서 내 자료나 폴더에 담아 주세요.");
    render();
    return targets;
  }
  function render() {
    const t = selected(), state = store.read();
    if (revision === null) revision = state.revision;
    $("#segment-original").hidden = !t;
    if (t) $("#segment-original").href = t.sourceUrl;
    $("#target-note").textContent = t ? `${t.folderTitle}에 저장 · ${t.title} · 회차/판본 재확인됨` : "연결할 자료 없음";
    $("#segment-save").disabled = !t || busy;
    const records = t ? state.records.filter(r => r.resourceId === t.resourceId && r.folderId === t.folderId) : [];
    $("#segment-list").innerHTML = records.length ? records.map(r => `<article class="segment-row"><h3>${escape(r.name)}</h3><p>${core.time(r.start)}~${core.time(r.end)} · 길이 ${core.time(r.end-r.start)} · ${r.capture === "PLAYER" ? "플레이어에서 지정" : "직접 입력"}</p><p>${escape(r.note)}</p><button type="button" data-play="${escape(r.id)}">저장 구간 보기</button><button type="button" data-edit="${escape(r.id)}">편집</button><button type="button" data-delete="${escape(r.id)}">구간 삭제</button><a href="${escape(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">원본 영상 ↗</a></article>`).join("") : "<p>저장한 구간이 없습니다.</p>";
    $("#lesson-segment-items").innerHTML = state.records.length ? state.records.map(r => {
      const target = targets.find(t => t.resourceId === r.resourceId && t.folderId === r.folderId);
      return `<article class="segment-row"><h3>${escape(r.name)}</h3><p>${escape(target ? `${target.folderTitle} · ${target.title}` : "현재 자료 연결 미확인")} · ${core.time(r.start)}~${core.time(r.end)}</p><p>${escape(r.note)}</p><button type="button" data-overview-play="${escape(r.id)}" ${target ? "" : "disabled"}>저장 구간 보기</button><button type="button" data-overview-edit="${escape(r.id)}" ${target ? "" : "disabled"}>구간 편집</button></article>`;
    }).join("") : "<p>확장 프로그램에서 영상 구간을 저장하면 여기에 표시됩니다.</p>";
  }
  function reset() {
    editing = null; $("#segment-form").reset(); $("#edit-heading").textContent = "구간 추가";
    revision = store.read().revision;
  }
  function requestExtension(action, value) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("확장 프로그램 연결 응답이 없습니다. 내 수업 자료 페이지를 새로고침한 뒤 ‘저장 구간 보기’를 다시 누르세요. 계속 실패하면 Chrome 확장 관리에서 Curi가 켜져 있는지 확인하세요. 저장한 구간은 유지됩니다.")); }, 8000);
      pending.set(id, { resolve, reject, timer });
      window.postMessage({ channel: "CURI_SEGMENTS_PAGE", id, action, value }, location.origin);
    });
  }
  async function play(id) {
    try {
      const wanted = selected();
      await loadTargets();
      const record = store.read().records.find(r => r.id === id), t = targets.find(t => wanted && targetKey(t) === targetKey(wanted));
      if (!record || !t || record.resourceId !== t.resourceId || record.folderId !== t.folderId || core.identity(record.sourceUrl) !== core.identity(t.sourceUrl) || record.variant !== t.variant) throw new Error("현재 회차/판본과 구간 기록이 다릅니다. 원본을 확인하세요.");
      status(`EBS 열기 요청 · ${record.name} ${core.time(record.start)}~${core.time(record.end)}`);
      await requestExtension("OPEN", record);
      status("EBS 구간 재생 창을 열었습니다. 실제 이동/재생 상태는 확장 프로그램의 영상 위 안내에서 확인하세요.");
    } catch (error) { status(error.message); }
  }
  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== location.origin || !event.data || event.data.channel !== "CURI_SEGMENTS_EXTENSION") return;
    const m = event.data;
    if (m.action === "REPLY") {
      const p = pending.get(m.id); if (!p) return;
      clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(m.value); return;
    }
    if (!["LIST", "WORKSPACE", "CREATE_FOLDER", "DELETE_FOLDER", "IMPORT", "PING", "REGISTER", "UNDO_REGISTER"].includes(m.action) || typeof m.id !== "string") return;
    try {
      if (busy) throw new Error("저장/확인 중입니다. 잠시 후 다시 시도하세요.");
      busy = true;
      let value;
      if (m.action === "PING") value = { origin: location.origin, protocol: 4 };
      else if (m.action === "WORKSPACE") value = { revision:store.read().revision, lastSave:readReceipt(), ...(await CuriExtensionLibrary.list()) };
      else if (m.action === "CREATE_FOLDER") {
        value = await CuriExtensionLibrary.createFolder(m.value);
        rememberSave(value, `‘${value.folderTitle}’ 폴더를 내 수업 자료에 만들었습니다.`, null);
      }
      else if (m.action === 'DELETE_FOLDER') { value = await CuriExtensionLibrary.deleteFolder(m.value); loadTargets().catch(() => {}); }
      else if (m.action === "UNDO_REGISTER") { value = {revision:store.read().revision,...(await CuriExtensionLibrary.undoRegister(m.value))}; await loadTargets(); status("담기를 되돌렸어요."); }
      else if (m.action === "REGISTER") {
        value = await CuriExtensionLibrary.register(m.value);
        const r = value.resource;
        if (r && !targets.some(t=>t.resourceId===r.id && t.folderId===value.folderId)) targets.push({resourceId:r.id,folderId:value.folderId,folderTitle:value.folderTitle,title:r.title,sourceUrl:r.navigation?.url || r.sourceUrl,variant:r.variant || ''});
        loadTargets().catch(()=>{});
        const notice = "내 수업 페이지와 CuriBase에 저장되었습니다. 다음 자료 검색에서 사용할 수 있습니다." + (value.refreshWarning ? " 목록 재확인은 페이지를 새로고침해 주세요." : "");
        status(notice);
        rememberSave(value, notice, core.identity(m.value.video.sourceUrl));
      }
      else {
        await loadTargets();
        if (m.action === "LIST") value = { targets, revision: store.read().revision, lastSave: readReceipt(), ...(await CuriExtensionLibrary.list()) };
        else {
          const record = core.validate(m.value.record), state = store.read();
          const t = targets.find(t => t.resourceId === record.resourceId && t.folderId === record.folderId);
          if (!t || core.identity(t.sourceUrl) !== core.identity(record.sourceUrl) || record.variant !== t.variant) throw new Error("현재 개인 자료의 회차/판본과 다릅니다. 자료를 다시 연결하세요.");
          const old = state.records.find(r => r.id === record.id);
          // 응답을 놓친 저장의 재시도만 같은 기록으로 인정한다.
          if (old && JSON.stringify(core.validate(old)) === JSON.stringify(record)) value = { saved: true, id: record.id, revision: state.revision };
          else value = { saved: true, id: record.id, revision: store.write(record, m.value.revision).revision };
          status("");
          rememberSave({ ...value, folderId: record.folderId, folderTitle: t.folderTitle }, "내 수업 페이지에 구간이 저장되었습니다.", core.identity(record.sourceUrl));
        }
      }
      window.postMessage({ channel: "CURI_SEGMENTS_APP", id: m.id, value }, location.origin);
    } catch (error) {
      window.postMessage({ channel: "CURI_SEGMENTS_APP", id: m.id, error: error.message }, location.origin);
    } finally { busy = false; try { render(); } catch (error) { status(error.message); $("#segment-save").disabled = true; } }
  });
  $("#segment-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const original = selected(), baseRevision = revision;
    if (!original) return;
    busy = true; $("#segment-save").disabled = true;
    try {
      await loadTargets();
      const t = targets.find(t => targetKey(t) === targetKey(original));
      if (!t) throw new Error("현재 자료 연결을 확인하지 못했습니다.");
      const record = { ...t, id: editing?.id || crypto.randomUUID(), start: $("#segment-start").value, end: $("#segment-end").value,
        name: $("#segment-name").value, note: $("#segment-note").value, duration: editing?.duration ?? null, capture: "MANUAL" };
      store.write(record, baseRevision); reset(); status("");
    } catch (error) { status(error.message); }
    finally { busy = false; render(); }
  });
  $("#segment-list").addEventListener("click", event => {
    const button = event.target.closest("[data-play], [data-edit], [data-delete]"); if (!button) return;
    const id = button.dataset.play || button.dataset.edit || button.dataset.delete;
    const record = store.read().records.find(r => r.id === id); if (!record) return;
    if (button.dataset.play) return void play(id);
    if (button.dataset.edit) {
      editing = record; revision = store.read().revision;
      $("#segment-name").value = record.name; $("#segment-note").value = record.note;
      $("#segment-start").value = core.time(record.start); $("#segment-end").value = core.time(record.end);
      $("#edit-heading").textContent = "구간 편집"; $("#segment-name").focus();
    } else if (confirm(`‘${record.name}’ 구간을 삭제할까요? 원본 영상과 자료는 유지됩니다.`)) {
      try { store.write(record, revision, true); reset(); render(); status("구간을 삭제했습니다."); } catch (error) { status(error.message); }
    }
  });
  $("#segment-target").addEventListener("change", () => { reset(); render(); });
  $("#segment-reset").addEventListener("click", () => { reset(); render(); });
  $("#close-segment-dialog").addEventListener("click", () => $("#segment-dialog").close());
  function selectRecord(record) {
    const target = targets.find(t => t.resourceId === record.resourceId && t.folderId === record.folderId);
    if (!target) throw new Error("현재 연결 자료를 확인하지 못했습니다.");
    $("#segment-target").value = targetKey(target); reset(); render();
  }
  function editRecord(record) {
    selectRecord(record); editing = record;
    $("#segment-name").value = record.name; $("#segment-note").value = record.note;
    $("#segment-start").value = core.time(record.start); $("#segment-end").value = core.time(record.end);
    $("#edit-heading").textContent = "구간 편집";
    $("#segment-dialog").showModal(); $("#segment-name").focus();
  }
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-overview-play], [data-overview-edit], [data-set-segment]");
    const anchor = event.target.closest(".saved-segments a");
    if (!button && !anchor) return;
    if (anchor && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    event.preventDefault();
    try {
      await loadTargets();
      if (button?.hasAttribute('data-set-segment')) {
        const target = targets.find(t => t.resourceId === button.dataset.setSegment && t.folderId === button.dataset.segmentFolder);
        if (!target) throw new Error("이 자료의 사용 구간을 설정할 수 있는 현재 회차를 확인하지 못했습니다.");
        $('#segment-target').value = targetKey(target); reset(); render();
        $('#segment-dialog').showModal(); $('#segment-name').focus();
      } else if (button) {
        const record = store.read().records.find(r => r.id === (button.dataset.overviewPlay || button.dataset.overviewEdit));
        if (!record) throw new Error("구간을 다시 확인하세요.");
        if (button.dataset.overviewPlay) { selectRecord(record); await play(record.id); }
        else editRecord(record);
      } else {
        const query = new URL(anchor.href).searchParams;
        const target = targets.find(t => t.resourceId === query.get("resource") && t.folderId === (query.get("folder") || ""));
        if (!target) throw new Error("현재 연결 자료를 확인하지 못했습니다.");
        $("#segment-target").value = targetKey(target); reset(); render();
        if (query.get("segment")) await play(query.get("segment"));
        else $("#segment-dialog").showModal();
      }
    } catch (error) { status(error.message); }
  });
  window.addEventListener("curi-segments-changed", () => {
    revision = null;
    loadTargets().catch(error => status(error.message));
  });
  window.addEventListener("storage", e => {
    if (e.key === receiptKey) return;
    if ([store.key, "curi.discovery.shelf.v1", "curi.teacher.folders.v1"].includes(e.key)) {
      if ($("#segment-dialog").open) status("다른 창의 변경이 있습니다. 입력을 보존했습니다. 편집 내용을 다시 확인하세요.");
      loadTargets().catch(error => status(error.message));
    }
  });
  loadTargets().then(() => {
    const id = params.get("segment");
    if (id) play(id);
    else if (params.get("resource") && targets.length) $("#segment-dialog").showModal();
  }).catch(error => status(error.message));
})();
