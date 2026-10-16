(() => {
  "use strict";
  const { escape } = CuriTeacher, $ = (selector) => document.querySelector(selector);
  let standards = null, loading = null, current, change, edit, previousStandard;
  const sources = new Map();
  let relatedKey = "", relatedData = null, relatedError = "", relatedController;
  const clean = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
  function selectedInfo() {
    const panel = $("#selected-standard"), item = standards?.find((entry) => entry.id === current.standard);
    panel.hidden = !current.standard;
    $("#clear-standard").disabled = !current.standard;
    $("#clear-standard").hidden = !current.standard;
    if (!current.standard) { panel.replaceChildren(); return; }
    if (!item) { panel.textContent = `${GradeContext.standardLabel(current.standard)} · ${standards ? "공식 목록에서 기준을 확인하지 못했습니다." : "기준 원문을 불러오는 중입니다."}`; return; }
    panel.innerHTML = `<h3>${escape(item.goalTopic||item.subject)}</h3><p>서비스 탐색어 · 공식 단원명이 아닙니다</p><p>${escape(GradeContext.standardLabel(item))} · ${escape(item.subject)}</p><p class="official-standard-text">${escape(item.text)}</p><p>공식 학년군: ${escape(item.gradeBand)} · ${escape(item.schoolLevel)}</p><p>${item.courseId === "middle1" ? "중1 참고 과정은 EBS 뉴런 구성 기준입니다. 수업 진도에 맞는 성취기준을 선택하세요. 영상의 학년 적합성은 미확인입니다." : "공식 기준의 학년군과 수업 대상 학년·영상 난이도는 별개입니다."}</p><p class="filter-help">${item.ruleSupported ? "일부 요구의 제한된 자동 비교 지원 · 전체 기준 충족과 학생 수행은 별도 확인" : "해당 기준의 자동 비교 미지원 · 자료의 교육적 부적합 판정이 아닙니다."}</p><p id="selected-official-source" class="filter-help">출처는 검색 결과와 함께 확인합니다.</p>`;
  }
  function render(state, response) {
    const focusedCode = document.activeElement?.dataset.selectStandard;
    current = state;
    if (response?.standard) sources.set(response.standard.standardId, response.standard);
    for (const [key, selector] of [["standardSubject", "#standard-subject"], ["standardGrade", "#standard-grade"], ["standardQuery", "#standard-query"]]) $(selector).value = state[key];
    if (state.standard && state.standard !== previousStandard) {
      $("#additional-filters").open = true;
      $("#curriculum-picker").open = true;
    }
    const selectedGoal=standards?.find(item=>item.id===state.standard);
    $("#lesson-goal-controls").hidden=!state.standard;
    if(selectedGoal){
      const selectedIds=state.goalRequirements.split(',');
      $("#goal-requirements").innerHTML=(selectedGoal.goalRequirements||[]).map(requirement=>`<label><input type="checkbox" value="${escape(requirement.id)}" ${!state.goalRequirements||selectedIds.includes(requirement.id)?'checked':''}>${escape(requirement.text)}</label>`).join('');
    }
    if(document.activeElement!==$("#lesson-goal"))$("#lesson-goal").value=state.lessonGoal;$("#use-purpose").value=state.usePurpose;$("#standard-mode").value=state.standardMode;
    previousStandard = state.standard;
    selectedInfo();
    if (standards) {
      updateRelated(state);
      const relatedMode = Boolean(state.q.trim()) && state.standardView !== "all" && !state.standardQuery;
      $("#related-standards").setAttribute("aria-pressed", String(relatedMode));
      $("#all-standards").setAttribute("aria-pressed", String(!relatedMode));
      $("#related-standards").disabled = !state.q.trim();
      $("#retry-related").hidden = !relatedMode || !relatedError;
      $("#related-standards-note").textContent = relatedMode ? relatedError || (relatedData ? `${relatedData.total}개 관련 후보 중 최대 8개를 먼저 보여줍니다. ${relatedData.note}` : "현재 검색 질문과 관련된 성취기준을 찾고 있습니다…") : state.q.trim() ? "전체 공식 기준을 탐색합니다. 검색 관련 기준으로 돌아갈 수 있습니다." : "질문을 검색하면 관련 기준 후보를 먼저 보여줍니다. 지금은 전체 기준을 탐색할 수 있습니다.";
      const needle = clean(state.standardQuery);
      let options = standards.filter((item) => (!state.standardSubject || item.subject === state.standardSubject) &&
        (state.standardGrade === "all" || item.courseId === GradeContext.courseForGrade(state.standardGrade)) &&
        (!needle || clean(`${item.id} ${item.text}`).includes(needle)));
      if (relatedMode) {
        const available = new Map(options.map(item => [item.id, item]));
        options = (relatedData?.related || []).filter(item => available.has(item.id)).map(item => ({ ...available.get(item.id), relatedReason: item.reason }));
      }
      $("#standard-options").innerHTML = options.map((item) => `<li><button type="button" data-select-standard="${escape(item.id)}" aria-pressed="${state.standard === item.id}"><b>${escape(item.goalTopic||item.subject)} · ${escape(item.courseLabel)}</b><small>서비스 탐색어</small><span>이번 수업에서 다룰 내용: ${escape(item.goalSummary||item.text)}</span><small>공식 기준: ${escape(item.text)}</small><small>${escape(GradeContext.standardLabel(item))} · 공식 원문</small>${item.relatedReason ? `<small class="standard-related-reason">관련 이유: ${escape(item.relatedReason)}</small>` : ""}</button></li>`).join("");
      if (focusedCode) document.querySelector(`[data-select-standard="${CSS.escape(focusedCode)}"]`)?.focus();
      $("#standard-option-count").textContent = `${relatedMode ? "검색 관련 기준" : `${standards.length}개 공식 기준`} ${options.length}개 · 선택할 때만 자료 검색에 적용됩니다.`;
      $("#standard-summary-count").textContent = relatedMode && relatedData ? `관련 후보 ${options.length}개` : "";
      $("#standard-no-options").hidden = options.length > 0 || relatedMode && !relatedData;
      $("#standard-no-options").textContent = relatedMode ? "현재 질문과 목록 조건에서 관련 기준을 찾지 못했습니다. 전체 기준 보기로 직접 탐색할 수 있습니다." : "목록 조건에 맞는 기준이 없습니다. 교과·과정·검색 단어를 바꿔 보세요.";
      $("#standard-selection-error").textContent = CuriSearchState.selectionError(state, standards);
    }
    const selected = sources.get(state.standard);
    if (selected && state.standard && $("#selected-standard")) {
      $("#selected-standard").insertAdjacentHTML("beforeend", CuriTeacher.placementMarkup(selected.placementGuidance) + CuriTeacher.guidanceMarkup(selected.guidance));
    }
    if (selected && $("#selected-official-source")) {
      const source = selected.officialSource;
      $("#selected-official-source").textContent = `공식 출처: ${source?.sourceDocument || "미확인"} · PDF ${source?.sourcePdfPage || "미확인"}쪽. ${selected.officialCheck?.humanConfirmed ? "공식 원문 사람 대조 기록 있음" : "공식 출처 대조 · 사람 원문 확인 미기록"}. 방송–기준 관계 승인과 별개입니다.`;
    }
  }
  function updateRelated(state) {
    const params = new URLSearchParams({ q: state.q.trim(), subject: state.standardSubject, grade: state.standardGrade });
    const key = String(params);
    if (key === relatedKey) return;
    relatedController?.abort(); relatedKey = key; relatedData = null; relatedError = "";
    if (!state.q.trim()) return;
    relatedController = new AbortController();
    const signal = relatedController.signal;
    const timer = setTimeout(() => relatedController?.signal === signal && relatedController.abort(), 12000);
    fetch(`/api/curi/curriculum/related?${params}`, { signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "관련 기준 조회 실패");
      if (data.query !== params.get("q") || !Array.isArray(data.related)) throw new Error("관련 기준 응답을 확인하지 못했습니다.");
      if (key !== relatedKey || signal !== relatedController.signal) return;
      relatedData = data; render(current);
    }).catch(() => {
      if (key !== relatedKey || signal !== relatedController.signal) return;
      relatedError = "관련 기준을 불러오지 못했습니다. 다시 찾거나 전체 기준 보기로 탐색하세요.";
      render(current);
    }).finally(() => clearTimeout(timer));
  }
  async function load() {
    if (standards) return standards;
    if (loading) return loading;
    $("#standard-load-status").textContent = "공식 성취기준을 불러오는 중입니다.";
    $("#retry-standards").hidden = true;
    loading = (async () => {
      try {
        const response = await fetch("/api/curi/curriculum", { signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "기준 목록 조회 실패");
        if (!Array.isArray(data.standards) || !data.standards.length) throw new Error("공식 기준 목록을 확인하지 못했습니다.");
        standards = data.standards;
        CuriTeacher.setSelectionStandards(standards);
        CuriTeacher.shelfContext?.standardsLoaded();
        $("#standard-load-status").textContent = "공식 문장의 단어 또는 기준 코드로 찾을 수 있습니다. 목록 조건은 자료 필터와 별개입니다.";
        render(current); return standards;
      } catch (error) {
        $("#standard-load-status").textContent = "공식 기준을 불러오지 못했습니다. 검색어로 자료 찾기는 계속 사용할 수 있습니다.";
        $("#retry-standards").hidden = false; throw error;
      } finally { loading = null; }
    })();
    return loading;
  }
  function setup(onChange, onEdit, initial) {
    change = onChange; edit = onEdit; render(initial);
    for (const [key, selector] of [["standardSubject", "#standard-subject"], ["standardGrade", "#standard-grade"], ["standardQuery", "#standard-query"]]) {
      $(selector).addEventListener(key === "standardQuery" ? "input" : "change", () => edit({ [key]: $(selector).value, ...(key === "standardQuery" ? { standardView: $(selector).value ? "all" : "related" } : {}) }));
    }
    $("#standard-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-select-standard]");
      if (button) change({ standard: button.dataset.selectStandard, standardMode:"priority",goalRequirements:"",lessonGoal:"",usePurpose:"",state: "", legacyScope: "" });
    });
    $("#lesson-goal").addEventListener("input",()=>edit({lessonGoal:$("#lesson-goal").value}));
    $("#use-purpose").addEventListener("change",()=>edit({usePurpose:$("#use-purpose").value}));
    $("#standard-mode").addEventListener("change",()=>edit({standardMode:$("#standard-mode").value}));
    $("#goal-requirements").addEventListener("change",()=>{const ids=[...document.querySelectorAll("#goal-requirements input:checked")].map(input=>input.value);if(ids.length){$("#goal-input-error").textContent="";edit({goalRequirements:ids.join(",")});}else $("#goal-input-error").textContent="필요한 내용을 하나 이상 선택하세요.";});
    $("#apply-lesson-goal").addEventListener('click',()=>{if(!document.querySelector('#goal-requirements input:checked')){$('#goal-input-error').textContent='필요한 내용을 하나 이상 선택하세요.';return;}change({lessonGoal:$("#lesson-goal").value,usePurpose:$("#use-purpose").value,standardMode:$("#standard-mode").value,goalRequirements:[...document.querySelectorAll('#goal-requirements input:checked')].map(input=>input.value).join(','),q:current.q||$("#lesson-goal").value.trim()});});
    $("#goal-full-standard").addEventListener('click',()=>change({goalRequirements:'',standardMode:'priority'}));
    $("#goal-expand").addEventListener('click',()=>change({standardMode:'priority',state:'',curriculum:'all',q:current.q||(standards?.find(item=>item.id===current.standard)?.goalTopic||'').split(' · ')[0]}));
    $("#clear-standard").addEventListener("click", () => change({ standard: "", standardMode:"candidates",lessonGoal:"",usePurpose:"",goalRequirements:"",state: "", legacyScope: "" }));
    $("#all-standards").addEventListener("click", () => edit({ standardView: "all" }));
    $("#related-standards").addEventListener("click", () => edit({ standardView: "related", standardQuery: "" }));
    $("#retry-related").addEventListener("click", () => { relatedKey = ""; render(current); });
    $("#retry-standards").addEventListener("click", () => load().catch(() => {}));
    load().catch(() => {});
  }
  CuriTeacher.curriculumPicker = { setup, render, validate: async (state) => {
    if (!state.standard && state.legacyScope !== "1") return;
    const error = CuriSearchState.selectionError(state, await load());
    if (error) throw new Error(error);
  } };
})();
