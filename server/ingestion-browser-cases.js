const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

async function ingestionBrowserCases({ page, base, check }) {
  const preview = (title = "미리보기 결과") => ({ canApply: true, summary: { received: 1, new: 1, changed: 0, reactivated: 0, same: 0, inactive: 0, errors: 0 }, changes: [{ outcome: "new", title, reason: "합성 입력" }], errors: [] });
  let applied = [], previews = [], pending = [], delayed = false, failApply = false, holdApply = false, releaseApply;
  // 네트워크 경쟁 상태를 재현하되 실제 가져오기 API 쓰기는 하지 않는다.
  await page.route("**/api/ingestion/preview", async (route) => {
    const input = route.request().postDataJSON(); previews.push(input);
    const send = () => route.fulfill({ json: preview(input.record?.title || input.csvText) }).catch(() => {});
    if (delayed) pending.push(send); else await send();
  });
  await page.route("**/api/ingestion/apply", async (route) => {
    applied.push(route.request().postDataJSON());
    if (holdApply) await new Promise((resolve) => { releaseApply = resolve; });
    await route.fulfill({ status: failApply ? 500 : 200, json: failApply ? { error: "합성 저장 실패" } : { preview: preview(), run: { runId: "TEST-INGEST", status: "COMPLETED" } } });
  });
  const single = async () => {
    await page.goto(`${base}/ingestion.html`); await page.locator('[value="single"]').check();
    for (const [id, value] of Object.entries({ "source-system": "EBS_TEST", "source-content-id": "TEST", "source-url": "https://www.ebs.co.kr/test", title: "수정 전", synopsis: "공개 출처 소개문을 확인하는 합성 입력입니다." })) await page.locator(`#${id}`).fill(value);
  };
  const show = async () => { await page.locator("#preview-button").click(); await page.waitForFunction(() => !document.querySelector("#apply-button").disabled); };
  const disabled = async () => assert.equal(await page.locator("#apply-button").isDisabled(), true);
  const waitCount = async (read, n) => { for (let i = 0; i < 200 && read() < n; i++) await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(read(), n); };
  await check("수정 전 코드 실행 재현: 미리보기 후 수정해도 과거 제목 전송", async () => {
    const old = execFileSync("git", ["show", "HEAD:public/ingestion.js"], { encoding: "utf8" });
    await page.route("**/ingestion.js", (route) => route.fulfill({ contentType: "text/javascript", body: old }));
    await single(); await show(); await page.locator("#title").fill("수정 후"); await page.locator("#apply-button").click();
    await waitCount(() => applied.length, 1); assert.equal(applied[0].record.title, "수정 전");
    await page.unroute("**/ingestion.js"); applied = [];
  });
  await check("단일 입력 모든 필드·CSV 텍스트·파일·스냅샷·입력 방법 변경 무효화", async () => {
    await single();
    for (const id of ["source-system", "source-content-id", "source-url", "title", "synopsis", "program-name", "episode-no", "content-level", "grade-band-seed", "subject-seed", "curriculum-unit-seed", "source-original-modified-at"]) {
      await show(); await page.locator(`#${id}`).fill(id === "source-original-modified-at" ? "2026-10-05T12:00" : `변경 ${id}`); await disabled();
    }
    await show(); await page.locator('[value="csv"]').check(); await disabled();
    await page.locator("#csv-text").fill("source_system,title\nEBS_TEST,CSV 이전"); await show();
    await page.locator("#csv-text").fill("source_system,title\nEBS_TEST,CSV 최신"); await disabled();
    await show(); await page.locator("#source-snapshot").check(); await disabled();
    await show(); await page.locator("#csv-file").setInputFiles({ name: "input.csv", mimeType: "text/csv", buffer: Buffer.from("source_system,title\nEBS_TEST,파일 입력") }); await disabled();
    await show(); await page.locator("#csv-file").setInputFiles([]); await disabled(); assert.equal(applied.length, 0);
  });
  await check("미리보기 요청 중 수정·응답 순서 역전에도 최신 결과만 저장 가능", async () => {
    await single(); delayed = true; pending = [];
    // AbortController가 네트워크를 중단하지 못해도 버전 검사로 이전 응답을 버린다.
    await page.evaluate(() => { window.AbortController = class { abort() {} }; });
    await page.locator("#preview-button").click(); await waitCount(() => pending.length, 1);
    await page.locator("#title").fill("최신 요청"); await disabled();
    await page.locator("#preview-button").click(); await waitCount(() => pending.length, 2);
    await pending[1](); await page.waitForFunction(() => !document.querySelector("#apply-button").disabled);
    await pending[0](); await page.waitForFunction(() => !document.querySelector("#preview-button").disabled);
    assert.match(await page.locator("#changes").innerText(), /최신 요청/);
    await page.locator("#apply-button").click(); await waitCount(() => applied.length, 1); assert.equal(applied[0].record.title, "최신 요청");
    delayed = false;
  });
  await check("CSV 파일 읽기 중 스냅샷 변경 시 요청·저장 무효화", async () => {
    await page.goto(`${base}/ingestion.html`); await page.locator("#csv-file").setInputFiles({ name: "slow.csv", mimeType: "text/csv", buffer: Buffer.from("slow") });
    await page.evaluate(() => { File.prototype.text = () => new Promise((resolve) => { window.finishFile = () => resolve("source_system,title\nEBS_TEST,늦은 파일"); }); });
    const count = previews.length; await page.locator("#preview-button").click(); await page.waitForFunction(() => typeof window.finishFile === "function");
    await page.locator("#source-snapshot").check(); await page.evaluate(() => window.finishFile()); await disabled(); assert.equal(previews.length, count);
  });
  await check("이벤트 없는 값 변경도 저장 직전 비교로 차단·현재 입력 보존", async () => {
    await single(); await show(); const count = applied.length;
    await page.evaluate(() => { document.querySelector("#title").value = "이벤트 없이 수정"; }); await page.locator("#apply-button").click();
    await page.waitForFunction(() => document.querySelector("#request-status").textContent.includes("현재 입력과"));
    assert.equal(applied.length, count); assert.equal(await page.locator("#title").inputValue(), "이벤트 없이 수정"); await disabled();
  });
  await check("연속 저장 1회만 전송·저장 중 입력 잠금·실패 후 입력 보존", async () => {
    await single(); await show(); holdApply = true; failApply = true; const count = applied.length;
    await page.evaluate(() => { document.querySelector("#apply-button").click(); document.querySelector("#apply-button").click(); });
    await waitCount(() => applied.length, count + 1); assert.equal(await page.locator("#title").isDisabled(), true);
    releaseApply(); await page.waitForFunction(() => document.querySelector("#request-status").textContent.includes("합성 저장 실패"));
    assert.equal(await page.locator("#title").inputValue(), "수정 전"); assert.equal(await page.locator("#title").isDisabled(), false); await disabled();
    holdApply = false; failApply = false; await show(); await page.locator("#apply-button").click(); await waitCount(() => applied.length, count + 2);
    await page.waitForFunction(() => document.querySelector("#request-status").textContent.includes("저장했습니다")); await disabled();
  });
  await page.unroute("**/api/ingestion/preview"); await page.unroute("**/api/ingestion/apply");
}
module.exports = { ingestionBrowserCases };
