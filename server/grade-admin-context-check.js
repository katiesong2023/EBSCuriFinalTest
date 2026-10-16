const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// 실제 브라우저·서버·저장소 대신 DOM과 응답만 제공하고, 운영 화면 스크립트를 실행한다.
function harness(saved = new Map()) {
  const nodes = [], requests = [];
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.hidden = false; this._text = ""; nodes.push(this); }
    set textContent(value) { this._text = String(value ?? ""); this.children = []; }
    get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this._text = ""; this.children = children; }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    async fire(type) { for (const callback of this.listeners[type] || []) await callback({ target: this }); }
    scrollIntoView() {}
  }
  for (const id of ["detail-content", "detail-title", "job-panel", "job-summary", "job-results", "job-start", "job-stop", "job-clear"]) {
    const node = new Element("div"); node.id = id;
  }
  const find = (id) => nodes.find((node) => node.id === id);
  const location = new URL("https://local.test/admin.html?id=resource-1&gradeBand=중1&subject=과학&standardId=9과07-03");
  const sandbox = { URL, URLSearchParams, Event, location,
    history: { replaceState(_state, _title, url) { location.href = String(url); } },
    document: { createElement: (tag) => new Element(tag), querySelector: (selector) => find(selector.replace(/^#/, "")), getElementById: find },
    localStorage: { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    addEventListener() {}, dispatchEvent() {},
    fetch: async (url, options) => {
      requests.push({ url, input: JSON.parse(options.body) });
      return { ok: true, json: async () => url === "/api/curimap/evidence"
        ? { summary: { candidates: 1, publishable: 0 }, relations: [] }
        : url === "/api/admin/source-check" ? { status: "PASS", checks: [] }
          : { runId: "test-run", saveStatus: "HELD", searchPreparation: { ready: 0 }, relations: [] } };
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const filename of ["grade-context.js", "admin-ui.js", "admin-jobs.js", "admin-detail.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public", filename), "utf8"), sandbox, { filename });
  }
  sandbox.CuriAdmin.renderHumanReview = () => {};
  const row = { id: "resource-1", title: "검증용 자료", contentCuriId: "content-1", active: true, automaticAllowed: true,
    sourceUrl: "https://www.ebs.co.kr/example", sourceStatus: "MATCHED", tagStatus: "VOCABULARY_NOT_FOUND", approvalStatus: "NOT_ASSESSED", mappingStatus: "NOT_RUN",
    work: { quality: { message: "원문 검사 가능" }, automatic: { processed: false, published: 0 } } };
  sandbox.CuriAdmin.renderDetail({ resource: row, navigation: { matching: true, position: 0, total: 1 },
    sourceRecord: { metadata: { subjectSeed: "과학" }, review: { history: [] } }, automatic: { latest: [], history: [] },
    tags: { supported: [], candidates: [] }, mappingAllowed: true, runs: [], assets: [], invalidatedAssets: [] });
  return { sandbox, nodes, find, requests, saved, row,
    button: (text) => nodes.find((node) => node.tagName === "button" && node.textContent === text),
    async idle() {
      for (let index = 0; index < 20 && sandbox.CuriAdmin.jobs.running; index += 1) await new Promise(setImmediate);
      assert.equal(sandbox.CuriAdmin.jobs.running, false, "작업 응답이 완료되어야 한다");
    }
  };
}

async function run() {
  const results = [], check = (name) => results.push({ name, status: "PASS" });
  const h = harness(), jobs = h.sandbox.CuriAdmin.jobs;
  assert.equal(h.find("automatic-selected-standard").hidden, false);
  assert.match(h.find("automatic-selected-standard").textContent, /9과07-03/);
  await h.button("후보·근거만 미리보기").fire("click");
  assert.deepEqual(h.requests.at(-1), { url: "/api/curimap/evidence", input: {
    contentCuriId: "content-1", subject: "과학", gradeBand: "중학교 1학년", standardId: "9과07-03"
  } });
  check("선택 기준 표시와 미리보기 요청이 중1 과학 9과07-03을 유지");

  await h.button("자동 검사·저장").fire("click"); await h.idle();
  assert.equal(h.requests.at(-1).url, "/api/admin/automatic-assets");
  assert.equal(h.requests.at(-1).input.standardId, "9과07-03");
  assert.equal(JSON.parse(h.saved.get("curi.admin.jobs.v1"))[0].standardId, "9과07-03");
  assert.match(h.find("job-results").textContent, /선택 기준 9과07-03/);
  check("상세 저장 작업과 브라우저 재개 기록이 선택 기준을 유지");

  const pending = harness();
  pending.sandbox.CuriAdmin.jobs.prepare([pending.row], "process", "과학", undefined, "중1", "9과07-03");
  const resumed = harness(pending.saved);
  await resumed.sandbox.CuriAdmin.jobs.start();
  assert.equal(resumed.requests.at(-1).input.standardId, "9과07-03");
  check("브라우저를 다시 연 뒤 작업 재개도 선택 기준을 유지");

  const batchStart = h.requests.length;
  jobs.prepare([h.row, { ...h.row, id: "resource-2", contentCuriId: undefined }], "process", "과학", undefined, "중학교 1학년");
  await jobs.start();
  assert.equal(h.requests.length - batchStart, 2);
  for (const request of h.requests.slice(batchStart)) assert.equal(Object.hasOwn(request.input, "standardId"), false);
  assert.equal(h.requests.at(-1).input.resourceId, "resource-2");
  check("일반 일괄 검사는 상세 URL에 선택 기준이 있어도 standardId를 추가하지 않음");

  for (const route of ["/curimap.html", "/review.html"]) {
    const node = h.nodes.find((item) => item.tagName === "a" && item.href?.startsWith(`${route}?`));
    const url = new URL(node.href, h.sandbox.location);
    assert.equal(url.searchParams.get("gradeBand"), "중1"); assert.equal(url.searchParams.get("subject"), "과학");
  }
  const explicit = new URL(h.sandbox.CuriAdmin.managedLink("다른 관계", "/review.html", { gradeBand: "초4", subject: "사회" }).href, h.sandbox.location);
  assert.equal(explicit.searchParams.get("gradeBand"), "초4"); assert.equal(explicit.searchParams.get("subject"), "사회");
  const ingestion = new URL(h.sandbox.CuriAdmin.managedLink("입력", "/ingestion.html", { resourceId: "resource-1" }).href, h.sandbox.location);
  assert.equal(ingestion.searchParams.has("gradeBand"), false);
  check("CuriMap·기존 사람 검토 이동 시 교과·과정을 유지하고 명시적 관계 문맥 우선");

  h.find("automatic-grade").value = "초등 3~4학년군";
  await h.find("automatic-grade").fire("change");
  assert.equal(h.sandbox.location.searchParams.has("standardId"), false);
  assert.equal(h.find("automatic-selected-standard").hidden, true);
  await h.button("후보·근거만 미리보기").fire("click");
  assert.equal(h.requests.at(-1).input.gradeBand, "초등 3~4학년군");
  assert.equal(Object.hasOwn(h.requests.at(-1).input, "standardId"), false);
  h.sandbox.location.searchParams.set("standardId", "4과01-01");
  h.find("automatic-subject").value = "사회";
  await h.find("automatic-subject").fire("change");
  assert.equal(h.sandbox.location.searchParams.has("standardId"), false);
  await h.button("자동 검사·저장").fire("click"); await h.idle();
  assert.equal(h.requests.at(-1).input.subject, "사회");
  assert.equal(Object.hasOwn(h.requests.at(-1).input, "standardId"), false);
  const visibleNodes = (node) => [node, ...node.children.flatMap(visibleNodes)];
  for (const route of ["/curimap.html", "/review.html"]) {
    const node = visibleNodes(h.find("detail-content")).find((item) => item.tagName === "a" && item.href?.startsWith(`${route}?`));
    const url = new URL(node.href, h.sandbox.location);
    assert.equal(url.searchParams.get("gradeBand"), "초등 3~4학년군"); assert.equal(url.searchParams.get("subject"), "사회");
  }
  check("교과·과정 변경 시 선택 기준을 해제하고 이후 요청에도 남기지 않음");

  jobs.prepare([h.row], "source", "과학", undefined, "중1", "9과07-03"); await jobs.start();
  assert.equal(Object.hasOwn(h.requests.at(-1).input, "standardId"), false);
  check("출처 점검은 선택 교육과정 조건을 보내지 않음");

  const report = { checkedAt: new Date().toISOString(), passed: results.length, failed: 0,
    scope: "실제 화면 스크립트 VM 검사 · 외부 요청/실제 저장소 변경 없음", results };
  fs.writeFileSync(path.join(__dirname, "../docs/r09-01-admin-context-check.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
