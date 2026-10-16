(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const { escape, sourceLink, readShelf } = CuriTeacher;
  let state = readLocation({ resetOnReload: true });
  let responseData;
  let controller;
  let requestNumber = 0;
  let toastTimer;
  let shelf = readShelf();
  function readLocation({ resetOnReload = false } = {}) {
    // 새로고침은 새 탐색으로 시작한다. 직접 연 검색 주소와 뒤로 가기는 주소 조건을 따른다.
    const reloaded = resetOnReload && performance.getEntriesByType("navigation")[0]?.type === "reload";
    if (reloaded) history.replaceState(null, "", "/");
    const params = new URLSearchParams(reloaded ? "" : location.search);
    // 검색에서 제거한 대상 학년은 이전 주소·저장값에서도 적용하지 않는다.
    return { ...CuriTeacher.filters.read(params), grade: "all", standard: "", state: "", curriculum: "all", standardMode: "candidates", lessonGoal: "", usePurpose: "", goalRequirements: "", legacyScope: "" };
  }

  const searchButton = $("#search-submit");
  const searchButtonIdle = searchButton.innerHTML;
  function setSearchBusy(busy) {
    searchButton.classList.toggle("is-searching", busy);
    searchButton.setAttribute("aria-busy", String(busy));
    searchButton.innerHTML = busy ? "검색 중…" : searchButtonIdle;
    $("#result-status").classList.toggle("is-searching", busy);
  }

  let hasCompletedSearch = false;
  async function search({ updateHistory = true, focusResults = false } = {}) {
    controller?.abort();
    controller = new AbortController();
    const activeController = controller;
    const number = ++requestNumber;
    setSearchBusy(true);
    document.querySelector(".results-section").hidden = false;
    const requested = { ...state };
    const params = CuriSearchState.apiParams(requested);
    responseData = null;
    CuriTeacher.related.reset();
    document.body.classList.toggle("has-query", Boolean(state.q || state.standard));
    if (updateHistory) history.pushState(null, "", `/?${new URLSearchParams(state)}`);
    $("#search-input").value = state.q;
    $("#clear-query").hidden = !state.q;
    CuriTeacher.filters.pending(state);
    $("#result-cards").setAttribute("aria-busy", "true");
    $("#all-results-panel").hidden = true;
    $("#result-cards").replaceChildren();
    $("#result-count").textContent = "";
    $("#concept-panel").hidden = true;
    $("#query-understanding").hidden = true;
    $("#query-limitations").hidden = true;
    $("#result-status").textContent = hasCompletedSearch ? "자료를 검색하고 있습니다…" : "첫 검색을 준비하고 있습니다. 자료 색인을 불러오는 데 최대 2분 정도 걸릴 수 있습니다…";
    $("#error-state").hidden = true;
    $("#empty-state").hidden = true;
    $("#pagination").hidden = true;
    // 첫 검색은 전체 방송의 메모리 색인 준비 시간이 필요하다. 이후 요청 제한은 유지한다.
    const timeout = setTimeout(() => activeController.abort(), hasCompletedSearch ? 12000 : 120000);
    try {
      if (requested.invalidConditions) throw new Error("같은 검색 조건을 여러 번 지정할 수 없습니다. 조건을 초기화하거나 주소를 확인하세요.");
      if (number !== requestNumber) return;
      const response = await fetch(`/api/curi/discover?${params}`, { signal: activeController.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "검색을 완료하지 못했습니다.");
      if (number !== requestNumber) return;
      if (requested.standard && (data.standard?.standardId !== requested.standard || !["STANDARD", "COMBINED"].includes(data.searchMode))) {
        throw new Error("서버가 선택한 성취기준을 반영하지 못했습니다. 서버를 재시작한 뒤 다시 검색하세요.");
      }
      hasCompletedSearch = true;
      responseData = data;
      for (const key of Object.keys(CuriTeacher.filters.defaults)) if (Object.hasOwn(data, key) && ["string", "number"].includes(typeof data[key])) state[key] = String(data[key]);
      state.page = String(data.page);
      render(data);
      history.replaceState(null, "", `/?${new URLSearchParams(state)}`);
    } catch (error) {
      if (number !== requestNumber) return;
      responseData = null;
      CuriTeacher.filters.failed();
      $("#result-cards").replaceChildren();
      $("#concept-panel").hidden = true;
      $("#query-understanding").hidden = true;
      $("#query-limitations").hidden = true;
      $("#result-count").textContent = "";
      $("#result-status").textContent = "검색을 완료하지 못했습니다.";
      $("#error-message").textContent = error.name === "AbortError" ? "응답이 늦어 검색을 중단했습니다. 다시 시도해 주세요." : /fetch|network/i.test(error.message) ? "서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요." : error.message;
      $("#error-state").hidden = false;
    } finally {
      clearTimeout(timeout);
      if (number === requestNumber) {
        setSearchBusy(false);
        $("#result-cards").setAttribute("aria-busy", "false");
        if (focusResults) $("#results-heading").focus({ preventScroll: true });
        document.dispatchEvent(new CustomEvent('curi-search-complete', { detail: { focusResults } }));
      }
    }
  }

  function render(data) {
    const relatedCount = data.filters.kind.find(option => option.value === 'listing')?.count || 0;
    CuriTeacher.filters.render(data, state);
    CuriTeacher.related.render(data, state, shelf);
    $("#result-count").textContent = `${data.total}건`;
    $("#result-status").textContent = data.total === 0 ? (relatedCount ? `개별 영상은 없지만 관련 프로그램·회차 목록 ${relatedCount}건을 확인할 수 있습니다.` : "현재 질문과 조건에 일치하는 자료가 없습니다.") : data.standard ? `${GradeContext.standardLabel(data.standard)} 기준${data.query ? "과 검색 질문을 함께 적용한" : "을 적용한"} 자료입니다.` : data.concepts.length ?
      `${data.concepts.map((concept) => concept.label).join(" · ")} 관련 자료입니다.${state.place ? ` 장소: ${state.place}` : ""}` :
      data.query ? "제목과 소개문에서 검색 주제와 관련된 자료를 찾았습니다." : "개별 영상을 먼저 보여드립니다. 관련 프로그램·회차 목록도 펼쳐볼 수 있습니다.";
    const interpretation = data.understanding;
    const requestTopics = [...(interpretation?.concepts || []).map(c=>c.label), ...data.concepts.map(c=>c.label), ...(interpretation?.alternativeGroups || []).map(g=>g.map(x=>x.text).join(" 또는 ")), ...(interpretation?.contentPlan?.relations || []).map(r=>r.label)].filter((v,i,all)=>all.indexOf(v)===i);
    $("#query-understanding").hidden = !data.query;
    $("#query-understanding").textContent = data.query ? `검색에 반영한 주제: ${requestTopics.join(" · ") || "일치하는 주제 없음"}${data.terms.length ? ` / 추가 검색어: ${data.terms.join(" · ")}` : ""}${interpretation?.excluded.length ? ` / 제외: ${interpretation.excluded.join(" · ")}` : ""}` : "";
    if (interpretation?.alternativeGroups?.length) $("#query-understanding").textContent += ` / 선택 주제: ${interpretation.alternativeGroups.map(g=>g.map(x=>x.text).join(" 또는 ")).join(" · ")}`;
    if (interpretation?.contentPlan?.relations?.length) $("#query-understanding").textContent += ` / 찾는 내용: ${interpretation.contentPlan.relations.map(r=>r.label).join(" · ")}`;
    if (interpretation?.contentPlan?.historicalPlace) $("#query-understanding").textContent += ` / 찾는 내용: ${interpretation.contentPlan.historicalPlace.places.map(place=>place.name).join(' · ')}의 과거 풍경·생활`;
    if (interpretation?.preferences?.content?.length) $("#query-understanding").textContent += ` / 선호 내용: ${interpretation.preferences.content.map(c=>c.label).join(" · ")} (필수 아님)`;
    if (interpretation?.classroomContext?.length) $("#query-understanding").textContent += ` / 수업 활용: ${interpretation.classroomContext.join(" · ")}`;
    if (interpretation?.preferences?.programs.length) $("#query-understanding").textContent += ` / 선호 프로그램: ${interpretation.preferences.programs.join(" · ")}`;
    if (interpretation?.constraints?.geographicScope?.required.length) $("#query-understanding").textContent += ` / 지역 범위: ${interpretation.constraints.geographicScope.required.map(scope => scope === "DOMESTIC" ? "국내" : "해외").join(" + ")} (제목·소개문 장소 단서)`;
    if (interpretation?.requiredPrograms?.length) $("#query-understanding").textContent += ` / 프로그램: ${interpretation.requiredPrograms.join(" · ")}`;
    if (interpretation?.preferences?.genres?.length) $("#query-understanding").textContent += ` / 형식 선호: ${interpretation.preferences.genres.join(" · ")} (관련순에 반영)`;
    if (interpretation?.constraints?.requiredGenres?.length) $("#query-understanding").textContent += ` / 형식 조건: ${interpretation.constraints.requiredGenres.join(interpretation.constraints.genreOperator === "OR" ? " 또는 " : " + ")} (공식 분류·회차 설명 기준)`;
    if (interpretation?.constraints?.excludedGenres?.length) $("#query-understanding").textContent += ` / 형식 제외: ${interpretation.constraints.excludedGenres.join(" · ")} (공식 분류·회차 설명 기준)`;
    if (interpretation?.constraints?.excludedPrograms?.length) $("#query-understanding").textContent += ` / 프로그램 제외: ${interpretation.constraints.excludedPrograms.join(" · ")}`;
    $("#query-limitations").hidden = !interpretation?.warnings.length;
    $("#query-limitations").textContent = interpretation?.warnings.join(" ") || "";
    renderConcepts(data.concepts);
    $("#result-cards").innerHTML = data.results.map((item,index)=>`${item.curriculumScope&&(!index||data.results[index-1].curriculumScope!==item.curriculumScope)?`<h3 class="curriculum-result-group">${item.curriculumScope==='RELATED'?'선택 기준 관련 후보':'주제 확장 자료 — 기준 연계 미확인'}</h3>`:''}${card(item,index+1+(data.page-1)*data.pageSize)}`).join("");
    $("#empty-state").hidden = data.total > 0;
    $("#empty-state h3").textContent = ['listing', 'collection'].includes(state.kind) ? '일치하는 목록이 없습니다' : '일치하는 개별 영상이 없습니다';
    $("#empty-message").textContent = relatedCount ? '아래의 관련 프로그램·회차 더 보기를 펼쳐 목록 자료를 확인해 주세요.' : data.emptyMessage;
    $("#pagination").hidden = data.pages <= 1;
    $("#page-label").textContent = `${data.page} / ${data.pages} 페이지`;
    $("#previous-page").disabled = data.page <= 1;
    $("#next-page").disabled = data.page >= data.pages;
    $("#all-results-panel").hidden = false;
  }

  function renderConcepts(concepts) {
    const panel = $("#concept-panel");
    panel.hidden = concepts.length === 0;
    panel.innerHTML = concepts.map((concept) => `<div class="concept-header"><div><p class="eyebrow">개념 → 장소 → 자료</p><h2>${escape(concept.label)}</h2></div><a href="${escape(sourceLink(concept.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escape(concept.sourceLabel)} ↗</a></div><p class="concept-description">${escape(concept.description)}</p><div class="place-chips"><button type="button" data-place="" aria-pressed="${!state.place}"><strong>모든 장소</strong><small>장소 전체 보기</small></button>${concept.places.map((place) => `<button type="button" data-place="${escape(place.name)}" aria-pressed="${state.place === place.name}"><strong>${escape(place.name)} ↗</strong><small>${escape(place.role)}</small></button>`).join("")}</div><details><summary>수업 질문 예시</summary><ul>${concept.questions.map((question) => `<li>${escape(question)}</li>`).join("")}</ul></details>`).join("");
  }

  function card(item, number) { return CuriTeacher.card(item, number, shelf); }

  function showToast(message) {
    clearTimeout(toastTimer);
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 4000);
  }

  function changeSearch(update) {
    const changedQuery = Object.hasOwn(update, "q") && update.q !== state.q;
    state = { ...(changedQuery ? CuriTeacher.filters.defaults : state), ...update, page: "1" };
    if (changedQuery) $("#additional-filters").open = false;
    search({ focusResults: true });
  }
  function newQuery(q) { changeSearch({ q }); }
  function resetAll() { state = { ...CuriTeacher.filters.defaults }; search(); }
  CuriTeacher.filters.setup(changeSearch);
  $("#search-form").addEventListener("submit", (event) => { event.preventDefault(); newQuery($("#search-input").value.trim()); });
  $("#search-input").addEventListener("input", () => { $("#clear-query").hidden = !$("#search-input").value; });
  $("#search-input").addEventListener("search", () => { if (!$("#search-input").value) newQuery(""); });
  $("#clear-query").addEventListener("click", () => { newQuery(""); $("#search-input").focus(); });
  document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", () => {
    const input = $("#search-input");
    input.value = button.dataset.query;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }));
  $("#concept-panel").addEventListener("click", (event) => { const button = event.target.closest("[data-place]"); if (button) { state.place = button.dataset.place; state.topic = ""; state.page = "1"; search(); } });
  $("#previous-page").addEventListener("click", () => { state.page = String(Math.max(1, Number(state.page) - 1)); search(); });
  $("#next-page").addEventListener("click", () => { state.page = String(Number(state.page) + 1); search(); });
  $("#reset-error").addEventListener("click", () => resetAll());
  $("#retry-search").addEventListener("click", () => search({ updateHistory: false }));
  $("#edit-empty-query").addEventListener("click", () => { $("#search-input").focus(); $("#search-input").select(); });
  $("#show-empty-filters").addEventListener("click", () => { $("#additional-filters").open = true; $("#additional-filters > summary").focus(); });
  $("#reset-search").addEventListener("click", () => resetAll());
  function restoreSearch() {
    const requested = Object.entries(CuriTeacher.filters.defaults).some(([key, value]) => state[key] !== value) || new URLSearchParams(location.search).get('browse') === 'all';
    if (requested) return search({ updateHistory: false });
    controller?.abort(); controller = null; requestNumber++;
    responseData = null;
    setSearchBusy(false);
    CuriTeacher.related.reset();
    CuriTeacher.filters.failed();
    document.body.classList.remove('has-query');
    document.querySelector('.results-section').hidden = true;
    $('#search-input').value = ''; $('#clear-query').hidden = true;
    $('#result-cards').setAttribute('aria-busy', 'false');
    $('#result-cards').replaceChildren();
    $('#result-status').textContent = ''; $('#result-count').textContent = '';
    for (const selector of ['#all-results-panel','#error-state','#empty-state','#pagination','#concept-panel','#query-understanding','#query-limitations']) $(selector).hidden = true;
  }
  window.addEventListener("popstate", () => { state = readLocation(); restoreSearch(); });
  window.addEventListener("focus", () => { shelf = readShelf(); window.dispatchEvent(new Event("curi-library-changed")); });
  CuriTeacher.folderPicker.setup((id) => {
    const item = responseData?.results.flatMap(entry => [entry, ...(entry.alternatives || [])]).find(entry => entry.id === id) || CuriTeacher.related.find(id) || CuriTeacher.readFolders(false).folders.flatMap(folder=>folder.items.map(entry=>entry.resource)).find(entry=>entry.id===id);
    if (!item) return null;
    const saved = shelf.find(entry => entry.id === id);
    return saved && CuriTeacher.hasShelfSelection(item, [saved]) ? structuredClone(saved) : { ...item, alternatives: undefined, query: state.q, selectionContexts: [CuriTeacher.newChoice(item, true)] };
  }, message=>{if(!window.CuriUI)showToast(message);}, () => state.q);
  if (CuriTeacher.notices.length) showToast(CuriTeacher.notices.join(" "));
  restoreSearch();
})();
