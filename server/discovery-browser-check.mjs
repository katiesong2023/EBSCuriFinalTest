// 선택적 브라우저 검증. 실행 환경의 Playwright를 사용하며 제품 실행에는 필요하지 않다.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE || undefined });
const base = process.env.CURI_TEST_URL || "http://127.0.0.1:3317";
const docs = process.env.CURI_REPORT_PREFIX || fileURLToPath(new URL("../docs/", import.meta.url));
const cases = [];
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  async function ready() { await page.waitForFunction(() => document.querySelector("#result-cards")?.getAttribute("aria-busy") === "false"); }
  async function check(name, operation) { await operation(); cases.push({ name, passed: true }); }
  const inventory = await (await page.request.get(`${base}/api/curi/discover?workspace=teacher&browse=all`)).json();
  await page.goto(`${base}/?view=all&q=${encodeURIComponent("동고서저 관련 클립을 추천해줘")}`); await ready();
  await check("데스크톱 첫 검색·개념·지명·출처", async () => {
    assert.equal(await page.locator("#result-cards > .resource-card").count(), 9);
    assert.ok(await page.locator('#result-cards [data-id^="BCAST-"]').count() >= 5);
    assert.ok(inventory.stats.broadcastTitleGroups >= 5000);
    assert.match(await page.locator("#catalog-stats").textContent(), /신규 일반방송/);
    assert.match(await page.locator("#concept-panel").innerText(), /설악산/);
    assert.match(await page.locator("#concept-panel").innerText(), /김제/);
    assert.equal(await page.locator("#result-cards a[href^='javascript:']").count(), 0);
    await page.locator('[data-kind="clip"]').click(); await ready();
    const exactClip = page.locator('#result-cards [data-id="ECLIP-046"] .card-actions a');
    assert.match(await exactClip.getAttribute("href"), /clipId=CS000000000000005150/);
    assert.equal(await exactClip.innerText(), "해당 클립 열기 ↗");
    await page.locator('[data-kind="all"]').click(); await ready();
    await page.screenshot({ path: `${docs}curi-local-desktop.png`, fullPage: true });
  });
  await check("교사용 개별 페이지 조건·링크 단위 안내", async () => {
    await page.locator("#direct-only").check(); await ready();
    assert.equal(await page.locator("#result-cards > .resource-card").count(), 8);
    assert.equal(await page.locator('#result-cards [data-id="ECLIP-046"]').count(), 1);
    await page.locator("#direct-only").uncheck(); await ready();
    assert.match(await page.locator('#result-cards [data-id="GEO-SEORAK"] .card-actions a').getAttribute("href"), /lectId=10295175/);
    assert.match(await page.locator('#result-cards [data-id="GEO-GIMJE"] .card-actions a').getAttribute("href"), /lectId=3054984/);
  });
  await check("장소·자료 유형 필터 및 뒤로가기", async () => {
    await page.locator('[data-place="김제"]').click(); await ready();
    assert.equal(await page.locator("#result-cards > .resource-card").count(), 1);
    await page.locator('[data-kind="lesson"]').click(); await ready();
    assert.equal(await page.locator("#empty-state").isVisible(), true);
    await page.goBack(); await ready();
    assert.equal(await page.locator("#result-cards > .resource-card").count(), 1);
  });
  await check("자료 모으기·새로고침 보존·메모 다운로드", async () => {
    await page.locator('#result-cards [data-save]').first().click();
    await page.reload(); await ready();
    assert.equal(await page.locator("#shelf-count").innerText(), "1");
    await page.locator("#open-shelf").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-shelf").click();
    const download = await downloadPromise;
    const contents = await fs.readFile(await download.path(), "utf8");
    assert.match(contents, /김제/); assert.match(contents, /lectId=3054984/); assert.match(contents, /미판정/);
    assert.match(contents, /동고서저/); assert.doesNotMatch(contents, /ebsmedia.net/);
    await page.locator("#close-shelf").click();
  });
  await check("전체 목록 페이지·프로그램 묶음 구분", async () => {
    await page.locator('[data-query=""]').click(); await ready();
    const title = await page.locator("#result-cards > .resource-card h3").first().innerText();
    await page.locator("#next-page").click(); await ready();
    assert.notEqual(await page.locator("#result-cards > .resource-card h3").first().innerText(), title);
    assert.ok((await page.locator("#page-label").innerText()).includes(`2 / ${inventory.pages}`));
    await page.locator('[data-kind="collection"]').click(); await ready();
    assert.equal(await page.locator("#result-count").innerText(), "444건");
  });
  await check("알 수 없는 검색·HTML 삽입 방지", async () => {
    await page.locator("#search-input").fill('<img src=x onerror="window.injected=true">');
    await page.locator("#search-submit").click(); await ready();
    assert.equal(await page.locator("#empty-state").isVisible(), true);
    assert.equal(await page.evaluate(() => window.injected), undefined);
  });
  await check("일반방송 프로그램 조건·주소 공유·새로고침", async () => {
    for (const q of ["민주주의", "기후 변화", "인구", "경제"]) {
      assert.equal(await page.locator(`[data-query="${q}"]`).isVisible(), true);
      await page.locator(`[data-query="${q}"]`).click(); await ready();
      assert.ok(await page.locator('#result-cards [data-id^="BCAST-"]').count() > 0, q);
    }
    await page.locator('[data-query=""]').click(); await ready();
    await page.locator("#program-filter").selectOption("지식채널e"); await ready();
    assert.equal(new URL(page.url()).searchParams.get("program"), "지식채널e");
    assert.ok(await page.locator('#result-cards [data-id^="BCAST-"]').count() > 0);
    await page.reload(); await ready();
    assert.equal(await page.locator("#program-filter").inputValue(), "지식채널e");
    await page.locator("#program-filter").selectOption(""); await ready();
  });
  await check("서버 실패 표시·재시도 복구", async () => {
    await page.route("**/api/curi/discover?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "시뮬레이션: 자료 읽기 실패" }) }));
    await page.locator('[data-query="화산 지형"]').click(); await ready();
    assert.equal(await page.locator("#error-state").isVisible(), true);
    assert.equal(await page.locator("#result-cards > .resource-card").count(), 0);
    await page.unroute("**/api/curi/discover?*");
    await page.locator("#retry-search").click(); await ready();
    assert.match(await page.locator('#result-cards [data-id="GEO-PARK-HALLA"] h3').innerText(), /한라산/);
  });
  await check("늦은 이전 응답으로 최신 검색 덮어쓰기 방지", async () => {
    await page.route("**/api/curi/discover?*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("q")?.includes("동고서저")) await new Promise((resolve) => setTimeout(resolve, 250));
      await route.continue().catch(() => {});
    });
    await page.locator('[data-query="동고서저 관련 클립을 추천해줘"]').click();
    await page.locator('[data-query="해안 지형"]').click(); await ready();
    await page.waitForTimeout(350);
    assert.match(await page.locator("#result-cards > .resource-card h3").innerText(), /한려해상/);
    await page.unroute("**/api/curi/discover?*");
  });
  await check("수업 예시 8개 검색·모바일 펼침", async () => {
    await page.locator(".classroom-examples summary").click();
    for (const q of ["다문화", "119", "급식", "감귤", "고인돌", "대동여지도", "날씨", "달의 모양"]) {
      await page.locator(`[data-query="${q}"]`).click(); await ready();
      assert.ok(await page.locator("#result-cards > .resource-card").count() > 0, q);
      assert.equal(await page.locator("#search-input").inputValue(), q);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1440, height: 1080 });
  });
  await check("이전 모음 다운로드 링크 갱신·잘못된 근거 링크 제외", async () => {
    const payload = await (await page.request.get(`${base}/api/curi/discover?kind=clip&q=${encodeURIComponent("동고서저")}`)).json();
    const clip = payload.results.find((item) => item.id === "ECLIP-046");
    await page.evaluate((item) => localStorage.setItem("curi.discovery.shelf.v1", JSON.stringify([{ ...item,
      navigation: { url: item.sourceUrl, label: "이전 링크" }, query: "동고서저", questions: [] }])), clip);
    await page.reload(); await ready();
    await page.locator("#open-shelf").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-shelf").click();
    const contents = await fs.readFile(await (await downloadPromise).path(), "utf8");
    assert.match(contents, /clipId=CS000000000000005150/);
    assert.doesNotMatch(contents, /- 수집 당시 출처:|- 근거 페이지:/);
    for (const match of contents.matchAll(/https:\/\/primary\.ebs\.co\.kr\/[^\s]+/g)) {
      assert.equal(new URL(match[0]).searchParams.get("clipId"), "CS000000000000005150");
    }
    assert.match(await page.locator(".shelf-item a").getAttribute("href"), /clipId=CS000000000000005150/);
    await page.locator("#close-shelf").click();
  });
  await check("다운로드 링크 조회 실패 안내·재시도 가능", async () => {
    // 최신 링크 조회 실패 시 예전의 잘못된 주소로 내려받지 않는다.
    await page.locator("#open-shelf").click();
    await page.route("**/api/curi/discover/resources?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "시뮬레이션: 링크 조회 실패" }) }));
    let downloaded = false;
    const onDownload = () => { downloaded = true; };
    page.on("download", onDownload);
    await page.locator("#export-shelf").click();
    await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("다운로드하지 않았습니다"));
    assert.equal(downloaded, false);
    assert.equal(await page.locator("#export-shelf").isDisabled(), false);
    page.off("download", onDownload);
    await page.unroute("**/api/curi/discover/resources?*");
    await page.locator("#close-shelf").click();
  });
  await check("관리자 로그인 경계·기존 AI 초안 화면 유료 실행 비활성화", async () => {
    await page.goto(`${base}/curimap.html`);
    await page.waitForURL('**/admin-login.html?**');
    assert.ok(process.env.CURI_ADMIN_TOKEN, '검사 서버와 같은 CURI_ADMIN_TOKEN을 전달하세요.');
    await page.locator('#admin-token').fill(process.env.CURI_ADMIN_TOKEN);
    await page.locator('#login-form button').click();
    await page.waitForURL('**/admin.html?filter=mapping');
    const data = await (await page.request.get(`${base}/api/curimap/contents`)).json();
    const content = data.contents.find((item) => item.title === "동고서저 지형, 산맥");
    await page.goto(`${base}/curimap.html?contentCuriId=${encodeURIComponent(content.curiId)}`);
    await page.waitForFunction(() => document.querySelector("#content-select")?.options.length > 1);
    assert.match(await page.locator("#paid-api-notice").innerText(), /꺼져/);
    assert.equal(await page.locator("#mapping-submit").isDisabled(), true);
    assert.match(await page.locator("#content-preview .source-link").getAttribute("href"), /clipId=CS000000000000005150/);
    await page.goto(`${base}/review.html?contentCuriId=${encodeURIComponent(content.curiId)}`);
    await page.waitForFunction(() => document.querySelector("#source-link").textContent.includes("해당 클립"));
    assert.match(await page.locator("#source-link").getAttribute("href"), /clipId=CS000000000000005150/);
  });
  await check("모바일 화면·자료 모음·키보드 닫기", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/?q=${encodeURIComponent("동고서저 관련 클립을 추천해줘")}`); await ready();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${docs}curi-local-mobile.png`, fullPage: true });
    await page.locator("#open-shelf").click();
    assert.equal(await page.locator("#shelf-dialog").isVisible(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#shelf-dialog").isVisible(), false);
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(`${docs}local-browser-simulation.json`, JSON.stringify({ generatedAt: new Date().toISOString(), browser: await browser.version(), viewports: ["1440x1080", "390x844"], cases, pageErrors: errors, note: "UI 동작 확인이며 영상 재생·교사 적합성 평가는 제외" }, null, 2) + "\n");
  console.log(`브라우저 시뮬레이션 ${cases.length}개 통과, 페이지 오류 0건`);
} finally { await browser.close(); }
