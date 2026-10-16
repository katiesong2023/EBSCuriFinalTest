const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { defaults, read } = require('../public/search-state');

(async () => {
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = path.join(__dirname, '../public', pathname === '/' ? 'discover.html' : pathname);
    try {
      const body = await fs.readFile(file);
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  const { chromium } = require('/Users/yunseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  let browser;
  const cases = [], errors = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    await page.route('**/api/curi/discover?*', async route => {
      const params = new URL(route.request().url()).searchParams;
      const state = read(params); requests.push(state);
      const options = values => values.map(value => ({ value, label: value || '전체', count: 5 }));
      const filters = { kind: options(['all', 'episode', 'clip', 'lesson', 'collection']), program: options(['', '검사 프로그램']), description: options(['all', 'detailed']), curriculum: options(['all', 'approved', 'automatic']), access: options(['all', 'direct']), topicChoices: [], state: options(['']) };
      await route.fulfill({ json: { ...state, query: state.q, page: Number(state.page), pageSize: 9, pages: 3, total: 20, results: [], filters, concepts: [], terms: [], note: '', countNote: '', dateNote: '' } });
    });
    await page.goto(base);
    await page.evaluate(() => {
      localStorage.setItem('curi.teacher.search.v1', JSON.stringify({ q: '이전 검색', program: '검사 프로그램', sort: 'newest' }));
      localStorage.setItem('curi.discovery.shelf.v1', '[]');
      localStorage.setItem('curi.teacher.folders.v1', JSON.stringify({ selectedId: '', folders: [] }));
      localStorage.setItem('curi.teacher.lesson.v1', JSON.stringify({ title: '보존할 수업', note: '개인 메모', items: [] }));
    });
    const ready = () => page.waitForFunction(() => document.querySelector('#result-cards')?.getAttribute('aria-busy') === 'false');
    await page.goto(base); await ready();
    assert.equal(await page.locator('#search-input').inputValue(), '');
    assert.equal(requests.at(-1).program, ''); cases.push('기본 주소 진입에서 과거 저장 검색·필터 자동 복원 없음');
    const personal = await page.evaluate(() => Object.fromEntries(['curi.discovery.shelf.v1', 'curi.teacher.folders.v1', 'curi.teacher.lesson.v1'].map(key => [key, localStorage.getItem(key)])));
    const submit = async query => { await page.locator('#search-input').fill(query); await page.locator('#search-input').press('Enter'); await ready(); };
    await submit('우주');
    await page.locator('#additional-filters').evaluate(element => { element.open = true; });
    await page.locator('#program-filter').selectOption('검사 프로그램'); await ready();
    await page.locator('#sort-filter').selectOption('newest'); await ready();
    await page.locator('#direct-only').check(); await ready();
    await page.locator('#next-page').click(); await ready();
    assert.equal(requests.at(-1).page, '2');
    await submit('생태계');
    for (const [key, value] of Object.entries(defaults)) assert.equal(requests.at(-1)[key], key === 'q' ? '생태계' : value, key);
    assert.equal(await page.locator('#program-filter').inputValue(), '');
    assert.equal(await page.locator('#sort-filter').inputValue(), 'relevance');
    assert.equal(await page.locator('#direct-only').isChecked(), false);
    cases.push('검색어 변경 시 프로그램·접근·정렬·페이지 등 전체 필터와 표시 초기화');
    await page.locator('#additional-filters').evaluate(element => { element.open = true; });
    await page.locator('#program-filter').selectOption('검사 프로그램'); await ready();
    await submit('생태계'); assert.equal(requests.at(-1).program, '검사 프로그램');
    cases.push('동일 검색어 재검색은 현재 필터 유지');
    await page.locator('[data-query="민주주의"]').evaluate(element => element.click()); await ready();
    assert.equal(requests.at(-1).q, '민주주의'); assert.equal(requests.at(-1).program, '');
    cases.push('검색 예시 선택도 이전 필터 초기화');
    await page.reload(); await ready();
    assert.equal(await page.locator('#search-input').inputValue(), '');
    for (const [key, value] of Object.entries(defaults)) assert.equal(requests.at(-1)[key], value, key);
    cases.push('검색 URL에서 새로고침하면 기본 목록으로 초기화');
    await page.goto(base + '/?q=직접주소&program=검사+프로그램&sort=newest'); await ready();
    assert.equal(requests.at(-1).q, '직접주소'); assert.equal(requests.at(-1).program, '검사 프로그램');
    await submit('다른 검색'); await page.goBack(); await ready();
    assert.equal(await page.locator('#search-input').inputValue(), '직접주소'); assert.equal(requests.at(-1).program, '검사 프로그램');
    cases.push('명시적 검색 링크와 뒤로 가기 조건 보존');
    assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(personal)), personal);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []); cases.push('개인 자료·수업·메모 보존 및 390px·브라우저 오류 없음');
    await fs.writeFile(path.join(__dirname, '../docs/r12-05-search-reset-check.json'), JSON.stringify({ date: '2026-10-15', passed: cases.length, cases, errors, mode: '격리 브라우저·대체 검색 API; 실제 검색 순위·DB 변경 없음' }, null, 2) + '\n');
    console.log(cases.length, '검색 초기화 화면 검사 통과');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
