const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {createAdminBrowserFixture}=require('./admin-browser-fixture');
const {openBroadcastStore,saveBroadcastPage}=require('./broadcast-store');
const {applyOfficialDetail}=require('./source-enrichment');
async function main(){const fixture=await createAdminBrowserFixture();let browser;const cases=[],errors=[];
try{
 const db=openBroadcastStore(fixture.broadcastFile),item={program:'원문 시험',title:'원문회귀 지방의회 시민',summary:'원문회귀 지방의회 시민',url:'https://www.ebs.co.kr/test?courseId=990000&stepId=1&lectId=990001'};
 saveBroadcastPage(db,{job:'source',sourceUrl:item.url,fetchedAt:'2026-10-05'},[item]);const row=db.prepare('SELECT * FROM episodes WHERE lect_id=?').get('990001');
 applyOfficialDetail(db,row.id,{title:item.title,url:item.url,description:'시민은 지역의 문제를 해결하기 위해 의견을 모은다. 지방의회에서는 공청회나 토론회, 주민참여조례 등 시민 참여를 보장하는 다양한 창구를 통해 시민의 목소리에 귀 기울이고 있다. 청소년 의회교실에서 지역의 의사결정에 참여하는 여러 사례를 소개한다. <img src=x onerror="window.injected=1">',durationMetadata:'PT6M39S'});db.close();
 const {chromium}=await import(process.env.CURI_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,executablePath:process.env.CURI_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(fixture.base)?r.continue():r.abort());
 await page.goto(fixture.base+'/?q='+encodeURIComponent('원문회귀'));await page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');
 const card=page.locator('#result-cards > article').first();assert.equal(await card.count(),1);assert.match(await card.locator('.evidence-badge').innerText(),/구체적 내용 설명/);assert.equal(await card.locator('.content-preview > summary').innerText(),'방송 내용 안내');assert.doesNotMatch(await card.locator('.content-preview').textContent(),/공개 소개문에서 구성/);assert.match(await card.locator('.preview-text').innerText(),/공청회/);cases.push('다섯 품질 배지·내용 안내');
 await card.locator('.semantic-details > summary').click();await card.locator('.source-description > summary').click();assert.ok(await card.locator('mark').count());assert.match(await card.locator('.full-description').innerText(),/window.injected/);assert.equal(await page.evaluate(()=>window.injected),undefined);cases.push('원문 강조·HTML 실행 차단');
 await card.locator('details').filter({has:page.locator('summary', {hasText:'출처와 확인 범위'})}).last().locator('summary').click();assert.match(await card.locator('.source-checks').innerText(),/6분 39초/);assert.match(await card.locator('.source-checks').innerText(),/대조 일치/);cases.push('회차·소개문·시점·페이지 표기 시간 분리');
 await page.locator('#additional-filters > summary').click();await page.locator('#description-filter').selectOption('production');await page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');assert.equal(await page.locator('#empty-state').isVisible(),true);cases.push('품질 필터·빈 결과');
 await page.locator('#clear-filters').click();await page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');await card.screenshot({path:'docs/r07-03-source-desktop.png'});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await card.screenshot({path:'docs/r07-03-source-mobile.png'});cases.push('PC·모바일 표시');assert.deepEqual(errors,[]);
 await fs.writeFile('docs/r07-03-browser-check.json',JSON.stringify({checkedAt:new Date().toISOString(),cases,errors,paidApiCalls:0},null,2)+'\n');console.log(`원문 화면 ${cases.length}개 통과`);
}finally{await browser?.close();await fixture.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
