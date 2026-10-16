const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const vm = require('node:vm');
const { createAdminBrowserFixture } = require('./admin-browser-fixture');

async function main() {
  const cases = [], errors = [], values = new Map();
  const context = { window: {}, URL, URLSearchParams, AbortSignal, setTimeout,
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  context.globalThis = context; vm.createContext(context);
  for (const name of ['grade-context.js', 'teacher-storage.js']) vm.runInContext(await fs.readFile(`public/${name}`, 'utf8'), context);
  context.CuriTeacher = context.window.CuriTeacher; context.window.GradeContext = context.GradeContext;
  vm.runInContext(await fs.readFile('public/teacher-guidance.js', 'utf8'), context);
  vm.runInContext(await fs.readFile('public/teacher-evidence.js', 'utf8'), context);
  const teacher = context.CuriTeacher;
  const selected = { standardId: '6사04-01', subject: '사회', courses: ['elementary56'], grade: '초등 5~6학년군' };
  const link = { standardId: '6사08-01', subject: '사회', courseId: 'elementary56', standard: '다른 기준', connectedParts: ['다른 부분'], unconfirmedParts: ['남은 내용'] };
  const item = { id: 'SCOPE_FIXTURE', title: '서로 다른 기준 확인', sourceUrl: 'https://www.ebs.co.kr/fixture', teachingContext: selected,
    curriculumStatus: 'APPROVED', approvedLinks: [link], automaticLinks: [link], evidenceRefresh: 'CURRENT',
    curriculumComparison: { standardId: selected.standardId, semanticState: 'CONCEPT_ONLY', label: '관련 개념만 확인' } };
  assert.equal(teacher.confirmation(item), '선택 기준 6사04-01: 관련 개념만 확인');
  assert.match(teacher.evidenceMarkup(item), /다른 기준의 확인 기록 2건/);
  const scoped = teacher.withTeachingContext(item, selected);
  assert.equal(scoped.approvedLinks.length, 0); assert.equal(scoped.automaticLinks.length, 0);
  assert.equal(scoped.otherStandardLinks.approvedLinks.length, 1);
  assert.equal(teacher.withTeachingContext(scoped, { ...selected, standardId: link.standardId }).approvedLinks.length, 1);
  cases.push('선택 기준·교과·과정 정확 일치와 다른 기준 펼침·문맥 전환');
  for (const state of ['PENDING', 'FAILED', 'UNAVAILABLE']) {
    const stale = teacher.unconfirmedResource(item, state);
    assert.equal(stale.curriculumComparison, null);
    assert.equal(stale.otherStandardLinks.approvedLinks.length, 0);
    assert.doesNotMatch(teacher.evidenceMarkup(stale), /다른 기준의 확인 기록|다른 부분/);
    assert.doesNotMatch(teacher.evidenceMarkdown(stale, String).join('\n'), /자동 부분 연계 후보|사람 검수 관계/);
  }
  cases.push('재확인·실패·자료 소실에서 과거 비교·다른 기준 숨김');
  context.fetch = async () => ({ ok: true, json: async () => ({ resources: [{ ...item, teachingContext: null, curriculumComparison: undefined, approvedLinks: [], automaticLinks: [], curriculumStatus: 'NOT_ASSESSED' }] }) });
  const [refreshed] = await teacher.refreshResources([item]);
  assert.equal(refreshed.curriculumComparison, null); assert.equal(refreshed.teachingContext.standardId, selected.standardId);
  assert.match(teacher.confirmation(refreshed), /연계 미확인$/);
  assert.doesNotMatch(teacher.evidenceMarkdown(refreshed, String).join('\n'), /다른 기준의 확인 기록/);
  const escaped = teacher.quoteMarkup({ quote: '<script>bad()</script>', sourceUrl: 'javascript:alert(1)', contentHash: 'a'.repeat(64), start: 0, end: 22 });
  assert.doesNotMatch(escaped, /<script>|javascript:/); assert.match(escaped, /&lt;script&gt;/);
  cases.push('현재 재조회가 과거 비교를 재사용하지 않음·인용 HTML/링크 안전 처리');

  const fixture = await createAdminBrowserFixture(); let browser;
  try {
    const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE });
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await browserContext.newPage(); page.on('pageerror', (error) => errors.push(error.message));
    await browserContext.route('**/*', (route) => route.request().url().startsWith(fixture.base) ? route.continue() : route.abort());
    const ready = () => page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('후보 발견과'), {}, { timeout: 60000 });
    await page.goto(`${fixture.base}/curriculum.html?standard=${encodeURIComponent('6과12-02')}`); await ready();
    const card = page.locator(`[data-resource="${fixture.ids[0]}"]`);
    assert.match(await card.locator('.curriculum-details > summary').innerText(), /^선택 기준 6과12-02:/);
    assert.ok(await card.locator('.requirement-comparison').count());
    assert.match(await card.locator('.comparison-dimensions').innerText(), /자동 비교 범위.*원문 충실도/s);
    assert.match(await card.locator('.requirement-comparison').first().innerText(), /콘텐츠가 제공하는 내용.*정확한 인용.*남은 요구/s);
    await card.locator('[data-save]').click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('curi.discovery.shelf.v1'))[0]);
    assert.equal(stored.teachingContext.standardId, '6과12-02');
    cases.push('교육과정 실제 API·선택 기준 첫 확인 줄·요구별 직접 인용·내 자료 저장');
    await page.locator('#state').selectOption('PARTIAL_SUPPORTED'); await ready();
    await page.reload(); await ready(); assert.equal(await page.locator('#state').inputValue(), 'PARTIAL_SUPPORTED');
    await page.locator('#standard').selectOption('6과12-01'); await page.locator('#curriculum-form button').click(); await ready();
    await page.locator('#state').selectOption('UNSUPPORTED'); await ready();
    assert.equal(await page.locator('#state').inputValue(), 'UNSUPPORTED');
    const summaries = await page.locator('.curriculum-details > summary').allTextContents();
    assert.ok(summaries.every((value) => value.startsWith('선택 기준 6과12-01:')));
    await page.goBack(); await ready();
    cases.push('기준 전환·미지원 필터·뒤로가기·새로고침 문맥 보존');
    await page.goto(`${fixture.base}/curriculum.html?standard=${encodeURIComponent('6과12-02')}&state=PARTIAL_SUPPORTED`); await ready();
    await page.screenshot({ path: 'docs/r08-07-evidence-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'docs/r08-07-evidence-mobile.png', fullPage: true });
    cases.push('데스크톱·390px 모바일 요구 비교 표시');
    let failed = false;
    await page.route('**/api/curi/curriculum?**', async (route) => {
      if (!failed) { failed = true; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '격리 조회 실패' }) }); }
      else await route.continue();
    });
    await page.locator('#standard').selectOption('6과12-01'); await page.locator('#curriculum-form button').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('격리 조회 실패'));
    assert.equal(await page.locator('.curriculum-candidate').count(), 0);
    await page.locator('#retry').click(); await ready();
    assert.ok((await page.locator('.curriculum-details > summary').allTextContents()).every((value) => value.startsWith('선택 기준 6과12-01:')));
    cases.push('선택 기준 조회 실패 시 이전 카드 제거·재시도 현재 기준 일치');
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await fixture.close(); }
  await fs.writeFile('docs/r08-07-browser-check.json', JSON.stringify({ checkedAt: new Date().toISOString(), cases, errors, scope: '격리 합성 API·브라우저 및 저장 모듈 기능 검사. 실제 사람 의미 평가는 수행하지 않음.', paidApiCalls: 0 }, null, 2) + '\n');
  console.log(`선택 기준 화면·저장 ${cases.length}개 통과`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
