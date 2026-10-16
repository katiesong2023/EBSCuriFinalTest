// 현재 로컬 서버에서 자연어 해석·근거 펼치기·모음 흐름을 확인한다.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE || "playwright");
const base = process.env.CURI_TEST_URL || "http://127.0.0.1:3317";
const root = new URL("../", import.meta.url);
const digest = async (file) => crypto.createHash("sha256").update(await fs.readFile(new URL(file, root))).digest("hex");
const before = { approval: await digest("server/data/curi-store.json"), broadcasts: await digest("server/data/broadcast-catalog.sqlite") };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE || undefined });
const cases = [], pageErrors = [];
let externalRequestsBlocked = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, acceptDownloads: true });
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
    externalRequestsBlocked++; return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const ready = () => page.waitForFunction(() => document.querySelector("#result-cards")?.getAttribute("aria-busy") === "false");
  async function query(q) { await page.goto(`${base}/?${new URLSearchParams({ q })}`); await ready(); }
  async function api(q) { const response = await page.request.get(`${base}/api/curi/discover?${new URLSearchParams({ q })}`); assert.equal(response.status(), 200); return response.json(); }
  async function check(name, fn) { await fn(); cases.push({ name, passed: true }); }
  await check("일반어 OR와 분기 해석을 실제 HTTP로 연결", async () => {
    const [a, b, either] = await Promise.all([api("설악산"), api("김제"), api("설악산 또는 김제")]);
    assert.ok(either.total >= Math.max(a.total, b.total));
    assert.equal(either.understanding.connector, "OR"); assert.equal(either.understanding.groups.length, 2);
  });
  await check("여러 단어 제외가 지리 패널로 돌아오지 않음", async () => {
    await query("해안 지형 제외하고 우주");
    assert.ok(await page.locator(".resource-card").count() > 0);
    assert.equal(await page.locator("#concept-panel").isVisible(), false);
    assert.match(await page.locator("#query-understanding").innerText(), /제외: 해안 지형/);
    assert.deepEqual((await api("해안 지형 제외하고 우주")).terms, []);
  });
  await check("고유명사와 시간 조건은 결과·미확인 안내로 분리", async () => {
    await query("김제 5분 이내");
    assert.ok(await page.locator(".resource-card").count() > 0);
    assert.match(await page.locator("#query-limitations").innerText(), /재생시간.*충족한 결과가 아닙니다/);
    assert.deepEqual((await api("김제 5분 이내")).terms, ["김제"]);
  });
  await check("사회·과학 자연어 질문과 원문 주제 근거", async () => {
    for (const q of ["민주주의를 설명하는 자료를 찾아주세요", "백혈구의 역할을 쉽게 설명할 자료를 보여주세요", "우주를 탐사하는 방법을 알아볼 다큐를 찾아줘"]) {
      await query(q); assert.ok(await page.locator(".resource-card").count() > 0, q);
      assert.ok((await api(q)).results.every((item) => item.semanticTags.length));
    }
  });
  await check("자료 목록 먼저·소개문과 추천 이유는 펼치기", async () => {
    const first = page.locator(".semantic-details").first();
    assert.equal(await first.getAttribute("open"), null);
    assert.equal(await first.locator(".summary").isVisible(), false);
    await first.locator("summary").click();
    assert.equal(await first.locator(".semantic-evidence").first().isVisible(), true);
    assert.match(await first.innerText(), /제목:|소개문:/);
    await page.screenshot({ path: new URL("docs/curi-semantic-desktop.png", root).pathname, fullPage: true });
  });
  await check("새 과학 자료 모음·재접속·준비 메모 출처 보존", async () => {
    const title = await page.locator(".resource-card h3").first().innerText();
    await page.locator("[data-save]").first().click(); await page.reload(); await ready();
    assert.equal(await page.locator("#shelf-count").innerText(), "1");
    await page.locator("#open-shelf").click();
    const pending = page.waitForEvent("download"); await page.locator("#export-shelf").click();
    const contents = await fs.readFile(await (await pending).path(), "utf8");
    assert.ok(contents.includes(title)); assert.match(contents, /https:\/\//); assert.match(contents, /미판정/);
    await page.locator("#close-shelf").click();
  });
  await check("프로덕션 근거 묶음·유료 호출 차단", async () => {
    const response = await page.request.get(`${base}/api/curi/discover/context?${new URLSearchParams({ q: "면역" })}`);
    assert.equal(response.status(), 200); const payload = await response.json();
    assert.ok(payload.resources.length > 0 && payload.resources.length <= 6);
    assert.ok(JSON.stringify(payload).length <= 24000); assert.equal(payload.constraints.paidApiCalls, 0);
    assert.equal((await (await page.request.get(`${base}/api/runtime`)).json()).paidApiEnabled, false);
  });
  await check("새로운 미보유 조건은 빈 결과", async () => {
    await query("우주 아르테미스검증X928"); assert.equal(await page.locator("#empty-state").isVisible(), true);
    assert.equal(await page.locator(".resource-card").count(), 0);
  });
  await check("모바일 펼침·긴 미확인 조건 가로 넘침 없음", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await query("5학년이 볼 자막 포함 5분 이내 무료 면역 영상");
    await page.locator(".semantic-details summary").first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: new URL("docs/curi-semantic-mobile.png", root).pathname, fullPage: true });
  });
  await check("서버 오류 후 해석·결과 제거와 재시도", async () => {
    await page.route("**/api/curi/discover?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "검증 오류" }) }));
    await page.locator("#search-input").fill("면역"); await page.locator("#search-form").evaluate((form) => form.requestSubmit()); await ready();
    assert.equal(await page.locator("#error-state").isVisible(), true);
    assert.equal(await page.locator("#query-understanding").isVisible(), false);
    assert.equal(await page.locator("#query-limitations").isVisible(), false);
    await page.unroute("**/api/curi/discover?*"); await page.locator("#retry-search").click(); await ready();
    assert.ok(await page.locator(".resource-card").count() > 0);
  });
  const after = { approval: await digest("server/data/curi-store.json"), broadcasts: await digest("server/data/broadcast-catalog.sqlite") };
  assert.deepEqual(after, before); assert.deepEqual(pageErrors, []);
  const report = { generatedAt: new Date().toISOString(), cases, passed: cases.length, pageErrors, externalRequestsBlocked, paidApiCalls: 0, storageUnchanged: true, hashes: after,
    note: "수집 완료 후 고정된 실자료에서 로컬 UI/HTTP 계약 확인. 고정 가상 자료 전후 비교 및 교육적 정확도 평가와 별도." };
  await fs.writeFile(new URL("docs/semantic-browser-simulation.json", root), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
