(() => {
  const { $, element, link, externalLink, managedLink, states, labels, date, adminUrl } = CuriAdmin;
  function panel(parent, title) { const node = element("section", null, "panel"); node.append(element("h3", title)); parent.append(node); return node; }
  function disclosure(parent, title) { const node = element("details", null, "panel"); node.append(element("summary", title)); parent.append(node); return node; }
  function relationPanel(parent, relation, run, row) {
    const { evidence, asset, currentReasons } = relation, section = panel(parent, `${GradeContext.standardLabel(evidence.standard)} · ${labels[evidence.semantic.status] || evidence.semantic.status}`);
    section.id = relation.relationId;
    section.append(element("p", `검사 당시 구조 ${labels[evidence.inspection.status]} · 현재 ${currentReasons.length ? "변경으로 제공 중단" : asset?.state === "BLOCKED" ? "사람 결정 우선" : asset?.search_state === "READY" ? "자동 부분 연계 후보 제공" : "공개 미제공"}`, "relation-state"));
    if (currentReasons.length) section.append(element("p", currentReasons.map((reason) => labels[reason] || reason).join(" · "), "notice"));
    if (asset?.reason) section.append(element("p", `${labels[asset.reason] || asset.reason}${asset.human_review_ref ? ` · 실제 검토 ${asset.human_review_ref}` : ""}`));
    section.append(element("h4", "성취기준의 요구"), element("p", evidence.standard.requirement));
    if (currentReasons.includes("STANDARD_CHANGED")) section.append(element("p", `현재 기준: ${relation.currentStandard?.requirement || "현재 공식 목록에서 찾지 못함"}`));
    section.append(element("p", `${evidence.standard.curriculumVersion} · ${evidence.standard.document} ${evidence.standard.page}쪽`, "muted"));
    for (const quote of evidence.quotes) section.append(element("blockquote", quote.quote), element("p", `검사 원문 ${quote.field} 위치 ${quote.start}–${quote.end} (UTF-16) · 판본 ${quote.variant}`, "muted"));
    section.append(element("h4", "연결되는 부분"), element("p", evidence.semantic.connectedParts.join(" / ") || "확인된 관계 설명 없음"),
      element("h4", "확인되지 않은 부분"), element("p", evidence.semantic.unconfirmedParts.join(" / ")));
    const failures = evidence.inspection.checks.filter((check) => check.status !== "PASS");
    section.append(element("p", evidence.semantic.reason));
    for (const check of failures) section.append(element("p", `${check.code} · ${labels[check.status]} · ${check.message}`, "check-failure"));
    const checks = element("details"); checks.append(element("summary", `전체 자동 조건 ${evidence.inspection.checks.length}개 · 검사 당시 결과`));
    for (const check of evidence.inspection.checks) checks.append(element("p", `${labels[check.status]} · ${check.code} · ${check.message}`));
    section.append(checks, element("p", `${date(evidence.inspection.checkedAt)} · ${evidence.ruleVersion} · 원문 ${evidence.source.contentHash.slice(0, 12)} · 기준 ${evidence.standard.evidenceHash.slice(0, 12)}`, "muted"));
    if (run.id && relation.persisted) section.append(managedLink("이 근거를 보며 관계별 사람 검토 열기", "/review.html",
      { ...(row.contentCuriId ? { contentCuriId: row.contentCuriId } : { resourceId: row.id }), standardId: evidence.standard.curriculumCuriId, subject: evidence.standard.subject, gradeBand: evidence.standard.courseLabel || (evidence.standard.courseId ? GradeContext.gradeLabel(evidence.standard.courseId) : evidence.standard.gradeBand), automaticRunId: run.id, automaticRelationId: relation.relationId }));
  }
  function renderAutomatic(parent, data) {
    const row = data.resource, section = panel(parent, "자동 후보·근거 검사·저장");
    const controls = element("div", null, "actions"), label = element("label", "연계 후보 교과 "), subject = element("select"); subject.id = "automatic-subject";
    for (const [value, text] of [["", "교과 선택"], ["사회", "사회"], ["과학", "과학"]]) { const option = element("option", text); option.value = value; subject.append(option); }
    subject.value = new URLSearchParams(location.search).get("subject") || data.automatic.latest.at(-1)?.subject || (["사회", "과학"].includes(data.sourceRecord?.metadata.subjectSeed) ? data.sourceRecord.metadata.subjectSeed : "");
    label.append(subject); controls.append(label);
    const gradeLabel = element("label", "연계 과정 "), grade = element("select"); grade.id = "automatic-grade";
    for (const item of GradeContext.courseOptions) { const option = element("option", item.label); option.value = item.label; grade.append(option); }
    const selectedGrade = new URLSearchParams(location.search).get("gradeBand") || data.automatic.latest.at(-1)?.grade_band || "초등 5~6학년군";
    grade.value = GradeContext.gradeLabel(GradeContext.courseForGrade(selectedGrade));
    gradeLabel.append(grade); controls.append(gradeLabel);
    const selectedStandard = () => new URLSearchParams(location.search).get("standardId")?.trim() || "";
    const criterion = element("p", null, "notice"); criterion.id = "automatic-selected-standard";
    function showCriterion() { const id = selectedStandard(); criterion.hidden = !id; criterion.textContent = id ? `선택한 성취기준 ${id} · 이 기준으로 미리보기·자동 검사합니다.` : ""; }
    showCriterion();
    for (const select of [grade, subject]) select.addEventListener("change", () => { const url = new URL(location.href); url.searchParams.set("gradeBand", grade.value); url.searchParams.set("subject", subject.value); url.searchParams.delete("standardId"); history.replaceState(null, "", url); showCriterion(); });
    const status = element("p", "자동 검사는 사람 검토를 요구하지 않습니다. 현재 지원 범위 밖의 관계는 보류합니다."); status.id = "automatic-action-status"; status.setAttribute("role", "status");
    function action(text, operation, runId) {
      const button = element("button", text); button.type = "button";
      button.disabled = operation !== "search" && !row.automaticAllowed;
      button.addEventListener("click", () => {
        try { CuriAdmin.jobs.prepare([row], operation, subject.value, runId, grade.value, selectedStandard()); CuriAdmin.jobs.start(); }
        catch (error) { status.textContent = error.message; }
      }); return button;
    }
    controls.append(action("저장 출처 점검", "source"), action(row.work.automatic.processed ? "자동 재검사·저장" : "자동 검사·저장", "process"));
    const preview = element("button", "후보·근거만 미리보기"); preview.type = "button"; preview.disabled = !row.automaticAllowed;
    const previewResult = element("div");
    preview.addEventListener("click", async () => {
      if (!["사회", "과학"].includes(subject.value)) { status.textContent = "교과를 선택하세요."; return; }
      preview.disabled = true; status.textContent = "현재 원문으로 후보 생성·근거 검사 중 · 아직 저장하지 않습니다.";
      try {
        const input = row.contentCuriId ? { contentCuriId: row.contentCuriId, subject: subject.value } : { resourceId: row.id, subject: subject.value };
        input.gradeBand = grade.value;
        if (selectedStandard()) input.standardId = selectedStandard();
        const response = await fetch("/api/curimap/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error);
        previewResult.replaceChildren(element("p", `저장 전 미리보기 · 후보 ${result.summary.candidates} · 공개 조건 충족 ${result.summary.publishable}. ${result.hold?.message || ""}`));
        for (const [index, evidence] of result.relations.entries()) relationPanel(previewResult, { evidence, relationId: `preview-${index}`, currentReasons: [], asset: null }, { id: "" }, row);
        status.textContent = "미리보기 완료 · 아직 실행 이력·자산을 저장하지 않았습니다. 저장 버튼은 현재 원문을 다시 대조합니다.";
      } catch (error) { status.textContent = error.message; previewResult.replaceChildren(); }
      finally { preview.disabled = !row.automaticAllowed; }
    });
    controls.append(preview); section.append(controls, criterion, status, previewResult);
    if (!row.automaticAllowed) section.append(element("p", "검사 대상 원본이 없거나 비활성입니다. 아래 원문 보강·가져오기에서 확인하세요."));
    if (!data.automatic.latest.length) section.append(element("p", "자동 처리 이력이 없는 자료입니다. 기존 AI 초안이 없어도 원본 ID로 검사할 수 있습니다."));
    for (const run of data.automatic.latest) {
      const report = run.report, block = panel(parent, `${run.subject || "교과 미지정"} · ${labels[run.displayState] || run.displayState}`);
      block.append(element("p", `실행 ${run.id} · ${date(run.finished_at || run.started_at)}`, "muted"));
      block.append(element("p", `후보 생성 ${report ? `${report.summary.candidates}관계` : "미완료"} → 구조 검사 ${report ? `통과 ${report.summary.structurallyPassed}관계` : "미완료"} → 저장 ${labels[run.displayState] || run.displayState} → 검색 준비 ${run.assets.filter((asset) => asset.state === "CURRENT" && asset.search_state === "READY").length}관계`));
      if (run.error) block.append(element("p", labels[run.error] || run.error, "check-failure"));
      if (report?.hold) block.append(element("p", `${report.hold.code} · ${report.hold.message}`));
      if (report?.sourceQuality) block.append(element("p", report.sourceQuality.message));
      if (run.currentReasons.length) block.append(element("p", `현재 변경: ${run.currentReasons.map((reason) => labels[reason] || reason).join(" · ")}`, "notice"));
      if (run.assets.some((asset) => asset.state === "CURRENT" && ["FAILED", "PENDING"].includes(asset.search_state))) block.append(action("이 실행의 검색 준비만 재시도", "search", run.id));
      for (const relation of run.relations) relationPanel(block, relation, run, row);
    }
  }
  CuriAdmin.renderDetail = (data) => {
    const row = data.resource, root = $("#detail-content"); $("#detail-title").textContent = row.title; root.append(states(row));
    const nav = element("nav", null, "actions"); nav.setAttribute("aria-label", "작업 자료 이동");
    if (data.navigation.previous) nav.append(link("← 이전 자료", adminUrl(data.navigation.previous, data.navigation.position - 1)));
    if (data.navigation.next) nav.append(link("다음 자료 →", adminUrl(data.navigation.next, data.navigation.matching ? data.navigation.position + 1 : data.navigation.position)));
    else nav.append(element("span", "현재 조건의 마지막 자료입니다."));
    nav.append(element("p", data.navigation.matching ? `현재 조건 ${data.navigation.position + 1}/${data.navigation.total}` : "처리 후 현재 목록 조건에서 빠졌습니다. 근거는 계속 확인할 수 있습니다.")); root.append(nav);
    const compare = element("div", null, "comparison-grid"), sourceColumn = element("div"), relationsColumn = element("div"); compare.append(sourceColumn, relationsColumn); root.append(compare);
    const source = panel(sourceColumn, "현재 원문과 출처"); source.append(element("p", `${row.program || ""} · ${row.id} · 판본 ${row.variant || data.sourceRecord?.metadata.variant || "UNSPECIFIED"}`),
      element("p", row.work.quality.message), element("div", row.summary || "공개 소개문 없음", "source-text"), externalLink(row.navigation?.label || "현재 출처 열기", row.navigation?.url || row.sourceUrl),
      element("p", row.navigation?.note || "출처의 제목·원본 ID 확인 필요"), element("p", `원문 변경/수집 기록 ${date(row.work.changedAt)} · 실제 변경 시각은 별도 확인`, "muted"));
    source.append(managedLink(data.sourceRecord ? "원문·입력 정보 수정" : "검수 대상으로 가져오기", "/ingestion.html", { resourceId: row.id }));
    source.append(element("p", "소개문 보강은 공개 출처에서 확인한 문장을 입력합니다. 관리자 의견·검수 메모를 원문 인용으로 사용하지 않습니다."));
    if (data.sourceRecord) { const history = disclosure(sourceColumn, "원문 변경과 재검수 기록"); for (const entry of data.sourceRecord.review?.history || []) history.append(element("p", `${entry.recordedAt} · ${entry.reason || entry.status}`)); }
    renderAutomatic(relationsColumn, data);
    CuriAdmin.renderHumanReview(root, data);
    const tags = disclosure(root, "등록 어휘·주제 태그 (학습 관계 검사와 별도)");
    tags.append(element("p", "등록 어휘를 찾지 못해도 정상 자료일 수 있습니다. 태그 수는 원문 충실도·인용 실패·교육과정 의미 정확도가 아닙니다."));
    if (!data.tags.supported.length) tags.append(element("p", "등록 어휘 미발견"));
    for (const tag of [...data.tags.supported, ...data.tags.candidates]) { const item = element("div", null, "evidence"); item.append(element("strong", `${tag.label} · ${tag.status}`), element("blockquote", tag.evidence.quote)); tags.append(item); }
    const human = disclosure(root, "선택적 사람 검토와 기존 승인 이력");
    human.append(element("p", "자동 검사를 사람 승인으로 바꾸지 않습니다. 사람 검토는 실제 원문과 기준을 확인한 후 별도로 기록합니다."));
    if (data.mappingAllowed) {
      const links = element("span"); human.append(links);
      const refreshLinks = () => links.replaceChildren(managedLink("CuriMap 초안·공식 후보 확인", "/curimap.html", { contentCuriId: row.contentCuriId }), element("span", " · "), managedLink("사람 검수·승인 저장·검색 준비", "/review.html", { contentCuriId: row.contentCuriId }));
      refreshLinks();
      for (const selector of ["#automatic-grade", "#automatic-subject"]) $(selector).addEventListener("change", refreshLinks);
    }
    if (data.gate) human.append(element("p", data.gate.eligible ? "기존 사람 승인 저장 조건 충족" : `기존 승인 조건: ${data.gate.reasons.join(" ")}`));
    for (const run of data.runs) for (const review of run.reviewHistory) human.append(element("p", `${review.reviewedAt} · ${labels[review.status] || review.status} · 관리자 검토 메모: ${review.note || "없음"}`));
    human.append(element("p", `현재 사람 승인 ${data.assets.length}관계 · 무효화 이력 ${data.invalidatedAssets.length}건`));
    for (const asset of data.assets) human.append(element("p", `${asset.standard.metadata.achievementStandardId} · ${asset.standard.metadata.achievementStandard}`));
    const history = disclosure(root, "자동 실행·재시도 이력");
    for (const run of [...data.automatic.history].reverse()) history.append(externalHistoryLink(run));
    if (!data.automatic.history.length) history.append(element("p", "실행 이력 없음"));
    const selectedRelation = new URLSearchParams(location.search).get("relationId");
    if (selectedRelation) document.getElementById(selectedRelation)?.scrollIntoView({ block: "center" });
  };
  function externalHistoryLink(run) {
    const node = element("details"); node.append(element("summary", `${run.id} · ${labels[run.state] || run.state} · ${date(run.finished_at || run.started_at)}`));
    node.append(element("p", `${run.error ? labels[run.error] || run.error : "완료 당시 상태"}${run.retry_of ? ` · 이전 실행 ${run.retry_of}` : ""}`), link("보존된 원문·인용·검사 기록 열기", `/api/admin/automatic-assets?runId=${encodeURIComponent(run.id)}`)); return node;
  }
})();
