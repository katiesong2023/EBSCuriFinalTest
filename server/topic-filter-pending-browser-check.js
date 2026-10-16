// 실제 검색 API와 지연/실패 응답으로 이전 검색의 주제 선택지 사용을 방지하는지 확인한다.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const base = process.env.CURI_TEST_BASE || 'http://127.0.0.1:3000';
const files = ['curi-store.json','broadcast-catalog.sqlite','semantic-layer.sqlite','automatic-assets.sqlite','broadcast-semantic-search.sqlite'];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async name=>[name,crypto.createHash('sha256').update(await fs.readFile('server/data/'+name)).digest('hex')])));
(async()=>{
  const before=await hashes(),{chromium}=require(process.env.CURI_PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.CURI_BROWSER_EXECUTABLE});
  const cases=[],errors=[],requests=[],gates=new Map();let failQuery='';
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(120000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(base)&&!route.request().url().includes('thumbnail')?route.continue():route.abort());
    await page.route('**/api/curi/discover?*',async route=>{
      const u=new URL(route.request().url()),q=u.searchParams.get('q');requests.push(u.href);
      if(q===failQuery){failQuery='';await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'검증용 일시 오류'})});return;}
      const gate=gates.get(q);if(gate){gate.enter();await gate.promise;}
      await route.continue().catch(()=>{});
    });
    const ready=()=>page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');
    const submit=async q=>{await page.locator('#search-input').fill(q);await page.locator('#search-form').evaluate(e=>e.requestSubmit());};
    const hold=q=>{let release,enter;const gate={promise:new Promise(r=>release=r),entered:new Promise(r=>enter=r),release:()=>{gates.delete(q);release();},enter:()=>enter()};gates.set(q,gate);return gate;};
    await page.goto(base+'/?'+new URLSearchParams({q:'민주주의'}));await ready();
    assert.equal(await page.locator('#topic-filter option[value="group:curriculum-civic"]').count(),1);
    const gate=hold('갯벌 생태계');await submit('갯벌 생태계');await gate.entered;
    for(const id of ['topic-filter','program-filter','kind-filter'])assert.ok(await page.locator('#'+id).isDisabled());
    const requestCount=requests.length;
    await page.locator('#topic-filter').evaluate(el=>{el.value='group:curriculum-civic';el.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(requests.length,requestCount);gate.release();await ready();
    assert.ok(await page.locator('#topic-filter').isEnabled());assert.equal(await page.locator('#topic-filter').inputValue(),'');
    assert.equal(await page.locator('#topic-filter option[value="group:curriculum-civic"]').count(),0);
    assert.match(await page.locator('#result-count').innerText(),/5/);assert.ok(!await page.locator('#empty-state').isVisible());
    cases.push('새 검색 대기 중 이전 민주주의 주제 차단·갯벌5건/최신 목록 복구');
    const select=async value=>{const [response]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/curi/discover?')),page.locator('#topic-filter').selectOption(value)]);assert.equal(response.status(),200);const data=await response.json();await ready();return data;};
    await page.locator('#additional-filters').evaluate(e=>e.open=true);
    const options=await page.locator('#topic-filter option').evaluateAll(os=>os.filter(o=>o.value).map(o=>({value:o.value,count:Number(o.textContent.match(/\((\d+)건\)/)?.[1])})));
    for(const option of options){const data=await select(option.value);assert.equal(data.total,option.count,option.value);assert.ok(data.total>0);assert.equal(await page.locator('#search-input').inputValue(),'갯벌 생태계');}
    cases.push(`검색 후 ${options.length}개 주제/묶음 전환·표시 건수 일치`);
    await page.locator('[data-clear-filter="topicChoice"]').click();await ready();assert.match(await page.locator('#result-count').innerText(),/5/);
    cases.push('주제 해제 시 검색어 유지·5건 복원');
    failQuery='다문화';await submit('다문화');await ready();assert.ok(await page.locator('#error-state').isVisible());
    assert.ok(await page.locator('#topic-filter').isDisabled());assert.equal(await page.locator('#topic-filter option').count(),1);
    assert.equal(await page.locator('#program-filter option').count(),1);await submit('다문화');await ready();
    assert.ok(!await page.locator('#error-state').isVisible());assert.ok(await page.locator('#topic-filter').isEnabled());assert.match(await page.locator('#result-count').innerText(),/35/);
    cases.push('검색 실패 시 이전 선택지 제거·재시도 후 활성화');
    const older=hold('민주주의');await submit('민주주의');await older.entered;
    const newer=hold('갯벌 생태계');await submit('갯벌 생태계');await newer.entered;older.release();
    assert.ok(await page.locator('#topic-filter').isDisabled());newer.release();await ready();
    assert.equal(await page.locator('#search-input').inputValue(),'갯벌 생태계');assert.ok(await page.locator('#topic-filter').isEnabled());assert.match(await page.locator('#result-count').innerText(),/5/);
    cases.push('이전 요청 취소/늦은 응답이 새 검색의 비활성 상태를 풀지 않음');
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});await page.locator('#additional-filters').evaluate(e=>e.open=true);
      const value=await page.locator('#topic-filter option').evaluateAll(os=>os.find(o=>o.value)?.value);
      const data=await select(value);assert.ok(data.total>0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('#topic-filter').scrollIntoViewIfNeeded();await page.screenshot({path:`docs/r12-26-topic-filter-${width}.png`,fullPage:false});
      await page.locator('[data-clear-filter="topicChoice"]').click();await ready();
    }
    cases.push('1440/390px 실제 주제 선택/해제·가로 넘침0');
    assert.deepEqual(errors,[]);const after=await hashes();assert.deepEqual(after,before);
    await fs.writeFile('docs/r12-26-topic-filter-browser.json',JSON.stringify({checkedAt:new Date().toISOString(),cases,errors,protectedBefore:before,protectedAfter:after,personalStorageWrites:false,paidApiCalls:0},null,2)+'\n');
    console.log(cases.length,'topic filter pending checks passed');
  } finally {for(const gate of gates.values())gate.release();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
