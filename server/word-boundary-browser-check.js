const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {createAdminBrowserFixture}=require('./admin-browser-fixture');
const {openBroadcastStore,saveBroadcastPage}=require('./broadcast-store');
async function main(){const fixture=await createAdminBrowserFixture();let browser;const cases=[],errors=[];try{
 const program='단어경계검증',samples=[['최연소 실험 참가자','어린 참가자의 도전을 소개합니다.'],['연소 실험','연소를 관찰하는 실험입니다.'],['최연소 실험 연구자','불완전연소의 생성물을 관찰하는 실험입니다.']];
 const db=openBroadcastStore(fixture.broadcastFile);saveBroadcastPage(db,{job:'WORD_BOUNDARY',sourceUrl:'https://www.ebs.co.kr/fixture',fetchedAt:new Date().toISOString()},samples.map(([title,summary],i)=>({title,summary,program,url:'https://www.ebs.co.kr/fixture?courseId=930050&stepId=1&lectId='+(930051+i)})));db.close();
 const {chromium}=await import(process.env.CURI_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,executablePath:process.env.CURI_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(fixture.base)?r.continue():r.abort());
 const go=async q=>{await page.goto(fixture.base+'/?'+new URLSearchParams({q,program}));await page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');};
 await go('연소');assert.equal(await page.locator('#result-cards > article').count(),2);assert.doesNotMatch(await page.locator('#result-cards').innerText(),/최연소 실험 참가자/);cases.push('부분 일치 제외·소개문 실제 복합어 유지');
 const api=await fetch(fixture.base+'/api/curi/discover?'+new URLSearchParams({workspace:'teacher',q:'연소',program})).then(r=>r.json());const both=api.results.find(i=>i.title==='최연소 실험 연구자');assert.ok(both);assert.doesNotMatch(both.relevanceReason,/제목에서/);assert.match(both.relevanceReason,/불완전연소/);cases.push('검색 이유의 필드와 복합어 인용 일치');
 await page.locator('[data-save]').first().click();await page.reload();await page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');assert.equal(await page.locator('#shelf-count').innerText(),'1');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));cases.push('모바일·개인 저장 유지');
 await go('실험 연소 제외');assert.equal(await page.locator('#result-cards > article').count(),1);assert.match(await page.locator('#result-cards h3').innerText(),/최연소 실험 참가자/);cases.push('제외 조건의 단어 경계');assert.deepEqual(errors,[]);
 await fs.writeFile('docs/r07-18-browser-check.json',JSON.stringify({generatedAt:new Date().toISOString(),cases,errors,paidApiCalls:0},null,2)+'\n');console.log('단어 경계 화면 '+cases.length+'개 통과');
 }finally{await browser?.close();await fixture.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
