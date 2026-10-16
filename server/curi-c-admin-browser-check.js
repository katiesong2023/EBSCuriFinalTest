// 임시 관리 저장소에서 C 관리자 화면과 기존 로그인/읽기 동선을 확인한다.
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {createAdminBrowserFixture}=require('./admin-browser-fixture');
const {chromium}=require('/Users/yunseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const fixture=await createAdminBrowserFixture();let browser;const layouts=[],errors=[];
 try {
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(fixture.base)?route.continue():route.abort());
  await page.goto(fixture.base+'/admin-login.html');await page.locator('#admin-token').fill(fixture.token);await page.locator('#login-form button').click();await page.waitForURL('**/admin.html');await page.waitForFunction(()=>/현재 저장된/.test(document.querySelector('#request-status')?.textContent));
  const pages=[['admin','/admin.html?q=관리회귀'],['detail','/admin.html?q=관리회귀&id='+fixture.ids[0]],['curriculum','/admin-curriculum.html'],['ingestion','/ingestion.html'],['curimap','/curimap.html'],['login','/admin-login.html'],['legacy','/index.html']];
  for(const [label,path] of pages) {
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});await page.goto(fixture.base+path);await page.evaluate(()=>document.fonts.ready);
    if(['admin','detail'].includes(label))await page.waitForFunction(()=>/현재 저장된|자료 상세를/.test(document.querySelector('#request-status')?.textContent));
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,background:getComputedStyle(document.body).backgroundColor,font:getComputedStyle(document.body).fontFamily}));assert(layout.scroll<=width,JSON.stringify({label,...layout}));assert.equal(layout.background,'rgb(251, 247, 239)');assert.match(layout.font,/Gothic A1/);
    await page.keyboard.press('Control+k');await page.locator('.magazine-palette[open]').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.magazine-palette').open);
    await page.screenshot({path:`docs/r12-20-admin-${label}-${width}.png`,fullPage:true});layouts.push({label,...layout});
   }
  }
  assert.deepEqual(errors,[]);await fs.writeFile('docs/r12-20-admin-check.json',JSON.stringify({layouts,errors,isolatedAdminData:true,actualLoginPassed:true},null,2)+'\n');console.log(layouts.length,'C admin layouts and isolated login passed');
 } finally {await browser?.close();await fixture.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
