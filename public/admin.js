(() => {
  const { $, element, link, states, date, adminUrl } = CuriAdmin;
  let page = 1, pages = 1, revision = 0, selected = new Map(), lastListing;
  function setUrl(values) { const url = new URL(location.href); for (const [key, value] of Object.entries(values)) value ? url.searchParams.set(key, value) : url.searchParams.delete(key); history.pushState(null, "", url); load(); }
  $("#filter-form").addEventListener("submit", (event) => { event.preventDefault(); setUrl({ id: "", cursor: "", q: $("#query").value, filter: $("#filter").value, sort: $("#sort").value, page: "1" }); });
  $("#previous").addEventListener("click", () => setUrl({ page: String(page - 1) }));
  $("#next").addEventListener("click", () => setUrl({ page: String(page + 1) }));
  $("#retry").addEventListener("click", load);
  window.addEventListener("popstate", load);
  const refreshAfterAction = () => { if (!CuriAdmin.human?.dirty) load(); else $("#request-status").textContent = "저장 상태가 변경되었습니다. 미저장 사람 입력을 유지하며 상세 이력에서 다시 확인하세요."; };
  window.addEventListener("admin-action-complete", refreshAfterAction); window.addEventListener("human-decision-saved", refreshAfterAction);
  $("#select-page").addEventListener("click", () => { for (const row of lastListing?.results || []) if (row.automaticAllowed && selected.size < 30) selected.set(row.id, row); renderSelection(); });
  $("#clear-selection").addEventListener("click", () => { selected.clear(); renderSelection(); });
  $("#prepare-batch").addEventListener("click", () => {
    try { CuriAdmin.jobs.prepare([...selected.values()], $("#batch-operation").value, $("#batch-subject").value, undefined, $("#batch-grade").value); }
    catch (error) { $("#batch-status").textContent = error.message; }
  });
  function renderSelection() {
    $("#selection-count").textContent = `선택 ${selected.size}/30자료 · 페이지를 옮겨도 선택 유지`;
    $("#resources").querySelectorAll('[data-select]').forEach((checkbox) => { checkbox.checked = selected.has(checkbox.dataset.select); });
    $("#prepare-batch").disabled = !selected.size;
  }
  async function load() {
    CuriAdmin.human?.reset();
    const current = ++revision, params = new URLSearchParams(location.search), detail = params.has("id");
    $("#list-view").hidden = detail; $("#detail-view").hidden = !detail;
    $("#request-status").textContent = "관리 자료를 불러오는 중입니다."; $("#retry").hidden = true;
    $("#query").value = params.get("q") || ""; $("#filter").value = params.get("filter") || "all"; $("#sort").value = params.get("sort") || "priority";
    $("#resources").replaceChildren(); $("#detail-content").replaceChildren(); $("#detail-title").textContent = "";
    $("#previous").disabled = true; $("#next").disabled = true;
    $("#back-to-list").href = adminUrl(null);
    try {
      const response = await fetch(`/api/admin/workspace?${params}`), result = await response.json();
      if (!response.ok) throw new Error(result.error || "관리 자료를 읽지 못했습니다."); if (current !== revision) return;
      if (detail) CuriAdmin.renderDetail(result); else renderList(result);
      $("#request-status").textContent = detail ? "자료 상세를 불러왔습니다." : "현재 저장된 자료와 자동 검사·사람 검토 상태입니다.";
    } catch (error) { if (current !== revision) return; $("#request-status").textContent = `${error.message} 다시 불러오거나 목록에서 자료를 선택하세요.`; $("#retry").hidden = false; }
  }
  function renderList(data) {
    page = data.page; pages = data.pages; lastListing = data;
    const url = new URL(location.href); url.searchParams.set("page", String(page)); history.replaceState(null, "", url);
    $("#metrics").replaceChildren(...[["all", "검색 범위 자료"], ["exceptions", "오류·변경·실패"], ["new", "자동 미처리"], ["text", "원문 보강"], ["passed", "자동 공개 조건 통과"], ["held", "검사 보류"], ["review", "선택적 사람 검토"], ["approved", "사람 승인 보유"]].map(([key, title]) => {
      const target = new URL(location.href); target.searchParams.set("filter", key); target.searchParams.set("page", "1");
      const node = link(title, target.pathname + target.search); node.className = "metric"; node.append(element("strong", `${data.counts[key].toLocaleString()}자료`)); return node;
    }));
    $("#count-explanation").textContent = `전체 관리 ${data.statistics.allResources.toLocaleString()}자료 중 검색어 범위 ${data.statistics.queryResources.toLocaleString()}자료 · 최신 후보 ${data.statistics.latestRelations}관계 · 실행 이력 ${data.statistics.executions}회 · 현재 자동 공개 ${data.statistics.currentAutomaticAssets}관계. ${data.statistics.note}`;
    $("#collection-status").replaceChildren(element("p", `방송 수집 ${data.collection.total.toLocaleString()} ID · 프로그램 표시명 ${data.collection.programs}개 · 소개문 값 ${data.collection.withDescription || 0}건 (제목 반복 포함)`));
    for (const row of data.collection.failedPages) $("#collection-status").append(element("p", `${row.job} · ${row.status} · ${row.error || "상세 없음"} · ${row.fetched_at}`));
    $("#ingestion-runs").replaceChildren(element("h3", "최근 가져오기"));
    for (const run of data.ingestionRuns) $("#ingestion-runs").append(element("p", `${run.runId} · ${run.status} · ${run.completedAt || run.startedAt || ""}`));
    $("#list-summary").textContent = `${data.total.toLocaleString()}자료 · ${data.policy}`;
    $("#resources").replaceChildren(...data.results.map((row, index) => {
      const node = element("article", null, "resource"); node.dataset.id = row.id;
      const label = element("label", "일괄 작업에 선택 "), checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.dataset.select = row.id; checkbox.disabled = !row.automaticAllowed;
      checkbox.addEventListener("change", () => { if (checkbox.checked && selected.size < 30) selected.set(row.id, row); else selected.delete(row.id); renderSelection(); }); label.prepend(checkbox);
      node.append(label, element("p", `${row.program || "프로그램 미확인"} · ${row.id}`, "muted"), element("h3", row.title), states(row),
        element("p", row.work.reasons.map((reason) => reason.label).join(" · "), "work-reasons"),
        element("p", `영향 기준: ${row.work.automatic.affectedStandards.join(" · ") || "해당 없음/후보 없음"}`),
        element("p", `최근 검사 ${date(row.work.automatic.lastCheckedAt)} · 원문 변경/수집 기록 ${date(row.work.changedAt)}`, "muted"),
        element("p", `다음 조치: ${row.work.nextAction}`), link("원문·자동 근거·처리 상세 →", adminUrl(row.id, (page - 1) * 30 + index)));
      return node;
    }));
    if (!data.total) $("#resources").append(element("p", "해당 조건의 자료가 없습니다. 검색어·상태 필터를 확인하세요."));
    $("#page-label").textContent = `${page} / ${pages}`; $("#previous").disabled = page <= 1; $("#next").disabled = page >= pages; renderSelection();
  }
  load();
})();
