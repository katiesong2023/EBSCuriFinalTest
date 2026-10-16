const mappingForm = document.querySelector("#mapping-form");
const contentSelect = document.querySelector("#content-select");
const curriculumSubject = document.querySelector("#curriculum-subject");
const curriculumGrade = document.querySelector("#curriculum-grade");
curriculumGrade.value = new URLSearchParams(location.search).get("gradeBand") || "초등 5~6학년군";
const curriculumSubjectNote = document.querySelector("#curriculum-subject-note");
const publicText = document.querySelector("#public-text");
const publicTextSourceUrl = document.querySelector("#public-text-source-url");
const candidateSubmit = document.querySelector("#candidate-submit");
const mappingSubmit = document.querySelector("#mapping-submit");
const contentPreview = document.querySelector("#content-preview");
const candidateStatus = document.querySelector("#candidate-status");
const candidateResults = document.querySelector("#candidate-results");
const mappingStatus = document.querySelector("#mapping-status");
const mappingResult = document.querySelector("#mapping-result");
const reviewLink = document.querySelector("#review-link");
const reviewLinkNote = document.querySelector("#review-link-note");

let contentsById = new Map();
let latestCandidateResponse = null;
let candidateInProgress = false;
let mappingInProgress = false;
let inputRevision = 0;
let historyRevision = 0;
let paidApiEnabled = false;
const publicTextConfirmed = document.querySelector("#public-text-confirmed");
const retryStatus = document.querySelector("#retry-status");

initialize().catch((error) => {
  setStatus(candidateStatus, "error", `콘텐츠 목록을 불러오지 못했습니다. ${error.message}`);
  contentSelect.replaceChildren(createOption("", "콘텐츠 목록을 불러오지 못했습니다."));
});

contentSelect.addEventListener("change", () => {
  inputRevision += 1;
  historyRevision += 1;
  publicTextConfirmed.checked = false;
  renderRetrySummary(null);
  const content = contentsById.get(contentSelect.value);
  setCurriculumSubject(content);
  renderContentPreview(content);
  setPublicTextDefaults(content);
  clearCandidateResults();
  clearMappingResult();
  setReviewLink(content?.curiId);
  latestCandidateResponse = null;
  setStatus(candidateStatus, "idle", "공개 텍스트를 확인한 뒤 공식 후보를 확인하세요.");
  setStatus(mappingStatus, "idle", "공식 후보를 확인하면 AI 초안을 생성할 수 있습니다.");
  refreshMappingAvailability();
  loadLatestRun(content?.curiId);
});

function handleInputChange() {
  inputRevision += 1;
  historyRevision += 1;
  publicTextConfirmed.checked = false;
  latestCandidateResponse = null;
  setReviewLink(contentSelect.value);
  clearCandidateResults();
  clearMappingResult();
  setStatus(candidateStatus, "idle", "입력이 바뀌었습니다. 공식 후보를 다시 확인하세요.");
  setStatus(mappingStatus, "idle", "입력과 공개 원문을 확인한 뒤 다시 실행하세요.");
  refreshMappingAvailability();
}

publicText.addEventListener("input", handleInputChange);
curriculumGrade.addEventListener("change", handleInputChange);
publicTextSourceUrl.addEventListener("input", handleInputChange);
curriculumSubject.addEventListener("change", () => {
  handleInputChange();
  renderContentPreview(contentsById.get(contentSelect.value));
});

function validateInput() {
  const content = contentsById.get(contentSelect.value);
  if (!content) return "콘텐츠를 선택하세요.";
  if (!curriculumSubject.value) return "일반 방송을 연결할 사회 또는 과학 교과를 선택하세요.";
  const text = publicText.value.trim();
  if (!text) return "공개 텍스트가 비어 있습니다. EBS에서 확인한 설명을 입력하세요.";
  if (text.length < 20) return "공개 텍스트는 20자 이상 필요합니다. AI는 호출하지 않습니다.";
  if (text.length > 1200) return "공개 텍스트는 1200자 이하로 입력하세요.";
  const sourceUrl = normalizeSourceUrl(publicTextSourceUrl.value);
  if (!sourceUrl) return "지원하지 않는 URL입니다. 로그인 정보·별도 포트가 없는 https EBS 원문 주소를 입력하세요.";
  const knownUrls = [content.sourceUrl, content.descriptionSourceUrl].map(normalizeSourceUrl);
  if ((text !== content.synopsis?.trim() || !knownUrls.includes(sourceUrl)) && !publicTextConfirmed.checked) {
    return "저장된 원문과 다른 입력입니다. 공개 EBS 원문에서 직접 확인했음을 체크하세요.";
  }
  return null;
}

function normalizeSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)ebs\.co\.kr$/i.test(url.hostname) &&
      !url.username && !url.password && !url.port ? url.toString() : null;
  } catch { return null; }
}

candidateSubmit.addEventListener("click", async () => {
  if (candidateInProgress || mappingInProgress) return;
  const validationMessage = validateInput();
  if (validationMessage) {
    setStatus(candidateStatus, "error", validationMessage);
    return;
  }
  const revision = inputRevision;
  const content = contentsById.get(contentSelect.value);
  if (!content) {
    setStatus(candidateStatus, "error", "후보를 확인할 콘텐츠를 선택하세요.");
    return;
  }

  candidateInProgress = true;
  refreshMappingAvailability();
  clearCandidateResults();
  setStatus(candidateStatus, "loading", "출처를 확보한 공식 성취기준 목록에서 후보를 확인하는 중입니다.");

  try {
    const parameters = new URLSearchParams({
      contentCuriId: content.curiId,
      subject: curriculumSubject.value,
      gradeBand: curriculumGrade.value
    });
    if (publicText.value.trim()) {
      parameters.set("synopsis", publicText.value.trim());
    }
    const response = await fetch(`/api/candidate-retrieval?${parameters.toString()}`);
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(payload.error ?? "후보를 확인하지 못했습니다.");
    }

    if (contentSelect.value !== content.curiId || inputRevision !== revision) {
      return;
    }

    latestCandidateResponse = payload;
    renderCandidateResponse(payload);
  } catch (error) {
    if (contentSelect.value !== content.curiId || inputRevision !== revision) {
      return;
    }
    latestCandidateResponse = null;
    setStatus(candidateStatus, "error", `후보를 확인하지 못했습니다. ${error.message}`);
  } finally {
    candidateInProgress = false;
    refreshMappingAvailability();
  }
});

mappingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (mappingInProgress || candidateInProgress) return;
  const validationMessage = validateInput();
  if (validationMessage) {
    setStatus(mappingStatus, "error", validationMessage);
    return;
  }
  const revision = inputRevision;
  historyRevision += 1;
  const content = contentsById.get(contentSelect.value);

  if (!content || latestCandidateResponse?.status !== "CANDIDATES_FOUND") {
    setStatus(mappingStatus, "error", "AI 초안 전에 공식 후보를 먼저 확인하세요.");
    return;
  }

  mappingInProgress = true;
  refreshMappingAvailability();
  clearMappingResult();
  setStatus(mappingStatus, "loading", "공개 텍스트와 공식 후보만 사용해 AI 초안을 생성하는 중입니다.");

  try {
    const response = await fetch("/api/curimap/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentCuriId: content.curiId,
        curriculumSubject: curriculumSubject.value,
        gradeBand: curriculumGrade.value,
        publicText: publicText.value,
        publicTextSourceUrl: publicTextSourceUrl.value,
        publicTextConfirmed: publicTextConfirmed.checked
      })
    });
    const payload = await readJsonResponse(response);

    if (contentSelect.value !== content.curiId || inputRevision !== revision) return;
    if (payload.retry) renderRetrySummary(payload.retry);
    if (!response.ok) {
      if (payload.result) {
        renderMappingResponse(payload.result);
        return;
      }
      throw new Error(payload.error ?? "AI 초안을 만들지 못했습니다.");
    }
    renderMappingResponse(payload);
  } catch (error) {
    if (contentSelect.value !== content.curiId || inputRevision !== revision) {
      return;
    }
    setStatus(mappingStatus, "error", `AI 초안을 만들지 못했습니다. ${error.message}`);
    mappingResult.append(createMessage("이번 요청의 완료 여부는 검수 화면에서 확인하세요. 자동 재시도는 하지 않습니다.", "error-message"));
  } finally {
    mappingInProgress = false;
    refreshMappingAvailability();
  }
});

async function initialize() {
  setStatus(candidateStatus, "loading", "저장된 콘텐츠 목록을 불러오는 중입니다.");
  const response = await fetch("/api/curimap/contents");
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload.error ?? "콘텐츠 목록을 불러오지 못했습니다.");
  }

  contentsById = new Map(payload.contents.map((content) => [content.curiId, content]));
  paidApiEnabled = payload.paidApiEnabled === true;
  const paidNotice = document.querySelector("#paid-api-notice");
  if (paidNotice) paidNotice.textContent = paidApiEnabled ? "유료 AI 연계가 활성화되어 있습니다. 초안 생성 시 API 비용이 발생할 수 있습니다." : "유료 AI 연계가 꺼져 있습니다. 공식 후보 확인과 콘텐츠 탐색은 사용할 수 있습니다.";
  populateContentSelect(payload.contents);
  selectContentFromUrl();
  setStatus(candidateStatus, "idle", "콘텐츠와 공개 텍스트를 확인한 뒤 공식 후보를 확인하세요.");
}

function populateContentSelect(contents) {
  contentSelect.replaceChildren(createOption("", "콘텐츠를 선택하세요."));

  for (const content of contents) {
    contentSelect.append(createOption(content.curiId, `${content.title} · ${content.gradeBand}`));
  }

  contentSelect.disabled = contents.length === 0;
  candidateSubmit.disabled = contents.length === 0;

  if (contents.length === 0) {
    setStatus(candidateStatus, "error", "선택할 수 있는 사회·과학 P0 또는 인접 일반 방송이 없습니다.");
  }
}

function setPublicTextDefaults(content) {
  publicText.value = content?.synopsis ?? "";
  publicTextSourceUrl.value = content?.descriptionSourceUrl ?? content?.sourceUrl ?? "";
}

function setCurriculumSubject(content) {
  const fixedSubject = ["사회", "과학"].includes(content?.subject) ? content.subject : "";
  curriculumSubject.value = fixedSubject;
  curriculumSubject.disabled = !content || Boolean(fixedSubject) || mappingInProgress;
  curriculumSubjectNote.textContent = !content
    ? "일반 방송은 원본 분류를 확인한 뒤 사회 또는 과학 공식 기준 범위를 사람이 선택합니다."
    : fixedSubject
      ? `원본 교과 ${content.subject}의 공식 기준만 사용합니다.`
      : `원본 분류는 ${content.subject}입니다. 원문을 확인하고 연결할 공식 교과를 사람이 선택하세요.`;
}

function renderContentPreview(content) {
  contentPreview.replaceChildren();

  if (!content) {
    contentPreview.classList.add("is-empty");
    contentPreview.append(createElement("p", "콘텐츠를 선택하면 실제 저장 메타데이터를 표시합니다."));
    return;
  }

  contentPreview.classList.remove("is-empty");
  contentPreview.append(createElement("p", "선택된 콘텐츠 · 저장 메타데이터", "card-label"));
  contentPreview.append(createElement("h3", content.title));

  const details = document.createElement("dl");
  appendDetail(details, "프로그램", content.programName ?? "공식 클립 메타데이터");
  appendDetail(details, "콘텐츠 단위", content.contentLevel ?? "미확인");
  appendDetail(details, "교과·학년", `${content.subject} · ${content.gradeBand}`);
  appendDetail(details, "공식 후보 교과", curriculumSubject.value || "사람 선택 필요");
  appendDetail(
    details,
    "공개 텍스트 상태",
    content.synopsis ? "공식 EBS 원문에서 확인됨" : "미확보 · AI 연계 실행 대상이 아닙니다."
  );
  appendDetail(details, "출처 상태", content.descriptionProvenance ?? "출처 상태 미확인");
  contentPreview.append(details);

  if (content.navigation?.url) {
    const link = document.createElement("a");
    link.href = content.navigation.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = content.navigation.label;
    link.className = "source-link";
    contentPreview.append(link);
    contentPreview.append(createElement("p", content.navigation.note, "source-note"));
  }
}

function renderCandidateResponse(payload) {
  if (payload.status === "HELD") {
    setStatus(candidateStatus, "held", `보류: ${payload.hold.message}`);
    candidateResults.append(createMessage("현재 콘텐츠는 최종 선택 없이 보류합니다.", "hold-message"));
    return;
  }

  setStatus(
    candidateStatus,
    "success",
    payload.retrievalMode === "GENERAL_BROADCAST_REVIEW_SHORTLIST"
      ? `일반 방송 검수용 공식 후보 ${payload.candidates.length}건을 준비했습니다. 원문과 맞지 않으면 AI와 사람이 보류·제외합니다.`
      : `공식 성취기준 후보 ${payload.candidates.length}건을 찾았습니다. 후보 안에서만 AI 초안을 생성합니다.`
  );

  for (const candidate of payload.candidates) {
    candidateResults.append(createCandidateCard(candidate));
  }
}

async function loadLatestRun(contentCuriId) {
  const revision = ++historyRevision;
  if (!contentCuriId) {
    return;
  }

  try {
    const response = await fetch(`/api/curimap/draft?contentCuriId=${encodeURIComponent(contentCuriId)}`);
    const payload = await readJsonResponse(response);
    if (!response.ok || contentSelect.value !== contentCuriId || historyRevision !== revision || mappingInProgress) return;
    renderRetrySummary(payload.retry);
    if (payload.run) renderMappingResponse(payload.run.result, true);
  } catch {
    // 최근 실행 이력을 읽지 못해도 새 초안 생성 기능은 유지한다.
  }
}

function renderMappingResponse(payload, isStoredResult = false) {
  clearMappingResult();
  if (payload.retry && !isStoredResult) renderRetrySummary(payload.retry);
  if (payload.status === "RUNNING") {
    setStatus(mappingStatus, "loading", "연계 실행 중입니다. 완료 후 콘텐츠를 다시 선택해 결과를 확인하세요.");
    return;
  }

  if (payload.status === "HELD") {
    setStatus(mappingStatus, "held", `보류: ${payload.hold.message}`);
    const canRepair = payload.hold?.code === "MODEL_HELD" && (payload.candidateOptions ?? []).length > 0;
    mappingResult.append(createMessage(
      canRepair
        ? "AI는 최종 선택을 보류했지만, 검수 화면에서 공식 후보를 선택해 사람 수정으로 계속할 수 있습니다."
        : "AI는 최종 성취기준을 선택하지 않았습니다.",
      "hold-message"
    ));
    if (payload.invocation) {
      mappingResult.append(createInvocationCard(payload.invocation));
    }
    return;
  }

  if (payload.status === "FAILED") {
    setStatus(mappingStatus, "error", payload.failure.message);
    mappingResult.append(createMessage("이번 실행의 초안은 저장되지 않았습니다. 원인을 확인한 뒤 남은 횟수 안에서 재시도하세요.", "error-message"));
    if (payload.invocation) mappingResult.append(createInvocationCard(payload.invocation));
    return;
  }

  if (payload.status !== "DRAFT") {
    setStatus(mappingStatus, "error", "응답 형식을 확인할 수 없습니다. 검수 화면에서 실행 이력을 확인하세요.");
    return;
  }
  setStatus(
    mappingStatus,
    "success",
    `${payload.reused ? "같은 입력으로 이미 생성된" : isStoredResult ? "최근" : "새"} 검수 전 AI 초안을 표시합니다. 사람 승인 전에는 검색에 사용하지 않습니다.`
  );

  const draft = document.createElement("article");
  draft.className = "mapping-card";
  draft.append(createElement("p", payload.review.label, "card-label"));
  draft.append(createElement("h3", payload.content.title));
  draft.append(createElement("h4", "선택된 공식 성취기준"));
  const standardList = document.createElement("ul");
  for (const candidate of payload.selectedCandidates) {
    standardList.append(
      createElement("li", `${GradeContext.standardLabel(candidate)} ${candidate.achievementStandard}`)
    );
  }
  draft.append(standardList);
  appendMappingDetail(draft, "핵심개념", payload.coreConcepts.join(", "));
  appendMappingDetail(draft, "연계근거", payload.rationale);
  appendMappingDetail(draft, "수업 활용", payload.teachingUse);
  appendMappingDetail(draft, "confidence", `${payload.confidence.value} · ${payload.confidence.note}`);
  appendMappingDetail(draft, "공개 원문", payload.publicText.sourceUrl);
  mappingResult.append(draft, createInvocationCard(payload.invocation));
}

function createCandidateCard(candidate) {
  const card = document.createElement("article");
  card.className = "candidate-card";
  card.append(createElement("p", "공식 성취기준 후보", "card-label"));
  card.append(createElement("h3", `${GradeContext.standardLabel(candidate)} ${candidate.achievementStandard}`));

  const details = document.createElement("div");
  details.className = "candidate-details";
  const unit = document.createElement("section");
  unit.append(createElement("h4", "단원"));
  unit.append(createElement("p", `${candidate.unit.number} · ${candidate.unit.title}`));
  details.append(unit);

  const source = document.createElement("section");
  source.append(createElement("h4", "공식 원문 근거"));
  source.append(
    createElement(
      "p",
      `${candidate.officialSource.document} · PDF ${candidate.officialSource.pdfPage}쪽 · ${candidate.officialSource.curriculumVersion}`
    )
  );
  details.append(source);

  card.append(details);
  card.append(
    createElement(
      "p",
      `텍스트 겹침: ${candidate.matchedTerms.join(", ") || "없음"}`,
      "matched-terms"
    )
  );
  if (candidate.selectionReason) card.append(createElement("p", candidate.selectionReason, "matched-terms"));
  return card;
}

function createInvocationCard(invocation) {
  const card = document.createElement("article");
  card.className = "invocation-card";
  card.append(createElement("p", "호출 이력", "card-label"));
  card.append(createElement("h3", `${invocation.model ?? "API 호출 없음"} · ${invocation.latencyMs == null ? "지연 미확인" : `${invocation.latencyMs}ms`}`));
  const details = document.createElement("dl");
  appendDetail(
    details,
    "설정",
    invocation.settings ? `추론 ${invocation.settings.reasoningEffort} · 출력 최대 ${invocation.settings.maxOutputTokens}토큰 · 도구 없음 · 외부 저장 안 함` : "AI 호출 전 보류 또는 실패"
  );
  appendDetail(
    details,
    "사용량",
    `입력 ${invocation.usage?.inputTokens ?? "미제공"} · 출력 ${invocation.usage?.outputTokens ?? "미제공"} · 합계 ${invocation.usage?.totalTokens ?? "미제공"} 토큰`
  );
  if (invocation.attemptNumber) appendDetail(details, "실행 횟수", `같은 입력 ${invocation.attemptNumber}회 · 재시도 ${invocation.retryCount}회`);
  if (invocation.apiCalled && !invocation.usage) appendDetail(details, "사용량 안내", "요청은 전송했으나 사용량을 받지 못했습니다. 비용 0을 뜻하지 않습니다.");
  card.append(details);
  return card;
}

function renderRetrySummary(retry) {
  retryStatus.textContent = retry
    ? `최근 24시간 실행 ${retry.attemptsInWindow}/${retry.maximumAttempts}회 · 남은 횟수 ${retry.remainingAttempts}회.` +
      (retry.nextAvailableAt ? ` 다음 실행 가능: ${new Date(retry.nextAvailableAt).toLocaleString("ko-KR")}.` : "") +
      " 자동 재시도 없음 · 같은 입력의 최근 성공 결과는 추가 호출 없이 표시합니다."
    : "콘텐츠별 24시간 내 최대 3회 실행합니다. 자동 재시도는 없습니다.";
}

function appendMappingDetail(container, label, value) {
  const section = document.createElement("section");
  section.className = "mapping-detail";
  section.append(createElement("h4", label), createElement("p", value));
  container.append(section);
}

function clearCandidateResults() {
  candidateResults.replaceChildren();
}

function clearMappingResult() {
  mappingResult.replaceChildren();
}

function refreshMappingAvailability() {
  const hasCandidates = latestCandidateResponse?.status === "CANDIDATES_FOUND";
  const busy = candidateInProgress || mappingInProgress;
  candidateSubmit.disabled = busy || !contentSelect.value;
  mappingSubmit.disabled = busy || !hasCandidates || !paidApiEnabled;
  contentSelect.disabled = mappingInProgress || contentsById.size === 0;
  publicText.disabled = mappingInProgress;
  publicTextSourceUrl.disabled = mappingInProgress;
  publicTextConfirmed.disabled = mappingInProgress;
  const content = contentsById.get(contentSelect.value);
  curriculumGrade.disabled = mappingInProgress || candidateInProgress;
  curriculumSubject.disabled = mappingInProgress || !content || ["사회", "과학"].includes(content.subject);
}

function selectContentFromUrl() {
  const requestedContentCuriId = new URLSearchParams(window.location.search).get("contentCuriId");
  if (!requestedContentCuriId || !contentsById.has(requestedContentCuriId)) {
    return;
  }

  contentSelect.value = requestedContentCuriId;
  contentSelect.dispatchEvent(new Event("change"));
}

function setReviewLink(contentCuriId) {
  // 실패 응답에는 콘텐츠 정보가 없으므로 링크는 콘텐츠 선택 시에만 갱신한다.
  if (!contentCuriId) {
    reviewLink.href = "/review.html";
    reviewLink.setAttribute("aria-disabled", "true");
    reviewLinkNote.textContent = "콘텐츠를 선택하면 해당 콘텐츠의 검수 화면을 열 수 있습니다.";
    return;
  }

  reviewLink.href = `/review.html?${new URLSearchParams({ contentCuriId, gradeBand: curriculumGrade.value, subject: curriculumSubject.value })}`;
  reviewLink.setAttribute("aria-disabled", "false");
  reviewLinkNote.textContent = "현재 콘텐츠의 저장된 최근 연계 실행 결과 또는 미실행 안내를 검수 화면에서 확인합니다.";
}

reviewLink.addEventListener("click", (event) => {
  if (reviewLink.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
  }
});

function setStatus(element, state, message) {
  element.dataset.state = state;
  element.replaceChildren();
  const dot = document.createElement("span");
  dot.className = "status-dot";
  dot.setAttribute("aria-hidden", "true");
  element.append(dot, document.createTextNode(message));
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function appendDetail(list, term, description) {
  const wrapper = document.createElement("div");
  wrapper.append(createElement("dt", term), createElement("dd", description));
  list.append(wrapper);
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function createMessage(message, className) {
  return createElement("p", message, className);
}

function createElement(tagName, text, className) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
}
