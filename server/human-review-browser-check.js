const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { createAdminBrowserFixture } = require("./admin-browser-fixture");
const cases = [], errors = [], check = async (name, fn) => { await fn(); cases.push({ name, passed: true }); console.log(`통과: ${name}`); };
async function main() {
  if (!process.env.CURI_PLAYWRIGHT_MODULE) throw new Error("CURI_PLAYWRIGHT_MODULE을 지정하세요.");
  const protectedFiles = ["curi-store.json", "broadcast-catalog.sqlite", "semantic-layer.sqlite", "automatic-assets.sqlite"];
  const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async (name) => [name, crypto.createHash("sha256").update(await fs.readFile(path.join(__dirname, "data", name))).digest("hex")])));
  const before = await hashes(), fixture = await createAdminBrowserFixture({ fakeEmbedding: true });
  const { base, token, ids, directory, broadcastFile } = fixture, standard = "CURI-CURR-2022-6과12-02", sibling = "CURI-CURR-2022-6과12-01";
  let browser;
  try {
    const login = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const headers = { Cookie: login.headers.get("set-cookie").split(";")[0], Origin: base, "Content-Type": "application/json" };
    const post = (url, body, overrides = {}) => fetch(`${base}${url}`, { method: "POST", headers: { ...headers, ...overrides }, body: JSON.stringify(body) });
    const api = async (url) => { const response = await fetch(`${base}${url}`, { headers }); assert.equal(response.status, 200); return response.json(); };
    const endpoint = "/api/admin/human-review", input = { resourceId: ids[0], subject: "과학" };
    const view = (extra = {}) => api(`${endpoint}?${new URLSearchParams({ ...input, ...extra })}`);
    const stored = async () => JSON.parse(await fs.readFile(path.join(directory, "server/data/curi-store.json")));
    const request = async (id, decision = "edit") => { const result = await view({ standardId: id }), relation = result.relations.find((item) => item.curriculumCuriId === id); return {
      target: { resourceId: ids[0] }, subject: "과학", curriculumCuriId: id, expectedVersion: relation.expectedVersion, requestId: crypto.randomUUID(), decision,
      confirmed: true, reasonCode: "REVIEWED", note: "합성 기능 시험 · 실제 사람 평가 아님", changes: decision === "edit" ? {
        teachingUse: "합성 관찰 활동", rationale: "합성 원문 설명", connectedParts: "자전 설명", unconfirmedParts: "실제 영상 미확인", coreConcepts: ["자전"] } : {} }; };
    await check("관계 조회·결정·검색 재시도 인증/Origin 및 실제 확인 없는 승인 차단", async () => {
      for (const url of [endpoint, `${endpoint}/search`]) {
        assert.equal((await fetch(`${base}${url}`)).status, 401);
        assert.equal((await post(url, {}, { Origin: "https://invalid.example" })).status, 403);
        assert.equal((await fetch(`${base}${url}`, { method: "DELETE", headers })).status, 405);
      }
      assert.equal((await post(endpoint, { ...await request(standard), confirmed: false })).status, 400);
      assert.equal((await stored()).relationReviews, undefined);
    });
    const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", (error) => errors.push(error.message));
    const humanReady = () => page.locator(`.human-relation[data-standard="${standard}"]`).waitFor();
    const card = () => page.locator(`.human-relation[data-standard="${standard}"]`), form = () => card().locator("form");
    const open = async () => { await page.goto(`${base}/admin.html?q=관리회귀&sort=title&page=1&id=${ids[0]}&human=1&subject=과학`); await humanReady(); };
    const edit = async () => {
      await form().locator('[name="decision"]').selectOption("edit");
      for (const [name, value] of Object.entries({ rationale: "합성 기능 시험 원문 근거", connectedParts: "자전과 낮·밤 연결", unconfirmedParts: "실제 영상과 학생 성취 미확인", teachingUse: "합성 관찰 활동", coreConcepts: "자전", note: "합성 브라우저 기능 시험 · 실제 사람 판단 아님" })) await form().locator(`[name="${name}"]`).fill(value);
      await form().locator('[name="confirmed"]').check();
    };
    const saveReady = () => page.waitForFunction(() => document.querySelector("#human-review-workspace")?.textContent.includes("결정·자산 저장 완료"));
    await check("기존 검수 직접 주소→로그인→동일 원문/관계 작업공간·실명 오표시 없음", async () => {
      await page.goto(`${base}/review.html?resourceId=${ids[0]}&subject=과학&standardId=${standard}&returnTo=${encodeURIComponent('/admin.html?q=관리회귀&sort=title&page=1')}`);
      await page.locator("#admin-token").fill(token); await page.locator("#login-form button").click(); await humanReady();
      assert.equal(new URL(page.url()).pathname, "/admin.html"); assert.equal(new URL(page.url()).searchParams.get("q"), "관리회귀");
      assert.match(await card().innerText(), /검토할 저장 원문/); assert.match(await page.locator("#human-review-workspace").innerText(), /실명 인증 아님/);
      await page.evaluate(() => localStorage.setItem("curi.teacher.folders.v1", '{"sentinel":"unchanged"}'));
    });
    await check("입력 중 단축키 무동작·미저장 이탈 취소·선택 관계 저장 단축키", async () => {
      await edit(); await form().locator('[name="note"]').focus(); await page.keyboard.press("Alt+s"); assert.equal((await stored()).relationReviews, undefined);
      let canceled = false; page.once("dialog", async (dialog) => { canceled = true; await dialog.dismiss(); });
      await page.locator("#back-to-list").click(); assert.equal(canceled, true); assert.equal(new URL(page.url()).searchParams.get("id"), ids[0]);
      await form().focus(); await page.keyboard.press("Alt+s"); await saveReady();
      const data = await stored(); assert.equal(data.relationReviews.length, 1); assert.equal(data.verifiedAssets.length, 5); assert.equal(data.searchProjection.filter((item) => item.contentCuriId.startsWith("RESOURCE-")).length, 1);
    });
    await check("응답 유실·동일 요청 재확인·중복 클릭은 새 결정/자산 없음", async () => {
      await page.reload(); await humanReady(); await edit();
      const beforeCount = (await stored()).relationReviews.length; let lost = false;
      await page.route(`**${endpoint}`, async (route) => { if (route.request().method() !== "POST") return route.continue(); await route.fetch(); lost = true; await route.abort(); });
      await form().locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector(".human-form")?.textContent.includes("같은 요청으로 저장 결과 재확인")); assert.equal(lost, true);
      await page.unroute(`**${endpoint}`); page.once("dialog", (dialog) => dialog.accept()); await page.reload(); await humanReady();
      assert.match(await form().innerText(), /응답을 확인하지 못한 요청/);
      await form().locator('button[type="submit"]').evaluate((button) => { button.click(); button.click(); }); await saveReady();
      assert.equal((await stored()).relationReviews.length, beforeCount + 1); assert.equal((await stored()).verifiedAssets.length, 5);
    });
    await check("형제 관계 승인·한 관계 보류·제외·자동 재검사 후 재공개 차단", async () => {
      assert.equal((await post(endpoint, await request(sibling))).status, 200);
      const siblingAsset = (await stored()).verifiedAssets.find((asset) => asset.curriculumCuriId === sibling && asset.reviewKind === "RELATION_REVIEW");
      for (const decision of ["hold", "exclude"]) {
        await page.reload(); await humanReady(); await form().locator('[name="decision"]').selectOption(decision);
        await form().locator('[name="reasonCode"]').selectOption("INSUFFICIENT_EVIDENCE"); await form().locator('[name="note"]').fill("합성 예외 판단 시험"); await form().locator('[name="confirmed"]').check();
        await form().locator('button[type="submit"]').click(); await saveReady();
        const data = await stored(); assert.equal(data.relationReviews.at(-1).decision, decision);
        assert.ok(data.verifiedAssets.some((asset) => asset.verifiedAssetId === siblingAsset.verifiedAssetId));
        const automatic = await (await post("/api/admin/automatic-assets", { resourceId: ids[0], subject: "과학" })).json(); assert.equal(automatic.searchPreparation.ready, 0);
        const discovery = await api(`/api/curi/discover/resources?ids=${ids[0]}`); assert.equal(discovery.resources[0].automaticLinks.length, 0); assert.equal(discovery.resources[0].approvedLinks.length, 1);
      }
    });
    await check("검색 준비 실패는 결정/자산 성공과 분리·재시도에 새 승인 없음", async () => {
      await fs.writeFile(path.join(directory, "server/data/fail-embedding"), "test");
      await open(); await edit(); await form().locator('[name="rationale"]').fill("검색 실패 재현용 새로운 합성 설명");
      await form().locator('button[type="submit"]').click(); await saveReady();
      assert.match(await page.locator("#human-review-workspace").innerText(), /검색 준비 실패/);
      const count = (await stored()).relationReviews.length; await fs.rm(path.join(directory, "server/data/fail-embedding"));
      await card().getByRole("button", { name: "이 관계 검색 준비만 재시도" }).click();
      await page.waitForFunction(() => document.querySelector(".human-form")?.textContent.includes("검색 준비 완료")); assert.equal((await stored()).relationReviews.length, count);
      assert.equal((await stored()).searchProjection.filter((item) => item.contentCuriId.startsWith("RESOURCE-")).length, 2);
    });
    await check("동시 탭의 과거 결정·원문 변경 화면 거절과 주제/사람 필터 무효화", async () => {
      const stale = await request(standard), fresh = await request(standard); assert.equal((await post(endpoint, fresh)).status, 200);
      assert.equal((await post(endpoint, stale)).status, 409);
      const oldSource = await request(standard), db = new DatabaseSync(broadcastFile); db.prepare("UPDATE episodes SET synopsis=? WHERE id=?").run("지구와 하늘이라는 소재를 소개하는 변경된 공개 원문입니다.", ids[0]); db.close();
      assert.equal((await post(endpoint, oldSource)).status, 409);
      const discovery = await api(`/api/curi/discover/resources?ids=${ids[0]}`); assert.equal(discovery.resources[0].approvedLinks.length, 0);
      const changed = await api(`/api/admin/workspace?id=${ids[0]}`); assert.equal(changed.resource.human.changed, true);
    });
    await check("방송 원문 가져오기·보강 후에도 판본과 실제 제외 우선순위 보존", async () => {
      assert.equal((await post(endpoint, await request(standard, "exclude"))).status, 200);
      const current = await view(), record = { source_system: "EBS_BROADCAST", source_content_id: ids[0], source_url: current.source.sourceUrl,
        title: current.source.fields.title, synopsis: "지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.", content_level: "episode", subject_seed: "과학", grade_band_seed: "5~6학년군" };
      const imported = await post("/api/ingestion/apply", { record }); assert.equal(imported.status, 200);
      assert.equal((await stored()).contents.find((item) => item.sourceIdentity.sourceContentId === ids[0]).metadata.variant, "EPISODE");
      const automatic = await (await post("/api/admin/automatic-assets", { resourceId: ids[0], subject: "과학" })).json();
      assert.ok(automatic.relations.some((relation) => relation.evidence.inspection.publicationEligible)); assert.equal(automatic.searchPreparation.ready, 0);
      assert.ok(automatic.assets.some((asset) => asset.state === "BLOCKED" && asset.reason === "HUMAN_EXCLUDE"));
    });
    await check("현재 원문/이전 판단 비교·390px·다음 이동·원래 승인4/교사 폴더 보존", async () => {
      await open(); assert.match(await card().innerText(), /이전 판단의 근거 변경/);
      await page.screenshot({ path: "docs/r08-04-human-desktop.png", fullPage: true }); await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: "docs/r08-04-human-mobile.png", fullPage: true });
      assert.equal(await page.evaluate(() => localStorage.getItem("curi.teacher.folders.v1")), '{"sentinel":"unchanged"}');
      await page.locator("#detail-title").click(); await page.keyboard.press("Alt+n");
      await page.waitForURL((url) => url.searchParams.get("id") === ids[1]); assert.equal(new URL(page.url()).searchParams.get("q"), "관리회귀"); assert.equal(new URL(page.url()).searchParams.get("sort"), "title");
      const data = await stored(), original = JSON.parse(await fs.readFile(path.join(__dirname, "data/curi-store.json")));
      assert.deepEqual(data.mappingRuns, original.mappingRuns); assert.deepEqual(data.verifiedAssets.filter((asset) => asset.reviewKind !== "RELATION_REVIEW"), original.verifiedAssets);
      assert.deepEqual(await hashes(), before);
    });
    assert.deepEqual(errors, []);
    await fs.writeFile("docs/r08-04-http-browser-check.json", JSON.stringify({ date: new Date().toISOString(), cases, errors, protectedHashes: before,
      fixture: "임시 JSON/방송/자동 DB, 합성 사람 입력·고정 시험 임베딩. 실제 사람 평가/원본 변경/유료 호출 없음", paidApiCalls: 0 }, null, 2) + "\n");
    console.log(`R08-04 HTTP·브라우저 ${cases.length}개 통과`);
  } finally { await browser?.close(); await fixture.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
