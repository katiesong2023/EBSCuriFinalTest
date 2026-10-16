const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createAdminBrowserFixture } = require('./admin-browser-fixture');
const { openBroadcastStore } = require('./broadcast-store');
const { attachOfficialSupplement, identityFor } = require('./source-supplements');
async function main() {
  const fixture = await createAdminBrowserFixture(), cases = [], errors = []; let browser;
  try {
    const db = openBroadcastStore(fixture.broadcastFile);
    const row = db.prepare('SELECT * FROM episodes WHERE id=?').get(fixture.ids[1]);
    const text = '소금물의 물을 증발시켜 소금을 얻는다.';
    attachOfficialSupplement(db, row.id, { type: 'PRESS_RELEASE', title: '합성 공식 설명', publishedAt: '2026-01-01',
      sourceUrl: 'https://about.ebs.co.kr/fixture', identity: identityFor(row), location: '합성 1부 문단',
      identityEvidence: [row.title, row.program, '1부'], sourceText: `${row.title} ${row.program} 1부. ${text}`,
      text, responseHash: 'fixture-only' }, { expectedHash: row.content_hash }); db.close();
    const response = await fetch(`${fixture.base}/api/curi/curriculum?standard=${encodeURIComponent('6과05-02')}`);
    const data = await response.json();
    let pageNumber = 1, item = data.results.find(item => item.id === row.id);
    while (!item && pageNumber < data.pages) {
      pageNumber++;
      const pageData = await (await fetch(`${fixture.base}/api/curi/curriculum?standard=${encodeURIComponent('6과05-02')}&page=${pageNumber}`)).json();
      item = pageData.results.find(item => item.id === row.id);
    }
    assert.ok(item); assert.equal(item.curriculumComparison.ruleSupport.supported, false);
    const quote = item.curriculumComparison.discoveryEvidence.find(quote => quote.field === 'supplement');
    assert.equal(quote.quote, text); assert.equal(item.automaticLinks.length, 0);
    cases.push('보조 발췌로 실제 API 후보 발견·정확 인용·미지원 보존');
    const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => route.request().url().startsWith(fixture.base) ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${fixture.base}/curriculum.html?standard=${encodeURIComponent('6과05-02')}&page=${pageNumber}`);
    const card = page.locator(`[data-resource="${row.id}"]`); await card.waitFor({ timeout: 60000 });
    await card.locator('details').evaluateAll(elements => elements.forEach(element => { element.open = true; }));
    assert.match(await card.innerText(), /자동 비교 미지원/);
    assert.match(await card.innerText(), /EBS 공식 보도자료/);
    assert.ok((await card.innerText()).includes(text));
    cases.push('카드에 보도자료 유형·인용·미지원 경계 표시');
    await page.screenshot({ path: 'docs/r08-09-source-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: 'docs/r08-09-source-mobile.png', fullPage: true });
    cases.push('데스크톱·모바일 표시·가로 넘침 없음'); assert.deepEqual(errors, []);
    await fs.writeFile('docs/r08-09-source-browser-check.json', JSON.stringify({ checkedAt: new Date().toISOString(), cases, errors,
      scope: '격리 합성 회차·보도자료 기능 검사. 실제 교육적 적합성 평가는 수행하지 않음.', paidApiCalls: 0 }, null, 2) + '\n');
    console.log(`보조 원문 화면 ${cases.length}개 통과`);
  } finally { await browser?.close(); await fixture.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
