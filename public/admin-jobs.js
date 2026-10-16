(() => {
  const { $, element, labels } = CuriAdmin, key = "curi.admin.jobs.v1";
  let jobs = [], running = false, stop = false, storageFailed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(saved)) jobs = saved.filter((job) => job && typeof job.id === "string" && ["process", "source", "search"].includes(job.operation)).slice(0, 30)
      .map((job) => ({ ...job, status: job.status === "RUNNING" ? "UNKNOWN" : job.status }));
  } catch { storageFailed = true; }
  const completed = (job) => ["SUCCESS", "HELD", "BLOCKED"].includes(job.status);
  function persist() { try { localStorage.setItem(key, JSON.stringify(jobs)); storageFailed = false; } catch { storageFailed = true; } }
  function render() {
    $("#job-panel").hidden = !jobs.length;
    $("#job-summary").textContent = `${jobs.length}건 중 성공 ${jobs.filter((job) => job.status === "SUCCESS").length} · 보류/차단 ${jobs.filter((job) => ["HELD", "BLOCKED"].includes(job.status)).length} · 실패 ${jobs.filter((job) => job.status === "FAILED").length} · 재개 대상 ${jobs.filter((job) => !completed(job)).length}건${storageFailed ? " · 브라우저 저장 실패: 창을 닫으면 재개 목록이 사라질 수 있습니다." : " · 이 브라우저에 실행 대상·결과를 보존합니다."}`;
    $("#job-results").replaceChildren(...jobs.map((job) => {
      const item = element("li", `${job.title} · ${job.id} · ${job.subject || "교과 미지정"} · ${job.gradeBand || "초등 5~6학년군"}${job.standardId ? ` · 선택 기준 ${GradeContext.standardLabel({standardId:job.standardId,subject:job.subject})}` : ""} · ${job.operation === "source" ? "저장 출처 점검" : job.operation === "search" ? "검색 준비" : "자동 검사·저장"}`);
      item.append(element("p", `${({ PENDING: "대기", RUNNING: "처리 중", SUCCESS: "성공", HELD: "보류", BLOCKED: "차단", FAILED: "실패", UNKNOWN: "응답 미확인 · 재조회/재시도 필요" })[job.status] || job.status} · ${job.message || ""}`)); return item;
    }));
    $("#job-start").disabled = running || !jobs.some((job) => !completed(job));
    $("#job-stop").disabled = !running || stop; $("#job-clear").disabled = running;
    $("#job-start").textContent = jobs.some((job) => job.status !== "PENDING") ? "미완료·실패 건 재개" : "표시한 대상 실행";
  }
  function prepare(rows, operation, subject, runId, gradeBand = "초등 5~6학년군", standardId) {
    if (running || jobs.some((job) => !completed(job))) throw new Error("남은 작업을 재개하거나 ‘작업 목록 비우기’를 누른 뒤 새 작업을 준비하세요.");
    if (!rows.length || rows.length > 30) throw new Error("실행할 자료를 1~30개 선택하세요.");
    if (operation === "process" && !["사회", "과학"].includes(subject)) throw new Error("자동 검사에 사용할 교과를 선택하세요.");
    jobs = rows.map((row) => ({ id: row.id, title: row.title, contentCuriId: row.contentCuriId, subject, gradeBand, operation, runId,
      ...(operation === "process" && standardId ? { standardId } : {}),
      status: "PENDING", message: "명시적으로 실행하면 처리합니다." }));
    persist(); render(); $("#job-panel").scrollIntoView({ block: "nearest" });
  }
  async function start() {
    if (running) return;
    running = true; stop = false; render();
    for (const job of jobs) {
      if (stop) break; if (completed(job)) continue;
      job.status = "RUNNING"; job.message = job.operation === "source" ? "저장된 출처 조건 점검 중" : job.operation === "search" ? "검색 투영 재시도 중" : "서버 원본으로 후보 생성·근거 검사·자산 저장 중";
      persist(); render();
      try {
        const input = job.contentCuriId ? { contentCuriId: job.contentCuriId } : { resourceId: job.id };
        if (job.subject) input.subject = job.subject;
        if (job.operation === "process") input.gradeBand = job.gradeBand || "초등 5~6학년군";
        if (job.operation === "process" && job.standardId) input.standardId = job.standardId;
        const url = job.operation === "source" ? "/api/admin/source-check" : job.operation === "search" ? "/api/admin/automatic-assets/search" : "/api/admin/automatic-assets";
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job.operation === "search" ? { runId: job.runId } : input) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || `요청 실패 ${response.status}`);
        job.runId = result.runId || job.runId;
        if (job.operation === "source") {
          job.status = result.status === "PASS" ? "SUCCESS" : "FAILED";
          job.message = `${result.checks.filter((check) => check.status !== "PASS").map((check) => check.message).join(" / ") || "저장 출처 조건 통과"} · 도착 페이지 새 대조·사람 검토 아님`;
        } else if (["FAILED", "INTERRUPTED", "STALE"].includes(result.saveStatus)) {
          job.status = "FAILED"; job.message = labels[result.runs[0]?.error] || labels[result.saveStatus];
        } else if (result.searchPreparation?.status === "FAILED") {
          job.status = "FAILED"; job.operation = "search"; job.message = "자산 저장 성공 · 검색 준비 실패. 재개하면 검색 준비만 재시도합니다.";
        } else if (result.searchPreparation?.status === "RECHECK_REQUIRED") {
          job.status = "BLOCKED"; job.message = "변경·사람 결정으로 제공 중단. 상세의 현재 근거를 확인하세요.";
        } else if (result.relations?.some((relation) => relation.evidence.inspection.status === "FAIL")) {
          job.status = "FAILED"; job.message = "검사 결과 저장 완료 · 자동 구조 조건 실패. 상세에서 실패 조건을 확인하세요.";
        } else {
          job.status = result.searchPreparation?.ready ? "SUCCESS" : "HELD";
          job.message = result.searchPreparation?.ready ? `현재 검색 준비 ${result.searchPreparation.ready}관계${result.reused ? " · 기존 실행 재사용" : ""}` : "실행 저장 완료 · 공개 가능한 관계 없음. 상세의 보류 이유를 확인하세요.";
        }
      } catch (error) { job.status = "FAILED"; job.message = error.message; }
      persist(); render(); window.dispatchEvent(new Event("admin-action-complete"));
    }
    running = false; persist(); render();
  }
  $("#job-start").addEventListener("click", start);
  $("#job-stop").addEventListener("click", () => { stop = true; $("#job-summary").textContent = "현재 요청이 끝나면 중단합니다. 완료 건은 유지하고 남은 건만 재개합니다."; $("#job-stop").disabled = true; });
  $("#job-clear").addEventListener("click", () => { if (running) return; jobs = []; persist(); render(); });
  window.addEventListener("beforeunload", (event) => { if (running) { event.preventDefault(); event.returnValue = ""; } });
  CuriAdmin.jobs = { prepare, start, render, get running() { return running; } }; persist(); render();
})();
