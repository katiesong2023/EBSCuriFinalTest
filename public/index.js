(() => {
  const form = document.querySelector("#search-form");
  const queryInput = document.querySelector("#query-input");
  const gradeFilter = document.querySelector("#grade-filter");
  const subjectFilter = document.querySelector("#subject-filter");
  const sortSelect = document.querySelector("#sort-select");
  const submit = document.querySelector("#search-submit");
  const status = document.querySelector("#search-status");
  const summary = document.querySelector("#result-summary");
  const sortSummary = document.querySelector("#sort-summary");
  const results = document.querySelector("#results-content");
  const pagination = document.querySelector("#pagination");
  const applied = document.querySelector("#applied-conditions");
  const warnings = document.querySelector("#condition-warnings");
  const sortLabels = { relevance: "관련도순", newest: "최신 방송순", oldest: "오래된 방송순" };
  let requestId = 0;
  let controller;
  let submitted;

  form.addEventListener("submit", (event) => { event.preventDefault(); search(); });
  sortSelect.addEventListener("change", () => { if (queryInput.value.trim()) search(); });
  queryInput.addEventListener("input", resetForEdit);
  gradeFilter.addEventListener("change", resetForEdit);
  subjectFilter.addEventListener("change", resetForEdit);

  function resetForEdit() {
    requestId += 1;
    controller?.abort();
    submitted = null;
    setBusy(false);
    setStatus("idle", "조건이 변경되었습니다. 검색을 눌러 결과를 확인하세요.");
    applied.textContent = "검색 후 해석된 조건이 표시됩니다.";
    warnings.replaceChildren(); warnings.hidden = true;
    summary.textContent = "검색을 기다리고 있습니다.";
    pagination.replaceChildren();
    showMessage("수업 주제로 검색하세요", "학년군과 교과를 함께 입력하거나 필터에서 선택할 수 있습니다.");
  }

  async function search(page = 1, { updateHistory = true } = {}) {
    const input = page === 1 || !submitted ? {
      query: queryInput.value.trim(), grade: gradeFilter.value, subject: subjectFilter.value, sort: sortSelect.value
    } : submitted;
    if (!input.query) { resetForEdit(); setStatus("error", "수업 질의를 입력하세요."); return; }
    submitted = { ...input };
    if (updateHistory) history.pushState(null, "", `${location.pathname}?${new URLSearchParams({ ...input, page: String(page) })}`);
    controller?.abort();
    const currentController = new AbortController();
    controller = currentController;
    const id = ++requestId;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; currentController.abort(); }, 190000);
    setBusy(true);
    pagination.replaceChildren();
    warnings.replaceChildren(); warnings.hidden = true;
    applied.textContent = "입력한 조건을 확인하고 있습니다.";
    summary.textContent = "검색 중입니다.";
    sortSummary.textContent = sortLabels[input.sort];
    setStatus("loading", "검증된 콘텐츠를 검색하고 있습니다. 첫 검색은 잠시 걸릴 수 있습니다.");
    showMessage("검색하고 있습니다", "수업 주제와 교육과정의 관련성을 확인하고 있습니다.", true);
    try {
      const parameters = new URLSearchParams({ ...input, page: String(page) });
      const response = await fetch(`/api/curi/search?${parameters}`, { signal: currentController.signal, cache: "no-store" });
      if (response.status === 404) throw new Error("검색 API를 찾지 못했습니다. 서버를 종료하고 npm start로 재시작하세요.");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "검색에 실패했습니다. 다시 검색하세요.");
      if (id !== requestId) return;
      history.replaceState(null, "", `${location.pathname}?${new URLSearchParams({ ...input, page: String(payload.page || page) })}`);
      render(payload);
    } catch (error) {
      if (id !== requestId) return;
      const message = timedOut ? "검색 대기 시간을 초과했습니다. 잠시 후 다시 검색하세요." :
        error.name === "TypeError" ? "서버에 연결하지 못했습니다. 서버 실행 상태를 확인하고 다시 검색하세요." : error.message;
      applied.textContent = "검색 실패로 적용 조건을 확인하지 못했습니다.";
      summary.textContent = "검색을 완료하지 못했습니다.";
      setStatus("error", message);
      showMessage("검색에 실패했습니다", message);
    } finally {
      clearTimeout(timeout);
      if (id === requestId) setBusy(false);
    }
  }

  function render(payload) {
    const sourceLabels = { explicit: "직접 선택", query: "질의에서 해석", all: "제한 없음", unresolved: "확인 필요" };
    applied.textContent = [["학년군", payload.applied.grade], ["교과", payload.applied.subject]]
      .map(([label, condition]) => `${label}: ${condition.courses?.length > 1 ? condition.grades.map((grade) => `${grade.schoolLevel} ${grade.grade}학년`).join(" 또는 ") : condition.value === "all" ? "전체" : condition.value} (${sourceLabels[condition.source]})`).join(" · ");
    warnings.replaceChildren(...payload.warnings.map((message) => element("li", message)));
    warnings.hidden = payload.warnings.length === 0;
    results.replaceChildren();
    pagination.replaceChildren();
    if (payload.state === "NEEDS_CLARIFICATION") {
      summary.textContent = "검색 조건 확인이 필요합니다.";
      setStatus("warning", "적용 조건의 안내를 확인하고 질의나 필터를 수정한 뒤 다시 검색하세요.");
      showMessage("검색 조건을 확인해주세요", payload.clarificationMessage || "학교급이 모호하거나 지원하지 않는 학년·교과 조건이 있습니다.");
      return;
    }
    summary.textContent = `기준을 통과한 결과 ${payload.total}건 · 10개씩 표시`;
    setStatus("success", payload.total ? "검증 자료 검색을 완료했습니다." : "조건과 연관도 기준을 통과한 콘텐츠가 없습니다.");
    if (!payload.total) {
      showMessage("조건에 맞는 콘텐츠가 아직 없습니다", payload.indexedContents === 0 ?
        "검색 가능한 검증 콘텐츠가 아직 없습니다." : "현재 승인된 자료에서 주제 근거와 연관도 기준을 함께 충족하는 자료를 찾지 못했습니다. 전체 방송의 자료가 없다는 뜻은 아닙니다.");
      if (payload.discoveryUrl) {
        const link = element("a", "전체 콘텐츠에서 이 주제 탐색하기", "source-link");
        link.href = payload.discoveryUrl;
        results.append(link);
      }
      return;
    }
    results.append(...payload.results.map(createCard));
    renderPagination(payload.page, payload.totalPages);
  }

  function createCard(result) {
    const card = element("article", null, "result-card");
    const top = element("div", null, "result-card-topline");
    top.append(element("span", "사람 검수 완료", "result-type"), element("span", "접근조건 미확인", "access-badge"));
    card.append(top, element("h3", result.title), element("p", result.program, "card-detail"));
    const metadata = element("dl", null, "result-metadata");
    for (const [label, value] of [["방송일", result.date ?? "방송일 미확인"],
      ["학년군", [...new Set(result.relations.map((item) => item.grade))].join(" · ")],
      ["교과", [...new Set(result.relations.map((item) => item.subject))].join(" · ")]]) {
      const row = element("div"); row.append(element("dt", label), element("dd", value)); metadata.append(row);
    }
    card.append(metadata);
    for (const relation of result.relations) {
      const standard = element("div", null, "standard-block");
      standard.append(element("p", "성취기준", "block-label"), element("strong", GradeContext.standardLabel(relation)), element("p", relation.standard));
      const reason = element("div", null, "reason-block");
      reason.append(element("p", "추천근거 · 저장된 검수 결과", "block-label"), element("p", relation.reason),
        element("p", "수업 활용", "block-label"), element("p", relation.teachingUse));
      const concepts = element("div", null, "tag-list");
      concepts.append(...relation.coreConcepts.map((concept) => element("span", concept)));
      card.append(standard, reason, concepts);
    }
    const footer = element("div", null, "card-footer");
    footer.append(element("span", result.navigation?.note || "원문 도착 페이지 미확인", "date-note"));
    if (isEbsUrl(result.navigation?.url)) {
      const link = element("a", `${result.navigation.label} ↗`, "ebs-link");
      link.href = result.navigation.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      footer.append(link);
    }
    card.append(footer);
    return card;
  }

  function isEbsUrl(value) {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password &&
        (url.hostname === "ebs.co.kr" || url.hostname.endsWith(".ebs.co.kr"));
    } catch { return false; }
  }

  function renderPagination(page, totalPages) {
    function pageButton(label, target, disabled) {
      const button = element("button", label, "page-button");
      button.type = "button"; button.disabled = disabled;
      button.addEventListener("click", () => search(target));
      return button;
    }
    pagination.append(pageButton("이전", page - 1, page === 1), element("span", `페이지 ${page} / ${totalPages}`, "pagination-info"));
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    for (let number = start; number <= Math.min(totalPages, start + 4); number += 1) {
      const button = pageButton(String(number), number, number === page);
      button.setAttribute("aria-label", `${number}페이지`);
      if (number === page) { button.className += " is-current"; button.setAttribute("aria-current", "page"); }
      pagination.append(button);
    }
    pagination.append(pageButton("다음", page + 1, page === totalPages));
  }

  function showMessage(title, text, loading = false) {
    const message = element("div", null, loading ? "loading-state" : "empty-state");
    const inner = element("div");
    if (loading) { const spinner = element("span", null, "loading-spinner"); spinner.setAttribute("aria-hidden", "true"); inner.append(spinner); }
    inner.append(element("h3", title), element("p", text)); message.append(inner); results.replaceChildren(message);
  }
  function setStatus(state, text) { status.dataset.state = state; status.textContent = text; }
  function setBusy(busy) { submit.disabled = busy; results.setAttribute("aria-busy", String(busy)); }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function restoreLocation(clearEmpty = false) {
    const parameters = new URLSearchParams(location.search);
    if (!parameters.has("query") && !clearEmpty) return;
    queryInput.value = parameters.get("query") || "";
    gradeFilter.value = parameters.get("grade") || "all";
    subjectFilter.value = parameters.get("subject") || "all";
    sortSelect.value = parameters.get("sort") || "relevance";
    submitted = null;
    if (queryInput.value.trim()) search(Number(parameters.get("page")) || 1, { updateHistory: false });
    else resetForEdit();
  }
  window.addEventListener("popstate", () => { resetForEdit(); restoreLocation(true); });
  showMessage("수업 주제로 검색하세요", "학년군과 교과를 함께 입력하거나 필터에서 선택할 수 있습니다.");
  restoreLocation();
})();
