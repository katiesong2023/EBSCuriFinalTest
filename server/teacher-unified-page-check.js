const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createAdminBrowserFixture } = require('./admin-browser-fixture');
const state = require('../public/search-state');
const cases = [];
const check = async (name, run) => { await run(); cases.push({ name, passed: true }); console.log('통과:', name); };
const hashes = async () => Object.fromEntries(await Promise.all(['curi-store.json','broadcast-catalog.sqlite','semantic-layer.sqlite','automatic-assets.sqlite'].map(async name => [name, crypto.createHash('sha256').update(await fs.readFile(`server/data/${name}`)).digest('hex')])));
async function main() {
  const before = await hashes(), fixture = await createAdminBrowserFixture(); let browser;
  try {
    const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE });
    const context = await browser.newContext({ viewport: {width:1440,height:1000} });
    const errors = [], requests = [];
    await context.route('**/*', route => route.request().url().startsWith(fixture.base) ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.url().includes('/api/curi/discover?')) requests.push(r.url()); });
    const ready = () => page.waitForFunction(() => document.querySelector('#result-cards')?.getAttribute('aria-busy') === 'false');
    const visit = async params => { await page.goto(`${fixture.base}/?${new URLSearchParams(params)}`); await ready(); };
    const choose = async code => { await page.locator('#standard-query').fill(code); await page.locator(`[data-select-standard="${code}"]`).click(); await ready(); };
    await check('URL 상태·브라우저 전용 키 분리·중복/이전 주소 검증', async () => {
      assert.equal(state.apiParams({...state.defaults,standardQuery:'원문'}).has('standardQuery'), false);
      assert.ok(state.read(new URLSearchParams('q=a&q=b')).invalidConditions);
      const old = state.read(state.legacyParams(new URLSearchParams('subject=과학&grade=중1&standard=9과05-02&state=RELATION_MISSING')));
      assert.equal(old.grade,'all'); assert.equal(old.standardGrade,'middle1'); assert.equal(old.state,'CONCEPT_ONLY');
      assert.ok(state.read(state.legacyParams(new URLSearchParams('grade=5&grade=6'))).invalidConditions);
    });
    await check('214개 공식 목록·패널 열기만으로 검색 미적용', async () => {
      await visit({q:'지구 자전',grade:'5'});
      await page.locator('#curriculum-picker > summary').click();
      await page.locator('#all-standards').click();
      await page.waitForFunction(() => document.querySelectorAll('[data-select-standard]').length === 214);
      const count=requests.length; await page.locator('#curriculum-picker > summary').click(); await page.locator('#curriculum-picker > summary').click();
      assert.equal(requests.length,count); assert.equal(new URL(page.url()).searchParams.get('standard'),'');
    });
    await check('기준 선택·전체 원문/출처·접기·질문/필터 개별 유지·이전 대상 학년 미적용', async () => {
      await page.locator('#sort-filter').selectOption('newest'); await ready();
      await choose('6과12-02');
      assert.equal(new URL(page.url()).searchParams.get('q'),'지구 자전');
      assert.equal(new URL(page.url()).searchParams.get('grade'),'all');
      assert.equal(new URL(page.url()).searchParams.get('sort'),'newest');
      assert.match(await page.locator('#selected-standard').innerText(),/지구.*자전/s);
      assert.match(await page.locator('#selected-official-source').innerText(),/공식 출처:/);
      await page.locator('#curriculum-picker > summary').click();
      assert.equal(await page.locator('#selected-standard').isVisible(),true);
      await page.locator('[data-clear-filter="q"]').click(); await ready();
      assert.equal(new URL(page.url()).searchParams.get('standard'),'6과12-02');
      assert.equal(await page.locator('#grade-filter, #grade-context-note, [data-clear-filter="grade"]').count(),0);
      assert.equal(new URL(requests.at(-1)).searchParams.get('grade'),'all');
      await page.locator('#clear-standard').click(); await ready();
      assert.equal(await page.locator('#sort-filter').inputValue(),'newest');
      assert.equal(await page.locator('#relation-state-choice').isVisible(),false);
    });
    await check('공식 문장·교과/과정 탐색·중1 편성과 공식 학년군 표시', async () => {
      await page.locator('#curriculum-picker > summary').click();
      await page.locator('#standard-subject').selectOption('과학');
      await page.locator('#standard-grade').selectOption('middle1');
      await choose('9과05-02');
      assert.match(await page.locator('#selected-standard').innerText(),/1~3|1∼3|1～3/);
      assert.match(await page.locator('#selected-standard').innerText(),/뉴런.*미확인/s);
      await page.locator('#standard-query').fill('마찰');
      assert.ok(await page.locator('[data-select-standard]').count()>0);
      assert.match(await page.locator('#selected-official-source').innerText(),/공식 출처:/);
    });
    await check('새로고침·뒤로가기·저장 조건 복원', async () => {
      await page.reload(); await ready(); assert.equal(new URL(page.url()).searchParams.get('standard'),'9과05-02');
      await page.locator('#clear-standard').click(); await ready(); await page.goBack(); await ready();
      assert.equal(new URL(page.url()).searchParams.get('standard'),'9과05-02');
      await page.goto(fixture.base); await ready(); assert.equal(new URL(page.url()).searchParams.get('standard'),'9과05-02');
    });
    await check('이전 교육과정 주소·충돌 오류·관리자 경로 보존', async () => {
      await page.goto(`${fixture.base}/curriculum.html?subject=과학&grade=5&standard=6과12-02&state=CONCEPT_ONLY`); await ready();
      assert.equal(new URL(page.url()).pathname,'/'); assert.equal(new URL(page.url()).searchParams.get('grade'),'all');
      assert.equal(await page.locator('#relation-state').inputValue(),'CONCEPT_ONLY');
      await page.goto(`${fixture.base}/curriculum.html?subject=사회&grade=5&standard=6과12-02`); await ready();
      assert.equal(await page.locator('#error-state').isVisible(),true); assert.equal(await page.locator('#result-cards > article').count(),0);
      const admin=await fetch(`${fixture.base}/admin-curriculum.html`); assert.match(await admin.text(),/관리자 로그인/); assert.match(await fs.readFile('public/admin-curriculum.html','utf8'),/curriculum.js/);
    });
    await check('빈 결과·빠른 기준 변경·실패/재시도·이전 결과 숨김', async () => {
      await visit({standard:'9사(지리)01-01'}); assert.equal(await page.locator('#empty-state').isVisible(),true);
      await page.route('**/api/curi/discover?*',async route=>{if(new URL(route.request().url()).searchParams.get('standard')==='6과12-02')await new Promise(resolve=>setTimeout(resolve,300));await route.continue().catch(()=>{});});
      await page.locator('#standard-query').fill('6과12-02'); await page.locator('[data-select-standard="6과12-02"]').click();
      await page.locator('#standard-query').fill('4사01-01'); await page.locator('[data-select-standard="4사01-01"]').click(); await ready();
      await page.waitForTimeout(400); assert.match(await page.locator('#result-status').innerText(),/4사01-01/);
      await page.unroute('**/api/curi/discover?*');
      await page.route('**/api/curi/discover?*',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"합성 조회 실패"}'}));
      await page.locator('#sort-filter').selectOption('oldest'); await ready(); assert.equal(await page.locator('#result-cards > article').count(),0);
      await page.unroute('**/api/curi/discover?*'); await page.locator('#retry-search').click(); await ready(); assert.equal(await page.locator('#error-state').isVisible(),false);
    });
    await check('중복 주소 새로고침에서도 오류 유지·기준 목록 실패 후 복구', async () => {
      await page.goto(`${fixture.base}/?q=지구&q=자전`); await ready();
      await page.reload(); await ready(); assert.equal(await page.locator('#error-state').isVisible(),true);
      await page.route('**/api/curi/curriculum',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
      await visit({q:'지구 자전'}); assert.equal(await page.locator('#error-state').isVisible(),false);
      await page.locator('#curriculum-picker > summary').click();
      assert.equal(await page.locator('#retry-standards').isVisible(),true);
      await page.unroute('**/api/curi/curriculum'); await page.locator('#all-standards').click(); await page.locator('#retry-standards').click();
      await page.waitForFunction(()=>document.querySelectorAll('[data-select-standard]').length===214);
    });
    await check('관련 기준 API·부정 범위·조건 검증·빈 질문', async () => {
      const api=async params=>{const r=await fetch(`${fixture.base}/api/curi/curriculum/related?${params}`);return {status:r.status,data:await r.json()};};
      assert.equal((await api('q=')).data.related.length,0);
      const excluded=await api(new URLSearchParams({q:'화산 말고 지진'})); assert.ok(excluded.data.related.length>0);
      assert.ok(excluded.data.related.every(item=>!item.reason.includes('‘화산’')));
      assert.equal((await api('q='+encodeURIComponent('추천해주세요'))).data.related.length,0);
      assert.equal((await api(new URLSearchParams({q:'지구',grade:'고3'}))).status,400);
      assert.equal((await api('q=a&q=b')).status,400);
      assert.equal((await api('q='+ 'x'.repeat(201))).status,400);
      assert.equal((await api('q=지구&unknown=1')).status,400);
      assert.equal((await api('q=마찰력')).data.paidApiCalls,0);
    });
    await check('질문별 관련 기준 최대8개·공식 문장 이유·미지원 포함·자동 선택 없음', async () => {
      await visit({q:'생태계의 다양한 생물 관계를 보여주는 다큐를 찾아줘'});
      await page.waitForFunction(()=>document.querySelector('#standard-summary-count').textContent.includes('관련 후보'));
      await page.locator('#curriculum-picker > summary').click();
      assert.ok(await page.locator('[data-select-standard]').count()<=8);
      assert.ok(await page.locator('[data-select-standard]').count()>0);
      assert.equal(new URL(page.url()).searchParams.get('standard'),'');
      assert.match(await page.locator('#standard-options').innerText(),/생태계.*관련 이유:.*공식 문장/s);
      const api=await fetch(`${fixture.base}/api/curi/curriculum/related?q=${encodeURIComponent('마찰력')}`).then(r=>r.json());
      assert.equal(api.related[0].id,'9과05-02'); assert.equal(api.related[0].ruleSupported,false);
      await page.locator('#search-input').fill('지구 자전과 낮과 밤'); await page.locator('#search-submit').click(); await ready();
      await page.waitForFunction(()=>document.querySelector('[data-select-standard="6과12-02"]'));
      assert.equal(await page.locator('[data-select-standard]').first().getAttribute('data-select-standard'),'6과12-02');
      await page.locator('[data-select-standard="6과12-02"]').click(); await ready();
      assert.equal(new URL(page.url()).searchParams.get('q'),'지구 자전과 낮과 밤');
      assert.match(await page.locator('#result-status').innerText(),/6과12-02/);
    });
    await check('전체 기준 전환·공식 코드 탐색·목록 교과/과정·보기 복원', async () => {
      const count=requests.length; await page.locator('#all-standards').click();
      assert.equal(await page.locator('[data-select-standard]').count(),214); assert.equal(requests.length,count);
      await page.reload(); await ready(); assert.equal(await page.locator('#all-standards').getAttribute('aria-pressed'),'true');
      await page.locator('#standard-query').fill('9과05-02'); assert.equal(await page.locator('[data-select-standard]').count(),1);
      await page.locator('#related-standards').click();
      await page.locator('#standard-subject').selectOption('사회');
      await page.waitForFunction(()=>document.querySelector('#standard-no-options').hidden===false);
      assert.equal(await page.locator('[data-select-standard]').count(),0);
      assert.equal(new URL(page.url()).searchParams.get('standard'),'6과12-02');
      await page.locator('#standard-subject').selectOption('과학'); await page.locator('#standard-grade').selectOption('middle1');
      await page.waitForFunction(()=>document.querySelector('[data-select-standard="9과07-03"]'));
      assert.ok((await page.locator('[data-select-standard]').evaluateAll(items=>items.map(item=>item.dataset.selectStandard))).every(code=>code.startsWith('9과')));
    });
    await check('관련 후보 없음·조회 실패/재시도·늦은 질문 응답 차단', async () => {
      await visit({q:'zzzz없는주제'}); await page.waitForFunction(()=>document.querySelector('#standard-no-options').hidden===false);
      await page.locator('#curriculum-picker > summary').click(); assert.match(await page.locator('#standard-no-options').innerText(),/전체 기준 보기/);
      await page.route('**/api/curi/curriculum/related?*',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
      await visit({q:'지구 자전'}); await page.locator('#curriculum-picker > summary').click(); await page.locator('#retry-related').waitFor({state:'visible'});
      assert.equal(await page.locator('#error-state').isVisible(),false);
      await page.unroute('**/api/curi/curriculum/related?*'); await page.locator('#retry-related').click(); await page.locator('[data-select-standard="6과12-02"]').waitFor();
      await page.route('**/api/curi/curriculum/related?*',async route=>{if(new URL(route.request().url()).searchParams.get('q')==='선거')await new Promise(resolve=>setTimeout(resolve,350));await route.continue().catch(()=>{});});
      await page.locator('#search-input').fill('선거'); await page.locator('#search-submit').click();
      await page.locator('#search-input').fill('마찰력'); await page.locator('#search-submit').click(); await ready();
      await page.locator('[data-select-standard="9과05-02"]').waitFor(); await page.waitForTimeout(450);
      assert.equal(await page.locator('[data-select-standard]').count(),1); await page.unroute('**/api/curi/curriculum/related?*');
      await page.setViewportSize({width:390,height:844}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('#curriculum-picker').screenshot({path:'docs/r07-08-related-mobile.png'}); await page.setViewportSize({width:1440,height:1000});
    });
    await check('구버전 서버가 선택 기준을 무시하면 정상 카드 표시 금지', async () => {
      await page.route('**/api/curi/discover?*',async route=>{const response=await route.fetch();const data=await response.json();data.standard=null;delete data.searchMode;await route.fulfill({response,json:data});});
      await visit({standard:'6과12-02'}); assert.equal(await page.locator('#error-state').isVisible(),true);
      assert.match(await page.locator('#error-message').innerText(),/서버.*재시작/); assert.equal(await page.locator('#result-cards > article').count(),0);
      await page.unroute('**/api/curi/discover?*');
    });
    await check('키보드 기준 선택·390px 화면 넘침 없음', async () => {
      await visit({standard:'6과12-02',standardQuery:'6과12-02'});
      await page.locator('[data-select-standard="6과12-02"]').focus(); await page.keyboard.press('Enter'); await ready(); assert.equal(await page.evaluate(()=>document.activeElement?.dataset.selectStandard),'6과12-02');
      await page.screenshot({path:'docs/r07-08-search-desktop.png',fullPage:true});
      await page.setViewportSize({width:390,height:844}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('#curriculum-picker').screenshot({path:'docs/r07-08-picker-mobile.png'});
      await page.locator('.standard-selection').screenshot({path:'docs/r07-08-selection-mobile.png'});
    });
    assert.deepEqual(errors,[]); assert.deepEqual(await hashes(),before);
    await fs.writeFile('docs/r07-08-page-check.json',JSON.stringify({date:new Date().toISOString(),cases,errors,protectedHashes:before,paidApiCalls:0,fixture:'임시 복제 서버·합성 방송·공식 214개 기준. 교사 결과 확인 대기'},null,2)+'\n');
  } finally { await browser?.close(); await fixture.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
