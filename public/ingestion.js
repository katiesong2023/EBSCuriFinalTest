const inputTypeControls = document.querySelectorAll('input[name="input-type"]');
const csvInput = document.querySelector("#csv-input");
const singleInput = document.querySelector("#single-input");
const previewButton = document.querySelector("#preview-button");
const applyButton = document.querySelector("#apply-button");
const requestStatus = document.querySelector("#request-status");
const summaryElement = document.querySelector("#summary");
const changesElement = document.querySelector("#changes");
const errorsElement = document.querySelector("#errors");

let previewInput = null, inputRevision = 0, requestRevision = 0, busy = null, previewController;
const editableControls = [...document.querySelectorAll('.input-choice input, .input-section input, .input-section textarea')];
function invalidatePreview() {
  inputRevision++;
  previewInput = null;
  applyButton.disabled = true;
  if (busy === "preview") { previewController?.abort(); requestRevision++; setBusy(null); }
  summaryElement.className = "summary empty";
  summaryElement.textContent = "입력이 변경되었습니다. 다시 미리보기하세요.";
  changesElement.replaceChildren(); errorsElement.replaceChildren();
  requestStatus.textContent = busy === "apply" ? "저장 요청 후 입력이 변경되었습니다. 현재 입력은 다시 미리보기해야 합니다." : "입력이 바뀌어 이전 미리보기를 무효화했습니다.";
}
for (const control of editableControls) {
  control.addEventListener("input", invalidatePreview);
  control.addEventListener("change", invalidatePreview);
}
inputTypeControls.forEach((control) => control.addEventListener("change", () => {
  const usesCsv = selectedInputType() === "csv";
  csvInput.hidden = !usesCsv; singleInput.hidden = usesCsv;
}));

previewButton.addEventListener("click", async () => {
  if (busy) return;
  const version = inputRevision, request = ++requestRevision;
  previewInput = null; previewController = new AbortController();
  setBusy("preview", "미리보기를 만들고 있습니다.");
  try {
    const input = await collectInput();
    if (version !== inputRevision || request !== requestRevision) return;
    const result = await requestIngestion("/api/ingestion/preview", input, previewController.signal);
    if (version !== inputRevision || request !== requestRevision) return;
    showPreview(result);
    previewInput = result.canApply ? { input, signature: JSON.stringify(input), version } : null;
    requestStatus.textContent = result.canApply ? "현재 입력의 정상 항목을 저장할 수 있습니다. 오류 행은 저장하지 않습니다." : "입력을 고친 뒤 다시 미리보기를 실행하세요.";
    document.querySelector("#preview-title").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { if (request === requestRevision) showRequestError(error); }
  finally { if (request === requestRevision) setBusy(null); }
});

applyButton.addEventListener("click", async () => {
  if (busy || !previewInput) return;
  const preview = previewInput, version = inputRevision;
  setBusy("apply", "확인한 입력의 정상 항목을 저장하고 있습니다.");
  try {
    const current = await collectInput();
    if (version !== inputRevision || preview.version !== version || JSON.stringify(current) !== preview.signature) {
      throw new Error("현재 입력과 미리보기가 다릅니다. 다시 미리보기하세요.");
    }
    previewInput = null;
    const result = await requestIngestion("/api/ingestion/apply", current);
    if (version === inputRevision) showPreview(result.preview);
    requestStatus.textContent = `실행 ${result.run.runId}을 저장했습니다. ${result.run.status === "PARTIAL_FAILURE" ? "오류 행은 건너뛰었습니다. " : ""}${version !== inputRevision ? "현재 입력은 변경되어 다시 미리보기해야 합니다." : "추가 저장은 새 미리보기 후 실행하세요."}`;
  } catch (error) { showRequestError(error); }
  finally { setBusy(null); }
});

async function collectInput() {
  if (selectedInputType() === "csv") {
    const selectedFile = document.querySelector("#csv-file").files[0];
    const typedCsv = document.querySelector("#csv-text").value.trim();
    const sourceSnapshot = document.querySelector("#source-snapshot").checked;
    const csvText = selectedFile ? await selectedFile.text() : typedCsv;
    if (!csvText) throw new Error("CSV 파일을 선택하거나 내용을 붙여넣으세요.");
    return { csvText, sourceSnapshot, mode: "MANUAL" };
  }

  const record = Object.fromEntries(
    ["source_system", "source_content_id", "source_url", "title", "synopsis", "program_name", "episode_no", "content_level", "source_original_modified_at", "grade_band_seed", "subject_seed", "curriculum_unit_seed"].map((field) => [field, document.querySelector(`#${field.replaceAll("_", "-")}`).value])
  );
  if (record.source_original_modified_at) record.source_original_modified_at = new Date(record.source_original_modified_at).toISOString();
  return { record, mode: "MANUAL" };
}

function selectedInputType() { return document.querySelector('input[name="input-type"]:checked').value; }

async function requestIngestion(path, input, signal) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청을 처리하지 못했습니다.");
  return payload;
}

function showPreview(result) {
  const entries = [["받은 행", result.summary.received], ["신규", result.summary.new], ["변경", result.summary.changed + result.summary.reactivated], ["동일", result.summary.same], ["비활성", result.summary.inactive], ["오류", result.summary.errors]];
  summaryElement.className = "summary";
  summaryElement.replaceChildren(...entries.map(([label, value]) => { const item = document.createElement("span"); item.textContent = `${label} ${value}`; return item; }));
  changesElement.replaceChildren(...result.changes.map((change) => resultItem(change)));
  errorsElement.replaceChildren(...result.errors.map((error) => errorItem(error)));
}

function resultItem(change) {
  const item = document.createElement("article");
  item.className = "result-item";
  const title = document.createElement("strong");
  title.textContent = `${outcomeLabel(change.outcome)} · ${change.title ?? change.stableKey}`;
  const detail = document.createElement("p");
  detail.textContent = change.changedFields?.length ? `변경 필드: ${change.changedFields.join(", ")} · 재검수 필요` : change.reason;
  item.append(title, detail);
  return item;
}

function errorItem(error) { const item = document.createElement("article"); item.className = "error-item"; item.textContent = `${error.rowNumber ? `${error.rowNumber}행: ` : ""}${error.reason}`; return item; }
function outcomeLabel(outcome) { return ({ new: "신규", changed: "변경", reactivated: "재활성", inactive: "비활성" })[outcome] ?? outcome; }
function setBusy(phase, message) {
  busy = phase;
  previewButton.disabled = Boolean(phase);
  applyButton.disabled = Boolean(phase) || !previewInput;
  editableControls.forEach((control) => { control.disabled = phase === "apply"; });
  if (message !== undefined) requestStatus.textContent = message;
}
function showRequestError(error) { requestStatus.textContent = error.message; applyButton.disabled = true; previewInput = null; }

// 선택 자료는 입력칸에만 채운다. 미리보기·저장은 관리자가 직접 실행한다.
async function prefillResource() {
  const id = new URLSearchParams(location.search).get("resourceId");
  if (!id) return;
  const version = inputRevision;
  previewButton.disabled = true;
  try {
    const response = await fetch(`/api/admin/workspace?id=${encodeURIComponent(id)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    if (version !== inputRevision) return;
    const single = document.querySelector('input[name="input-type"][value="single"]');
    single.checked = true; single.dispatchEvent(new Event("change"));
    for (const [key, value] of Object.entries(payload.importRecord)) {
      const input = document.querySelector(`#${key.replaceAll("_", "-")}`);
      if (input) input.value = value || "";
    }
    requestStatus.textContent = "선택 자료를 입력했습니다. 원문·교과 참고값(사회 또는 과학)을 확인한 뒤 미리보기하세요. 아직 저장하지 않았습니다.";
  } catch (error) { requestStatus.textContent = `자료를 읽지 못했습니다. ${error.message} 새로고침하거나 관리 목록에서 다시 선택하세요.`; }
  finally { if (!busy) previewButton.disabled = false; }
}
prefillResource();
