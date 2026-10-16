(() => {
  "use strict";
  const key = "curi.teacher.segments.v1", core = CuriSegmentCore;
  const read = () => {
    const raw = localStorage.getItem(key);
    const value = raw === null ? { revision: 0, records: [] } : JSON.parse(raw);
    if (!Number.isInteger(value.revision) || !Array.isArray(value.records)) throw new Error("구간 저장 내용을 읽지 못했습니다. 원본을 보존하고 저장을 멈췄습니다.");
    // 이전 소수 초 기록도 같은 정수 초 기준으로 표시하되 원본 저장 문자열은 유지한다.
    value.records = value.records.map(record => ({ ...record, ...core.validate(record) }));
    return value;
  };
  function write(record, revision, remove = false) {
    const state = read(), previous = state.records.find(r => r.id === record.id);
    if (revision !== state.revision) throw new Error("다른 창에서 구간이 변경됐습니다. 목록을 다시 확인한 뒤 저장하세요.");
    const next = remove ? null : core.validate(record);
    if (previous && (previous.resourceId !== record.resourceId || previous.folderId !== record.folderId)) throw new Error("구간의 연결 자료를 바꿀 수 없습니다.");
    if (!previous && state.records.length >= 2000) throw new Error("구간은 2,000개까지 저장할 수 있습니다.");
    const now = new Date().toISOString();
    const index = state.records.findIndex(r => r.id === record.id);
    if (remove) state.records = state.records.filter(r => r.id !== record.id);
    else {
      const saved = { ...next, createdAt: previous?.createdAt || now, updatedAt: now };
      if (index < 0) state.records.push(saved);
      else state.records[index] = saved;
    }
    state.revision++;
    localStorage.setItem(key, JSON.stringify(state));
    window.dispatchEvent(new Event("curi-segments-changed"));
    return state;
  }
  function forResource(item, folderId = "") {
    return read().records.filter(r => r.resourceId === item.id && r.folderId === folderId);
  }
  function reorder(id, beforeId, revision) {
    const raw=localStorage.getItem(key), state=read();
    if(state.revision!==revision)throw new Error('다른 창에서 구간이 변경됐어요. 새로고침해 주세요.');
    const record=state.records.find(r=>r.id===id),target=state.records.find(r=>r.id===beforeId);
    if(!record||!target||record.folderId!==target.folderId||record.resourceId!==target.resourceId)throw new Error('같은 자료의 장면끼리 순서를 바꿀 수 있어요.');
    if(id===beforeId)return state;
    state.records=state.records.filter(r=>r.id!==id);
    state.records.splice(state.records.findIndex(r=>r.id===beforeId),0,record);
    if(localStorage.getItem(key)!==raw)throw new Error('다른 창에서 구간이 변경됐어요. 다시 시도해 주세요.');
    state.revision++;
    localStorage.setItem(key,JSON.stringify(state));
    window.dispatchEvent(new Event('curi-segments-changed'));
    return state;
  }
  function markdown(item, folderId = "", escape = v => String(v || "")) {
    return forResource(item, folderId).flatMap(r => [`- 수업용 구간: ${escape(r.name)} · ${core.time(r.start)}~${core.time(r.end)} (${core.time(r.end - r.start)})`,
      `  - 원본: ${r.sourceUrl}`, `  - 메모: ${escape(r.note)}`, "  - 시점 이동·끝 정지는 Curi 확장 프로그램이 연결된 지원 플레이어에서 사용"]);
  }
  globalThis.CuriSegments = { key, read, write, forResource, markdown, reorder };
})();
