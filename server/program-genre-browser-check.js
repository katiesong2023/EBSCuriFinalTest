const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createAdminBrowserFixture } = require('./admin-browser-fixture');
const { openBroadcastStore, saveBroadcastPage } = require('./broadcast-store');
const hashes = async () => Object.fromEntries(await Promise.all(['curi-store.json', 'broadcast-catalog.sqlite', 'semantic-layer.sqlite', 'automatic-assets.sqlite']
  .map(async name => [name, crypto.createHash('sha256').update(await fs.readFile(`server/data/${name}`)).digest('hex')])));
async function main() {
  const before = await hashes(), fixture = await createAdminBrowserFixture(), cases = [], errors = [];
  let browser;
  const check = async (name, run) => { await run(); cases.push({ name, passed: true }); console.log('통과:', name); };
  try {
    const db = openBroadcastStore(fixture.broadcastFile);
    saveBroadcastPage(db, { job: 'PROGRAM_GENRE_TEST', sourceUrl: 'https://www.ebs.co.kr/fixture', fetchedAt: new Date().toISOString() }, [
      { title: '장르회귀 지구 자전 다큐', program: 'EBS 다큐프라임', summary: '지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.', url: 'https://www.ebs.co.kr/fixture?courseId=930010&stepId=1&lectId=930011' },
      { title: '장르회귀 지구 자전 일반', program: '장르회귀 일반 방송', summary: '지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.', url: 'https://www.ebs.co.kr/fixture?courseId=930010&stepId=1&lectId=930012' },
      { title: '형태회귀 지구 자전 A', program: '형태회귀 방송', summary: '지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다. 전문가 인터뷰를 진행한다.', url: 'https://www.ebs.co.kr/fixture?courseId=930010&stepId=1&lectId=930013' },
      { title: '형태회귀 지구 자전 B', program: '형태회귀 방송', summary: '지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다. 실험을 통해 원리를 알아본다.', url: 'https://www.ebs.co.kr/fixture?courseId=930010&stepId=1&lectId=930014' }
    ]); db.close();
    const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => route.request().url().startsWith(fixture.base) ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', error => { errors.push(error.message); console.error('화면 오류:', error.message); });
    const ready = () => page.waitForFunction(() => document.querySelector('#result-cards')?.getAttribute('aria-busy') === 'false');
    const visit = async params => { await page.goto(`${fixture.base}/?${new URLSearchParams(params)}`); await ready(); assert.equal(await page.locator('#error-state').isVisible(), false); };
    const submit = async q => { await page.locator('#search-input').fill(q); await page.locator('#search-submit').click(); await ready(); };
    await check('주제+프로그램 약칭 조건·UI 해석·주소/새로고침 복원', async () => {
      await visit({ q: '장르회귀 지구 자전 다큐프라임' });
      assert.equal(await page.locator('#result-cards > article').count(), 1);
      assert.match(await page.locator('#result-cards').innerText(), /EBS 다큐프라임/);
      assert.match(await page.locator('#query-understanding').innerText(), /프로그램: EBS 다큐프라임/);
      await page.reload(); await ready();
      assert.equal(await page.locator('#search-input').inputValue(), '장르회귀 지구 자전 다큐프라임');
      assert.equal(await page.locator('#result-cards > article').count(), 1);
    });
    await check('일반 다큐 요청의 다른 형식 제외·명시 선호/한정/제외·UI 설명', async () => {
      await submit('장르회귀 지구 자전 다큐멘터리');
      assert.equal(await page.locator('#result-cards > article').count(), 1);
      assert.match(await page.locator('#query-understanding').innerText(), /형식 조건: 다큐멘터리/);
      await submit('장르회귀 지구 자전 다큐 같은');
      assert.equal(await page.locator('#result-cards > article').count(), 2);
      assert.match(await page.locator('#result-cards > article').first().innerText(), /EBS 다큐프라임/);
      assert.match(await page.locator('#query-understanding').innerText(), /형식 선호: 다큐멘터리/);
      await submit('장르회귀 지구 자전 다큐만');
      assert.equal(await page.locator('#result-cards > article').count(), 1);
      assert.match(await page.locator('#query-understanding').innerText(), /형식 조건: 다큐멘터리/);
      assert.match(await page.locator('#query-limitations').innerText(), /공식 프로그램 분류.*실제 영상 형식/);
      await submit('장르회귀 지구 자전 다큐프라임 말고');
      assert.equal(await page.locator('#result-cards > article').count(), 1);
      assert.match(await page.locator('#result-cards').innerText(), /장르회귀 일반 방송/);
      assert.match(await page.locator('#query-understanding').innerText(), /프로그램 제외: EBS 다큐프라임/);
    });
    await check('선택 기준·장르 한정·상세 프로그램 조건 교집합·390px 표시', async () => {
      await visit({ q: '장르회귀 지구 자전 다큐멘터리', standard: '6과12-02' });
      assert.equal(await page.locator('#result-cards > article').count(), 1);
      const card = page.locator('#result-cards > article');
      await card.locator('.curriculum-details > summary').click();
      assert.match(await card.innerText(), /현재 원문 자동 비교/);
      await page.locator('#additional-filters > summary').click();
      await page.locator('#program-filter').selectOption('장르회귀 일반 방송'); await ready();
      assert.equal(await page.locator('#empty-state').isVisible(), true);
      assert.equal(new URL(page.url()).searchParams.get('standard'), '6과12-02');
      await page.locator('[data-clear-filter="program"]').click(); await ready();
      assert.equal(await page.locator('#result-cards > article').count(), 1);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#search-form').screenshot({ path: 'docs/r07-12-query-mobile.png' });
      await page.locator('#query-understanding').screenshot({ path: 'docs/r07-12-interpretation-mobile.png' });
    });
    await check('형태 선택 UI 없이 인터뷰/실험 요청·OR·기준 조건 반영', async () => {
      await visit({ q: '형태회귀 지구 자전 인터뷰', standard: '6과12-02' });
      assert.equal(await page.locator('#result-cards > article').count(), 1);
      assert.match(await page.locator('#result-cards').innerText(), /형태회귀 지구 자전 A/);
      assert.match(await page.locator('#query-understanding').innerText(), /형식 조건: 대담·인터뷰/);
      await submit('형태회귀 지구 자전 인터뷰 또는 실험');
      assert.equal(await page.locator('#result-cards > article').count(), 2);
      assert.match(await page.locator('#query-understanding').innerText(), /대담·인터뷰 또는 실험·시연/);
      assert.equal(new URL(page.url()).searchParams.get('standard'), '6과12-02');
      assert.equal(await page.locator('#kind-filters [data-kind]').count(), 5);
      assert.equal(await page.locator('#search-examples [data-query]').count(), 18);
      assert.equal(await page.locator('#genre-filter, #form-filter, .broadcast-form-badge').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    });
    assert.deepEqual(errors, []); assert.deepEqual(await hashes(), before);
    await fs.writeFile('docs/r07-12-program-genre-browser-check.json', JSON.stringify({ date: new Date().toISOString(), cases, errors, protectedHashes: before, paidApiCalls: 0,
      scope: '격리 브라우저·임시 저장소의 합성 장르 자료. 실제 영상 형식 판정 아님.' }, null, 2) + '\n');
  } finally { await browser?.close(); await fixture.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
