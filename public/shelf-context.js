(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  let items, render, dirty = false;
  const saveStatus = (ok) => {
    dirty = !ok;
    $("#shelf-save-status").textContent = ok ? "내 자료의 수업 선택 이유를 이 브라우저에 저장했습니다." : "내 자료를 저장하지 못했습니다. 입력은 현재 화면에 유지됩니다. 다시 저장하거나 자료 목록을 내려받으세요.";
    $("#retry-shelf-save").hidden = ok;
    return ok;
  };
  function evidence(item) {
    const choices = CuriTeacher.choicesFor(item);
    const shown = choices.length > 1 ? { ...CuriTeacher.withTeachingContext(item, null), curriculumComparison: null } : CuriTeacher.withTeachingContext(item, CuriTeacher.choiceContext(choices[0]));
    return (choices.length > 1 ? "<p>자료 전체의 현재 관계 기록 · 기준별 상태는 아래 선택 이유에서 확인합니다.</p>" : "") + CuriTeacher.evidenceMarkup(shown);
  }
  function refresh() {
    document.querySelectorAll("#shelf-items [data-resource]").forEach((card) => {
      const item = items().find((entry) => entry.id === card.dataset.resource);
      if (!item) return;
      card.querySelector(".shelf-evidence").innerHTML = evidence(item);
      const link = card.querySelector(".saved-video-link");
      if (link) {
        if (link.nextElementSibling?.matches(".saved-segments")) link.nextElementSibling.remove();
        link.outerHTML = CuriTeacher.savedVideoLink(item);
      }
      card.querySelectorAll("[data-choice]").forEach((container) => {
        const choice = item.selectionContexts?.find((entry) => entry.id === container.dataset.choice);
        if (choice) container.querySelector("[data-choice-current]").textContent = `${CuriTeacher.currentChoiceStatus(item, choice)} · 현재 재확인: ${item.evidenceCheckedAt || "미기록"}`;
      });
    });
  }
  function standardsLoaded() {
    document.querySelectorAll("#shelf-items [data-choice-field='standardId']").forEach((select) => {
      const item = items?.().find((entry) => entry.id === select.closest("[data-resource]").dataset.resource);
      const choice = item?.selectionContexts?.find((entry) => entry.id === select.closest("[data-choice]").dataset.choice);
      if (choice) select.innerHTML = CuriTeacher.standardOptions(choice);
    });
  }
  function setup(getItems, renderItems) {
    items = getItems; render = renderItems;
    $("#shelf-items").addEventListener("input", (event) => {
      const input = event.target;
      if (!input.matches("[data-choice-field], [data-assessment]")) return;
      const card = input.closest("[data-resource]"), container = input.closest("[data-choice]");
      const item = items().find((entry) => entry.id === card.dataset.resource);
      const choice = item?.selectionContexts?.find((entry) => entry.id === container.dataset.choice);
      if (!choice) return;
      CuriTeacher.updateChoice(choice, input);
      if (input.dataset.choiceField === "standardId") {
        container.querySelector(".choice-standard").textContent = choice.standardText || "공식 기준 미지정";
        container.querySelector(".choice-grade").textContent = `학년군 연계: ${choice.officialGradeBand || choice.courseLabel || "미기록"}${choice.courses.includes("middle1") ? " · EBS 뉴런 중1 편성 참고 · 학교별 배치 미확인" : ""}`;
        container.querySelector("summary").textContent = `선택 이유 · ${GradeContext.standardLabel(choice) || "기준 미지정"}`;
        refresh();
      }
      if (input.dataset.assessment) {
        const key = input.dataset.assessment, record = choice.assessments[key];
        container.querySelector(`[data-assessment-time="${key}"]`).textContent = `확인 시점: ${record.checkedAt || "미기록"}`;
        input.closest("details").querySelector("summary").textContent = `${{difficulty:"영상 난이도",prerequisites:"선수개념",scenes:"장면·사용 구간"}[key]} · ${record.status === "PERSONAL_REVIEW" ? "개인 확인 기록 있음" : "미확인"}`;
      }
      saveStatus(CuriTeacher.saveShelf(items()));
    });
    $("#shelf-items").addEventListener("click", (event) => {
      const button = event.target.closest("[data-add-choice]");
      if (!button) return;
      const item = items().find((entry) => entry.id === button.dataset.addChoice);
      if (!item) return;
      if (item.selectionContexts.length >= 20) { $("#shelf-save-status").textContent = "한 자료에는 선택 이유를 20개까지 보존할 수 있습니다."; return; }
      item.selectionContexts.push(CuriTeacher.newChoice(item, true));
      saveStatus(CuriTeacher.saveShelf(items())); render();
      const card = [...document.querySelectorAll("#shelf-items [data-resource]")].find((entry) => entry.dataset.resource === item.id);
      const last = card.querySelector("[data-choice]:last-of-type");
      if (last) { last.open = true; last.querySelector("textarea")?.focus(); }
    });
    $("#retry-shelf-save").addEventListener("click", () => saveStatus(CuriTeacher.saveShelf(items())));
    window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  }
  CuriTeacher.shelfContext = { setup, refresh, standardsLoaded, evidence, saved: saveStatus };
})();
