const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createAdminBrowserFixture}=require('./admin-browser-fixture');
async function main(){const fixture=await createAdminBrowserFixture();let browser;const cases=[],errors=[];try{
 await fs.copyFile('server/data/broadcast-catalog.sqlite',fixture.broadcastFile);
 await fs.symlink(path.resolve('server/data/broadcast-semantic-search.sqlite'),path.join(fixture.directory,'server/data/broadcast-semantic-search.sqlite'));
 await fs.symlink(path.resolve('server/data/.model-cache'),path.join(fixture.directory,'server/data/.model-cache'));
 const {chromium}=await import(process.env.CURI_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,executablePath:process.env.CURI_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(fixture.base)?r.continue():r.abort());
 const ready=()=>page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false',{},{timeout:60000});
 await page.goto(fixture.base+'/?'+new URLSearchParams({q:'국내 화산 지형의 특징을 설명하는 영상'}));await ready();assert.ok(await page.locator('[data-save]').count());assert.match(await page.locator('#query-understanding').innerText(),/지역 범위: 국내/);assert.match(await page.locator('#result-cards h3').first().innerText(),/한라산/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));cases.push('국내 조건 표시·한라산·390px');
 await page.locator('[data-save]').first().click();await page.reload();await ready();assert.equal(await page.locator('#shelf-count').innerText(),'1');assert.equal(new URL(page.url()).searchParams.get('q'),'국내 화산 지형의 특징을 설명하는 영상');cases.push('국내 요청 주소 복원·개인 저장');
 await page.goto(fixture.base+'/?'+new URLSearchParams({q:'한라산의 화산 지형을 설명하는 자료'}));await ready();for(const summary of await page.locator('#result-cards > article .semantic-details > summary').all())await summary.click();const cards=await page.locator('#result-cards').innerText();assert.match(cards,/화산 지형 직접 언급/);assert.match(cards,/주변 내용/);assert.match(cards,/미확인/);cases.push('지형 직접 언급·주변 물 이용·남은 요구 표시');
 await page.goto(fixture.base+'/?'+new URLSearchParams({q:'우리나라의 화산 활동으로 만들어진 지형을 보여주는 수업 자료'}));await ready();assert.doesNotMatch(await page.locator('#result-cards').innerText(),/과테말라/);cases.push('국내 조건을 UI에서도 유지');await page.screenshot({path:'docs/r07-19-geography-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);await fs.writeFile('docs/r07-19-geography-browser-check.json',JSON.stringify({generatedAt:new Date().toISOString(),cases,errors,paidApiCalls:0},null,2)+'\n');console.log(cases.length,'browser checks passed');
 }finally{await browser?.close();await fixture.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
