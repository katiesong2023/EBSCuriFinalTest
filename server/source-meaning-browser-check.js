const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {createAdminBrowserFixture}=require('./admin-browser-fixture');
const {openBroadcastStore,saveBroadcastPage}=require('./broadcast-store');
(async()=>{
 const fixture=await createAdminBrowserFixture(),cases=[],errors=[];let browser;
 try {
  const db=openBroadcastStore(fixture.broadcastFile);
  saveBroadcastPage(db,{job:'MEANING_TEST',sourceUrl:'https://www.ebs.co.kr/fixture',fetchedAt:new Date().toISOString()},[
   {title:'의미검사 작은 가게',summary:'전라북도 순창군 작은 시골 마을. 결혼 13년 차인 남은 씨는 필리핀 아내 배티 씨와 부부의 연을 맺고 세 딸을 얻었다.'},
   {title:'의미검사 배움 교실',summary:'초등학교에서 이주배경 학생들이 함께 배우고 서로의 언어와 생활 문화를 이해하는 과정을 살펴본다.'}
  ].map((row,i)=>({...row,program:'의미 대조 검사',url:'https://www.ebs.co.kr/tv/show?courseId=960030&stepId=1&lectId='+(960031+i)})));
  db.close();
  const {chromium}=require('/Users/yunseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(fixture.base)?route.continue():route.abort());
  const search=async q=>{await page.goto(fixture.base+'/?'+new URLSearchParams({q,program:'의미 대조 검사'}));await page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');};
  await search('다문화 가족');
  let cards=page.locator('#result-cards > article');
  assert.equal(await cards.count(),1);assert.match(await cards.first().locator('h3').innerText(),/작은 가게/);
  assert.match(await cards.first().locator('.selection-reason').innerText(),/다른 표현으로 찾은 관련 후보/);
  assert.match(await cards.first().locator('[aria-label="검색어와 원문 표현"]').innerText(),/필리핀 아내/);
  assert.match(await cards.first().locator('[aria-label="검색어와 원문 표현"]').innerText(),/가족.*부부/);
  cases.push('다문화 가족의 다른 표현·관계 단서 표시');
  await cards.first().locator('.semantic-details > summary').click();
  await cards.first().locator('.source-description > summary').click();
  const highlighted=(await cards.first().locator('.full-description mark').allTextContents()).join(' ');
  for(const phrase of ['전라북도','필리핀 아내','부부'])assert.ok(highlighted.includes(phrase));
  cases.push('자기 원문에 의미 단서 강조·확인 수준 유지');
  await search('다문화 어린이');cards=page.locator('#result-cards > article');
  assert.equal(await cards.count(),1);assert.match(await cards.first().locator('h3').innerText(),/배움 교실/);
  assert.match(await cards.first().locator('[aria-label="검색어와 원문 표현"]').innerText(),/초등학교|학생/);
  cases.push('어린이를 초등학교·학생 문맥으로 검색');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await cards.first().screenshot({path:'docs/r12-03-meaning-mobile.png'});
  cases.push('390px 원문·의미 단서 표시');
  await search('다문화 가족 유니콘');assert.equal(await page.locator('#result-cards > article').count(),0);
  cases.push('미지의 필수 소재 유지');assert.deepEqual(errors,[]);
  await fs.writeFile('docs/r12-03-meaning-browser.json',JSON.stringify({date:'2026-10-15',passed:cases.length,cases,errors,paidApiCalls:0},null,2)+'\n');
  console.log(cases.length,'의미 검색 화면 검사 통과');
 } finally {await browser?.close();await fixture.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
