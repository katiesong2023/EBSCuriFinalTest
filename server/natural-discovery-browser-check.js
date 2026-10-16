const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createAdminBrowserFixture}=require('./admin-browser-fixture');
async function main(){const fixture=await createAdminBrowserFixture();let browser;const cases=[],errors=[];try{
 await fs.copyFile('server/data/broadcast-catalog.sqlite',fixture.broadcastFile);
 await fs.symlink(path.resolve('server/data/broadcast-semantic-search.sqlite'),path.join(fixture.directory,'server/data/broadcast-semantic-search.sqlite'));
 await fs.symlink(path.resolve('server/data/.model-cache'),path.join(fixture.directory,'server/data/.model-cache'));
 const {chromium}=await import(process.env.CURI_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,executablePath:process.env.CURI_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(fixture.base)?r.continue():r.abort());
 const ready=()=>page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false',{},{timeout:60000});
 const q='연소에 필요한 조건을 설명해주는 영상';await page.goto(fixture.base+'/?'+new URLSearchParams({q}));await ready();assert.ok(await page.locator('[data-save]').count());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));cases.push('실제 전체 방송 자연어 검색·390px');
 const response=await fetch(fixture.base+'/api/curi/discover?'+new URLSearchParams({workspace:'teacher',q})).then(r=>r.json());assert.equal(response.retrieval.semantic,'LOCAL_E5');assert.ok(response.results.every(x=>!x.title.includes('넌 뭔데 내 취향 다 아니')));cases.push('실제 모델·무관 추천시스템 방송 유입 차단');
 await page.locator('[data-save]').first().click();await page.reload();await ready();assert.equal(await page.locator('#shelf-count').innerText(),'1');assert.equal(new URL(page.url()).searchParams.get('q'),q);cases.push('주소 복원·개인 저장 유지');
 await page.locator('#sort-filter').selectOption('newest');await ready();assert.equal(new URL(page.url()).searchParams.get('sort'),'newest');cases.push('방송일 정렬·요청 유지');
 await page.goto(fixture.base+'/?'+new URLSearchParams({q:'연소와 블루드래곤가상물질을 모두 설명해주는 영상'}));await ready();assert.equal(await page.locator('[data-save]').count(),0);cases.push('명시 복합 조건의 빈 결과');
 await page.screenshot({path:'docs/r07-19-empty-mobile.png',fullPage:true});
 await page.goto(fixture.base+'/?'+new URLSearchParams({q:'낮과 밤이 생기는 까닭을 알려주는 영상',standard:'6과12-02'}));await ready();assert.ok(await page.locator('[data-save]').count());assert.match(await page.locator('#selected-standard').innerText(),/자전/);cases.push('성취기준·자연어 결합');await page.screenshot({path:'docs/r07-19-search-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);await fs.writeFile('docs/r07-19-browser-check.json',JSON.stringify({generatedAt:new Date().toISOString(),cases,errors,paidApiCalls:0},null,2)+'\n');console.log(cases.length,'browser checks passed');
 }finally{await browser?.close();await fixture.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
