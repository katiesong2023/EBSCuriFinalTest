const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { fixture, loadModule } = require("./verified-save-check");
const { contentVersion, evaluateVerification, verifiedPayload, fingerprint, reconcileVerifiedAssets } = require("./data-quality");
const { embeddingSpec, documentForAsset, embeddingKey } = require("./search-index-contract");
const { parseSearchInput } = require("./search-conditions");
const { createNaturalSearch, configuredThreshold } = require("./natural-search");

const vector = (score = 1) => [score, Math.sqrt(1 - score * score), ...Array(382).fill(0)];

// 검수 Gate를 통과하는 모의 자산만 메모리에 구성한다. 실제 저장소를 쓰지 않는다.
function searchFixture(count = 24) {
  const store = fixture();
  store.contents = []; store.mappingRuns = []; store.contentCurriculumMaps = [];
  for (let index = 0; index < count; index += 1) {
    const part = fixture();
    const content = part.contents[0];
    const id = `content-${String(index).padStart(2, "0")}`;
    content.curiId = id;
    content.metadata.title = `국토 ${index}`;
    content.metadata.broadcastDate = index % 3 === 0 ? null : `2025-01-${String(index + 1).padStart(2, "0")}`;
    const run = part.mappingRuns[0];
    run.contentCuriId = id; run.mappingRunId = `run-${index}`;
    run.input.contentCuriId = id; run.result.content.curiId = id; run.result.content.title = content.metadata.title;
    const review = run.reviewHistory[0];
    review.contentCuriId = id; review.mappingRunId = run.mappingRunId;
    review.reviewId = `review-${index}`; review.contentVersion = contentVersion(content);
    part.contentCurriculumMaps.forEach((map, relation) => {
      map.contentCuriId = id; map.mappingRunId = run.mappingRunId;
      map.curiMapId = `map-${index}-${relation}`; map.reviewId = review.reviewId;
    });
    const context = evaluateVerification(part, id);
    assert.equal(context.eligible, true);
    const assets = context.maps.map((_, relation) => {
      const payload = verifiedPayload(context, relation);
      return { ...payload, verifiedAssetId: `asset-${index}-${relation}`, version: 1,
        evidenceFingerprint: fingerprint(payload) };
    });
    store.contents.push(content); store.mappingRuns.push(run); store.contentCurriculumMaps.push(...part.contentCurriculumMaps);
    store.verifiedAssets.push(...assets);
    assets.forEach((asset, relation) => store.searchProjection.push({
      embeddingKey: embeddingKey(documentForAsset(asset)), spec: embeddingSpec,
      vector: vector(index === 23 ? 0.7 : relation === 0 ? 0.9 : 0.85),
      inputTokens: 20, truncated: false, verifiedAssetId: asset.verifiedAssetId,
      version: asset.version, contentCuriId: id, curiMapId: asset.curiMapId,
      curriculumCuriId: asset.curriculumCuriId, contentVersion: asset.contentVersion,
      evidenceFingerprint: asset.evidenceFingerprint
    }));
  }
  return reconcileVerifiedAssets(store);
}

function checkConditions() {
  for (const query of ["초등 5학년 사회 산맥", "5~6학년군 사회 지형", "5, 6학년 사회", "초등 고학년 사회", "초등 5학년과 6학년 사회"]) {
    const result = parseSearchInput({ query });
    assert.deepEqual(result.applied.grade.courses, ["elementary56"], query);
    assert.equal(result.applied.subject.value, "사회");
    assert.equal(result.needsClarification, false);
  }
  assert.equal(parseSearchInput({ query: "중학년 수학" }).applied.grade.value, "초등 3~4학년군");
  assert.equal(parseSearchInput({ query: "중학년 수학" }).needsClarification, false);
  for (const query of ["사회 또는 과학", "1학년 과학", "초1 과학", "중학교 2학년 과학", "초등 7학년", "12학년 과학"]) {
    assert.equal(parseSearchInput({ query }).needsClarification, true);
  }
  const conflict = parseSearchInput({ query: "초등 3학년 사회", grade: "초등 5~6학년군", subject: "과학" });
  assert.equal(conflict.applied.subject.value, "과학");
  assert.equal(conflict.warnings.length, 2);
  assert.equal(conflict.needsClarification, false);
  assert.equal(parseSearchInput({ query: "산맥" }).applied.subject.value, "all");
  assert.equal(parseSearchInput({ query: "사회적 책임" }).applied.subject.value, "all");
  for (const input of [{ query: "" }, { query: "a".repeat(301) }, { query: "산맥", page: "1x" },
    { query: "산맥", page: 0 }, { query: "산맥", sort: "bad" }, { query: "산맥", subject: "bad" }]) {
    assert.throws(() => parseSearchInput(input));
  }
  for (const value of ["", "bad", -1, 2]) assert.throws(() => configuredThreshold(value));
  assert.equal(configuredThreshold("0.9"), 0.9);
  console.log("search conditions passed (inference, explicit conflicts, ambiguity, school, input/config validation)");
}

async function checkSearch() {
  let store = searchFixture();
  assert.equal(store.verifiedAssets.length, 48);
  let calls = 0;
  const readStore = async () => reconcileVerifiedAssets(structuredClone(store));
  const service = createNaturalSearch({ readStore, getThreshold: () => 0.82,
    createEmbedder: () => ({ async embed(text) { calls += 1; assert.equal(text, "query: 초등 5학년 사회 산맥");
      return { vector: vector(), truncated: false }; }, async close() {} }) });
  const input = { query: "초등 5학년 사회 산맥" };
  const before = JSON.stringify(store);
  const first = await service(input);
  assert.equal(first.total, 23); assert.equal(first.results.length, 10); assert.equal(first.totalPages, 3);
  assert.equal(first.results[0].relations.length, 2);
  assert.equal(first.results[0].relations[0].reason, "연계 근거");
  const second = await service({ ...input, page: 2 });
  const third = await service({ ...input, page: 3 });
  assert.equal(third.results.length, 3);
  assert.equal(new Set([...first.results, ...second.results, ...third.results].map((item) => item.contentCuriId)).size, 23);
  assert.equal(calls, 1); assert.equal(second.usage.queryCacheHit, true);
  assert.equal((await service({ ...input, page: 999 })).page, 3);
  const newest = await service({ ...input, sort: "newest" });
  const oldest = await service({ ...input, sort: "oldest" });
  assert.equal(first.results[0].date, "2025-01-23");
  assert.equal(newest.results[0].date, "2025-01-23");
  assert.equal(oldest.results[0].date, "2025-01-02");
  for (const sort of ["newest", "oldest", "relevance"]) {
    const all = [];
    for (let page = 1; page <= 3; page += 1) all.push(...(await service({ ...input, sort, page })).results);
    assert.equal(all.length, 23);
    const firstUnknown = all.findIndex((item) => item.date === null);
    assert(all.slice(firstUnknown).every((item) => item.date === null));
    assert(!all.some((item) => item.contentCuriId === "content-23"));
  }
  const filtered = await service({ ...input, subject: "과학" });
  assert.equal(filtered.total, 0); assert.ok(filtered.warnings.some((warning) => warning.startsWith("교과:"))); assert.equal(calls, 1);
  assert.equal((await service({ query: "1학년 사회 산맥" })).total, 0);
  assert.equal((await service({ query: "사회 과학" })).state, "NEEDS_CLARIFICATION");
  assert.equal(JSON.stringify(store), before);

  store.searchProjection[0].vector = vector(0.98);
  store.searchProjection[1].vector = vector(0.5);
  const relevanceFirst = await service(input);
  assert.equal(relevanceFirst.results[0].contentCuriId, "content-00");
  assert.equal(relevanceFirst.results[0].date, null);
  assert.equal(relevanceFirst.results[0].relations.length, 1);
  assert.equal((await service({ ...input, sort: "newest" })).results[0].contentCuriId, "content-22");
  store = searchFixture();

  const strict = createNaturalSearch({ readStore, getThreshold: () => 0.95,
    createEmbedder: () => ({ async embed() { return { vector: vector() }; }, async close() {} }) });
  assert.equal((await strict(input)).total, 0);
  store.mappingRuns[0].reviewHistory.at(-1).decision = "exclude";
  const afterExclude = await service(input);
  assert.equal(afterExclude.total, 22); assert.equal(calls, 1);
  store.searchProjection[2].version = 0;
  // R08-04: 같은 자료의 다른 유효 관계는 계속 검색된다.
  assert.equal((await service(input)).total, 22);
  assert.equal(calls, 1);

  store = searchFixture(1);
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const concurrent = createNaturalSearch({ readStore, getThreshold: () => 0.82,
    createEmbedder: () => ({ async embed() { entered(); await new Promise((resolve) => { release = resolve; });
      return { vector: vector() }; }, async close() {} }) });
  const pending = concurrent(input); await started;
  const same = concurrent(input);
  await assert.rejects(concurrent({ query: "다른 질의" }), /다른 검색/);
  store.mappingRuns[0].reviewHistory.at(-1).decision = "exclude";
  release();
  assert.equal((await pending).total, 0); assert.equal((await same).total, 0);
  store = searchFixture(1);
  let attempt = 0;
  const retry = createNaturalSearch({ readStore, getThreshold: () => 0.82,
    createEmbedder: () => ({ async embed() { if (++attempt === 1) throw new Error("모의 실패"); return { vector: vector() }; }, async close() {} }) });
  await assert.rejects(retry(input), /검색 계산/);
  assert.equal((await retry(input)).total, 1);
  console.log("search ranking passed (all matches, dedupe, threshold, dates, pages, cache, invalidation, concurrency, retry, no writes)");
  return first;
}

async function checkRoutes() {
  let handler;
  let calls = 0;
  const service = createNaturalSearch({ readStore: async () => searchFixture(0) });
  await loadModule("./server", {
    "node:http": { createServer(fn) { handler = fn; return { listen() {} }; } },
    "./natural-search": { SearchError: require("./search-conditions").SearchError,
      async searchVerifiedContents(input) { calls += 1; return service(input); } },
    "./curimap-mapping": { createCuriMapDraft() { throw new Error("검색에서 연계 실행 금지"); } }
  }, { URL, Buffer, console: { log() {}, error() {} } });
  async function request(method, query) {
    const result = {};
    await handler(Object.assign(new EventEmitter(), { method, url: `/api/curi/search?${query}` }), {
      writeHead(status, headers) { result.status = status; result.headers = headers; },
      end(body) { result.body = body; }
    });
    return result;
  }
  const success = await request("GET", "query=산맥");
  assert.equal(success.status, 200); assert.equal(success.headers["Cache-Control"], "no-store");
  assert.equal(JSON.parse(success.body).total, 0);
  assert.equal((await request("HEAD", "query=산맥")).body, undefined);
  assert.equal((await request("GET", "")).status, 400);
  assert.equal((await request("HEAD", "")).body, undefined);
  assert.equal((await request("POST", "query=산맥")).status, 405);
  assert.equal(calls, 4);
  console.log("search API passed (GET/HEAD, validation, method, no-store, no CuriMap calls)");
}

async function checkUi(payload) {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.events = {}; this.attributes = {}; this.dataset = {}; this.value = ""; this.textContent = ""; }
    addEventListener(name, fn) { this.events[name] = fn; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; this.textContent = ""; }
    setAttribute(name, value) { this.attributes[name] = value; }
    set innerHTML(_) { throw new Error("검증 자료의 HTML 삽입 금지"); }
  }
  const elements = new Map();
  const element = (selector) => { if (!elements.has(selector)) elements.set(selector, new Element("div")); return elements.get(selector); };
  element("#query-input").value = "산맥";
  element("#grade-filter").value = "all"; element("#subject-filter").value = "all";
  element("#sort-select").value = "relevance";
  let response = structuredClone(payload);
  response.results[0].title = '<img src=x onerror="alert(1)">';
  let hold = false;
  let release;
  let statusCode = 200;
  let latestUrl;
  const browserLocation = { pathname: "/index.html", search: "" }, browserEvents = {};
  const setLocation = (_state, _title, address) => { const url = new URL(address, "http://localhost"); browserLocation.search = url.search; };
  const context = vm.createContext({ URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    location: browserLocation, history: { pushState: setLocation, replaceState: setLocation }, window: { addEventListener: (event, callback) => { browserEvents[event] = callback; } },
    document: { querySelector: element, createElement: (tag) => new Element(tag) },
    async fetch(url) {
      latestUrl = url;
      if (hold) await new Promise((resolve) => { release = resolve; });
      const body = response;
      return { status: statusCode, ok: statusCode === 200, async json() { return body; } };
    }
  });
  vm.runInContext(await fs.readFile(require.resolve("../public/index.js"), "utf8"), context);
  const flush = () => new Promise(setImmediate);
  const submit = () => element("#search-form").events.submit({ preventDefault() {} });
  hold = true; submit();
  assert.equal(element("#search-submit").disabled, true);
  assert.equal(element("#search-status").dataset.state, "loading");
  release(); hold = false; await flush();
  assert.equal(element("#results-content").children.length, 10);
  assert.equal(element("#results-content").children[0].children[1].textContent, response.results[0].title);
  assert.equal(element("#search-submit").disabled, false);
  response.page = 2;
  element("#pagination").children.at(-1).events.click(); await flush();
  assert.equal(new URL(latestUrl, "http://localhost").searchParams.get("page"), "2");
  assert.equal(new URLSearchParams(browserLocation.search).get("page"), "2");
  browserLocation.search = "?query=민주주의&grade=" + encodeURIComponent("중학교 1학년") + "&subject=사회&page=1";
  browserEvents.popstate(); await flush();
  assert.equal(element("#grade-filter").value, "중학교 1학년");
  assert.equal(new URL(latestUrl, "http://localhost").searchParams.get("grade"), "중학교 1학년");

  hold = true; submit(); element("#query-input").events.input(); release(); hold = false; await flush();
  assert.match(element("#result-summary").textContent, /검색을 기다/);
  assert.equal(element("#search-submit").disabled, false);
  statusCode = 404; submit(); await flush();
  assert.match(element("#search-status").textContent, /npm start/);
  statusCode = 503; response = { error: "모의 검색 실패" }; submit(); await flush();
  assert.match(element("#search-status").textContent, /모의 검색 실패/);
  response = { ...payload, state: "EMPTY", total: 0, results: [], indexedContents: 0 }; statusCode = 200;
  submit(); await flush(); assert.equal(element("#pagination").children.length, 0);
  response = { ...response, state: "NEEDS_CLARIFICATION", warnings: ["교과를 선택하세요."] };
  submit(); await flush();
  assert.equal(element("#condition-warnings").hidden, false);
  assert.equal(element("#search-status").dataset.state, "warning");
  console.log("search UI passed (loading, results, safe text, pages, stale response, errors, empty, clarification)");
}

async function main() { checkConditions(); const payload = await checkSearch(); await checkRoutes(); await checkUi(payload); }
main().catch((error) => { console.error(error); process.exitCode = 1; });
