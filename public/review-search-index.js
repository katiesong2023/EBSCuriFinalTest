function createSearchIndexUi({ getInput, setBusy }) {
  const button = document.querySelector("#prepare-search-index");
  const message = document.querySelector("#search-index-status");
  const details = document.querySelector("#search-index-details");
  let available = false;
  let loading = false;
  let sequence = 0;

  function updateButton() { button.disabled = !available || loading; }
  function show(state, text) { message.dataset.state = state; message.textContent = text; }
  function render(status) {
    const labels = { NOT_SAVED: "최신 사람 승인·수정 결과를 먼저 CuriBase에 저장하세요.",
      PENDING: "검색 준비 전입니다. 검색 준비·재시도를 누르세요.",
      RUNNING: "검색 준비 중입니다. 잠시 후 새로고침해 확인하세요.",
      INTERRUPTED: "이전 검색 준비가 중단되었습니다. 검색 준비·재시도를 누르세요.",
      FAILED: "검색 준비에 실패했습니다. CuriBase 저장 결과는 유지됩니다.",
      READY: `검색 준비 완료 · ${status.indexedCount}개 검증 관계` };
    show(status.ready ? "success" : ["FAILED", "INTERRUPTED"].includes(status.state) ? "error" : "idle",
      labels[status.state] ?? "검색 상태를 확인하지 못했습니다.");
    details.replaceChildren();
    const run = status.lastRun;
    if (run) {
      const usage = run.usage;
      const line = document.createElement("p");
      line.textContent = `최근 실행: ${run.status} · 새 임베딩 ${usage.embeddedDocuments}건 · 재사용 ${usage.reusedDocuments}건 · 입력 ${usage.inputTokens}토큰 · 외부 API 호출 ${usage.externalApiCalls}회`;
      details.append(line);
      if (usage.truncatedDocuments) {
        const note = document.createElement("p");
        note.textContent = `최근 실행 ${usage.truncatedDocuments}건은 모델 입력 한도(512토큰)까지 색인했습니다. 원문 전체는 CuriBase에 보존됩니다.`;
        details.append(note);
      }
      if (status.state !== "READY" && run.error) {
        const error = document.createElement("p"); error.textContent = run.error; details.append(error);
      }
    }
    button.textContent = status.ready ? "검색 준비 상태 재확인" : "검색 준비·재시도";
  }

  async function request(contentCuriId, input) {
    const current = ++sequence;
    loading = true;
    updateButton();
    show("loading", input ? "검색 자료를 준비하고 있습니다. 최초 실행은 모델 다운로드로 시간이 걸릴 수 있습니다." : "검색 준비 상태를 확인하고 있습니다.");
    try {
      const response = await fetch(input ? "/api/curibase/search-index" :
        `/api/curibase/search-index?contentCuriId=${encodeURIComponent(contentCuriId)}`, input ? {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
        } : undefined);
      const status = await response.json().catch(() => ({}));
      if (!response.ok || !status.state) throw new Error(status.error ??
        "검색 준비 상태를 읽지 못했습니다. 서버를 Ctrl+C로 종료하고 npm start로 다시 실행한 뒤 새로고침하세요.");
      if (current === sequence) render(status);
    } catch (error) {
      if (current === sequence) { details.replaceChildren(); show("error", error.message); }
    } finally {
      if (current === sequence) { loading = false; updateButton(); }
    }
  }

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    const input = getInput();
    setBusy(true);
    try { await request(input.contentCuriId, input); } finally { setBusy(false); }
  });
  return {
    refresh: (id) => request(id),
    prepare: (input) => request(input.contentCuriId, input),
    setAvailable(value) { available = value; updateButton(); },
    clear() { sequence += 1; available = false; loading = false; details.replaceChildren();
      show("idle", "CuriBase 저장 상태를 확인한 뒤 검색을 준비할 수 있습니다."); updateButton(); }
  };
}
