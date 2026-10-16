(() => {
  const { element, $, labels } = CuriAdmin, dirty = new Set(), pendingKey = "curi.admin.review-pending.v1";
  let activeForm, busy = false, notice = "";
  const api = async (path, input) => {
    const response = await fetch(path, input ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : undefined);
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "요청 실패"); return result;
  };
  const decisionLabels = { approve: "승인", edit: "수정", exclude: "제외", hold: "보류" };
  function pending() { try { return JSON.parse(sessionStorage.getItem(pendingKey) || "{}"); } catch { return {}; } }
  function remember(key, value) { try { const saved = pending(); if (value) saved[key] = value; else delete saved[key]; sessionStorage.setItem(pendingKey, JSON.stringify(saved)); } catch { notice = "브라우저 임시 저장 실패 · 창을 닫기 전 서버 이력을 확인하세요."; } }
  function discardInputs() { for (const form of dirty) remember(form.dataset.relationKey, null); dirty.clear(); }
  function appendHistory(parent, reviews) {
    for (const review of [...reviews].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))) {
      parent.append(element("p", `${review.reviewedAt} · ${decisionLabels[review.decision]} · ${review.reviewerRole} (단일 운영자, 실명 확인 아님) · ${review.note || "사유 없음"} · ${review.reviewId}`));
      if (review.source) parent.append(element("p", `검토 당시 원문 ${review.source.contentHash.slice(0, 12)} · 기준: ${review.standardSnapshot.requirement}`), element("blockquote", review.source.fields.synopsis || review.source.fields.title), element("p", `연계 이유: ${review.result.rationale || "없음"}`));
    }
  }
  function field(parent, label, value, kind = "textarea") {
    const wrapper = element("label", label), control = element(kind);
    if (kind === "textarea") { control.rows = 3; control.maxLength = 5000; }
    control.value = value || ""; wrapper.append(control); parent.append(wrapper); return control;
  }
  function card(relation, view, reload) {
    const root = element("section", null, "panel human-relation"); root.dataset.standard = relation.curriculumCuriId;
    const title = element("h4", `${GradeContext.standardLabel(relation.standardSnapshot)} · ${relation.latest ? decisionLabels[relation.latest.decision] : "새 사람 판단 없음"}`); root.append(title);
    root.append(element("p", `검토 과정: ${view.gradeBand || "미확인"} · 공식 학년군: ${relation.standardSnapshot.gradeBand || "미확인"}${relation.standardSnapshot.courseId === "middle1" ? " · EBS 뉴런 편성 참고 · 학교별 배치 미확인" : ""}`));
    root.append(element("p", `${relation.standardSnapshot.document} ${relation.standardSnapshot.page}쪽 · ${relation.standardSnapshot.curriculumVersion}`));
    if (relation.latest?.invalidReason) root.append(element("p", `이전 판단의 근거 변경: ${labels[relation.latest.invalidReason] || relation.latest.invalidReason}. 현재 원문으로 다시 검토하세요.`, "notice"));
    root.append(element("p", `현재 승인 자산 ${relation.asset ? "저장됨" : "없음"} · 검색 준비 ${labels[relation.search.state] || relation.search.state}${relation.search.error ? ` · ${relation.search.error}` : ""}`));
    const compare = element("div", null, "human-compare"), original = element("div"), evaluation = element("div"); compare.append(original, evaluation); root.append(compare);
    original.append(element("h4", "검토할 저장 원문"));
    for (const [key, value] of Object.entries(relation.fields)) if (value) original.append(element("p", ({ title: "제목", synopsis: "소개문", draftText: "기존 초안에 보존된 공개 원문" })[key]), element("blockquote", value));
    evaluation.append(element("h4", "공식 요구와 관계 판단"), element("p", relation.standardSnapshot.requirement));
    if (relation.automatic) evaluation.append(element("p", `자동 구조 ${labels[relation.automatic.inspection.status]} · 관계 ${labels[relation.automatic.semantic.status]}`), element("p", relation.automatic.semantic.reason));
    evaluation.append(element("p", `참조 ${relation.reference.kind} · ${relation.reference.id || "현재 원문"}`), element("p", `원문 ${view.source.contentHash.slice(0, 12)} · 기준 ${relation.standardSnapshot.evidenceHash.slice(0, 12)}`, "muted"));
    evaluation.append(element("blockquote", relation.defaults.quote.quote), element("p", `${relation.defaults.quote.field} ${relation.defaults.quote.start}–${relation.defaults.quote.end} (UTF-16)`),
      element("p", `연결되는 부분: ${relation.defaults.connectedParts || "작성 필요"}`), element("p", `미확인 부분: ${relation.defaults.unconfirmedParts || "작성 필요"}`),
      element("p", `연계 이유: ${relation.defaults.rationale || "작성 필요"}`), element("p", `수업 활용: ${relation.defaults.teachingUse || "작성 필요"}`));
    const form = element("form", null, "human-form"); form.dataset.relationKey = relation.relationKey; form.tabIndex = 0; form.setAttribute("aria-label", `${GradeContext.standardLabel(relation.standardSnapshot)} 사람 판단`); evaluation.append(form);
    const decision = field(form, "이 관계의 결정", "", "select"); decision.name = "decision";
    for (const [value, label] of [["", "선택하세요"], ...Object.entries(decisionLabels)]) { const option = element("option", label); option.value = value; decision.append(option); }
    const edits = element("fieldset"); edits.append(element("legend", "관계 설명 · 필요한 필드만 수정")); form.append(edits);
    const defaults = relation.defaults, quoteField = field(edits, "인용할 원문 필드", "", "select"); quoteField.name = "quoteField";
    for (const key of Object.keys(relation.fields)) { const option = element("option", key); option.value = key; quoteField.append(option); } quoteField.value = defaults.quote.field;
    const quote = field(edits, "인용문 (원문과 정확히 일치)", defaults.quote.quote); quote.name = "quote";
    const start = field(edits, "인용 시작 위치 (UTF-16, 0부터)", String(defaults.quote.start), "input"); start.name = "start"; start.type = "number"; start.min = "0";
    const controls = {};
    for (const [key, label] of [["rationale", "연계 이유"], ["connectedParts", "연결되는 부분"], ["unconfirmedParts", "확인되지 않은 부분 (없으면 없다고 명시)"], ["teachingUse", "수업 활용"], ["coreConcepts", "핵심개념 (쉼표로 구분, 최대 6개)"]]) {
      controls[key] = field(edits, label, key === "coreConcepts" ? defaults[key].join(", ") : defaults[key]); controls[key].name = key;
    }
    const coverage = field(edits, "직접 확인한 연계 범위", "", "select"); coverage.name = "coverage";
    for (const [value, label] of [["PARTIAL", "부분 연계"], ["FULL", "전체 성취기준 관계 확인"]]) { const option = element("option", label); option.value = value; coverage.append(option); } coverage.value = defaults.coverage;
    const reason = field(form, "결정 사유", "", "select"); reason.name = "reasonCode";
    for (const [value, label] of [["REVIEWED", "원문·공식 요구 대조"], ["INSUFFICIENT_EVIDENCE", "근거 부족"], ["CONFLICT", "상충"], ["OUT_OF_SCOPE", "범위 밖"], ["SOURCE_CHANGED", "원문 변경"], ["OTHER", "그 밖의 사유"]]) { const option = element("option", label); option.value = value; reason.append(option); }
    const note = field(form, "사람 검토 사유·메모 (공개 원문 인용과 별도)", ""); note.name = "note"; note.required = true;
    const confirmLabel = element("label", " 이 관계의 현재 원문·인용·공식 성취기준을 실제로 검토했습니다."), confirmed = element("input"); confirmed.type = "checkbox"; confirmed.name = "confirmed"; confirmLabel.prepend(confirmed); form.append(confirmLabel);
    const message = element("p", "승인은 표시된 설명을 그대로 채택합니다. 내용을 보완하려면 수정을 선택하세요."); message.setAttribute("role", "status"); form.append(message);
    const save = element("button", "결정·해당 자산 함께 저장"); save.type = "submit"; form.append(save);
    let request = pending()[relation.relationKey] || null, uncertain = Boolean(request), saving = false;
    function values() { return { quote: { field: quoteField.value, start: Number(start.value), end: Number(start.value) + quote.value.length, quote: quote.value },
      ...Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, key === "coreConcepts" ? control.value.split(",").map((value) => value.trim()).filter(Boolean) : control.value])), coverage: coverage.value }; }
    function update() {
      edits.disabled = saving || uncertain || decision.value !== "edit";
      edits.hidden = decision.value !== "edit";
      for (const control of [decision, reason, note, confirmed]) control.disabled = saving || uncertain;
      save.disabled = saving || busy || !decision.value || !confirmed.checked || !note.value.trim();
      save.textContent = uncertain ? "같은 요청으로 저장 결과 재확인" : saving ? "결정·자산 저장 및 검색 준비 중" : "결정·해당 자산 함께 저장";
    }
    if (request) {
      decision.value = request.decision; reason.value = request.reasonCode; note.value = request.note; confirmed.checked = request.confirmed;
      const changes = request.changes || {}; for (const [key, control] of Object.entries(controls)) if (changes[key] !== undefined) control.value = key === "coreConcepts" ? changes[key].join(", ") : changes[key];
      if (changes.quote) { quoteField.value = changes.quote.field; quote.value = changes.quote.quote; start.value = changes.quote.start; }
      coverage.value = changes.coverage || defaults.coverage; dirty.add(form); message.textContent = "응답을 확인하지 못한 요청을 복구했습니다. 같은 요청으로 이력을 재확인하세요.";
    }
    form.addEventListener("focusin", () => { activeForm = form; });
    form.addEventListener("input", () => { dirty.add(form); update(); }); form.addEventListener("change", () => { dirty.add(form); update(); });
    quote.addEventListener("input", () => { const index = (relation.fields[quoteField.value] || "").indexOf(quote.value); if (index >= 0) start.value = index; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (save.disabled || busy) return;
      request ||= { target: view.target, subject: view.subject, gradeBand: view.gradeBand || $("#automatic-grade")?.value, curriculumCuriId: relation.curriculumCuriId, expectedVersion: relation.expectedVersion,
        requestId: crypto.randomUUID(), decision: decision.value, reasonCode: reason.value, note: note.value, confirmed: confirmed.checked,
        changes: decision.value === "edit" ? Object.fromEntries(Object.entries(values()).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(defaults[key]))) : {} };
      remember(relation.relationKey, request); saving = true; busy = true; update(); message.textContent = "사람 결정·해당 관계 자산을 저장하고 검색을 준비하고 있습니다.";
      try {
        const result = await api("/api/admin/human-review", request);
        remember(relation.relationKey, null); request = null; uncertain = false; dirty.delete(form);
        notice = `결정·자산 저장 완료${result.reused ? " · 기존 요청 재확인" : ""} · 검색 준비 ${labels[result.searchPreparation.state] || result.searchPreparation.state}`;
        if (result.current === false) notice += " · 근거 또는 이후 판단이 변경되어 현재 이력을 확인하세요.";
        busy = false; await reload(relation.curriculumCuriId, root); window.dispatchEvent(new Event("human-decision-saved"));
      } catch (error) { uncertain = true; message.textContent = error.message + " 입력과 요청 ID를 보존했습니다."; }
      finally { saving = false; busy = false; update(); }
    });
    const refresh = element("button", "현재 이력 다시 조회 · 입력 취소"); refresh.type = "button";
    refresh.addEventListener("click", async () => { if (busy || dirty.has(form) && !confirm("입력을 취소하고 서버의 현재 이력을 조회할까요?")) return; remember(relation.relationKey, null); dirty.delete(form); await reload(relation.curriculumCuriId, root); }); form.append(refresh);
    const history = element("details"); history.append(element("summary", `실제 사람 이력 ${relation.history.length}건 · 기존 묶음 참조 ${relation.legacyReviews.length}건`));
    appendHistory(history, [...relation.history, ...relation.legacyReviews]); root.append(history);
    if (relation.asset?.reviewKind === "RELATION_REVIEW") {
      const retry = element("button", "이 관계 검색 준비만 재시도"); retry.type = "button";
      retry.addEventListener("click", async () => { if (busy) return; retry.disabled = true; try { const result = await api("/api/admin/human-review/search", { reviewId: relation.asset.reviewId }); message.textContent = `결정·자산 보존 · 검색 준비 ${labels[result.searchPreparation.state] || result.searchPreparation.state}`; } catch (error) { message.textContent = error.message; } finally { retry.disabled = false; } }); root.append(retry);
    }
    update(); return root;
  }
  CuriAdmin.renderHumanReview = (parent, data) => {
    const panel = element("section", null, "panel"); panel.id = "human-review-workspace"; parent.append(panel);
    panel.append(element("h3", "선택적 관계별 사람 확인"), element("p", "실제 확인한 관계만 판단하세요. 결정·해당 자산을 함께 저장합니다. Alt+S: 선택한 관계 저장, Alt+N: 다음 자료 (입력칸에서는 작동하지 않음)."));
    const open = element("button", "원문·관계별 사람 판단 열기"); open.type = "button"; panel.append(open);
    const status = element("p", notice); status.setAttribute("role", "status"); panel.append(status);
    const results = element("div"); panel.append(results); let view;
    const target = data.resource.contentCuriId ? { contentCuriId: data.resource.contentCuriId } : { resourceId: data.resource.id };
    const query = () => new URLSearchParams({ ...target, subject: $("#automatic-subject")?.value || "", gradeBand: $("#automatic-grade")?.value || "초등 5~6학년군", ...(new URLSearchParams(location.search).get("standardId") ? { standardId: new URLSearchParams(location.search).get("standardId") } : {}) });
    async function load(id, oldCard) {
      try {
        status.textContent = "현재 원문·공식 기준·사람 이력을 읽고 있습니다.";
        const parameters = query(); if (!parameters.get("subject")) parameters.delete("subject"); if (id) parameters.set("standardId", id);
        view = await api(`/api/admin/human-review?${parameters}`);
        if (oldCard) { const relation = view.relations.find((item) => item.curriculumCuriId === id); oldCard.replaceWith(card(relation, view, load)); }
        else {
          results.replaceChildren();
          const choose = field(results, "필요한 공식 관계 직접 선택 (다른 관계를 자동 변경하지 않음)", "", "select"); choose.append(element("option", "공식 성취기준 선택")); choose.firstChild.value = "";
          for (const standard of view.standards) { const option = element("option", `${GradeContext.standardLabel(standard)} · ${standard.requirement}`); option.value = standard.curriculumCuriId; choose.append(option); }
          choose.addEventListener("change", () => { if (busy || !choose.value || dirty.size && !confirm("미저장 입력을 취소하고 선택한 관계를 열까요?")) return; discardInputs(); const url = new URL(location.href); url.searchParams.set("standardId", choose.value); history.replaceState(null, "", url); load(); });
          for (const relation of view.relations) results.append(card(relation, view, load));
          for (const archived of view.archived || []) {
            const history = element("details"); history.append(element("summary", `${GradeContext.standardLabel(archived.standardSnapshot)} · 공식 기준 변경으로 현재 승인 불가 · 이전 사람 이력 ${archived.history.length}건`));
            appendHistory(history, archived.history); results.append(history);
          }
          if (!view.relations.length) results.append(element("p", "자동·기존 후보가 없습니다. 공식 관계를 직접 선택하거나 원문을 보강하세요."));
        }
        status.textContent = notice || `${view.operator} · 현재 원문 버전으로 검토하세요.`;
        if (!oldCard) (results.querySelector(`[data-standard="${CSS.escape(new URLSearchParams(location.search).get("standardId") || "")}"]`) || panel).scrollIntoView({ block: "start" });
      } catch (error) { status.textContent = error.message + " 열기 버튼으로 다시 조회할 수 있습니다."; }
    }
    open.addEventListener("click", () => { if (busy || dirty.size && !confirm("미저장 입력을 취소하고 다시 조회할까요?")) return; discardInputs(); const url = new URL(location.href); url.searchParams.set("human", "1"); history.replaceState(null, "", url); load(); });
    if (new URLSearchParams(location.search).get("human") === "1") load();
  };
  window.addEventListener("beforeunload", (event) => { if (dirty.size || busy) { event.preventDefault(); event.returnValue = ""; } });
  document.addEventListener("click", (event) => { if (event.target.closest("a[href]") && (dirty.size || busy) && !confirm("미저장 입력을 두고 이동할까요?")) event.preventDefault(); });
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input,textarea,select,[contenteditable=true]")) return;
    if (event.key.toLowerCase() === "s" && activeForm?.isConnected) { event.preventDefault(); activeForm.requestSubmit(); }
    if (event.key.toLowerCase() === "n" && !busy) { event.preventDefault(); const next = document.querySelector('[aria-label="작업 자료 이동"] a:last-of-type'); if (next?.textContent.includes("다음 자료")) next.click(); }
  });
  CuriAdmin.human = { get dirty() { return dirty.size > 0 || busy; }, reset() { if (!busy) dirty.clear(); } };
})();
