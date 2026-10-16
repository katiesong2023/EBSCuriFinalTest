const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { DatabaseSync } = require("node:sqlite");
const { createAdminBrowserFixture } = require("./admin-browser-fixture");
const { ingestionBrowserCases } = require("./ingestion-browser-cases");
const cases = [], errors = [];
const check = async (name, fn) => { await fn(); cases.push({ name, passed: true }); console.log(`통과: ${name}`); };
const files = ["curi-store.json", "broadcast-catalog.sqlite", "semantic-layer.sqlite", "automatic-assets.sqlite"];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async (name) => [name, crypto.createHash("sha256").update(await fs.readFile(path.join(__dirname, "data", name))).digest("hex")])));

async function main() {
  if (!process.env.CURI_PLAYWRIGHT_MODULE) throw new Error("CURI_PLAYWRIGHT_MODULE을 지정하세요.");
  const before = await hashes(), fixture = await createAdminBrowserFixture();
  const { base, token, ids, automaticFile, broadcastFile, directory } = fixture;
  let browser;
  try {
    const login = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const headers = { Cookie: login.headers.get("set-cookie").split(";")[0], Origin: base, "Content-Type": "application/json" };
    const post = (url, body) => fetch(`${base}${url}`, { method: "POST", headers, body: JSON.stringify(body) });
    const api = async (url) => { const res = await fetch(`${base}${url}`, { headers }); assert.equal(res.status, 200); return res.json(); };
    await check("작업공간·출처 점검 인증·Origin·Host·메서드·입력 경계", async () => {
      for (const endpoint of ["/api/admin/workspace", "/api/admin/source-check", "/api/curimap/evidence", "/api/admin/automatic-assets", "/api/admin/automatic-assets/search"]) {
        assert.equal((await fetch(`${base}${endpoint}`)).status, 401);
        assert.equal((await fetch(`${base}${endpoint}`, { method: "POST", headers: { ...headers, Origin: "https://invalid.example" }, body: "{}" })).status, 403);
      }
      assert.equal((await fetch(`${base}/api/admin/source-check`, { headers })).status, 405);
      assert.equal((await post("/api/admin/source-check", { resourceId: ids[0], source: {} })).status, 400);
      assert.equal((await post("/api/admin/source-check", { resourceId: "missing" })).status, 404);
      const status = await new Promise((resolve, reject) => { const req = http.get(`${base}/api/admin/source-check`, { headers: { Host: "invalid.example", Cookie: headers.Cookie } }, (res) => { res.resume(); resolve(res.statusCode); }); req.on("error", reject); });
      assert.equal(status, 403);
      const result = await (await post("/api/admin/source-check", { resourceId: ids[0] })).json(); assert.equal(result.status, "PASS");
      assert.equal((await api("/api/admin/automatic-assets")).runs.length, 0);
    });
    const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", (error) => errors.push(error.message));
    const ready = () => page.waitForFunction(() => /현재 저장된|자료 상세를 불러왔습니다/.test(document.querySelector("#request-status")?.textContent));
    const settledJobs = () => page.waitForFunction(() => { const jobs = JSON.parse(localStorage.getItem("curi.admin.jobs.v1") || "[]"); return jobs.length && jobs.every((job) => !["PENDING", "RUNNING", "UNKNOWN"].includes(job.status)); });
    const jobs = () => page.evaluate(() => JSON.parse(localStorage.getItem("curi.admin.jobs.v1")));
    const gotoList = async (extra = "") => { await page.goto(`${base}/admin.html?q=관리회귀&sort=title&page=1${extra}`); await ready(); };
    await check("직접 접근 로그인 복귀·초안 없는 신규 집계·어휘 0건과 오류 구분", async () => {
      await gotoLogin(); await ready();
      await page.evaluate(() => localStorage.setItem("curi.teacher.folders.v1", '{"sentinel":"unchanged"}'));
      const data = await api("/api/admin/workspace?q=관리회귀&sort=title");
      assert.equal(data.counts.all, 3); assert.equal(data.counts.new, 3); assert.equal(data.counts.exceptions, 0); assert.equal(data.counts.review, 0);
      assert.equal(data.results.find((row) => row.id === ids[2]).tagStatus, "VOCABULARY_NOT_FOUND");
      assert.match(await page.locator("#count-explanation").innerText(), /3자료.*관계.*회/);
      await page.screenshot({ path: "docs/r08-03-admin-desktop.png", fullPage: true });
    });
    async function gotoLogin() {
      await page.goto(`${base}/admin.html?q=관리회귀&filter=all&sort=title&page=1`);
      await page.locator("#admin-token").fill(token); await page.locator("#login-form button").click();
    }
    await check("원본 자료 상세·미리보기 무저장·필터와 목록 복귀 보존", async () => {
      await page.locator(`.resource[data-id="${ids[0]}"] a`).click(); await ready();
      await page.locator("#automatic-subject").selectOption("과학"); await page.getByRole("button", { name: "후보·근거만 미리보기" }).click();
      await page.waitForFunction(() => document.querySelector("#automatic-action-status").textContent.includes("미리보기 완료"));
      assert.match(await page.locator("#detail-content").innerText(), /확인되지 않은 부분/);
      assert.equal((await api("/api/admin/automatic-assets")).runs.length, 0);
      await page.locator("#back-to-list").click(); await ready(); assert.equal(new URL(page.url()).searchParams.get("sort"), "title");
      assert.equal(new URL(page.url()).searchParams.get("q"), "관리회귀");
    });
    await check("일괄 실행 명시 대상·현재 건 이후 중단·새로고침 후 미완료만 재개", async () => {
      for (const id of ids.slice(0, 2)) await page.locator(`[data-select="${id}"]`).check();
      await page.locator("#batch-subject").selectOption("과학"); await page.locator("#prepare-batch").click();
      assert.equal((await api("/api/admin/automatic-assets")).runs.length, 0);
      let release, entered = false;
      await page.route("**/api/admin/automatic-assets", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const response = await route.fetch(); entered = true; await new Promise((resolve) => { release = resolve; }); await route.fulfill({ response });
      });
      await page.locator("#job-start").click();
      for (let i = 0; !entered && i < 200; i++) await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(entered, true);
      await page.locator("#job-stop").click(); release();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("curi.admin.jobs.v1"))[0].status === "SUCCESS");
      assert.equal((await jobs())[1].status, "PENDING");
      await page.unroute("**/api/admin/automatic-assets"); await page.reload(); await ready();
      await page.locator("#job-start").click(); await settledJobs();
      assert.deepEqual((await jobs()).map((job) => job.status), ["SUCCESS", "HELD"]);
      assert.equal((await api("/api/admin/automatic-assets")).runs.length, 2);
      const stored = JSON.parse(await fs.readFile(path.join(directory, "server/data/curi-store.json")));
      const original = JSON.parse(await fs.readFile(path.join(__dirname, "data/curi-store.json")));
      assert.deepEqual(stored.mappingRuns, original.mappingRuns); assert.deepEqual(stored.verifiedAssets, original.verifiedAssets);
    });
    await check("검색 준비 실패는 저장 성공과 분리·재개 시 검색만 재시도", async () => {
      await page.locator("#job-clear").click();
      const db = new DatabaseSync(automaticFile); db.exec("UPDATE assets SET search_state='FAILED'; DELETE FROM search_projection;"); db.close();
      await page.goto(`${base}/admin.html?q=관리회귀&filter=search&sort=title&page=1&id=${ids[0]}&cursor=0`); await ready();
      const beforeRuns = (await api("/api/admin/automatic-assets")).runs.length;
      const requests = []; const listener = (request) => { if (request.method() === "POST") requests.push(new URL(request.url()).pathname); }; page.on("request", listener);
      await page.getByRole("button", { name: "이 실행의 검색 준비만 재시도" }).click(); await settledJobs(); await ready();
      assert.deepEqual(requests, ["/api/admin/automatic-assets/search"]); page.off("request", listener);
      assert.equal((await api("/api/admin/automatic-assets")).runs.length, beforeRuns);
      assert.match(await page.locator("#detail-content").innerText(), /목록 조건에서 빠졌습니다/);
      assert.match(await page.locator("#detail-content").innerText(), /마지막 자료/);
    });
    await check("현재 원문·인용 위치·기준 요구·미확인 부분·선택적 사람 관계 문맥", async () => {
      await page.goto(`${base}/admin.html?q=관리회귀&sort=title&page=1&id=${ids[0]}&cursor=0`); await ready();
      assert.match(await page.locator(".comparison-grid").innerText(), /성취기준의 요구/); assert.match(await page.locator(".comparison-grid").innerText(), /확인되지 않은 부분/);
      assert.match(await page.locator(".comparison-grid").innerText(), /지구는 자전한다/);
      const human = page.locator('a[href*="automaticRelationId="]').first(), href = new URL(await human.getAttribute("href"), base);
      assert.ok(href.searchParams.get("automaticRunId")); assert.ok(href.searchParams.get("automaticRelationId"));
      const back = new URL(href.searchParams.get("returnTo"), base); assert.equal(back.searchParams.get("id"), ids[0]); assert.ok(back.searchParams.get("relationId"));
      await human.click(); await page.waitForURL("**/admin.html?**"); await ready();
      await page.locator(".human-form").first().waitFor();
      assert.equal(await page.locator('.human-form [name="confirmed"]').first().isChecked(), false);
      assert.equal(new URL(page.url()).searchParams.get("id"), ids[0]);
      await page.screenshot({ path: "docs/r08-03-admin-detail.png", fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: "docs/r08-03-admin-mobile.png", fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await check("원문 변경 예외와 이전 근거·현재 원문 비교·응답 미확인 재개 중복 방지", async () => {
      const db = new DatabaseSync(broadcastFile); db.prepare("UPDATE episodes SET synopsis=? WHERE id=?").run("지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다. 관찰한 변화를 소개한다.", ids[0]); db.close();
      await page.goto(`${base}/admin.html?q=관리회귀&filter=changed&sort=title&page=1&id=${ids[0]}&cursor=0`); await ready();
      assert.match(await page.locator("#detail-content").innerText(), /변경으로 제공 중단/);
      assert.match(await page.locator(".source-text").innerText(), /관찰한 변화를/);
      await page.locator("#job-clear").click(); await page.getByRole("button", { name: "자동 재검사·저장", exact: true }).click(); await settledJobs(); await ready();
      const count = (await api("/api/admin/automatic-assets")).runs.length;
      await page.evaluate(() => { const jobs = JSON.parse(localStorage.getItem("curi.admin.jobs.v1")); jobs[0].status = "RUNNING"; localStorage.setItem("curi.admin.jobs.v1", JSON.stringify(jobs)); });
      await page.reload(); await ready(); assert.equal((await jobs())[0].status, "UNKNOWN");
      await page.locator("#job-start").click(); await settledJobs(); assert.equal((await api("/api/admin/automatic-assets")).runs.length, count);
    });
    await check("빈 목록·상세 실패와 재시도·로딩·세션 만료 복귀·교사 폴더 보존", async () => {
      await page.goto(`${base}/admin.html?q=존재하지않는자료987`); await ready(); assert.match(await page.locator("#resources").innerText(), /자료가 없습니다/);
      let release;
      await page.route("**/api/admin/workspace?*", async (route) => { await new Promise((resolve) => { release = resolve; }); await route.fulfill({ status: 500, json: { error: "합성 조회 실패" } }); });
      await page.goto(`${base}/admin.html?id=${ids[0]}&q=관리회귀&sort=title`);
      assert.match(await page.locator("#request-status").innerText(), /불러오는 중/);
      for (let i = 0; !release && i < 200; i++) await new Promise((resolve) => setTimeout(resolve, 10)); release();
      await page.locator("#retry").waitFor({ state: "visible" }); assert.match(await page.locator("#request-status").innerText(), /합성 조회 실패/);
      await page.unroute("**/api/admin/workspace?*"); await page.locator("#retry").click(); await ready();
      await page.evaluate(() => fetch("/api/admin/session", { method: "DELETE" })); await page.reload();
      await page.locator("#admin-token").fill(token); await page.locator("#login-form button").click(); await ready();
      assert.equal(new URL(page.url()).searchParams.get("id"), ids[0]); assert.equal(new URL(page.url()).searchParams.get("q"), "관리회귀");
      assert.equal(await page.evaluate(() => localStorage.getItem("curi.teacher.folders.v1")), '{"sentinel":"unchanged"}');
    });
    await ingestionBrowserCases({ page, base, check });
    await check("기존 승인 4개·실제 JSON 및 방송/시맨틱/자동 DB 무변경", async () => {
      assert.deepEqual(await hashes(), before); assert.equal(JSON.parse(await fs.readFile(path.join(directory, "server/data/curi-store.json"))).verifiedAssets.length, 4);
    });
    assert.deepEqual(errors, []);
    await fs.writeFile("docs/r08-03-http-browser-check.json", JSON.stringify({ date: new Date().toISOString(), cases, errors, protectedHashes: before, fixture: "임시 서버·합성 방송 DB·복제 JSON; 가져오기는 요청을 가로채 전송값 검사", paidApiCalls: 0 }, null, 2) + "\n");
    console.log(`R08-03 HTTP·브라우저 ${cases.length}개 통과`);
  } finally { await browser?.close(); await fixture.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
