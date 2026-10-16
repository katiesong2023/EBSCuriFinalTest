const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { openBroadcastStore, saveBroadcastPage } = require("./broadcast-store");

const cases = [], browserCases = [], errors = [];
const check = async (name, operation, list = cases) => { await operation(); list.push({ name, passed: true }); };

async function main() {
  const root = path.resolve(__dirname, ".."), temporary = await fs.mkdtemp(path.join(os.tmpdir(), "curi-automatic-http-"));
  let child, browser;
  try {
    await fs.mkdir(path.join(temporary, "server/data"), { recursive: true });
    for (const filename of await fs.readdir(__dirname)) if (filename.endsWith(".js")) await fs.copyFile(path.join(__dirname, filename), path.join(temporary, "server", filename));
    for (const filename of await fs.readdir(path.join(__dirname, "data"))) if (filename.endsWith(".json")) await fs.copyFile(path.join(__dirname, "data", filename), path.join(temporary, "server/data", filename));
    for (const directory of ["public", "EBS_Curi_FINAL_PACKAGE_v1.4", "node_modules"]) await fs.symlink(path.join(root, directory), path.join(temporary, directory));
    const dbFile = path.join(temporary, "server/data/broadcast-catalog.sqlite"), db = openBroadcastStore(dbFile);
    const page = { job: "AUTOMATIC_TEST", sourceUrl: "https://www.ebs.co.kr/fixture", fetchedAt: new Date().toISOString() };
    saveBroadcastPage(db, page, [{ title: "자동 검사 예시 지구의 자전", program: "합성 개발 검사", summary: "지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.",
      url: "https://www.ebs.co.kr/fixture?courseId=900000&stepId=1&lectId=900001", date: "2026-10-05" },
    { title: "자동 검사 예시 지구의 자전", program: "합성 개발 검사", summary: "지구의 자전과 낮과 밤을 소재로 음악과 풍경을 소개한다.",
      url: "https://www.ebs.co.kr/fixture?courseId=900000&stepId=1&lectId=900002", date: "2020-01-01" }]);
    const id = db.prepare("SELECT id FROM episodes WHERE lect_id='900001'").get().id;
    const siblingId = db.prepare("SELECT id FROM episodes WHERE lect_id='900002'").get().id; db.close();
    const port = await new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); }); });
    const base = `http://127.0.0.1:${port}`, token = crypto.randomBytes(32).toString("hex");
    child = spawn(process.execPath, ["server/server.js"], { cwd: temporary, env: { ...process.env, PORT: String(port), CURI_ADMIN_TOKEN: token,
      CURI_ADMIN_ORIGIN: base, CURI_AUTOMATIC_DB: path.join(temporary, "server/data/automatic-assets.sqlite"), NODE_ENV: "test", CURI_ALLOW_PAID_API: "false" }, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("서버 시작 시간 초과")), 10000);
      child.stdout.once("data", () => { clearTimeout(timer); resolve(); }); child.once("error", reject); child.once("exit", (code) => reject(new Error(`서버 종료 ${code}`))); });
    const login = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    assert.equal(login.status, 200);
    const headers = { Cookie: login.headers.get("set-cookie").split(";")[0], Origin: base, "Content-Type": "application/json" };
    const endpoint = `${base}/api/admin/automatic-assets`, post = (body, url = endpoint) => fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    await check("관리 세션·동일 Origin·허용 메서드·클라이언트 통과 결과 주입 차단", async () => {
      for (const url of [endpoint, `${endpoint}/search`]) {
        assert.equal((await fetch(url, { method: "POST", body: "{}" })).status, 401);
        assert.equal((await fetch(url, { method: "POST", headers: { ...headers, Origin: "https://example.com" }, body: "{}" })).status, 403);
        assert.equal((await fetch(url, { method: "DELETE", headers })).status, 405);
      }
      assert.equal((await fetch(endpoint)).status, 401);
      assert.equal((await post({ resourceId: id, subject: "과학", report: { publicationEligible: true } })).status, 400);
      assert.equal((await fetch(endpoint, { method: "POST", headers, body: "not-json" })).status, 400);
      assert.equal((await post({ runId: "invalid" }, `${endpoint}/search`)).status, 400);
    });
    let runId;
    await check("가져오기 없는 공식 방송 원본 → 별도 자산 저장 → 검색 준비 및 중복 실행", async () => {
      const response = await post({ resourceId: id, subject: "과학" }); assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store"); const result = await response.json();
      runId = result.runId; assert.equal(result.assets.length, 1); assert.equal(result.searchPreparation.ready, 1);
      const repeated = await (await post({ resourceId: id, subject: "과학" })).json();
      assert.equal(repeated.runId, runId); assert.equal(repeated.reused, true);
      const retried = await (await post({ runId }, `${endpoint}/search`)).json(); assert.equal(retried.searchPreparation.ready, 1);
    });
    await check("공개 교사 검색·재조회에 현재 자동 관계만 제공하고 승인 필터와 구분", async () => {
      const url = `${base}/api/curi/discover?workspace=teacher&q=지구&curriculum=automatic`;
      const automatic = await (await fetch(url)).json(); assert.equal(automatic.total, 1);
      assert.equal(automatic.results[0].id, id); assert.equal(automatic.results[0].automaticLinks.length, 1);
      assert.equal(automatic.results[0].approvedLinks.length, 0);
      const approved = await (await fetch(`${base}/api/curi/discover?workspace=teacher&browse=all&curriculum=approved`)).json();
      assert.ok(approved.results.length > 0); assert.ok(approved.results.every((r) => r.approvedLinks.length && r.id !== id));
      const resources = await (await fetch(`${base}/api/curi/discover/resources?ids=${id}`)).json();
      assert.equal(resources.resources[0].automaticLinks.length, 1); assert.equal(resources.resources[0].curriculumStatus, "NOT_ASSESSED");
      const sibling = await (await fetch(`${base}/api/curi/discover/resources?ids=${siblingId}`)).json();
      assert.equal(sibling.resources[0].automaticLinks.length, 0);
      const stored = JSON.parse(await fs.readFile(path.join(temporary, "server/data/curi-store.json")));
      assert.equal(stored.verifiedAssets.length, 4); assert.ok(!stored.contents.some((r) => r.sourceIdentity.sourceContentId === id));
    });
    let browserPage;
    if (process.env.CURI_PLAYWRIGHT_MODULE) {
      const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
      browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE || undefined });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
      browserPage = await context.newPage(); browserPage.on("pageerror", (error) => errors.push(error.message)); browserPage.setDefaultTimeout(15000);
      await check("카드 자동 부분 연계·인용·미확인 부분·사람 검수 분리 표시", async () => {
        await browserPage.goto(`${base}/?q=지구&browse=all&view=all&curriculum=automatic`);
        await browserPage.waitForFunction(() => document.querySelector("#result-cards")?.getAttribute("aria-busy") === "false");
        assert.equal(await browserPage.locator("#automatic-only").isChecked(), true);
        const card = browserPage.locator("#result-cards > .resource-card").first();
        assert.match(await card.innerText(), /자동 근거 검사 통과 · 부분 연계 후보/);
        await card.locator(".curriculum-details > summary").click();
        await card.locator(".automatic-evidence > summary").click();
        const text = await card.innerText(); assert.match(text, /확인되지 않은 부분/); assert.match(text, /지구는 자전한다/); assert.doesNotMatch(text, /사람 검수 완료/);
        await card.locator("[data-save]").click();
        await browserPage.screenshot({ path: path.join(temporary, "automatic-desktop.png"), fullPage: true });
      }, browserCases);
      await check("수업 폴더 재조회·자동 부분 연계 내보내기", async () => {
        await browserPage.goto(`${base}/lesson.html`);
        await browserPage.locator("#new-folder-title").fill("자동 근거 검사 수업"); await browserPage.locator("#create-folder button").click();
        await browserPage.locator("#add-videos").click(); await browserPage.locator(`[data-add="${id}"]`).click(); await browserPage.locator("#close-add").click();
        await browserPage.waitForFunction(() => document.querySelector(".resource-evidence")?.textContent.includes("자동 근거 검사 통과"));
        const downloadEvent = browserPage.waitForEvent("download"); await browserPage.locator("#export-folder").click();
        const download = await downloadEvent, text = await fs.readFile(await download.path(), "utf8");
        assert.match(text, /자동 부분 연계 후보/); assert.match(text, /확인되지 않은 부분/); assert.doesNotMatch(text, /사람 검수 완료/);
        await browserPage.setViewportSize({ width: 390, height: 844 });
        assert.ok(await browserPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }, browserCases);
    }
    await check("원문 변경 직후 검색 캐시·자료 재조회·관리 이력 무효화", async () => {
      const changed = new DatabaseSync(dbFile);
      changed.prepare("UPDATE episodes SET synopsis=? WHERE id=?").run("지구의 자전과 낮과 밤이라는 단어를 소개하고 하늘의 모습을 둘러본다.", id); changed.close();
      const automatic = await (await fetch(`${base}/api/curi/discover?workspace=teacher&q=지구&curriculum=automatic`)).json();
      assert.equal(automatic.total, 0);
      const current = await (await fetch(`${base}/api/curi/discover/resources?ids=${id}`)).json(); assert.ok(current.resources.every((r) => r.automaticLinks.length === 0));
      const topic = await (await fetch(`${base}/api/curi/discover?workspace=teacher&q=지구`)).json(); assert.ok(topic.results.flatMap((r) => [r, ...(r.alternatives || [])]).some((r) => r.id === siblingId));
      const history = await (await fetch(`${endpoint}?runId=${runId}`, { headers })).json();
      assert.equal(history.assets[0].state, "STALE"); assert.ok(history.events.some((e) => e.type === "INVALIDATED"));
    });
    if (browserPage) {
      await check("원문 변경 후 폴더 재열기·내보내기·내 자료에서 과거 통과 숨김", async () => {
        await browserPage.reload();
        await browserPage.waitForFunction(() => document.querySelector(".resource-evidence")?.textContent.includes("주제 관련 자료"));
        assert.doesNotMatch(await browserPage.locator(".resource-evidence").innerText(), /자동 근거 검사 통과/);
        const downloadEvent = browserPage.waitForEvent("download"); await browserPage.locator("#export-folder").click();
        const download = await downloadEvent, text = await fs.readFile(await download.path(), "utf8");
        assert.match(text, /교육과정 연계 미확인/); assert.doesNotMatch(text, /자동 부분 연계 후보/);
        await browserPage.goto(`${base}/?q=지구&view=all`); await browserPage.locator("#open-shelf").click();
        await browserPage.waitForFunction(() => document.querySelector("#shelf-items .approval-status")?.textContent.includes("주제 관련 자료"));
        assert.doesNotMatch(await browserPage.locator("#shelf-items").innerText(), /자동 근거 검사 통과/);
      }, browserCases);
      await check("재조회 실패 시 브라우저 저장 통과 표시를 되살리지 않음", async () => {
        await browserPage.route("**/api/curi/discover/resources?*", (route) => route.abort());
        await browserPage.goto(`${base}/lesson.html`);
        await browserPage.waitForFunction(() => document.querySelector(".resource-evidence")?.textContent.includes("확인 실패"));
        assert.doesNotMatch(await browserPage.locator(".resource-evidence").innerText(), /자동 근거 검사 통과|사람 검수 완료/);
      }, browserCases);
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(process.env.CURI_REPORT_PATH || "docs/r08-02-http-browser-check.json", JSON.stringify({ date: new Date().toISOString(), cases, browserCases, errors,
      fixture: "임시 복제 서버·합성 소개문·임시 방송/자동 DB만 변경", paidApiCalls: 0 }, null, 2) + "\n");
    console.log(`R08-02 HTTP ${cases.length}개 · 브라우저 ${browserCases.length}개 통과`);
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) await new Promise((resolve) => { child.once("exit", resolve); child.kill(); });
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
