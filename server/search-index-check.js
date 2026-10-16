const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { fixture, loadModule } = require("./verified-save-check");
const { contentVersion } = require("./data-quality");
const { createLocalEmbedder } = require("./local-embedding");

async function checkUi() {
  class Element {
    constructor() { this.dataset = {}; this.children = []; this.events = {}; }
    addEventListener(name, fn) { this.events[name] = fn; }
    append(item) { this.children.push(item); }
    replaceChildren(...items) { this.children = items; }
  }
  const elements = new Map();
  const element = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  let response = { state: "PENDING", ready: false };
  let fail = false;
  let release;
  let hold = false;
  let calls = 0;
  let busy = false;
  const context = vm.createContext({ document: { querySelector: element, createElement: () => new Element() },
    async fetch() {
      calls += 1;
      if (hold) await new Promise((resolve) => { release = resolve; });
      if (fail) throw new Error("모의 연결 실패");
      return { ok: true, json: async () => response };
    } });
  vm.runInContext(await fs.readFile(require.resolve("../public/review-search-index.js"), "utf8"), context);
  const ui = context.createSearchIndexUi({ getInput: () => ({ contentCuriId: "content-1" }), setBusy: (value) => { busy = value; } });
  ui.setAvailable(true);
  await ui.refresh("content-1");
  assert.match(element("#search-index-status").textContent, /준비 전/);
  hold = true;
  const pending = element("#prepare-search-index").events.click();
  assert.equal(busy, true);
  assert.equal(element("#prepare-search-index").disabled, true);
  await element("#prepare-search-index").events.click();
  assert.equal(calls, 2);
  response = { state: "FAILED", ready: false, lastRun: { status: "FAILED", error: "로컬 모의 실패",
    usage: { embeddedDocuments: 1, reusedDocuments: 0, inputTokens: 10, externalApiCalls: 0 } } };
  release(); await pending; hold = false;
  assert.equal(busy, false);
  assert.match(element("#search-index-status").textContent, /CuriBase 저장 결과는 유지/);
  response = { ...response, state: "READY", ready: true, indexedCount: 2 };
  await element("#prepare-search-index").events.click();
  assert.match(element("#search-index-status").textContent, /검색 준비 완료/);
  assert.equal(element("#search-index-details").children.length, 1);
  fail = true; await ui.refresh("content-1");
  assert.equal(element("#search-index-status").dataset.state, "error");
  fail = false; hold = true;
  const stale = ui.refresh("content-1");
  ui.clear(); release(); await stale;
  assert.equal(element("#prepare-search-index").disabled, true);
  assert.doesNotMatch(element("#search-index-status").textContent, /완료/);
  console.log("search index UI checks passed (loading, duplicate click, failure, retry, usage, stale response)");
}

async function checkRoutes(service, input, setup) {
  let handler;
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let embedCalls = 0;
  // 이 검사는 승인 이후의 Gate·저장을 담당한다. 실제 인증 경계는 admin-workspace-check에서 검사한다.
  await loadModule("./server", {
    "./admin-auth": { createAdminAccess: () => ({ handle: async () => false, announce() {} }) },
    "node:http": { createServer(fn) { handler = fn; return { listen() {} }; } },
    "./search-index": { ...service, prepareSearchIndex: (body) => service.prepareSearchIndex(body, {
      createEmbedder: () => ({ async embed() { embedCalls += 1;
        if (embedCalls === 1) { entered(); await new Promise((resolve) => { release = resolve; }); }
        return { vector: [1, ...Array(383).fill(0)], inputTokens: 10, truncated: false }; }, async close() {} })
    }) }
  }, { URL, Buffer, console: { log() {}, error() {} } });
  async function request(method, url, body) {
    const req = Object.assign(new EventEmitter(), { method, url });
    const result = {};
    const res = { writeHead(status) { result.status = status; }, end(text) { result.body = text ? JSON.parse(text) : null; } };
    const pending = handler(req, res);
    setImmediate(() => { if (body !== undefined) req.emit("data", Buffer.from(JSON.stringify(body))); req.emit("end"); });
    await pending; return result;
  }
  await setup();
  const url = "/api/curibase/search-index";
  assert.equal((await request("GET", url + "?contentCuriId=content-1")).body.state, "PENDING");
  assert.equal((await request("HEAD", url + "?contentCuriId=content-1")).body, null);
  assert.equal((await request("POST", url, {})).status, 400);
  assert.equal((await request("POST", url, { ...input, reviewId: "old" })).status, 409);
  const pending = request("POST", url, input);
  await started;
  assert.equal((await request("GET", url + "?contentCuriId=content-1")).body.state, "RUNNING");
  for (const route of [url, "/api/curibase/verified", "/api/curimap/review"]) {
    assert.equal((await request("POST", route, input)).status, 409);
  }
  release();
  assert.equal((await pending).body.ready, true);
  console.log("search index API checks passed (GET/HEAD, stale input, RUNNING, shared write lock)");
}

async function runChecks() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "curi-search-index-"));
  const file = path.join(directory, "server/data/curi-store.json");
  let failPublish = false;
  try {
    const data = await loadModule("./data-store", {}, { process: { pid: process.pid, cwd: () => directory } });
    const wrappedData = { ...data, async writeDataStore(store) {
      if (failPublish && store.searchIndexRuns?.at(-1)?.status === "SUCCEEDED") {
        failPublish = false; throw new Error("모의 최종 교체 실패");
      }
      return data.writeDataStore(store);
    } };
    const service = await loadModule("./search-index", { "./data-store": wrappedData });
    const verified = await loadModule("./verified-save", { "./data-store": data });
    const reviews = await loadModule("./review-actions", { "./data-store": data });
    const input = { contentCuriId: "content-1", mappingRunId: "run-1", reviewId: "review-1", contentVersion: contentVersion(fixture().contents[0]) };
    const reset = async (store = fixture()) => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(store));
    };
    const setup = async () => { await reset(); await verified.saveVerifiedAssets(input); };
    let calls = 0;
    let failAt = 0;
    const options = { createEmbedder: () => ({ async embed() {
      calls += 1;
      if (calls === failAt) throw new Error("로컬 모의 실패");
      return { vector: [1, ...Array(383).fill(0)], inputTokens: 12, truncated: false };
    }, async close() {} }) };
    await reset();
    await assert.rejects(service.prepareSearchIndex(input, options), /먼저/);
    assert.equal(calls, 0);
    await setup();
    failAt = 2;
    let result = await service.prepareSearchIndex(input, options);
    assert.equal(result.state, "FAILED");
    let store = await data.readDataStore();
    assert.equal(store.embeddingCache.length, 1);
    assert.equal(store.searchProjection.length, 0);
    assert.equal(store.verifiedAssets.length, 2);
    assert.equal(result.lastRun.usage.embeddedDocuments, 1);
    result = await service.prepareSearchIndex(input, options);
    assert.equal(result.ready, true);
    assert.equal(calls, 3);
    assert.equal(result.lastRun.usage.reusedDocuments, 1);
    const firstBytes = await fs.readFile(file, "utf8");
    assert.equal((await service.prepareSearchIndex(input, options)).reused, true);
    assert.equal(await fs.readFile(file, "utf8"), firstBytes);
    const restarted = await loadModule("./search-index", { "./data-store": data });
    assert.equal((await restarted.getSearchIndexStatus("content-1")).ready, true);
    store = await data.readDataStore();
    store.searchProjection[0].version -= 1;
    store.searchProjection.push({ ...store.searchProjection[1], contentCuriId: "orphan" });
    await reset(store);
    assert.equal((await data.readDataStore()).searchProjection.length, 1);
    assert.equal((await service.prepareSearchIndex(input, options)).lastRun.usage.reusedDocuments, 2);
    assert.equal(calls, 3);
    store = await data.readDataStore();
    store.searchProjection.forEach((item) => { item.spec = { model: "old-model" }; });
    store.embeddingCache.forEach((item) => { delete item.spec; });
    await reset(store);
    result = await service.prepareSearchIndex(input, options);
    assert.equal(result.ready, true);
    assert.equal(result.lastRun.usage.embeddedDocuments, 2);
    const reviewInput = { contentCuriId: input.contentCuriId, mappingRunId: input.mappingRunId,
      contentVersion: input.contentVersion, expectedReviewId: input.reviewId, decision: "approve", confirmed: true, note: "동일 근거 재검토" };
    const edited = await reviews.saveReviewDecision(reviewInput);
    assert.equal((await service.getSearchIndexStatus("content-1")).state, "NOT_SAVED");
    const newInput = { ...input, reviewId: edited.review.reviewId };
    await verified.saveVerifiedAssets(newInput);
    await assert.rejects(service.prepareSearchIndex(input, options), /변경/);
    result = await service.prepareSearchIndex(newInput, options);
    assert.equal(result.ready, true);
    assert.equal(result.lastRun.usage.reusedDocuments, 2);
    assert.ok((await data.readDataStore()).searchProjection.every((item) => item.version === 2));
    await reviews.saveReviewDecision({ ...reviewInput, expectedReviewId: newInput.reviewId, decision: "exclude", note: "모의 제외" });
    store = await data.readDataStore();
    assert.equal(store.searchProjection.length, 0);
    assert.equal(store.contents[0].lifecycle.isSearchEligible, false);
    await assert.rejects(service.prepareSearchIndex(newInput, options), /먼저/);

    await setup();
    await service.prepareSearchIndex(input, options);
    const changed = await reviews.saveReviewDecision({ ...reviewInput, decision: "edit", note: "공식 관계와 근거 수정",
      curriculumCuriIds: ["standard-1"], coreConcepts: ["변경된 핵심개념"], rationale: "변경된 연계 근거", teachingUse: "새로운 수업 활용" });
    const changedInput = { ...input, reviewId: changed.review.reviewId };
    assert.equal((await data.readDataStore()).searchProjection.length, 0);
    await verified.saveVerifiedAssets(changedInput);
    result = await service.prepareSearchIndex(changedInput, options);
    assert.equal(result.indexedCount, 1);
    assert.equal(result.lastRun.usage.embeddedDocuments, 1);
    assert.equal((await data.readDataStore()).searchProjection[0].curriculumCuriId, "standard-1");

    await setup();
    failPublish = true;
    result = await service.prepareSearchIndex(input, options);
    assert.equal(result.state, "FAILED");
    store = await data.readDataStore();
    assert.equal(store.searchProjection.length, 0);
    assert.equal(store.embeddingCache.length, 2);
    result = await service.prepareSearchIndex(input, options);
    assert.equal(result.lastRun.usage.reusedDocuments, 2);
    assert.equal(result.ready, true);
    store = await data.readDataStore();
    store.searchProjection = [];
    store.searchIndexRuns.at(-1).status = "RUNNING";
    await reset(store);
    assert.equal((await restarted.getSearchIndexStatus("content-1")).state, "INTERRUPTED");
    result = await restarted.prepareSearchIndex(input, options);
    assert.equal(result.ready, true);
    assert.equal((await data.readDataStore()).searchIndexRuns.at(-2).status, "INTERRUPTED");
    store = await data.readDataStore();
    store.curriculumStandards[0].metadata.achievementStandard = "공식 원문 변경";
    await reset(store);
    assert.equal((await data.readDataStore()).searchProjection.length, 1);
    await setup();
    result = await service.prepareSearchIndex(input, { createEmbedder: () => ({
      async embed() { return { vector: [0], inputTokens: 1, truncated: false }; }, async close() {} }) });
    assert.equal(result.state, "FAILED");
    assert.equal((await data.readDataStore()).searchProjection.length, 0);
    await checkRoutes(service, input, setup);
    await checkUi();
    const timeout = createLocalEmbedder({ timeoutMs: 1 });
    try { await assert.rejects(timeout.embed("passage: 시험"), /제한 시간/); } finally { await timeout.close(); }
    console.log("search index checks passed (atomic publish, cache retry, versions, exclusion, restart, invalid vectors, write failure, timeout)");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

runChecks().catch((error) => { console.error(error); process.exitCode = 1; });
