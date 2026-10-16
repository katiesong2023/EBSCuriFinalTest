const reviewForm = document.querySelector("#review-form");
const decisionInputs = [...document.querySelectorAll('input[name="decision"]')];
const reviewNote = document.querySelector("#review-note");
const decisionStatus = document.querySelector("#decision-status");
const saveDecision = document.querySelector("#save-decision");
const backLink = document.querySelector("#back-link");
const reviewNotice = document.querySelector("#review-notice");
const reviewStateTitle = document.querySelector("#review-state-title");
const reviewStateMessage = document.querySelector("#review-state-message");
const reviewStatusBadge = document.querySelector("#review-status-badge");
const recoveryNote = document.querySelector("#recovery-note");
const contentTitle = document.querySelector("#content-title");
const contentMetadata = document.querySelector("#content-metadata");
const publicText = document.querySelector("#public-text");
const sourceLink = document.querySelector("#source-link");
let sourceNavigation = null;
const standardResults = document.querySelector("#standard-results");
const draftStatus = document.querySelector("#draft-status");
const draftCard = document.querySelector("#draft-card");
const progressSteps = [...document.querySelectorAll(".progress-step")];

const decisionLabels = {
  approve: "승인",
  edit: "수정",
  exclude: "제외"
};

const editFields = document.querySelector("#edit-fields");
const officialOptions = document.querySelector("#official-options");
const editCoreConcepts = document.querySelector("#edit-core-concepts");
const editRationale = document.querySelector("#edit-rationale");
const editTeachingUse = document.querySelector("#edit-teaching-use");
const reviewConfirmed = document.querySelector("#review-confirmed");
const savedReview = document.querySelector("#saved-review");
const saveVerified = document.querySelector("#save-verified");
const verifiedStatus = document.querySelector("#verified-status");
const verifiedDetails = document.querySelector("#verified-details");
const verifiedBadge = document.querySelector("#verified-badge");
let verifiedState = null;
let currentRun = null;
let reviewOptions = null;
let isSaving = false;
let isReviewableDraft = false;
let availableDecisions = new Set(Object.keys(decisionLabels));
const searchIndexUi = createSearchIndexUi({
  getInput: () => ({ contentCuriId: verifiedState.contentCuriId, mappingRunId: currentRun.mappingRunId,
    reviewId: currentRun.reviewHistory.at(-1).reviewId, contentVersion: reviewOptions.contentVersion }),
  setBusy: (busy) => { isSaving = busy; setSavingState(busy); }
});

decisionInputs.forEach((input) => input.addEventListener("change", updateDecisionState));
reviewForm.addEventListener("submit", saveReviewDecision);
saveVerified.addEventListener("click", saveToCuriBase);
initializeReview();

async function initializeReview() {
  searchIndexUi.clear();
  verifiedState = null;
  saveVerified.disabled = true;
  const contentCuriId = new URLSearchParams(window.location.search).get("contentCuriId");
  setRecoveryNote(contentCuriId);

  if (!contentCuriId) {
    renderMissingContent();
    setVerifiedStatus("error", "CuriMap에서 콘텐츠를 선택하세요.");
    return;
  }

  backLink.href = `/curimap.html?contentCuriId=${encodeURIComponent(contentCuriId)}`;

  try {
    const [contentsResponse, draftResponse, optionsResponse] = await Promise.all([
      fetch("/api/curimap/contents"),
      fetch(`/api/curimap/draft?contentCuriId=${encodeURIComponent(contentCuriId)}`),
      fetch(`/api/curimap/review-options?contentCuriId=${encodeURIComponent(contentCuriId)}`)
    ]);
    const [contentsPayload, draftPayload, optionsPayload] = await Promise.all([
      readJsonResponse(contentsResponse),
      readJsonResponse(draftResponse),
      readJsonResponse(optionsResponse)
    ]);

    if (!contentsResponse.ok || !draftResponse.ok || !optionsResponse.ok) {
      throw new Error(contentsPayload.error ?? draftPayload.error ?? optionsPayload.error ?? "저장된 연계 결과를 읽지 못했습니다.");
    }

    const content = contentsPayload.contents.find((item) => item.curiId === contentCuriId);
    if (!content) {
      throw new Error("선택한 콘텐츠를 현재 CuriMap 목록에서 찾지 못했습니다.");
    }

    currentRun = draftPayload.run;
    reviewOptions = optionsPayload;
    renderContent(content);
    renderLatestRun(draftPayload.run);
    renderReviewHistory();
    await refreshVerifiedStatus(contentCuriId);
  } catch (error) {
    renderLoadFailure(error.message);
    setVerifiedStatus("error", "저장 상태를 읽지 못했습니다. 새로고침하세요.");
  }
}

function renderContent(content) {
  sourceNavigation = content.navigation ?? null;
  contentTitle.textContent = content.title;
  contentMetadata.replaceChildren();
  appendDetail(contentMetadata, "프로그램", content.programName ?? "공식 클립 메타데이터");
  appendDetail(contentMetadata, "교과·학년", `${content.subject} · ${content.gradeBand}`);
  appendDetail(contentMetadata, "검수할 공식 교과", reviewOptions?.curriculumSubject ?? content.subject);
  appendDetail(
    contentMetadata,
    "출처 상태",
    content.descriptionProvenance ?? "공식 EBS 원문 상태를 다시 확인하세요."
  );

  publicText.textContent = content.synopsis ?? "공개 소개문이 저장되지 않아 실제 AI 연계 실행 대상이 아닙니다.";
  setSourceLink(content.sourceUrl);
}

function renderLatestRun(run) {
  if (!run) {
    setReviewPageState(
      "held",
      "아직 연계 실행 이력이 없습니다.",
      "CuriMap에서 이 콘텐츠의 공식 후보를 확인한 뒤 AI 연계 초안을 생성하세요.",
      "NOT_RUN"
    );
    setDraftStatus("held", "아직 저장된 연계 실행 결과가 없습니다.");
    setDraftMessage("이 콘텐츠는 CuriMap에서 AI 연계 초안을 다시 실행해야 합니다.");
    setStandardMessage("저장된 연계 결과가 없어서 선택된 공식 성취기준을 표시할 수 없습니다.");
    setReviewAvailability(false, "검수할 AI 초안이 아직 준비되지 않았습니다.");
    setProgress("source");
    return;
  }

  const result = run.result ?? {};
  if (result.status === "RUNNING") {
    setReviewPageState("held", "연계 실행 중입니다.", "완료 후 새로고침해 결과를 확인하세요.", "RUNNING");
    setDraftStatus("held", "AI 초안 생성이 아직 완료되지 않았습니다.");
    setDraftMessage("실행 중에는 검수하거나 다시 실행하지 마세요.");
    setStandardMessage("완료된 성취기준 결과가 아직 없습니다.");
    setReviewAvailability(false, "실행이 완료된 뒤 새로고침하세요.");
    setProgress("source");
    return;
  }
  if (result.status === "DRAFT") {
    renderDraftResult(result, run);
    return;
  }

  if (result.status === "HELD") {
    const message = result.hold?.message ?? "공개 텍스트와 공식 후보의 연결 근거가 부족해 보류했습니다.";
    if (result.hold?.code === "MODEL_HELD" && (result.candidateOptions ?? []).length > 0) {
      setReviewPageState(
        "held",
        "AI 연계가 보류되었습니다.",
        `${message} 공식 후보를 확인한 뒤 사람 수정으로 검수를 계속할 수 있습니다. AI 보류 결과 자체는 승인할 수 없습니다.`,
        "HELD · EDIT_REQUIRED"
      );
      setDraftStatus("held", "AI 보류 결과입니다. 사람 수정 검수만 가능합니다.");
      renderHeldDraftCard(result);
      renderStandards(result.candidateOptions);
      setReviewAvailability(true, "승인은 비활성화되어 있습니다. 공식 후보를 선택하고 사람 수정으로 저장하세요.", ["edit", "exclude"]);
      prepareEditFieldsFromCandidates(result.candidateOptions);
      setProgress("decision");
      return;
    }
    setReviewPageState("held", "연계 실행이 보류되었습니다.", message, "HELD");
    setDraftStatus("held", `보류: ${message}`);
    setDraftMessage("최종 선택된 성취기준이 없으므로 검수 판단을 진행하지 않습니다.");
    setStandardMessage("보류된 실행에는 선택된 공식 성취기준이 없습니다.");
    setReviewAvailability(false, "보류된 실행은 CuriMap에서 원문·후보를 확인한 뒤 다시 실행하세요.");
    setProgress("source");
    return;
  }

  const message = result.failure?.message ?? run.failure?.message ?? "AI 연계 초안을 만들지 못했습니다.";
  setReviewPageState("error", "연계 실행이 실패했습니다.", message, "FAILED");
  setDraftStatus("error", `실패: ${message}`);
  setDraftMessage("실패한 실행 결과는 검수하거나 저장할 수 없습니다.");
  setStandardMessage("실패한 실행에는 검수할 성취기준 결과가 없습니다.");
  setReviewAvailability(false, "실패 원인을 확인한 뒤 CuriMap에서 해당 콘텐츠를 다시 실행하세요.");
  savedReview.replaceChildren(createElement("p", "검수 기록을 표시할 수 없습니다."));
  setProgress("source");
}

function renderDraftResult(result, run) {
  setReviewPageState(
    "success",
    "검수 전 AI 초안을 불러왔습니다.",
    "이 결과는 사람 검수 전 초안입니다. CuriBase 저장과 검색 공개에는 아직 사용되지 않습니다.",
    "REVIEW_REQUIRED"
  );
  setDraftStatus("success", "사람 확인 전 초안입니다. 공식 후보 밖의 성취기준은 포함하지 않습니다.");
  publicText.textContent = result.publicText?.text ?? publicText.textContent;
  setSourceLink(result.publicText?.sourceUrl);
  renderStandards(result.selectedCandidates ?? []);
  renderDraftCard(result, run);
  setReviewAvailability(true, "검수 방향을 선택하면 이 영역에 현재 선택이 표시됩니다.");
  prepareEditFields();
  setProgress("decision");
}

function renderStandards(candidates) {
  standardResults.replaceChildren();
  if (candidates.length === 0) {
    setStandardMessage("선택된 공식 성취기준이 없습니다.");
    return;
  }

  for (const candidate of candidates) {
    const item = document.createElement("section");
    item.className = "standard-item";
    item.append(createElement("strong", GradeContext.standardLabel(candidate)));
    item.append(createElement("p", candidate.achievementStandard));
    item.append(
      createElement(
        "p",
        `${candidate.unit?.number ?? "단원 미확인"} · ${candidate.unit?.title ?? "단원 미확인"}`,
        "standard-meta"
      )
    );
    item.append(
      createElement(
        "p",
        `${candidate.officialSource?.document ?? "공식 원문"} · PDF ${candidate.officialSource?.pdfPage ?? "쪽수 미확인"}쪽`,
        "standard-meta"
      )
    );
    standardResults.append(item);
  }
}

function renderDraftCard(result, run) {
  draftCard.replaceChildren();
  const header = document.createElement("div");
  header.className = "draft-header";
  const headerText = document.createElement("div");
  headerText.append(createElement("p", "연계된 공식 성취기준", "text-label"));
  headerText.append(
    createElement(
      "h3",
      (result.selectedCandidates ?? []).map((candidate) => GradeContext.standardLabel(candidate)).join(", ")
    )
  );
  header.append(headerText, createElement("span", `confidence ${result.confidence?.value ?? "미제공"}`, "confidence-badge"));
  draftCard.append(header);

  const concepts = document.createElement("div");
  concepts.className = "draft-detail";
  concepts.append(createElement("h4", "핵심개념"));
  const tags = document.createElement("div");
  tags.className = "tag-list";
  for (const concept of result.coreConcepts ?? []) {
    tags.append(createElement("span", concept));
  }
  concepts.append(tags);
  draftCard.append(concepts);
  appendDraftDetail(draftCard, "연계근거", result.rationale);
  appendDraftDetail(draftCard, "수업 활용", result.teachingUse);

  const meta = document.createElement("div");
  meta.className = "draft-detail draft-meta";
  meta.append(
    createElement("span", `모델: ${result.invocation?.model ?? run.model ?? "미제공"}`),
    createElement("span", `실행 지연: ${result.invocation?.latencyMs ?? run.latencyMs ?? "미제공"}ms`),
    createElement("span", "검수 전 상태")
  );
  draftCard.append(meta);
}

function renderHeldDraftCard(result) {
  draftCard.replaceChildren();
  const header = document.createElement("div");
  header.className = "draft-header";
  const headerText = document.createElement("div");
  headerText.append(createElement("p", "AI 연계 보류", "text-label"));
  headerText.append(createElement("h3", "사람이 공식 후보를 선택해 수정 검수할 수 있습니다."));
  header.append(headerText, createElement("span", "승인 불가", "confidence-badge"));
  draftCard.append(header);
  appendDraftDetail(draftCard, "보류 사유", result.hold?.message);
  appendDraftDetail(draftCard, "다음 단계", "공식 후보를 하나 이상 선택하고 수정 연계근거·수업 활용을 입력한 뒤 사람 수정으로 저장하세요.");
}

function renderMissingContent() {
  setReviewPageState(
    "held",
    "검수할 콘텐츠가 선택되지 않았습니다.",
    "CuriMap에서 콘텐츠를 선택하고 연계 실행 결과를 연 뒤 검수 화면으로 이동하세요.",
    "NO_CONTENT"
  );
  setDraftStatus("held", "선택한 콘텐츠가 없어 최근 실행 결과를 불러올 수 없습니다.");
  setDraftMessage("CuriMap에서 검수할 콘텐츠를 먼저 선택하세요.");
  setStandardMessage("선택한 콘텐츠가 없습니다.");
  setReviewAvailability(false, "검수할 콘텐츠와 AI 초안이 필요합니다.");
  savedReview.replaceChildren(createElement("p", "검수 기록을 표시할 수 없습니다."));
  setProgress("source");
}

function renderLoadFailure(message) {
  setReviewPageState("error", "연계 결과를 불러오지 못했습니다.", message, "LOAD_FAILED");
  setDraftStatus("error", `불러오기 실패: ${message}`);
  setDraftMessage("새로고침 후에도 같은 문제가 있으면 CuriMap에서 다시 실행하세요.");
  setStandardMessage("연계 결과를 읽지 못했습니다.");
  setReviewAvailability(false, "결과를 불러오지 못해 검수를 시작할 수 없습니다.");
  savedReview.replaceChildren(createElement("p", "검수 기록을 표시할 수 없습니다."));
  setProgress("source");
}

function setReviewPageState(state, title, message, badge) {
  reviewNotice.dataset.state = state;
  reviewStateTitle.textContent = title;
  reviewStateMessage.textContent = message;
  reviewStatusBadge.textContent = badge;
  reviewStatusBadge.className = `badge badge-${state}`;
}

function setDraftStatus(state, message) {
  draftStatus.dataset.state = state;
  draftStatus.replaceChildren();
  const dot = document.createElement("span");
  dot.className = "status-dot";
  dot.setAttribute("aria-hidden", "true");
  draftStatus.append(dot, document.createTextNode(message));
}

function setDraftMessage(message) {
  draftCard.replaceChildren(createElement("p", message, "empty-state"));
}

function setStandardMessage(message) {
  standardResults.replaceChildren(createElement("p", message, "empty-state"));
}

function setReviewAvailability(isAvailable, message, decisions = Object.keys(decisionLabels)) {
  isReviewableDraft = isAvailable;
  availableDecisions = new Set(decisions);
  decisionInputs.forEach((input) => {
    input.disabled = !isAvailable || !availableDecisions.has(input.value);
    if (!isAvailable || !availableDecisions.has(input.value)) {
      input.checked = false;
    }
  });
  reviewNote.disabled = !isAvailable;
  reviewConfirmed.disabled = !isAvailable;
  editFields.disabled = !isAvailable || getSelectedDecision() !== "edit";
  reviewNote.required = false;
  saveDecision.disabled = !isAvailable || !getSelectedDecision();
  if (!isAvailable) {
    reviewNote.value = "";
    reviewNote.placeholder = "검수 전 AI 초안이 준비되면 입력할 수 있습니다.";
  }
  setDecisionStatus(isAvailable ? "idle" : "error", message);
  updateVerifiedButton();
}

function setProgress(currentStep) {
  const order = ["source", "draft", "decision"];
  const currentIndex = order.indexOf(currentStep);
  progressSteps.forEach((step) => {
    step.classList.toggle("is-current", order.indexOf(step.dataset.step) <= currentIndex);
  });
}

function setRecoveryNote(contentCuriId) {
  recoveryNote.textContent = contentCuriId
    ? "이 주소에는 콘텐츠 ID만 포함됩니다. 새로고침과 뒤로가기는 저장된 최근 연계 실행 결과와 해당 실행의 검수 기록을 다시 표시합니다. 저장하지 않은 입력은 복구되지 않습니다. 실행 중 페이지를 떠났거나 결과가 없거나 실패했다면 CuriMap에서 이 콘텐츠를 다시 실행하세요."
    : "콘텐츠 ID가 없는 주소는 연계 결과를 복구할 수 없습니다. CuriMap에서 콘텐츠를 선택해 검수 화면으로 이동하세요.";
}

function setSourceLink(url) {
  sourceLink.replaceChildren();
  if (sourceNavigation?.url) {
    sourceLink.href = sourceNavigation.url;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    sourceLink.textContent = `${sourceNavigation.label} ↗`;
    sourceLink.title = sourceNavigation.note;
    return;
  }
  if (!url) {
    sourceLink.href = "/curimap.html";
    sourceLink.textContent = "EBS 원문 URL이 저장되지 않았습니다.";
    return;
  }
  sourceLink.href = `https://www.ebs.co.kr/search?${new URLSearchParams({ query: contentTitle.textContent || "EBS" })}`;
  sourceLink.target = "_blank";
  sourceLink.rel = "noreferrer";
  sourceLink.append("EBS에서 제목 검색 ", createElement("span", "↗"));
  sourceLink.lastElementChild.setAttribute("aria-hidden", "true");
}

function appendDetail(list, label, value) {
  const row = document.createElement("div");
  row.append(createElement("dt", label), createElement("dd", value));
  list.append(row);
}

function appendDraftDetail(container, label, value) {
  const detail = document.createElement("div");
  detail.className = "draft-detail";
  detail.append(createElement("h4", label), createElement("p", value ?? "미제공"));
  container.append(detail);
}

function prepareEditFields() {
  prepareEditFieldsFromCandidates(currentRun?.result?.selectedCandidates ?? []);
}

function prepareEditFieldsFromCandidates(candidates) {
  const latest = currentRun?.reviewHistory?.at(-1);
  const edited = latest?.decision === "edit" ? latest.result : null;
  const ids = edited?.curriculumCuriIds ?? candidates.map((item) => item.curriculumCuriId);
  editCoreConcepts.value = edited?.coreConcepts?.join(", ") ?? currentRun.result.coreConcepts?.join(", ") ?? "";
  editRationale.value = edited?.rationale ?? currentRun.result.rationale ?? "";
  editTeachingUse.value = edited?.teachingUse ?? currentRun.result.teachingUse ?? "";
  officialOptions.replaceChildren();
  for (const standard of reviewOptions.standards) {
    const label = document.createElement("label");
    label.className = "official-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = standard.curiId;
    input.checked = ids.includes(standard.curiId);
    const text = document.createElement("span");
    text.append(createElement("strong", GradeContext.standardLabel(standard)));
    text.append(createElement("span", standard.metadata.achievementStandard));
    text.append(createElement("small", `${standard.source.sourceDocument} · PDF ${standard.source.sourcePdfPage}쪽`));
    label.append(input, text);
    officialOptions.append(label);
  }
}

function updateDecisionState() {
  const decision = getSelectedDecision();
  if (decision && !availableDecisions.has(decision)) {
    decisionInputs.find((input) => input.value === decision).checked = false;
    setDecisionStatus("error", "현재 보류 결과에서는 승인할 수 없습니다. 사람 수정 또는 제외를 선택하세요.");
    return;
  }
  saveDecision.disabled = isSaving || !isReviewableDraft || !decision;
  editFields.hidden = decision !== "edit";
  editFields.disabled = isSaving || !isReviewableDraft || decision !== "edit";
  reviewNote.required = decision === "edit" || decision === "exclude";
  reviewConfirmed.checked = false;
  reviewNote.placeholder = decision === "edit" ? "어떤 내용을 왜 수정했는지 입력하세요." :
    decision === "exclude" ? "이 연계를 제외하는 사유를 입력하세요." : "검수 메모를 입력하세요. (선택)";
  setDecisionStatus("idle", `${decisionLabels[decision]}을 선택했습니다. 원문 검토 확인 후 저장하세요.`);
  updateVerifiedButton();
}

async function saveReviewDecision(event) {
  event.preventDefault();
  const decision = getSelectedDecision();
  if (isSaving || !isReviewableDraft || !decision || !availableDecisions.has(decision)) return;
  if (!reviewConfirmed.checked || ((decision === "edit" || decision === "exclude") && !reviewNote.value.trim())) {
    setDecisionStatus("error", "검수 사유와 원문 검토 확인을 입력하세요.");
    return;
  }
  const curriculumCuriIds = [...officialOptions.querySelectorAll("input:checked")].map((input) => input.value);
  if (decision === "edit" && (!curriculumCuriIds.length || !editCoreConcepts.value.trim() || !editRationale.value.trim() || !editTeachingUse.value.trim())) {
    setDecisionStatus("error", "공식 성취기준을 하나 이상 선택하고 수정 핵심개념·연계근거·수업 활용을 입력하세요.");
    return;
  }
  const coreConcepts = editCoreConcepts.value.split(",").map((item) => item.trim()).filter(Boolean);
  if (decision === "edit" && (coreConcepts.length > 6 || coreConcepts.some((item) => item.length > 400))) {
    setDecisionStatus("error", "수정 핵심개념은 6개 이하로, 각 항목은 400자 이하로 입력하세요.");
    return;
  }
  const payload = {
    contentCuriId: currentRun.result.content.curiId, mappingRunId: currentRun.mappingRunId,
    expectedReviewId: currentRun.reviewHistory?.at(-1)?.reviewId ?? null,
    contentVersion: reviewOptions.contentVersion, decision, confirmed: true,
    note: reviewNote.value, curriculumCuriIds, coreConcepts, rationale: editRationale.value, teachingUse: editTeachingUse.value
  };
  isSaving = true;
  setSavingState(true);
  setDecisionStatus("loading", "검수 결정을 저장하고 있습니다.");
  try {
    const response = await fetch("/api/curimap/review", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    const result = await readJsonResponse(response);
    if (!response.ok || !result.reviewHistory) throw new Error(result.error ?? "저장 결과를 확인하지 못했습니다. 새로고침으로 기록을 확인하세요.");
    currentRun.reviewHistory = result.reviewHistory;
    renderReviewHistory();
    prepareEditFields();
    reviewNote.value = "";
    reviewConfirmed.checked = false;
    decisionInputs.forEach((input) => { input.checked = false; });
    editFields.hidden = true;
    setDecisionStatus("success", `${decisionLabels[decision]} 검수 기록을 저장했습니다.`);
    await refreshVerifiedStatus(payload.contentCuriId);
  } catch (error) {
    setDecisionStatus("error", error.message);
    verifiedState = null;
    searchIndexUi.clear();
    verifiedBadge.textContent = "CuriBase 상태 확인 필요";
    setVerifiedStatus("error", "검수 저장 여부와 CuriBase 상태를 새로고침으로 확인하세요.");
  } finally {
    isSaving = false;
    setSavingState(false);
  }
}

function setSavingState(saving) {
  decisionInputs.forEach((input) => { input.disabled = saving || !isReviewableDraft; });
  reviewNote.disabled = saving || !isReviewableDraft;
  reviewConfirmed.disabled = saving || !isReviewableDraft;
  editFields.disabled = saving || !isReviewableDraft || getSelectedDecision() !== "edit";
  saveDecision.disabled = saving || !isReviewableDraft || !getSelectedDecision();
  saveDecision.textContent = saving ? "저장 중…" : "검수 결정 저장";
  updateVerifiedButton();
}

function renderReviewHistory() {
  const history = currentRun?.reviewHistory ?? [];
  savedReview.replaceChildren();
  if (!history.length) {
    savedReview.append(createElement("p", "이 실행에는 저장된 사람 검수 기록이 없습니다."));
    return;
  }
  const latest = history.at(-1);
  setReviewPageState(latest.status === "EXCLUDED" ? "held" : "success",
    `사람 ${decisionLabels[latest.decision]} 기록을 불러왔습니다.`,
    "AI 원본과 검수 이력을 보존합니다. CuriBase 저장 전 · 검색 미반영 상태입니다.", latest.status);
  for (const review of [...history].reverse()) {
    const item = document.createElement("article");
    item.className = "standard-item";
    item.append(createElement("h3", `${decisionLabels[review.decision]} · ${review.status}`));
    item.append(createElement("p", `${new Date(review.reviewedAt).toLocaleString("ko-KR")} · 로컬 사람 검수자`));
    item.append(createElement("p", `사유·메모: ${review.note || "없음"}`));
    for (const standard of review.result.officialStandards) {
      item.append(createElement("p", `${GradeContext.standardLabel(standard)} · ${standard.metadata.achievementStandard}`));
    }
    appendDraftDetail(item, "검수 결과 연계근거", review.result.rationale);
    appendDraftDetail(item, "검수 결과 수업 활용", review.result.teachingUse);
    savedReview.append(item);
  }
}

function getSelectedDecision() {
  return decisionInputs.find((input) => input.checked)?.value ?? "";
}

function updateVerifiedButton() {
  saveVerified.disabled = isSaving || !isReviewableDraft || !verifiedState?.eligible || Boolean(getSelectedDecision());
  saveVerified.textContent = verifiedState?.saved ? "저장 상태 재확인" : "CuriBase에 저장";
  searchIndexUi.setAvailable(!isSaving && verifiedState?.saved && !getSelectedDecision());
}

function setVerifiedStatus(state, message) {
  verifiedStatus.dataset.state = state;
  verifiedStatus.textContent = message;
}

function renderVerifiedStatus(status) {
  verifiedState = status;
  verifiedBadge.textContent = status.saved ? "CuriBase 저장 완료" : "CuriBase 저장 전";
  verifiedDetails.replaceChildren();
  for (const asset of status.assets ?? []) {
    verifiedDetails.append(createElement("p", `${asset.curriculumCuriId} · ${asset.curriculumVersion} · 저장 버전 ${asset.version} · ${new Date(asset.savedAt).toLocaleString("ko-KR")}`));
  }
  if (status.invalidatedCount) {
    verifiedDetails.append(createElement("p", `이전 검증 자산 ${status.invalidatedCount}건은 무효화 이력으로 보존됩니다.`));
  }
  setVerifiedStatus(status.saved ? "success" : status.eligible ? "idle" : "error",
    status.saved ? `${status.assets.length}개 관계의 CuriBase 저장을 확인했습니다. 검색 준비 상태는 아래에서 확인하세요.` :
      status.eligible ? "저장된 최신 사람 검수 결과를 CuriBase에 저장할 수 있습니다." : status.reasons.join(" "));
  if (currentRun?.reviewHistory?.length) {
    reviewStateMessage.textContent = status.saved ? "AI 원본과 검수 이력을 보존합니다. CuriBase 저장 완료 · 검색 준비 상태는 아래에서 확인하세요." :
      "AI 원본과 검수 이력을 보존합니다. CuriBase 저장 전 · 검색 미반영 상태입니다.";
  }
  updateVerifiedButton();
}

async function refreshVerifiedStatus(contentCuriId) {
  searchIndexUi.clear();
  verifiedState = null;
  updateVerifiedButton();
  try {
    const response = await fetch(`/api/curibase/verified?contentCuriId=${encodeURIComponent(contentCuriId)}`);
    const payload = await readJsonResponse(response);
    if (response.status === 404 && !payload.error) {
      throw new Error("실행 중인 서버에 CuriBase 저장 API가 없습니다. 서버 터미널에서 Ctrl+C로 종료하고 프로젝트 폴더에서 npm start로 다시 실행한 뒤 새로고침하세요.");
    }
    if (!response.ok || !Array.isArray(payload.reasons)) throw new Error(payload.error ?? "저장 상태를 읽지 못했습니다.");
    // 여러 조회 사이에 다른 탭의 검수가 저장되었으면 현재 화면으로 저장하지 않는다.
    if (payload.mappingRunId !== (currentRun?.mappingRunId ?? null) ||
        payload.reviewId !== (currentRun?.reviewHistory?.at(-1)?.reviewId ?? null)) {
      throw new Error("최신 실행 또는 검수 기록이 변경되었습니다. 새로고침하세요.");
    }
    renderVerifiedStatus(payload);
    await searchIndexUi.refresh(contentCuriId);
  } catch (error) {
    verifiedBadge.textContent = "CuriBase 상태 확인 필요";
    verifiedDetails.replaceChildren();
    setVerifiedStatus("error", error.message);
  }
}

async function saveToCuriBase() {
  if (saveVerified.disabled || isSaving || !verifiedState?.eligible) return;
  const input = { contentCuriId: verifiedState.contentCuriId, mappingRunId: currentRun.mappingRunId,
    reviewId: currentRun.reviewHistory.at(-1).reviewId, contentVersion: reviewOptions.contentVersion };
  isSaving = true;
  setSavingState(true);
  saveVerified.textContent = "저장 중…";
  setVerifiedStatus("loading", "검증 조건을 확인하고 CuriBase에 저장하고 있습니다.");
  try {
    const response = await fetch("/api/curibase/verified", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload.saved) throw new Error(payload.error ?? "저장 결과를 확인하지 못했습니다. 새로고침하세요.");
    renderVerifiedStatus(payload);
    await searchIndexUi.prepare(input);
  } catch (error) {
    verifiedState = null;
    searchIndexUi.clear();
    verifiedBadge.textContent = "CuriBase 상태 확인 필요";
    verifiedDetails.replaceChildren();
    setVerifiedStatus("error", `${error.message} 새로고침으로 저장 여부를 확인하세요.`);
  } finally {
    isSaving = false;
    setSavingState(false);
  }
}

function setDecisionStatus(state, message) {
  decisionStatus.dataset.state = state;
  decisionStatus.textContent = message;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function createElement(tagName, text, className) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
}
