const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createAdminBrowserFixture } = require('./admin-browser-fixture');

const hashes = async () => Object.fromEntries(await Promise.all(['curi-store.json', 'broadcast-catalog.sqlite', 'semantic-layer.sqlite', 'automatic-assets.sqlite']
  .map(async name => [name, crypto.createHash('sha256').update(await fs.readFile(`server/data/${name}`)).digest('hex')])));
async function main() {
  const before = await hashes(), fixture = await createAdminBrowserFixture(), cases = [], errors = [];
  let browser;
  const check = async (name, run) => { await run(); cases.push({ name, passed: true }); console.log('통과:', name); };
  try {
    const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => route.request().url().startsWith(fixture.base) ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.querySelector('#result-cards')?.getAttribute('aria-busy') === 'false');
    const visit = async params => { await page.goto(`${fixture.base}/?${new URLSearchParams(params)}`); await ready(); assert.equal(await page.locator('#error-state').isVisible(), false); };
    await check('214개 기준 유지·중1 학년군/참고 안내·공식 편성 근거', async () => {
      await visit({ standard: '9과05-02' });
      const panel = page.locator('#selected-standard');
      assert.match(await panel.innerText(), /공식 학년군: 1~3학년군/);
      assert.match(await panel.innerText(), /수업 진도에 맞는 성취기준을 선택/);
      assert.equal(await panel.locator('.official-placement').count(), 1);
      await panel.locator('.official-placement > summary').click();
      assert.equal(await panel.locator('.official-placement blockquote').count(), 3);
      assert.match(await panel.locator('.official-placement').innerText(), /내용 배열은 반드시 따라야 할 학습 순서/);
      assert.match(await panel.locator('.official-placement').innerText(), /추출 문단/);
      const data = await fetch(`${fixture.base}/api/curi/curriculum`).then(response => response.json());
      assert.equal(data.standards.length, 214);
    });
    await check('중1 해설/단원 고려 사항·미지원 유지·모바일 원문 읽기', async () => {
      const panel = page.locator('#selected-standard');
      await panel.locator('.official-guidance > summary').click();
      assert.match(await panel.locator('.official-guidance').innerText(), /질량과 무게를 구별/);
      assert.match(await panel.locator('.official-guidance').innerText(), /힘과 우리 생활/);
      assert.match(await panel.innerText(), /자동 비교 미지원/);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await panel.screenshot({ path: 'docs/r07-10-middle-guidance-mobile.png' });
      await page.setViewportSize({ width: 1440, height: 1000 });
    });
    await check('초등 PDF 해설·요구별 영상 인용과 분리·내보내기와 저장 문맥 보존', async () => {
      await visit({ standard: '6과12-02', q: '지구 자전' });
      const panel = page.locator('#selected-standard');
      await panel.locator('.official-guidance > summary').click();
      assert.match(await panel.locator('.official-guidance').innerText(), /자전축이 기울어진 채 하루에 한 바퀴/);
      assert.match(await panel.locator('.official-guidance').innerText(), /PDF 41쪽/);
      const card = page.locator(`#result-cards > article[data-id="${fixture.ids[0]}"]`);
      await card.locator('.curriculum-details > summary').click();
      await card.locator('.official-guidance > summary').click();
      assert.match(await card.locator('.official-guidance').innerText(), /영상의 내용 인용·자동 비교 결과·사람 승인/);
      const data = await fetch(`${fixture.base}/api/curi/discover?workspace=teacher&standard=6과12-02&q=${encodeURIComponent('지구 자전')}`).then(response => response.json());
      const item = data.results.find(row => row.id === fixture.ids[0]);
      assert.equal(item.curriculumComparison.state, 'PARTIAL_SUPPORTED');
      for (const requirement of item.curriculumComparison.requirementComparisons) {
        for (const quote of requirement.quotes) assert.equal(item.summary.slice(quote.start, quote.end), quote.quote);
      }
      const md = await page.evaluate(item => CuriTeacher.evidenceMarkdown(item, String).join('\n'), item);
      assert.match(md, /공식 교육과정 설명 \(영상 인용·자동 비교·승인과 별도\)/);
      assert.match(md, /공개 소개문 인용/); assert.match(md, /남은 요구/);
      await card.locator('[data-save]').click(); await page.locator('#open-shelf').click();
      const refreshed = await page.evaluate(async () => {
        const [item] = await CuriTeacher.refreshResources(CuriTeacher.readShelf());
        return { comparison: item.curriculumComparison, standard: item.selectionContexts[0].standardId,
          markdown: CuriTeacher.evidenceMarkdown(item, String).join('\n') };
      });
      assert.equal(refreshed.standard, '6과12-02'); assert.equal(refreshed.comparison, null);
      assert.doesNotMatch(refreshed.markdown, /공개 소개문 인용/);
      await page.locator('#close-shelf').click();
    });
    await check('별도 해설이 없는 기준과 기준 변경 후 이전 해설 제거', async () => {
      await visit({ standard: '9과02-03' });
      await page.locator('#selected-standard .official-guidance > summary').click();
      assert.match(await page.locator('#selected-standard .official-guidance').innerText(), /별도로 제시된 해설이 없습니다/);
      assert.doesNotMatch(await page.locator('#selected-standard').innerText(), /자전축이 기울어진/);
      await visit({ q: '생태계' });
      assert.equal(await page.locator('#selected-standard .official-guidance').count(), 0);
    });
    await check('간소화 화면·18개 예시 접기·상세 필터 복원·검색어 지우기·조건 보존', async () => {
      await visit({ q: '', standard: '' });
      assert.equal(await page.locator('#search-examples').getAttribute('open'), '');
      assert.equal(await page.locator('#search-examples [data-query]').count(), 18);
      assert.equal(await page.locator('.classroom-examples').count(), 0);
      assert.equal(await page.locator('#additional-filters').evaluate(node => node.open), false);
      assert.equal(await page.locator('#curriculum-picker').evaluate(node => node.open), false);
      assert.equal(await page.locator('#clear-standard').isVisible(), false);
      assert.equal(await page.locator('#clear-query').isVisible(), false);
      assert.equal(await page.locator('main a[href="/admin-curriculum.html"]').count(), 0);
      assert.equal(await page.locator('footer a[href="/admin-curriculum.html"]').count(), 1);
      for (const button of await page.locator('#search-examples [data-query]').all()) {
        assert.equal(await button.textContent(), await button.getAttribute('data-query'));
      }
      await page.locator('[data-query="생태계"]').focus(); await page.keyboard.press('Enter'); await ready();
      assert.equal(await page.locator('#search-input').inputValue(), '생태계');
      assert.equal(await page.locator('#search-examples').evaluate(node => node.open), false);
      assert.equal(await page.locator('#search-input').evaluate(node => node === document.activeElement), true);
      await page.locator('#search-examples > summary').click();
      await page.locator('#sort-filter').selectOption('newest'); await ready();
      assert.equal(await page.locator('#search-examples').evaluate(node => node.open), true);
      await visit({ standard: '6과12-02', q: '지구 자전', sort: 'newest', description: 'present' });
      assert.equal(await page.locator('#search-examples').evaluate(node => node.open), false);
      assert.equal(await page.locator('#additional-filters').evaluate(node => node.open), true);
      assert.equal(await page.locator('#description-filter').inputValue(), 'present');
      await page.locator('#search-examples > summary').click();
      await page.locator('[data-query="소리"]').click(); await ready();
      let params = new URL(page.url()).searchParams;
      assert.equal(params.get('standard'), '6과12-02'); assert.equal(params.get('sort'), 'newest'); assert.equal(params.get('description'), 'present');
      assert.equal(await page.locator('#search-examples').evaluate(node => node.open), false);
      await page.locator('#clear-query').click(); await ready();
      assert.equal(await page.locator('#search-input').inputValue(), '');
      params = new URL(page.url()).searchParams;
      assert.equal(params.get('standard'), '6과12-02'); assert.equal(params.get('sort'), 'newest'); assert.equal(params.get('description'), 'present');
      await page.reload(); await ready();
      assert.equal(await page.locator('#additional-filters').evaluate(node => node.open), true);
      await page.locator('#date-from').fill('2025-12-31'); await page.locator('#date-to').fill('2024-01-01');
      await page.locator('#period-form button').click(); assert.equal(await page.locator('#period-error').isVisible(), true);
      await page.locator('#clear-filters').click(); await ready();
      assert.equal(new URL(page.url()).searchParams.get('standard'), '6과12-02');
      assert.equal(new URL(page.url()).searchParams.get('description'), 'all');
      await page.locator('#clear-standard').click(); await ready();
      assert.equal(await page.locator('#search-examples').evaluate(node => node.open), true);
      await page.locator('#additional-filters > summary').click();
      if (await page.locator('#curriculum-picker').evaluate(node => node.open)) await page.locator('#curriculum-picker > summary').click();
      await page.screenshot({ path: 'docs/r07-10-search-examples-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('.search-panel').screenshot({ path: 'docs/r07-10-search-examples-mobile.png' });
      await page.locator('#search-examples > summary').click();
      await page.locator('#search-input').fill('지구 자전'); await page.locator('#search-submit').click(); await ready();
      assert.equal(await page.locator('#search-examples').evaluate(node => node.open), false);
      assert.equal(await page.locator('#additional-filters').evaluate(node => node.open), false);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: 'docs/r07-10-results-mobile.png', fullPage: true });
      await page.locator('#additional-filters > summary').click();
      assert.equal(await page.locator('#program-search').isVisible(), true);
      assert.equal(await page.locator('#date-from').isVisible(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('.result-filters').screenshot({ path: 'docs/r07-10-filters-mobile.png' });
    });
    assert.deepEqual(errors, []); assert.deepEqual(await hashes(), before);
    await fs.writeFile('docs/r07-10-guidance-browser-check.json', JSON.stringify({ date: new Date().toISOString(), cases, errors, protectedHashes: before,
      paidApiCalls: 0, scope: '임시 복제 서버·격리 브라우저. 실제 학교 진도·교사 효용·영상 적합성 판단 아님.' }, null, 2) + '\n');
  } finally { await browser?.close(); await fixture.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
