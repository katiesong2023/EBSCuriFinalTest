// 새 표현의 교사 흐름을 임시 서버·새 브라우저 저장 공간에서 확인한다.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const fixture = JSON.parse(await fs.readFile('server/data/quality-workspace-queries.json'));
const files = ['curi-store.json', 'broadcast-catalog.sqlite', 'semantic-layer.sqlite'];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async name =>
  [name, crypto.createHash('sha256').update(await fs.readFile(`server/data/${name}`)).digest('hex')])));
const before = await hashes();
const port = process.env.CURI_R09_TEST_PORT || '3339', base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: port, NODE_ENV: 'test',
  CURI_ALLOW_PAID_API: 'false', CURI_ADMIN_TOKEN: crypto.randomBytes(32).toString('hex'), CURI_ADMIN_ORIGIN: base }, stdio: ['ignore', 'pipe', 'pipe'] });
const report = { generatedAt: new Date().toISOString(), cases: [], queries: [], pageErrors: [], externalRequests: [],
  writesToServer: [], protectedBefore: before, humanEvaluations: 0, playbackChecks: 0, paidApiCalls: 0 };
let browser, serverError = '';
child.stderr.on('data', chunk => { serverError += chunk; });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('서버 시작 시간 초과')), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${serverError}`)); });
    child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
  const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE || undefined });
  report.browser = await browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // 외부 링크는 누르지 않는다. 의도치 않은 외부 요청도 실제 전송 전에 차단한다.
  await context.route('**/*', route => {
    const request = route.request();
    if (!request.url().startsWith(`${base}/`)) { report.externalRequests.push(request.url()); return route.abort(); }
    if (request.method() !== 'GET') report.writesToServer.push({ url: request.url(), method: request.method() });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  const ready = () => page.waitForFunction(() => document.querySelector('#result-cards')?.getAttribute('aria-busy') === 'false');
  const check = async (name, run) => { await run(); report.cases.push({ name, passed: true }); console.log('통과:', name); };
  for (const query of fixture.queries) {
    await check(`${query.id} 새 표현의 확정 응답·빈 결과·단일 목록 표시`, async () => {
      const start = performance.now();
      const responsePromise = page.waitForResponse(response => response.url().includes('/api/curi/discover?'));
      await page.goto(`${base}/?q=${encodeURIComponent(query.query)}`);
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      const data = await response.json();
      await ready();
      const elapsedMs = +(performance.now() - start).toFixed(2);
      assert.equal(await page.locator('#error-state').isVisible(), false);
      assert.equal(await page.locator('#empty-state').isVisible(), data.total === 0);
      assert.equal(await page.locator('#result-cards > .resource-card').count(), data.results.length);
      report.queries.push({ id: query.id, total: data.total, results: data.results.map(item => item.id), elapsedMs });
    });
  }
  for (const query of fixture.queries.filter(row => ['S01', 'N02'].includes(row.id))) {
    await check(`${query.id} 주제 선택→결과 비교→폴더 저장·새 탭 재열기`, async () => {
      await page.goto(`${base}/?q=${encodeURIComponent(query.query)}`); await ready();
      const concept = query.id === 'S01' ? 'citizen' : 'bee';
      const responsePromise = page.waitForResponse(response => response.url().includes(`/api/curi/discover?`) && response.url().includes(`concept=${concept}`));
      await page.locator('#concept-filter').selectOption(concept);
      const data = await (await responsePromise).json(); await ready();
      assert.ok(data.total > 0); assert.ok(data.results.length >= 2);
      const items = data.results.slice(0, 2);
      for (const item of items) await page.locator(`#result-cards [data-save="${item.id}"]`).click();
      await page.screenshot({ path: `docs/r09-${query.id}-discovery.png`, fullPage: true });
      await page.locator('header a[href="/lesson.html"]').click();
      const title = `${query.subject} R09 새 표현 확인`;
      await page.locator('#new-folder-title').fill(title); await page.locator('#create-folder button').click();
      await page.locator('#add-videos').click();
      for (const item of items) await page.locator(`[data-add="${item.id}"]`).click();
      await page.locator('#close-add').click();
      assert.equal(await page.locator('.folder-video').count(), 2);
      await page.locator('.folder-note > summary').click(); await page.locator('#lesson-note').fill(query.requestedRelation);
      await page.locator('.video-note > summary').first().click(); await page.locator('[data-note]').first().fill('원문과 실제 장면은 수업 전에 확인');
      await page.locator('#save-folders').click();
      const other = await context.newPage();
      await other.goto(`${base}/lesson.html`);
      assert.equal(await other.locator('#lesson-title').inputValue(), title);
      assert.equal(await other.locator('#lesson-note').inputValue(), query.requestedRelation);
      assert.equal(await other.locator('[data-note]').first().inputValue(), '원문과 실제 장면은 수업 전에 확인');
      assert.equal(await other.locator('.folder-video').count(), 2);
      await other.close();
      await page.screenshot({ path: `docs/r09-${query.id}-folder.png`, fullPage: true });
      await page.locator('#find-more').click(); await ready();
      assert.equal(new URL(page.url()).searchParams.get('concept'), concept);
      assert.equal(new URL(page.url()).searchParams.get('q'), query.query);
    });
  }
  await check('사회·과학 폴더 독립 보존·모바일 표시', async () => {
    await page.goto(`${base}/lesson.html`);
    assert.equal(await page.locator('#folder-list button').count(), 2);
    for (const title of ['사회 R09 새 표현 확인', '과학 R09 새 표현 확인']) {
      await page.getByRole('button', { name: title, exact: false }).click();
      assert.equal(await page.locator('.folder-video').count(), 2);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: 'docs/r09-folder-mobile.png', fullPage: true });
  });
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.externalRequests, []); assert.deepEqual(report.writesToServer, []);
  report.protectedAfter = await hashes(); assert.deepEqual(report.protectedAfter, before);
  report.storesUnchanged = true; report.passed = true;
} catch (error) {
  report.passed = false; report.error = error.stack; process.exitCode = 1; console.error(error);
} finally {
  await browser?.close();
  if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  await fs.writeFile('docs/r09-workspace-browser.json', JSON.stringify(report, null, 2) + '\n');
}
