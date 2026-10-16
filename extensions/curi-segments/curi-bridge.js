(() => {
  "use strict";
  const pending = new Map();
  let clipEnabled = false;
  const allowed = async () => {
    const configured = (await chrome.storage.local.get("curiOrigin")).curiOrigin || "http://localhost:3000";
    return location.origin === CuriSegmentCore.origin(configured) && location.pathname === "/lesson.html";
  };
  const refreshClipConnection = () => allowed().then(value => { clipEnabled = value; }).catch(() => { clipEnabled = false; });
  void refreshClipConnection();
  chrome.storage.onChanged?.addListener((changes, area) => { if (area === 'local' && changes.curiOrigin) void refreshClipConnection(); });
  // 실제 버튼 클릭에서 즉시 전달해 Chrome의 사이드 패널 사용자 동작 조건을 유지한다.
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-create-clip]');
    const section = button?.closest('.lesson-clip-list');
    if (!event.isTrusted || !clipEnabled || !section || button.disabled) return;
    const sourceUrl = CuriSegmentCore.publicUrl(section.dataset.segmentUrl);
    if (!sourceUrl) return;
    const id = crypto.randomUUID();
    button.dataset.extensionOpening = id;
    chrome.runtime.sendMessage({ type: 'CREATE_CLIP', sourceUrl, folderId: section.dataset.segmentFolder || '' })
      .then(result => window.postMessage({ channel: 'CURI_CLIP_LAUNCH', id, error: result?.error }, location.origin))
      .catch(error => window.postMessage({ channel: 'CURI_CLIP_LAUNCH', id, error: error.message }, location.origin));
  }, true);
  // 확인 링크는 확장 없이도 EBS로 열린다. 연결된 확장만 구간 재생으로 보강한다.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-clip-open]');
    if (!link || !event.isTrusted || !clipEnabled || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    let record;
    try {
      const records = JSON.parse(localStorage.getItem('curi.teacher.segments.v1') || '{"records":[]}').records;
      record = CuriSegmentCore.validate(records.find(value => value.id === link.dataset.clipOpen));
      if (!CuriSegmentCore.sameSource(record.sourceUrl, link.href)) return;
    } catch { return; }
    event.preventDefault();
    const section = link.closest('.lesson-clip-list'), status = section?.querySelector('[data-clip-status]');
    if (status) status.textContent = '저장한 구간으로 EBS를 여는 중입니다…';
    Promise.resolve().then(() => chrome.runtime.sendMessage({ type:'OPEN', record })).then(result => {
      if (result?.error || !result?.value?.opened) throw new Error(result?.error || '확장 프로그램의 열기 응답을 확인하지 못했습니다.');
      if (status?.isConnected) status.textContent = 'EBS 구간 재생 창을 열었습니다.';
    }).catch(error => {
      if (!status?.isConnected) return;
      status.textContent = error.message + ' ';
      const fallback = document.createElement('a');
      fallback.href = link.href; fallback.target = '_blank'; fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'EBS 직접 열기 ↗';
      status.append(fallback);
    });
  }, true);
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (sender.id !== chrome.runtime.id || m?.type !== "CURI_REQUEST" || !["LIST", "WORKSPACE", "CREATE_FOLDER", "DELETE_FOLDER", "IMPORT", "PING", "REGISTER", "UNDO_REGISTER"].includes(m.action)) return;
    allowed().then(ok => {
      if (!ok) return reply({ error: "설정된 Curi 주소와 다릅니다." });
      const id = crypto.randomUUID(), timer = setTimeout(() => { pending.delete(id); reply({ error: "Curi 확인이 지연됐습니다. 입력을 유지하고 다시 시도하세요." }); }, ["REGISTER", "LIST"].includes(m.action) ? 60000 : 15000);
      pending.set(id, { reply, timer });
      window.postMessage({ channel: "CURI_SEGMENTS_EXTENSION", id, action: m.action, value: m.value }, location.origin);
    }).catch(e => reply({ error: e.message }));
    return true;
  });
  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== location.origin || !event.data || !await allowed()) return;
    const m = event.data;
    if (m.channel === "CURI_SEGMENTS_APP") {
      const p = pending.get(m.id); if (!p) return;
      clearTimeout(p.timer); pending.delete(m.id); p.reply({ value: m.value, error: m.error });
    } else if (m.channel === "CURI_SEGMENTS_PAGE" && m.action === "OPEN") {
      try {
        const result = await chrome.runtime.sendMessage({ type: "OPEN", record: CuriSegmentCore.validate(m.value) });
        window.postMessage({ channel: "CURI_SEGMENTS_EXTENSION", action: "REPLY", id: m.id, ...result }, location.origin);
      } catch (e) { window.postMessage({ channel: "CURI_SEGMENTS_EXTENSION", action: "REPLY", id: m.id, error: e.message }, location.origin); }
    }
  });
})();
