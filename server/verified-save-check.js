const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { contentVersion, reconcileVerifiedAssets } = require("./data-quality");

// 실제 콘텐츠·사람 승인·API 키를 건드리지 않는 임시 저장소만 사용한다.
function fixture() {
  const content = { curiId: "content-1", sourceIdentity: { sourceSystem: "EBS", sourceContentId: "clip-1" },
    sourceVersion: "v1", source: { sourceUrl: "https://primary.ebs.co.kr/clip/1", contentFingerprint: "source-v1" },
    lifecycle: { isActive: true }, metadata: { title: "우리 국토", contentLevel: "clip", subjectSeed: "사회", gradeBandSeed: "초등 5학년" } };
  const standards = [1, 2].map((number) => ({ curiId: `standard-${number}`, curriculumVersion: "2022 개정",
    sourceIdentity: { sourceStandardId: `6사01-0${number}` },
    source: { sourceDocument: "사회과 공식 원문", sourcePdfPage: "34", contentFingerprint: `standard-v${number}` },
    provenance: { classification: "HUMAN_VERIFIED" }, lifecycle: { isActive: true }, review: { status: "HUMAN_APPROVED" },
    metadata: { subject: "사회", gradeBand: "5~6학년군", achievementStandardId: `6사01-0${number}`, achievementStandard: `공식 기준 ${number}` } }));
  const text = "우리 국토의 산맥과 동고서저 지형의 분포를 확인하는 공개 원문입니다.";
  const publicText = { text, sourceUrl: content.source.sourceUrl, sha256: crypto.createHash("sha256").update(text).digest("hex") };
  const result = { status: "DRAFT", content: { curiId: content.curiId, title: content.metadata.title, subject: "사회", gradeBand: "초등 5학년" },
    publicText, selectedCandidates: standards.map((standard) => ({ curriculumCuriId: standard.curiId })),
    coreConcepts: ["국토"], rationale: "연계 근거", teachingUse: "지도에서 국토 확인" };
  const review = { reviewId: "review-1", mappingRunId: "run-1", contentCuriId: content.curiId,
    contentVersion: contentVersion(content), decision: "approve", status: "HUMAN_APPROVED", confirmed: true,
    reviewedAt: "2026-09-22T01:00:00.000Z", reviewerRole: "LOCAL_HUMAN_REVIEWER", note: "",
    result: { curriculumCuriIds: standards.map((standard) => standard.curiId), coreConcepts: result.coreConcepts,
      rationale: result.rationale, teachingUse: result.teachingUse, officialStandards: structuredClone(standards) } };
  return { contents: [content], curriculumStandards: standards,
    mappingRuns: [{ mappingRunId: "run-1", contentCuriId: content.curiId, status: "SUCCEEDED",
      input: { contentCuriId: content.curiId, publicText }, result, reviewHistory: [review] }],
    contentCurriculumMaps: standards.map((standard, index) => ({ curiMapId: `map-${index}`, mappingRunId: "run-1",
      contentCuriId: content.curiId, curriculumCuriId: standard.curiId, curriculumVersion: standard.curriculumVersion,
      assetClassification: "DRAFT", reviewStatus: review.status, reviewId: review.reviewId,
      reviewedAt: review.reviewedAt, reviewerRole: review.reviewerRole, draft: structuredClone(result) })),
    verifiedAssets: [], verifiedAssetHistory: [], searchProjection: [] };
}

async function loadModule(name, dependencies, extras = {}) {
  const module = { exports: {} };
  vm.runInNewContext(await fs.readFile(require.resolve(name), "utf8"), {
    module, process, URL, console, ...extras,
    require: (dependency) => Object.hasOwn(dependencies, dependency) ? dependencies[dependency] : require(dependency)
  });
  return module.exports;
}

async function checkUiAndRoutes(service, reviewService, reset, input) {
  const { EventEmitter } = require("node:events");
  let handler;
  let release;
  let holdSave = false;
  let indexed = false;
  async function getIndexStatus(id) {
    const status = await service.getVerifiedStatus(id);
    return { state: !status.saved ? "NOT_SAVED" : indexed ? "READY" : "PENDING",
      ready: status.saved && indexed, indexedCount: status.saved && indexed ? status.assets.length : 0 };
  }
  // 이 검사는 승인 이후의 Gate·저장을 담당한다. 실제 인증 경계는 admin-workspace-check에서 검사한다.
  await loadModule("./server", {
    "./admin-auth": { createAdminAccess: () => ({ handle: async () => false, announce() {} }) },
    "node:http": { createServer(callback) { handler = callback; return { listen() {} }; } },
    "./review-actions": reviewService,
    "./search-index": {
      getSearchIndexStatus: getIndexStatus,
      async prepareSearchIndex(input) { indexed = true; return getIndexStatus(input.contentCuriId); }
    },
    "./verified-save": { ...service, async saveVerifiedAssets(value) {
      if (holdSave) await new Promise((resolve) => { release = resolve; });
      return service.saveVerifiedAssets(value);
    } }
  }, { URL, Buffer, console: { log() {}, error() {} } });
  async function request(method, url, body) {
    const req = Object.assign(new EventEmitter(), { method, url });
    const result = {};
    const pending = handler(req, {
      writeHead(status) { result.status = status; },
      end(value) { result.body = value ? JSON.parse(value) : null; }
    });
    setImmediate(() => {
      if (body !== undefined) req.emit("data", Buffer.from(typeof body === "string" ? body : JSON.stringify(body)));
      req.emit("end");
    });
    await pending;
    return result;
  }
  await reset();
  const url = "/api/curibase/verified";
  assert.equal((await request("GET", `${url}?contentCuriId=content-1`)).body.eligible, true);
  assert.equal((await request("HEAD", `${url}?contentCuriId=content-1`)).body, null);
  assert.equal((await request("GET", `${url}?contentCuriId=missing`)).status, 404);
  assert.equal((await request("POST", url, "{invalid")).status, 400);
  assert.equal((await request("POST", url, { ...input, reviewId: "stale" })).status, 409);
  holdSave = true;
  const pending = request("POST", url, input);
  await new Promise(setImmediate);
  assert.equal((await request("POST", url, input)).status, 409);
  assert.equal((await request("POST", "/api/curimap/review", {})).status, 409);
  release();
  assert.equal((await pending).body.saved, true);
  holdSave = false;
  assert.equal((await request("POST", url, input)).body.reused, true);

  class Element {
    constructor() {
      this.children = []; this.dataset = {}; this.value = ""; this.checked = false;
      this.classList = { toggle() {} };
    }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
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
  await reset();
  let posts = 0;
  let failStatus = false;
  let missingRoute = false;
  let displayRun = fixture().mappingRuns[0];
  const context = vm.createContext({ URLSearchParams, window: { location: { search: "?contentCuriId=content-1" } },
    document: { querySelector: element, querySelectorAll: (selector) => selector.includes("decision") ? decisions : [],
      createElement: () => new Element(), createTextNode: (value) => value },
    async fetch(target, options) {
      if (target.includes("/curibase/")) {
        if (missingRoute) return { ok: false, status: 404, json: async () => { throw new SyntaxError("Not Found"); } };
        if (failStatus) return { ok: false, json: async () => ({ error: "모의 조회 실패" }) };
        if (options?.method === "POST" && target === "/api/curibase/verified") posts += 1;
        const result = await request(options?.method ?? "GET", target, options?.body);
        return { ok: result.status === 200, json: async () => result.body };
      }
      let body;
      if (target.includes("review-options")) body = await reviewService.getReviewOptions("content-1");
      else if (target.includes("/draft")) body = { run: structuredClone(displayRun) };
      else body = { contents: [{ curiId: "content-1", title: "우리 국토", subject: "사회", gradeBand: "초등 5학년" }] };
      return { ok: true, json: async () => body };
    }
  });
  vm.runInContext(await fs.readFile(require.resolve("../public/review-search-index.js"), "utf8"), context);
  vm.runInContext(await fs.readFile(require.resolve("../public/review.js"), "utf8"), context);
  // 초기 비동기 조회를 한 번 명시적으로 완료해 UI 입력과 순서를 맞춘다.
  await context.initializeReview();
  assert.equal(element("#save-verified").disabled, false);
  decisions[1].checked = true;
  context.updateDecisionState();
  assert.equal(element("#save-verified").disabled, true);
  decisions[1].checked = false;
  context.updateVerifiedButton();
  const saving = context.saveToCuriBase();
  assert.equal(element("#save-verified").disabled, true);
  assert.equal(element("#save-decision").disabled, true);
  await context.saveToCuriBase();
  await saving;
  assert.equal(posts, 1);
  assert.equal(element("#verified-badge").textContent, "CuriBase 저장 완료");
  assert.equal(element("#verified-details").children.length, 2);
  assert.match(element("#search-index-status").textContent, /검색 준비 완료/);
  await context.saveToCuriBase();
  assert.equal(element("#verified-details").children.length, 2);
  await context.initializeReview();
  assert.equal(element("#verified-badge").textContent, "CuriBase 저장 완료");
  const edited = await reviewService.saveReviewDecision({ contentCuriId: "content-1", mappingRunId: "run-1",
    expectedReviewId: "review-1", contentVersion: input.contentVersion, confirmed: true, decision: "exclude", note: "다른 탭에서 제외" });
  await context.saveToCuriBase();
  assert.equal(element("#save-verified").disabled, true);
  assert.equal(element("#verified-status").dataset.state, "error");
  displayRun.reviewHistory = edited.reviewHistory;
  await context.initializeReview();
  assert.equal(element("#save-verified").disabled, true);
  assert.equal(element("#verified-badge").textContent, "CuriBase 저장 전");
  failStatus = true;
  await context.initializeReview();
  assert.equal(element("#verified-badge").textContent, "CuriBase 상태 확인 필요");
  assert.equal(element("#save-verified").disabled, true);
  failStatus = false;
  missingRoute = true;
  await context.initializeReview();
  assert.match(element("#verified-status").textContent, /Ctrl\+C.*npm start/);
  assert.equal(element("#save-verified").disabled, true);
  console.log("verified UI/API checks passed (save, reload, repeat, shared lock, stale tab, exclusion, load failure)");
}

async function runChecks() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "curi-verified-"));
  const file = path.join(directory, "server/data/curi-store.json");
  let failRename = false;
  let failWrite = false;
  try {
    const data = await loadModule("./data-store", { "node:fs/promises": { ...fs,
      async writeFile(...args) {
        if (failWrite) { await fs.writeFile(args[0], "partial"); throw new Error("모의 부분 쓰기 실패"); }
        return fs.writeFile(...args);
      },
      async rename(...args) { if (failRename) throw new Error("모의 교체 실패"); return fs.rename(...args); }
    } }, { process: { pid: process.pid, cwd: () => directory } });
    const service = await loadModule("./verified-save", { "./data-store": data });
    const reviewService = await loadModule("./review-actions", { "./data-store": data });
    const reset = async (store = fixture()) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(store, null, 2)}\n`); };
    const input = { contentCuriId: "content-1", mappingRunId: "run-1", reviewId: "review-1", contentVersion: contentVersion(fixture().contents[0]) };
    await checkUiAndRoutes(service, reviewService, reset, input);
    await reset();
    for (const bad of [null, {}, { ...input, contentCuriId: "other" }, { ...input, mappingRunId: "other" },
      { ...input, reviewId: "other" }, { ...input, contentVersion: "old" }]) {
      await assert.rejects(service.saveVerifiedAssets(bad), service.VerifiedSaveError);
    }
    const invalidCases = [
      (s) => { s.mappingRuns[0].reviewHistory = []; },
      (s) => { s.mappingRuns[0].reviewHistory[0].status = "EXCLUDED"; },
      (s) => { s.mappingRuns[0].reviewHistory[0].contentCuriId = "other"; },
      (s) => { s.mappingRuns[0].reviewHistory[0].confirmed = false; },
      (s) => { s.mappingRuns[0].reviewHistory[0].reviewedAt = "invalid"; },
      (s) => { s.mappingRuns[0].reviewHistory[0].reviewerRole = "AI"; },
      (s) => { s.mappingRuns[0].reviewHistory[0].result.curriculumCuriIds = ["invented"]; },
      (s) => { s.contents[0].lifecycle.isActive = false; },
      (s) => { s.contents[0].source.sourceUrl = "https://ebs.co.kr.evil.test/"; },
      (s) => { s.contents[0].sourceIdentity.sourceContentId = ""; },
      (s) => { s.contents[0].metadata.contentLevel = "program"; },
      (s) => { s.contents[0].metadata.title = "변경"; },
      (s) => { s.mappingRuns[0].result.publicText.text = "짧음"; },
      (s) => { s.mappingRuns[0].result.publicText.sha256 = "bad"; },
      (s) => { s.mappingRuns[0].result.publicText.sourceUrl = "https://example.com"; },
      (s) => { s.curriculumStandards[1].metadata.achievementStandard = "원문 변경"; },
      (s) => { s.curriculumStandards[1].curriculumVersion = "이전 교육과정"; },
      (s) => { s.curriculumStandards[1].review.status = "REVIEW_REQUIRED"; },
      (s) => { s.curriculumStandards[1].source.sourceDocument = ""; },
      (s) => { s.contentCurriculumMaps[1].contentCuriId = "other"; },
      (s) => { s.contentCurriculumMaps.push(structuredClone(s.contentCurriculumMaps[0])); },
      (s) => { s.mappingRuns.push({ mappingRunId: "new", contentCuriId: "content-1", status: "FAILED" }); }
    ];
    for (const mutate of invalidCases) {
      const store = fixture(); mutate(store); await reset(store);
      const before = await fs.readFile(file, "utf8");
      await assert.rejects(service.saveVerifiedAssets(input), service.VerifiedSaveError);
      assert.equal(await fs.readFile(file, "utf8"), before);
    }
    await reset();
    const saved = await service.saveVerifiedAssets({ ...input, assets: [{ forged: true }], reviewerRole: "AI" });
    assert.equal(saved.assets.length, 2);
    assert.equal(saved.saved, true);
    assert.ok((await data.readDataStore()).contentCurriculumMaps.every((map) => map.assetClassification === "VERIFIED"));
    const firstBytes = await fs.readFile(file, "utf8");
    const repeated = await service.saveVerifiedAssets(input);
    assert.equal(repeated.reused, true);
    assert.equal(await fs.readFile(file, "utf8"), firstBytes);
    const restartedData = await loadModule("./data-store", {}, { process: { pid: process.pid, cwd: () => directory } });
    const restartedService = await loadModule("./verified-save", { "./data-store": restartedData });
    assert.equal(JSON.stringify(await restartedService.getVerifiedStatus("content-1")), JSON.stringify(await service.getVerifiedStatus("content-1")));

    // R08-04: 기준·개별 관계 변경은 해당 관계만, 공유 원문·묶음 결정 변경은 함께 무효화한다.
    for (const [index, mutate] of invalidCases.entries()) {
      const store = JSON.parse(firstBytes); mutate(store);
      store.searchProjection = [{ contentCuriId: "content-1" }];
      await data.writeDataStore(store);
      const read = await data.readDataStore();
      const remaining = index >= 15 && index <= 20 ? 1 : 0;
      assert.equal(read.verifiedAssets.length, remaining);
      assert.equal(read.verifiedAssetHistory.length, 2 - remaining);
      assert.equal(read.searchProjection.length, 0);
      assert.equal(read.contents[0].lifecycle.isCuriBaseVerified, Boolean(remaining));
      assert.ok(read.contentCurriculumMaps.filter((map) => map.assetClassification === "VERIFIED").length <= remaining);
    }
    const tampered = JSON.parse(firstBytes);
    tampered.verifiedAssets[0].publicText.text = "변조";
    reconcileVerifiedAssets(tampered);
    assert.equal(tampered.verifiedAssets.length, 1);

    await reset(JSON.parse(firstBytes));
    const reviewInput = { contentCuriId: "content-1", mappingRunId: "run-1", expectedReviewId: "review-1",
    contentVersion: input.contentVersion, confirmed: true, decision: "edit", note: "둘째 기준 제외",
      curriculumCuriIds: ["standard-1"], coreConcepts: ["사람이 확인한 국토"], rationale: "사람 수정 근거", teachingUse: "지도 활용" };
    for (const kind of ["write", "rename"]) {
      failWrite = kind === "write"; failRename = kind === "rename";
      await assert.rejects(reviewService.saveReviewDecision(reviewInput), /모의/);
      assert.equal(await fs.readFile(file, "utf8"), firstBytes);
      failWrite = false; failRename = false;
      assert.deepEqual(await fs.readdir(path.dirname(file)), ["curi-store.json"]);
    }
    const edited = await reviewService.saveReviewDecision(reviewInput);
    let status = await service.getVerifiedStatus("content-1");
    assert.equal(status.saved, false);
    assert.equal(status.eligible, true);
    assert.equal(status.invalidatedCount, 2);
    const editSave = { ...input, reviewId: edited.review.reviewId };
    const beforeSave = await fs.readFile(file, "utf8");
    failRename = true;
    await assert.rejects(service.saveVerifiedAssets(editSave), /교체 실패/);
    assert.equal(await fs.readFile(file, "utf8"), beforeSave);
    failRename = false;
    status = await service.saveVerifiedAssets(editSave);
    assert.equal(status.assets.length, 1);
    assert.equal(status.assets[0].version, 2);
    await assert.rejects(service.saveVerifiedAssets(input), /변경/);
    await reviewService.saveReviewDecision({ ...reviewInput, expectedReviewId: edited.review.reviewId, decision: "exclude", note: "제외" });
    status = await service.getVerifiedStatus("content-1");
    assert.equal(status.eligible, false);
    assert.equal(status.saved, false);
    assert.equal(status.invalidatedCount, 3);
    const final = await data.readDataStore();
    assert.equal(JSON.stringify(final.mappingRuns[0].result), JSON.stringify(fixture().mappingRuns[0].result));
    console.log("verified save checks passed (Gate, atomic multi-relation save, retries, review invalidation, versions, restart, partial write/rename failure)");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

if (require.main === module) runChecks().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { fixture, loadModule };
