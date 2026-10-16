// 실데이터 쓰기·유료 호출 없이 HTTP 권한과 관리자·교사 화면 경계를 검사한다.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
const require = createRequire(import.meta.url);
const { createAdminAccess } = require('./admin-auth');
const files = ['server/data/curi-store.json', 'server/data/broadcast-catalog.sqlite', 'server/data/semantic-layer.sqlite'];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async (file) => [file, crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
const reportPrefix = process.env.CURI_REPORT_PREFIX || 'docs/r08-';
const before = await hashes(), cases = [], browserCases = [], errors = [];
const token = crypto.randomBytes(32).toString('hex'), port = process.env.CURI_ADMIN_TEST_PORT || '3328', base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: port, NODE_ENV: 'test', CURI_ADMIN_TOKEN: token, CURI_ADMIN_ORIGIN: base, CURI_ALLOW_PAID_API: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stderr.on('data', chunk => { logs += chunk; });
const check = async (name, fn, target = cases) => { await fn(); target.push({ name, passed: true }); console.log('통과:', name); };
let browser;
try {
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(new Error(`server exited ${code}: ${logs}`))); });
  const auth = await fetch(`${base}/api/admin/session`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.equal(auth.status, 200);
  const cookie = auth.headers.get('set-cookie').split(';')[0];
  const request = (path, options = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...options });
  const api = async (path) => { const res = await request(path, { headers: { Cookie: cookie } }); assert.equal(res.status, 200); return res.json(); };
  await check('관리 화면 직접 접근·인코딩·중복 슬래시 우회 차단', async () => {
    for (const path of ['/admin.html', '/curimap.html?contentCuriId=x', '/review.html', '/ingestion.html', '/%61dmin.html', '/%2fadmin.html', '/x/%2e%2e/admin.html', '/admin.html/']) {
      assert.equal((await request(path)).status, 303, path);
    }
  });
  await check('모든 관리 API GET·HEAD·쓰기 미인증 401', async () => {
    for (const path of ['/api/admin/workspace', '/api/data-store/model', '/api/data-store/summary', '/api/candidate-retrieval', '/api/curimap/contents', '/api/curimap/review-options', '/api/curimap/draft', '/api/curimap/review', '/api/curibase/verified', '/api/curibase/search-index', '/api/ingestion/runs', '/api/ingestion/preview', '/api/ingestion/apply', '/api/new-management-route']) {
      for (const method of ['GET', 'HEAD', 'POST']) assert.equal((await request(path, { method })).status, 401, `${method} ${path}`);
    }
  });
  await check('교사 화면과 탐색은 로그인 없이 제공', async () => {
    for (const path of ['/', '/lesson.html', '/index.html', '/api/curi/discover?q=우주', '/api/curi/discover?workspace=teacher&q=기후']) assert.equal((await request(path)).status, 200);
  });
  await check('쿠키 속성·잘못된 코드·외부 Origin·Host·출처 없는 쓰기 차단', async () => {
    assert.match(auth.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await request('/api/admin/session', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{"token":"bad"}' })).status, 401);
    for (const origin of ['https://attacker.example', 'null', undefined]) {
      const headers = { Cookie: cookie, 'Content-Type': 'application/json' }; if (origin) headers.Origin = origin;
      assert.equal((await request('/api/ingestion/apply', { method: 'POST', headers, body: '{}' })).status, 403);
    }
    // fetch는 Host를 재작성하므로 DNS rebinding 검사는 원시 HTTP 헤더를 사용한다.
    const status = await new Promise((resolve, reject) => { const req = http.get(`${base}/api/admin/workspace`, { headers: { Host: 'attacker.example', Cookie: cookie } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
    assert.equal(status, 403);
  });
  let listing, detail;
  await check('관리 자료 수·원문 불일치·검수 대기·상태 필터·페이지', async () => {
    listing = await api('/api/admin/workspace'); assert.ok(listing.collection.total >= 20000); assert.ok(listing.total > listing.collection.total);
    for (const filter of ['source', 'tags', 'inference', 'review', 'approved', 'mapping', 'search', 'inactive']) {
      const data = await api(`/api/admin/workspace?filter=${filter}`); assert.equal(data.total, listing.counts[filter]);
      if (filter === 'source') assert.ok(data.results.every(row => row.sourceStatus === 'MISMATCH'));
      if (filter === 'review') assert.ok(data.results.every(row => row.reviewPending));
    }
    assert.equal((await api('/api/admin/workspace?page=999999')).page, listing.pages);
    assert.equal((await api('/api/admin/workspace?q=noSuchResourceXYZ')).total, 0);
    assert.equal((await request('/api/admin/workspace?id=missing', { headers: { Cookie: cookie } })).status, 404);
    const mapping = await api('/api/admin/workspace?filter=mapping');
    detail = await api(`/api/admin/workspace?id=${mapping.results[0].id}`); assert.ok(detail.mappingAllowed);
    for (const tag of detail.tags.supported) assert.equal(detail.resource[tag.evidence.field].slice(tag.evidence.start, tag.evidence.end), tag.evidence.quote);
    assert.equal(detail.resource.relationStatus, 'RELATION_NOT_VERIFIED');
  });
  await check('미선택 검수·연계는 목록으로 이동, 유료 초안은 차단', async () => {
    for (const path of ['/review.html', '/curimap.html']) assert.equal((await request(path, { headers: { Cookie: cookie } })).headers.get('location'), '/admin.html?filter=mapping');
    const response = await request('/api/curimap/draft', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
  });
  await check('로그아웃은 서버 세션을 폐기', async () => {
    assert.equal((await request('/api/admin/session', { method: 'DELETE', headers: { Cookie: cookie, Origin: base } })).status, 200);
    assert.equal((await request('/api/admin/workspace', { headers: { Cookie: cookie } })).status, 401);
  });
  await check('운영 환경 설정 누락·약한 코드 거절', async () => {
    assert.throws(() => createAdminAccess({ port, env: { NODE_ENV: 'production' } }));
    assert.throws(() => createAdminAccess({ port, env: { CURI_ADMIN_TOKEN: 'short' } }));
    assert.doesNotThrow(() => createAdminAccess({ port, env: { CURI_ADMIN_TOKEN: 'local-test-only' } }));
    assert.throws(() => createAdminAccess({ port, env: { NODE_ENV:'production', CURI_ADMIN_TOKEN:'local-test-only', CURI_ADMIN_ORIGIN:'https://curi.example' } }), /32자/);
    assert.throws(() => createAdminAccess({ port, env: { NODE_ENV: 'production', CURI_ADMIN_TOKEN: token, CURI_ADMIN_ORIGIN: base } }));
  });
  await check('세션 만료·로그인 시도 제한·운영 Secure 쿠키', async () => {
    let time = 100000;
    const access = createAdminAccess({ port, env: { NODE_ENV: 'production', CURI_ADMIN_TOKEN: token, CURI_ADMIN_ORIGIN: 'https://curi.example' }, now: () => time });
    async function call(method, pathname, value, session) {
      const req = { method, url: pathname, headers: { host: `127.0.0.1:${port}`, origin: 'https://curi.example', 'content-type': 'application/json', cookie: session }, async *[Symbol.asyncIterator]() { yield JSON.stringify(value); } };
      const result = {}; await access.handle(req, { writeHead(status, headers) { Object.assign(result, { status, headers }); }, end() {} }, pathname); return result;
    }
    const login = await call('POST', '/api/admin/session', { token }); assert.match(login.headers['Set-Cookie'], /^__Host-curi_admin=.*; Secure$/);
    time += 8 * 60 * 60 * 1000 + 1;
    assert.equal((await call('GET', '/api/admin/workspace', null, login.headers['Set-Cookie'].split(';')[0])).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/admin/session', { token: 'bad' })).status, 401);
    assert.equal((await call('POST', '/api/admin/session', { token })).status, 429);
    time += 60001; assert.equal((await call('POST', '/api/admin/session', { token })).status, 200);
  });
  await check('방송 가져오기 후 중복·원문 변경·비활성 검색 반영', async () => {
    const { buildCatalog } = require('./discovery-catalog');
    const source = { id: 'BCAST-TEST', title: '옛 제목', summary: '화산 분출', sourceUrl: 'https://ebs.co.kr/test', program: '과학 방송', kind: 'episode', navigation: { status: 'PUBLISHED' }, variant: 'EPISODE', broadcastDate: '2026-01-01' };
    const content = { sourceIdentity: { sourceContentId: source.id }, lifecycle: { isActive: true }, source: { sourceUrl: source.sourceUrl }, metadata: { title: '새 제목', synopsis: '별과 우주', contentLevel: 'episode', programName: source.program }, provenance: { classification: 'SOURCE' } };
    const catalog = buildCatalog([], { contents: [content] }, { concepts: [], resources: [] }, [source]);
    assert.equal(catalog.resources.length, 1); assert.equal(catalog.resources[0].summary, '별과 우주'); assert.equal(catalog.resources[0].broadcastDate, source.broadcastDate);
    content.lifecycle.isActive = false;
    assert.equal(buildCatalog([], { contents: [content] }, { concepts: [], resources: [] }, [source]).resources.length, 0);
  });
  await check('원문 변경·제외 후 관리 상태는 현재 Gate와 함께 무효화', async () => {
    const { fixture } = require('./verified-save-check');
    const { reconcileVerifiedAssets, evaluateVerification, verifiedPayload, fingerprint } = require('./data-quality');
    const { buildRows } = require('./admin-workspace');
    const { tagResource } = require('./semantic-layer');
    const store = fixture(), content = store.contents[0];
    const resource = { id: content.sourceIdentity.sourceContentId, title: content.metadata.title, summary: '산맥과 지형', sourceUrl: content.source.sourceUrl, navigation: { status: 'MATCHED' } };
    const base = { resources: [resource], tags: new Map([[resource.id, tagResource(resource)]]), mismatches: new Set() };
    const gate = evaluateVerification(store, content.curiId);
    store.verifiedAssets = gate.maps.map((map, index) => { const payload = verifiedPayload(gate, index); return { ...payload, verifiedAssetId: `asset-${index}`, evidenceFingerprint: fingerprint(payload) }; });
    reconcileVerifiedAssets(store); assert.equal(buildRows(base, store)[0].approvalStatus, 'APPROVED');
    content.metadata.title = '바뀐 제목'; reconcileVerifiedAssets(store);
    let row = buildRows(base, store)[0]; assert.equal(row.approvalStatus, 'STALE_REVIEW'); assert.equal(row.reviewPending, true); assert.equal(row.searchStatus, 'NOT_SAVED'); assert.equal(store.verifiedAssetHistory.length, 2);
    Object.assign(store.mappingRuns[0].reviewHistory.at(-1), { status: 'EXCLUDED', decision: 'exclude' });
    row = buildRows(base, store)[0]; assert.equal(row.approvalStatus, 'EXCLUDED'); assert.equal(row.reviewPending, false);
  });
  if (process.env.CURI_PLAYWRIGHT_MODULE) {
    const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.querySelector('#request-status')?.textContent.includes('현재 저장된') || document.querySelector('#request-status')?.textContent.includes('자료 상세를 불러왔습니다'));
    await check('직접 검수 접근→로그인→미선택 목록 복귀', async () => {
      await page.goto(`${base}/review.html`); await page.locator('#admin-token').fill(token); await page.locator('#login-form button').click(); await ready(); assert.match(page.url(), /admin.html\?filter=mapping/);
      await page.evaluate(() => localStorage.setItem('curi.teacher.folders.v1', '{"sentinel":"unchanged"}'));
    }, browserCases);
    await check('목록→원문·태그→CuriMap→검수→관리 목록', async () => {
      await page.locator('.resource a').first().click(); await ready();
      assert.equal(await page.locator('.evidence').count(), detail.tags.supported.length + detail.tags.candidates.length);
      await page.getByText('원문 변경과 재검수 기록', { exact: true }).click();
      await page.screenshot({ path: `${reportPrefix}admin-detail.png`, fullPage: true });
      await page.getByText('선택적 사람 검토와 기존 승인 이력', { exact: true }).click();
      await page.getByRole('link', { name: 'CuriMap 초안·공식 후보 확인' }).click(); await page.waitForFunction(() => document.querySelector('#content-select')?.value);
      assert.equal(await page.locator('#content-select').inputValue(), detail.resource.contentCuriId);
      await page.locator('#review-link').click(); await page.waitForURL('**/admin.html?**'); await ready();
      await page.locator('#human-review-workspace').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('id'), detail.resource.id);
      await page.locator('#back-to-list').click(); await ready();
    }, browserCases);
    await check('상태 필터·빈 목록·검색·상세 URL 재접속', async () => {
      await page.locator('#filter').selectOption('source'); await page.locator('#filter-form button').click(); await ready(); assert.ok(await page.locator('.resource').count());
      await page.locator('#query').fill('noSuchResourceXYZ'); await page.locator('#filter-form button').click(); await ready(); assert.equal(await page.locator('.resource').count(), 0);
      await page.goto(`${base}/admin.html?id=${detail.resource.id}`); await ready(); await page.reload(); await ready(); assert.equal(await page.locator('#detail-title').textContent(), detail.resource.title);
    }, browserCases);
    await check('방송 선택→가져오기 입력만 준비·자동 저장 없음', async () => {
      const broadcasts = await apiWithBrowser('/api/admin/workspace?q=BCAST-');
      await page.goto(`${base}/admin.html?id=${broadcasts.results[0].id}`); await ready();
      await page.getByRole('link', { name: '검수 대상으로 가져오기' }).click(); await page.waitForFunction(() => document.querySelector('#source-content-id')?.value);
      assert.equal(await page.locator('#source-content-id').inputValue(), broadcasts.results[0].id); assert.equal(await page.locator('#apply-button').isDisabled(), true);
    }, browserCases);
    await check('조회 실패→재시도·잘못된 자료→목록 복귀', async () => {
      await page.route('**/api/admin/workspace*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"모의 읽기 실패"}' }));
      await page.goto(`${base}/admin.html`); await page.locator('#retry').waitFor({ state: 'visible' }); await page.unroute('**/api/admin/workspace*'); await page.locator('#retry').click(); await ready();
      await page.goto(`${base}/admin.html?id=missing`); await page.locator('#retry').waitFor({ state: 'visible' }); await page.locator('#back-to-list').click(); await ready();
    }, browserCases);
    await check('데스크톱·모바일 표시·교사 폴더 불변·로그아웃', async () => {
      await page.screenshot({ path: `${reportPrefix}admin-desktop.png`, fullPage: false });
      await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: `${reportPrefix}admin-mobile.png`, fullPage: false });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => localStorage.getItem('curi.teacher.folders.v1')), '{"sentinel":"unchanged"}');
      await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await page.waitForURL('**/admin-login.html');
      await page.goto(`${base}/admin.html`); await page.waitForURL('**/admin-login.html?**'); assert.deepEqual(errors, []);
    }, browserCases);
    async function apiWithBrowser(path) { const response = await page.request.get(`${base}${path}`); assert.equal(response.status(), 200); return response.json(); }
  }
  await check('승인 JSON·방송 DB·시맨틱 DB 해시 불변', async () => assert.deepEqual(await hashes(), before));
  await fs.writeFile(`${reportPrefix}admin-check.json`, JSON.stringify({ generatedAt: new Date().toISOString(), cases, browserCases, errors, dataHashes: before, dataUnchanged: true, paidApiCalls: 0 }, null, 2) + '\n');
} finally { await browser?.close(); child.kill(); }
