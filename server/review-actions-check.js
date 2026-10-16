const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createFingerprint } = require("./data-store");

// 실제 사람 검수 이력을 만들지 않고 모의 저장소에서 상태·원본 보존을 검증한다.
function fixture() {
  const standards = ["standard-1", "standard-2"].map((curiId) => ({
    curiId, curriculumVersion: "2022", lifecycle: { isActive: true },
    provenance: { classification: "HUMAN_VERIFIED" }, review: { status: "HUMAN_APPROVED" },
    source: { sourceDocument: "공식 원문", sourcePdfPage: "10" },
    metadata: { subject: "사회", gradeBand: "5~6학년군", achievementStandardId: curiId, achievementStandard: "공식 기준" }
  }));
  const result = { status: "DRAFT", content: { curiId: "content-1" },
    selectedCandidates: [{ curriculumCuriId: "standard-1" }],
    coreConcepts: ["국토"], rationale: "AI 원본 근거", teachingUse: "AI 원본 활용" };
  return { contents: [{ curiId: "content-1", lifecycle: { isActive: true }, metadata: { title: "국토", subjectSeed: "사회", gradeBandSeed: "초등 5학년" } }],
    curriculumStandards: standards,
    mappingRuns: [{ mappingRunId: "run-1", contentCuriId: "content-1", status: "SUCCEEDED", result }],
    contentCurriculumMaps: [{ curiMapId: "map-1", contentCuriId: "content-1", mappingRunId: "run-1",
      curriculumCuriId: "standard-1", draft: structuredClone(result), reviewStatus: "AI_GENERATED" }],
    verifiedAssets: [], searchProjection: [] };
}

function harness(store = fixture()) {
  const state = { store, writes: 0, failWrite: false };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("./review-actions"), "utf8"), {
    module, require(name) {
      if (name === "node:crypto") return require(name);
      if (name === "./data-quality") return require(name);
      if (name === "./data-store") return { createFingerprint,
        readDataStore: async () => structuredClone(state.store),
        writeDataStore: async (value) => {
          if (state.failWrite) throw new Error("저장 실패 모의");
          state.store = JSON.parse(JSON.stringify(value));
          state.writes += 1;
        } };
      throw new Error(`허용하지 않은 의존성: ${name}`);
    }
  });
  return { ...module.exports, state };
}

async function requestFor(service, overrides = {}) {
  return { contentCuriId: "content-1", mappingRunId: "run-1", decision: "approve", confirmed: true,
    contentVersion: (await service.getReviewOptions("content-1")).contentVersion,
    expectedReviewId: service.state.store.mappingRuns[0].reviewHistory?.at(-1)?.reviewId ?? null,
    ...overrides };
}

async function runChecks() {
  const service = harness();
  const original = JSON.stringify(service.state.store.mappingRuns[0].result);
  const originalMap = JSON.stringify(service.state.store.contentCurriculumMaps[0].draft);
  const before = JSON.stringify(service.state.store);
  const invalidInputs = [null, { decision: "toString" }, { confirmed: false },
    { contentCuriId: "content-2" }, { mappingRunId: "older-run" }, { expectedReviewId: "stale" },
    { contentVersion: "stale" }, { decision: "exclude", note: " " },
    { decision: "edit", note: "수정", curriculumCuriIds: ["invented"], rationale: "근거", teachingUse: "활용" },
    { decision: "edit", note: "수정", curriculumCuriIds: [] },
    { decision: "edit", note: "수정", curriculumCuriIds: ["standard-1", "standard-1"] },
    { decision: "edit", note: "수정", curriculumCuriIds: ["standard-1"], rationale: " " }];
  for (const input of invalidInputs) {
    await assert.rejects(service.saveReviewDecision(input === null ? null : await requestFor(service, input)), service.ReviewInputError);
  }
  assert.equal(JSON.stringify(service.state.store), before);
  const firstRequest = await requestFor(service, { reviewerRole: "ADMIN", reviewedAt: "forged" });
  const approved = (await service.saveReviewDecision(firstRequest)).review;
  assert.equal(approved.status, "HUMAN_APPROVED");
  assert.equal(approved.reviewerRole, "LOCAL_HUMAN_REVIEWER");
  assert.ok(Number.isFinite(Date.parse(approved.reviewedAt)));
  await assert.rejects(service.saveReviewDecision(firstRequest), (error) => error.statusCode === 409);
  const edited = (await service.saveReviewDecision(await requestFor(service, {
    decision: "edit", note: "원문에 맞춰 기준 교체", curriculumCuriIds: ["standard-2"],
    coreConcepts: ["사람 개념"], rationale: "사람 수정 근거", teachingUse: "사람 수정 활용"
  }))).review;
  assert.equal(edited.status, "HUMAN_EDITED");
  assert.equal(service.state.store.contentCurriculumMaps[0].reviewStatus, "EXCLUDED");
  assert.equal(service.state.store.contentCurriculumMaps[1].reviewStatus, "HUMAN_EDITED");
  const excluded = (await service.saveReviewDecision(await requestFor(service, { decision: "exclude", note: "연계 부적합" }))).review;
  assert.equal(excluded.result.curriculumCuriIds[0], "standard-2");
  assert.equal(excluded.result.rationale, "사람 수정 근거");
  assert.ok(service.state.store.contentCurriculumMaps.every((map) => map.assetClassification === "EXCLUDED"));
  assert.equal(JSON.stringify(service.state.store.mappingRuns[0].result), original);
  assert.equal(JSON.stringify(service.state.store.contentCurriculumMaps[0].draft), originalMap);
  assert.equal(service.state.store.verifiedAssets.length, 0);
  assert.equal(service.state.store.searchProjection.length, 0);

  const restored = harness(JSON.parse(JSON.stringify(service.state.store)));
  await restored.saveReviewDecision(await requestFor(restored));
  assert.equal(restored.state.store.mappingRuns[0].reviewHistory.length, 4);
  assert.equal(restored.state.store.contentCurriculumMaps[0].reviewStatus, "HUMAN_APPROVED");
  assert.equal(restored.state.store.contentCurriculumMaps[1].reviewStatus, "EXCLUDED");
  restored.state.failWrite = true;
  await assert.rejects(restored.saveReviewDecision(await requestFor(restored)), /저장 실패 모의/);
  assert.equal(restored.state.store.mappingRuns[0].reviewHistory.length, 4);

  for (const status of ["FAILED", "HELD", "RUNNING"]) {
    const blocked = harness();
    blocked.state.store.mappingRuns[0].result.status = status;
    await assert.rejects(blocked.saveReviewDecision(await requestFor(blocked)), (error) => error.statusCode === 409);
  }
  const modelHeld = harness();
  modelHeld.state.store.mappingRuns[0].status = "HELD";
  modelHeld.state.store.mappingRuns[0].result = {
    status: "HELD", content: { curiId: "content-1" },
    hold: { code: "MODEL_HELD", message: "AI 보류" },
    candidateOptions: [{ curriculumCuriId: "standard-1" }],
    coreConcepts: ["국토"], rationale: "AI 보류 근거", teachingUse: "AI 보류 활용"
  };
  modelHeld.state.store.contentCurriculumMaps = [];
  await assert.rejects(
    modelHeld.saveReviewDecision(await requestFor(modelHeld)),
    (error) => error.statusCode === 409 && /사람 수정/.test(error.message)
  );
  const repaired = (await modelHeld.saveReviewDecision(await requestFor(modelHeld, {
    decision: "edit", note: "공식 후보를 사람이 확인해 수정", curriculumCuriIds: ["standard-2"],
    coreConcepts: ["사람이 확인한 개념"], rationale: "사람이 확인한 수정 연계근거", teachingUse: "사람이 확인한 수업 활용"
  }))).review;
  assert.equal(repaired.status, "HUMAN_EDITED");
  assert.equal(modelHeld.state.store.contentCurriculumMaps.length, 1);
  assert.equal(modelHeld.state.store.contentCurriculumMaps[0].reviewStatus, "HUMAN_EDITED");
  const changed = harness();
  const staleRequest = await requestFor(changed);
  changed.state.store.contents[0].metadata.title = "변경된 콘텐츠";
  await assert.rejects(changed.saveReviewDecision(staleRequest), (error) => error.statusCode === 409);
  changed.state.store.contents[0].lifecycle.isActive = false;
  await assert.rejects(changed.saveReviewDecision(await requestFor(changed)), (error) => error.statusCode === 409);
  const invalidStandard = harness();
  invalidStandard.state.store.curriculumStandards[0].review.status = "REVIEW_REQUIRED";
  assert.equal((await invalidStandard.getReviewOptions("content-1")).standards.length, 1);
  await assert.rejects(invalidStandard.saveReviewDecision(await requestFor(invalidStandard)), /공식 목록/);
  console.log("review checks passed (decisions, official list, conflicts, history, original preservation, write failure)");
}

async function runUiChecks() {
  class Element {
    constructor() {
      this.children = []; this.dataset = {}; this.value = ""; this.checked = false;
      this.classList = { toggle() {} };
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    get lastElementChild() { return this.children.at(-1); }
    addEventListener() {}
    setAttribute() {}
    querySelectorAll() {
      return this.children.flatMap((child) => child instanceof Element
        ? [...(child.type === "checkbox" && child.checked ? [child] : []), ...child.querySelectorAll()] : []);
    }
  }
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const decisions = ["approve", "edit", "exclude"].map((value) => Object.assign(new Element(), { value }));
  const service = harness();
  let posts = 0;
  const context = vm.createContext({
    URLSearchParams, window: { location: { search: "?contentCuriId=content-1" } },
    document: { querySelector: element, querySelectorAll: (selector) => selector.includes("decision") ? decisions : [],
      createElement: () => new Element(), createTextNode: (text) => text },
    fetch: async (url, options) => {
      let body;
      if (options?.method === "POST") {
        posts += 1;
        body = await service.saveReviewDecision(JSON.parse(options.body));
      } else if (url.includes("review-options")) body = await service.getReviewOptions("content-1");
      else if (url.includes("/draft")) body = { run: structuredClone(service.state.store.mappingRuns[0]) };
      else body = { contents: [{ curiId: "content-1", title: "국토", subject: "사회", gradeBand: "5~6학년군" }] };
      return { ok: true, json: async () => body };
    }
  });
  context.createSearchIndexUi = () => ({ clear() {}, setAvailable() {}, async refresh() {}, async prepare() {} });
  vm.runInContext(fs.readFileSync(require.resolve("../public/review.js"), "utf8"), context);
  await new Promise(setImmediate);
  assert.equal(element("#review-status-badge").textContent, "REVIEW_REQUIRED");
  assert.equal(element("#save-decision").disabled, true);
  decisions[1].checked = true;
  context.updateDecisionState();
  assert.equal(element("#edit-fields").hidden, false);
  element("#review-note").value = "원문에 맞게 근거 수정";
  element("#edit-core-concepts").value = "사람이 확인한 개념";
  element("#edit-rationale").value = "사람이 수정한 근거";
  await context.saveReviewDecision({ preventDefault() {} });
  assert.equal(posts, 0);
  element("#review-confirmed").checked = true;
  const pending = context.saveReviewDecision({ preventDefault() {} });
  assert.equal(element("#save-decision").disabled, true);
  await context.saveReviewDecision({ preventDefault() {} });
  await pending;
  assert.equal(posts, 1);
  assert.equal(element("#review-status-badge").textContent, "HUMAN_EDITED");
  assert.equal(element("#review-note").value, "");
  assert.equal(element("#review-confirmed").checked, false);
  await context.initializeReview();
  assert.equal(element("#saved-review").children.length, 1);
  assert.equal(element("#edit-rationale").value, "사람이 수정한 근거");
  service.state.store.mappingRuns[0] = { mappingRunId: "failed-run", result: { status: "FAILED" } };
  await context.initializeReview();
  assert.equal(element("#save-decision").disabled, true);
  assert.equal(element("#review-status-badge").textContent, "FAILED");
  console.log("review UI checks passed (confirmation, edit, duplicate submit, reload, failed draft)");
}

async function runRouteChecks() {
  const { EventEmitter } = require("node:events");
  const service = harness();
  let handler;
  vm.runInNewContext(fs.readFileSync(require.resolve("./server"), "utf8"), {
    URL, Buffer, process: { cwd: () => process.cwd(), env: {} }, console: { log() {}, error() {} },
    require(name) {
      if (name === "./admin-auth") return { createAdminAccess: () => ({ handle: async () => false, announce() {} }) };
      if (["./admin-workspace", "./curriculum-discovery", "./semantic-context", "./teacher-discovery", "./automatic-evidence-service", "./automatic-assets-http", "./admin-source-check", "./human-review-http"].includes(name)) return require(name);
      if (name === "node:http") return { createServer(callback) { handler = callback; return { listen() {} }; } };
      if (name === "node:path") return require(name);
      if (name === "./review-actions") return service;
      if (["./verified-save", "./search-index", "./natural-search", "./discovery-search", "./source-links"].includes(name)) return require(name);
      if (["node:fs/promises", "./data-store", "./incremental-ingestion", "./curimap-mapping", "./candidate-retrieval"].includes(name)) return {};
      throw new Error(`허용하지 않은 의존성: ${name}`);
    }
  });
  async function request(method, url, body) {
    const req = Object.assign(new EventEmitter(), { method, url });
    const result = {};
    const res = { writeHead(status) { result.status = status; }, end(text) { result.body = text ? JSON.parse(text) : null; } };
    const pending = handler(req, res);
    setImmediate(() => {
      if (body !== undefined) req.emit("data", Buffer.from(typeof body === "string" ? body : JSON.stringify(body)));
      req.emit("end");
    });
    await pending;
    return result;
  }
  assert.equal((await request("GET", "/api/curimap/review-options?contentCuriId=content-1")).body.standards.length, 2);
  assert.equal((await request("GET", "/api/curimap/review-options?contentCuriId=missing")).status, 400);
  assert.equal((await request("HEAD", "/api/curimap/review-options?contentCuriId=content-1")).body, null);
  assert.equal((await request("POST", "/api/curimap/review", "{invalid")).status, 400);
  const input = await requestFor(service);
  assert.equal((await request("POST", "/api/curimap/review", input)).body.review.status, "HUMAN_APPROVED");
  assert.equal((await request("POST", "/api/curimap/review", input)).status, 409);
  service.state.failWrite = true;
  assert.equal((await request("POST", "/api/curimap/review", await requestFor(service))).status, 500);
  console.log("review route checks passed (options, decisions, conflict, invalid input, write failure)");
}

Promise.all([runChecks(), runUiChecks(), runRouteChecks()]).catch((error) => {
  console.error(error); process.exitCode = 1;
});
