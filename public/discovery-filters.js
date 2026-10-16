(() => {
  "use strict";
  const { escape } = CuriTeacher, $ = (selector) => document.querySelector(selector);
  const defaults = CuriSearchState.defaults;
  const selectors = { program: "#program-filter" };
  let current = { ...defaults }, data, change, ready = false;
  const resultControls = ['#topic-filter', '#program-filter', '#kind-filter', '#relation-state', '#approved-only', '#automatic-only', '#direct-only'];
  function availability(available, busy = false) {
    ready = available;
    for (const selector of resultControls) $(selector).disabled = !available;
    $('#additional-filters').setAttribute('aria-busy', String(busy));
  }
  function optionMarkup(options, selected, hideEmpty = false) {
    const available = hideEmpty ? options.filter(option => !option.value || option.count > 0) : [...options];
    if (!hideEmpty && selected && !available.some((option) => option.value === selected)) available.push({ value: selected, label: selected, count: 0 });
    return available.map((option) => `<option value="${escape(option.value)}">${escape(option.label)}${hideEmpty && !option.value ? "" : ` (${option.count}건)`}</option>`).join("");
  }
  function topicOptions() {
    const groups = data.filters.topicChoices || [];
    const option = (value, label, count) => `<option value="${escape(value)}">${escape(label)} (${count}건)</option>`;
    const unclassified = data.filters.topicUnclassified;
    const value = current.concept ? 'concept:' + current.concept : current.conceptGroup ? 'group:' + current.conceptGroup : '';
    const selected = optionValue => optionValue === value;
    $("#topic-filter").innerHTML = '<option value="">주제 전체</option>' + groups.filter(group => group.count > 0 || selected('group:' + group.value) || group.concepts.some(concept => concept.count > 0 || selected('concept:' + concept.value)))
      .map(group => `<optgroup label="${escape(group.label)}">${group.count > 0 || selected('group:' + group.value) ? option('group:' + group.value, group.label + ' 전체', group.count) : ''}${group.concepts.filter(concept => concept.count > 0 || selected('concept:' + concept.value)).map(concept => option('concept:' + concept.value, concept.label, concept.count)).join('')}</optgroup>`).join('') +
      (unclassified?.count > 0 || selected('concept:unclassified') ? option('concept:unclassified', unclassified.label, unclassified.count) : '');
    // 예전 주소의 개념·묶음도 선택/해제가 가능하도록 보존한다.
    if (value && ![...$("#topic-filter").options].some(entry => entry.value === value)) {
      const previous = current.concept ? data.filters.concept?.find(entry => entry.value === current.concept) : data.filters.conceptGroup?.find(entry => entry.value === current.conceptGroup);
      $("#topic-filter").insertAdjacentHTML('beforeend', option(value, previous?.label || current.concept || current.conceptGroup, previous?.count || 0));
    }
    $("#topic-filter").value = value;
  }
  function programOptions() {
    if (!data) return;
    const options = data.filters.program;
    $("#program-filter").innerHTML = optionMarkup(options, current.program, true);
    $("#program-filter").value = [...$("#program-filter").options].some(option => option.value === current.program) ? current.program : "";
  }
  function selection() {
    const chips = [];
    if (current.q) chips.push(["q", `검색: ${current.q}`]);
    if (current.standard) chips.push(["standard", `성취기준: ${GradeContext.standardLabel(current.standard)}`]);
    if (current.state) chips.push(["state", data?.filters.state?.find((option) => option.value === current.state)?.label || current.state]);
    if (current.concept || current.conceptGroup) chips.push(["topicChoice", `주제: ${current.concept ? data?.filters.topicChoices?.flatMap(group => group.concepts).find(option => option.value === current.concept)?.label || data?.filters.concept?.find(option => option.value === current.concept)?.label || (current.concept === "unclassified" ? "미분류" : current.concept) : data?.filters.topicChoices?.find(option => option.value === current.conceptGroup)?.label || data?.filters.conceptGroup?.find(option => option.value === current.conceptGroup)?.label || current.conceptGroup}`]);
    for (const key of ["kind", "program", "subject", "description", "curriculum", "access"]) {
      if (current[key] === defaults[key]) continue;
      chips.push([key, data?.filters[key]?.find((option) => option.value === current[key])?.label || current[key]]);
    }
    if (current.topic) chips.push(["topic", `이전 주제: ${data?.topicLabel || current.topic}`]);
    if (current.place) chips.push(["place", `장소: ${current.place}`]);
    if (current.year || current.from || current.to) chips.push(["date", current.year === "unknown" ? "날짜 미확인" : current.year ? `${current.year}년` : `${current.from || "시작일 전체"} ~ ${current.to || "종료일 전체"}`]);
    $("#selected-filters").innerHTML = chips.length ? chips.map(([key, label]) => `<button type="button" data-clear-filter="${key}" aria-label="${escape(label)} 조건 해제">${escape(label)} <span aria-hidden="true">×</span></button>`).join("") : '<span class="filter-help">선택한 조건 없음 · 개별 자료 전체</span>';
    $("#selected-filters").hidden = chips.length === 0;
    $("#clear-filters").disabled = !chips.some(([key]) => !["q", "standard"].includes(key)) && current.sort === "relevance";
    $("#clear-filters").hidden = $("#clear-filters").disabled;
    $("#selected-filters").parentElement.hidden = !chips.length && $("#clear-filters").disabled;
  }
  function render(response, state) {
    data = response; current = state;
    $("#relation-state-choice").hidden = !current.standard;
    $("#relation-state").innerHTML = optionMarkup(data.filters.state || [{ value: "", label: "선택 관계 상태 전체", count: data.total }], current.state);
    $("#relation-state").value = current.state;
    topicOptions();
    programOptions();
    $("#sort-filter").value = current.sort;
    for (const [selector, checked, count] of [["#approved-only", current.curriculum === "approved", data.filters.curriculum.find((option) => option.value === "approved").count],
      ["#automatic-only", current.curriculum === "automatic", data.filters.curriculum.find((option) => option.value === "automatic").count],
      ["#direct-only", current.access === "direct", data.filters.access.find((option) => option.value === "direct").count]]) {
      $(selector).checked = checked; $(`${selector.replace("-only", "-count")}`).textContent = `(${count}건)`;
    }
    const kinds = data.filters.kind.filter(option => !['collection', 'listing'].includes(option.value) || option.value === current.kind);
    $("#kind-filter").innerHTML = optionMarkup(kinds.filter(option => option.count > 0 || option.value === 'all' || option.value === current.kind), current.kind);
    $("#kind-filter").value = current.kind;
    $("#ranking-note").textContent = data.note; $("#filter-count-note").textContent = data.countNote;
    if (["kind", "conceptGroup", "concept", "program", "subject", "description", "year", "from", "to", "curriculum", "access", "state", "place", "topic"].some((key) => current[key] !== defaults[key])) $("#additional-filters").open = true;
    selection();
    availability(true);
  }
  function setup(onChange) {
    change = onChange;
    $("#relation-state").addEventListener("change", () => { if (ready) change({ state: $("#relation-state").value }); });
    for (const [key, selector] of Object.entries(selectors)) $(selector).addEventListener("change", () => {
      if (!ready) return;
      const update = { [key]: $(selector).value };
      change(update);
    });
    $("#topic-filter").addEventListener("change", () => {
      if (!ready) return;
      const [kind, value] = $("#topic-filter").value.split(':');
      change({ conceptGroup: kind === 'group' ? value : '', concept: kind === 'concept' ? value : '', subject: 'all' });
    });
    $("#sort-filter").addEventListener("change", () => change({ sort: $("#sort-filter").value }));
    for (const [selector, value] of [["#approved-only", "approved"], ["#automatic-only", "automatic"]]) $(selector).addEventListener("change", () => { if (ready) change({ curriculum: $(selector).checked ? value : "all" }); });
    $("#direct-only").addEventListener("change", () => { if (ready) change({ access: $("#direct-only").checked ? "direct" : "all" }); });
    $("#kind-filter").addEventListener("change", () => { if (ready) change({ kind: $("#kind-filter").value }); });
    $("#selected-filters").addEventListener("click", (event) => {
      const key = event.target.closest("[data-clear-filter]")?.dataset.clearFilter;
      if (!key) return;
      change(key === "topicChoice" ? { conceptGroup: "", concept: "" } : key === "date" ? { year: "", from: "", to: "" } : key === "conceptGroup" ? { conceptGroup: "", concept: "" } : key === "standard" ? { standard: "", state: "", lessonGoal:"",usePurpose:"",goalRequirements:"",standardMode:"candidates",legacyScope: "" } : { [key]: defaults[key] });
    });
    $("#clear-filters").addEventListener("click", () => { change({ ...defaults, q: current.q, standard: current.standard,
      standardSubject: current.standardSubject, standardGrade: current.standardGrade, standardQuery: current.standardQuery, standardView: current.standardView, legacyScope: current.legacyScope }); });
  }
  CuriTeacher.filters = { defaults, setup, render, read: CuriSearchState.read, pending: (state) => {
    current = state;
    availability(false, true);
    // 응답을 기다리는 동안에도 새 검색의 초기화된 조건을 바로 표시한다.
    for (const [key, selector] of Object.entries(selectors)) $(selector).value = current[key];
    $("#topic-filter").value = current.concept ? 'concept:' + current.concept : current.conceptGroup ? 'group:' + current.conceptGroup : '';
    $("#relation-state").value = current.state;
    $("#sort-filter").value = current.sort;
    $("#approved-only").checked = current.curriculum === 'approved';
    $("#automatic-only").checked = current.curriculum === 'automatic';
    $("#direct-only").checked = current.access === 'direct';
    $("#kind-filter").value = current.kind;
    selection();
  }, failed: () => {
    availability(false);
    // 실패한 새 검색에 이전 결과의 선택지·건수를 다시 사용하지 않는다.
    for (const selector of ['#topic-filter', '#program-filter', '#kind-filter', '#relation-state']) {
      $(selector).innerHTML = '<option value="">검색 완료 후 선택</option>';
    }
  } };
})();
