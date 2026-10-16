const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createAdminBrowserFixture } = require('./admin-browser-fixture');
const cases = [], errors = [];
const check = async (name, run) => { await run(); cases.push({name,passed:true}); console.log('통과:',name); };
const hashes = async () => Object.fromEntries(await Promise.all(['curi-store.json','broadcast-catalog.sqlite','semantic-layer.sqlite','automatic-assets.sqlite'].map(async name => [name,crypto.createHash('sha256').update(await fs.readFile(`server/data/${name}`)).digest('hex')])));
async function main() {
  const before = await hashes(), fixture = await createAdminBrowserFixture(); let browser;
  try {
    const {chromium} = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({headless:true,executablePath:process.env.CURI_BROWSER_EXECUTABLE});
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*',r => r.request().url().startsWith(fixture.base) ? r.continue() : r.abort());
    const page = await context.newPage(); page.on('pageerror',e => errors.push(e.message));
    const ready=()=>page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');
    const visit=async params=>{await page.goto(`${fixture.base}/?${new URLSearchParams(params)}`);await ready();assert.equal(await page.locator('#error-state').isVisible(),false);};
    const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('curi.discovery.shelf.v1')));
    const shelfReady=()=>page.waitForFunction(()=>![...document.querySelectorAll('#shelf-items .approval-status')].some(e=>e.textContent.includes('재확인 중')));
    const first=()=>page.locator('#shelf-items [data-choice]').first();
    await check('선택 기준 요구/내용/인용/남은 요구·일반 검색 이유 구분·운영 집계 제거',async()=>{
      await visit({q:'지구 자전',standard:'6과12-02',grade:'3'});
      const card=page.locator(`#result-cards > article[data-id="${fixture.ids[0]}"]`);
      await card.locator('.curriculum-details > summary').click();
      assert.match(await card.locator('.curriculum-comparison').innerText(),/콘텐츠가 제공하는 내용.*정확한 인용.*남은 요구/s);
      assert.match(await card.locator('.curriculum-comparison').innerText(),/영상.*학생.*별도/s);
      assert.ok(await card.locator('.requirement-comparison blockquote').count()>0);
      const response=await fetch(`${fixture.base}/api/curi/discover?workspace=teacher&standard=6과12-02`).then(r=>r.json());
      const item=response.results.find(i=>i.id===fixture.ids[0]);
      for(const requirement of item.curriculumComparison.requirementComparisons)for(const quote of requirement.quotes)assert.equal(item.summary.slice(quote.start,quote.end),quote.quote);
      assert.equal(await page.locator('#catalog-stats').count(),0);
      assert.ok(await page.locator('a[href="/admin-curriculum.html"]').count()>0);
      await card.locator('[data-save]').click();
      const choice=(await saved())[0].selectionContexts[0]; assert.equal(choice.standardId,'6과12-02'); assert.equal(choice.targetGrade,'all');
      assert.equal(choice.courseLabel,'초등 5~6학년군'); assert.ok(choice.snapshot.label.startsWith('선택 기준 6과12-02:'));
    });
    await check('확인 상태7종·다른 기준 이력·공식 보조 원문 범위·현재 실패 경계',async()=>{
      const result=await page.evaluate(()=>{
        const labels={UNSUPPORTED:'해당 기준의 자동 비교 미지원',TITLE_ONLY:'제목 후보만 있음',DESCRIPTION_LOW:'소개문 부족',CONCEPT_ONLY:'관련 개념만 확인',PARTIAL_SUPPORTED:'일부 요구를 뒷받침하는 설명 확인',INTERPRETATION_HELD:'표현 해석 보류',EXPLICIT_CONFLICT:'요구와 명확한 상충'};
        const item={id:'SCOPE_UI',title:'범위 검사',sourceUrl:'https://www.ebs.co.kr/test',curriculumStatus:'APPROVED',approvedLinks:[{standardId:'6과12-03',subject:'과학',courseId:'elementary56',standard:'다른 기준',reason:'다른 기준 기록'}],automaticLinks:[],teachingContext:{standardId:'6과12-02',subject:'과학',courses:['elementary56']}};
        const states=Object.entries(labels).map(([state,label])=>CuriTeacher.evidenceMarkup({...item,curriculumComparison:{standardId:'6과12-02',state,label,ruleSupport:{label:'일부 요구의 비교'},sourceQuality:{label:'원문 상태'},requirementComparisons:[]}}));
        const supplement=CuriTeacher.quoteMarkup({field:'supplement',sourceLabel:'공식 보도자료',quote:'보조 문서 발췌',start:0,end:9,sourceUrl:'https://www.ebs.co.kr/test',documentTitle:'공식 문서',location:'문단1',originalStart:20,originalEnd:29,evidencePurpose:'DISCOVERY_ONLY'});
        const failed=CuriTeacher.evidenceMarkup(CuriTeacher.unconfirmedResource({...item,curriculumComparison:{standardId:'6과12-02',label:'과거 부분 근거'}},'FAILED'));
        return {states,labels:Object.values(labels),supplement,failed};
      });
      result.states.forEach((markup,index)=>{assert.ok(markup.includes(result.labels[index]));assert.ok(markup.includes('다른 기준의 확인 기록'));assert.ok(markup.includes('선택 기준 6과12-02의 확인이나 승인에 포함되지 않습니다'));});
      assert.match(result.supplement,/후보 발견 근거.*자동 요구 판정과 별도/);assert.match(result.supplement,/공식 보조 문서 원문/);
      assert.match(result.failed,/확인 실패/);assert.doesNotMatch(result.failed,/과거 부분 근거|curriculum-comparison/);
    });
    await check('같은 기준의 다른 수업 대상은 별도 선택 이유·기존 목표 유지',async()=>{
      const result=await page.evaluate(()=>{
        const current=CuriTeacher.readShelf(),item={...current[0],evidenceRefresh:'CURRENT',selectionContexts:undefined};
        let local=CuriTeacher.toggleShelfSelection([],item); local[0].selectionContexts[0].lessonGoal='초3 개인 목표';
        const other={...item,teachingContext:{...item.teachingContext,targetGrade:'중학교 1학년'}};
        local=CuriTeacher.toggleShelfSelection(local,other);
        return {count:local[0].selectionContexts.length,first:local[0].selectionContexts[0],second:local[0].selectionContexts[1],saved:CuriTeacher.hasShelfSelection(other,local)};
      });
      assert.equal(result.count,2);assert.equal(result.first.lessonGoal,'초3 개인 목표');assert.equal(result.second.targetGrade,'중학교 1학년');assert.equal(result.saved,true);
      assert.equal(result.first.courseLabel,result.second.courseLabel);
    });
    await check('내 자료에서 목표/활용/추가 내용·개인 확인 편집·복수 선택 이유 보존',async()=>{
      await page.locator('#open-shelf').click(); await shelfReady();
      await first().locator('summary').first().click();
      await first().locator('[data-choice-field="lessonGoal"]').fill('낮과 밤의 원인을 설명한다');
      await first().locator('[data-choice-field="usePart"]').fill('자전 설명 문장');
      await first().locator('[data-choice-field="additionalContent"]').fill('손전등 모형 활동');
      const personal=first().locator('.personal-assessments > details').first();await personal.locator('summary').click();
      await personal.locator('[data-assessment-field="status"]').selectOption('PERSONAL_REVIEW');
      await personal.locator('[data-assessment-field="note"]').fill('교사 개인 난이도 판단');
      await page.locator('#shelf-items [data-add-choice]').click();
      const second=page.locator('#shelf-items [data-choice]').nth(1); await second.locator('[data-choice-field="standardId"]').selectOption('6과12-03');
      await second.locator('[data-choice-field="lessonGoal"]').fill('별자리의 계절 변화와 비교');
      const choices=(await saved())[0].selectionContexts;assert.equal(choices.length,2);assert.equal(choices[0].lessonGoal,'낮과 밤의 원인을 설명한다');
      assert.equal(choices[0].assessments.difficulty.status,'PERSONAL_REVIEW');assert.equal(choices[1].standardId,'6과12-03');assert.equal(choices[1].snapshot.standardId,'6과12-02');
      assert.match(await second.locator('.choice-target').innerText(),/미지정/);
    });
    await check('검색 조건 변경·재열기와 폴더 담기·공식 학년군/개인 대상 구분',async()=>{
      await page.locator('#close-shelf').click(); await page.locator('#clear-standard').click(); await ready();
      await page.reload();await ready();await page.locator('#open-shelf').click();await shelfReady();
      assert.equal(await page.locator('#shelf-items [data-choice]').count(),2);await first().locator('summary').first().click();
      assert.equal(await first().locator('[data-choice-field="lessonGoal"]').inputValue(),'낮과 밤의 원인을 설명한다');
      assert.match(await first().locator('.choice-grade').innerText(),/5~6/);assert.match(await first().locator('.choice-target').innerText(),/미지정/);
      await page.locator('#shelf-dialog a[href="/lesson.html"]').click();
      await page.locator('#new-folder-title').fill('통합 검색 수업');await page.locator('#create-folder button').click();
      await page.locator('#add-videos').click();await page.locator('[data-add]').click();await page.locator('#close-add').click();
      assert.equal(await page.locator('.folder-video').count(),1);assert.equal(await page.locator('.folder-video [data-choice]').count(),2);
      await page.locator('.folder-video [data-choice]').first().locator('summary').first().click();
      assert.equal(await page.locator('.folder-video [data-choice-field="lessonGoal"]').first().inputValue(),'낮과 밤의 원인을 설명한다');
      await page.reload();assert.equal(await page.locator('.folder-video [data-choice]').count(),2);
      await page.locator('#find-more').click();await ready();await page.locator('#open-shelf').click();await shelfReady();
    });
    await check('조회 지연·실패·저장 실패/재시도에서도 입력과 선택 snapshot 유지',async()=>{
      await first().locator('summary').first().click();const snapshot=(await saved())[0].selectionContexts[0].snapshot;
      await page.route('**/api/curi/discover/resources?*',async r=>{await new Promise(resolve=>setTimeout(resolve,350));await r.continue();});
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await first().locator('[data-choice-field="lessonGoal"]').fill('갱신 중 편집한 목표');await page.waitForTimeout(600);
      assert.equal(await first().locator('[data-choice-field="lessonGoal"]').inputValue(),'갱신 중 편집한 목표');
      await page.unroute('**/api/curi/discover/resources?*');await page.route('**/api/curi/discover/resources?*',r=>r.abort());
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.querySelector('#shelf-items [data-choice-current]').textContent.includes('확인 실패'));
      assert.deepEqual((await saved())[0].selectionContexts[0].snapshot,snapshot);
      await page.evaluate(()=>{window.__saveShelf=CuriTeacher.saveShelf;CuriTeacher.saveShelf=()=>false;});
      await first().locator('[data-choice-field="lessonGoal"]').fill('저장 실패 중에도 남길 목표');
      assert.equal(await page.locator('#retry-shelf-save').isVisible(),true);
      assert.equal(await first().locator('[data-choice-field="lessonGoal"]').inputValue(),'저장 실패 중에도 남길 목표');
      await page.evaluate(()=>CuriTeacher.saveShelf=window.__saveShelf);await page.locator('#retry-shelf-save').click();
      assert.equal((await saved())[0].selectionContexts[0].lessonGoal,'저장 실패 중에도 남길 목표');await page.unroute('**/api/curi/discover/resources?*');
    });
    await check('내보내기 실패·재시도·도중 편집·개인 기록/복수 기준 Markdown',async()=>{
      await page.evaluate(()=>{CuriTeacher.download=(filename,lines)=>window.__download={filename,lines};});
      await page.route('**/api/curi/discover/resources?*',r=>r.abort());await page.locator('#export-shelf').click();
      await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('다운로드하지 않았습니다'));
      assert.equal(await page.evaluate(()=>window.__download),undefined);assert.equal((await saved())[0].selectionContexts.length,2);
      await page.unroute('**/api/curi/discover/resources?*');await page.route('**/api/curi/discover/resources?*',async r=>{await new Promise(resolve=>setTimeout(resolve,350));await r.continue();});
      await page.locator('#export-shelf').click();await first().locator('[data-choice-field="lessonGoal"]').fill('내보내기 중 새 목표');
      await page.waitForFunction(()=>window.__download);const markdown=await page.evaluate(()=>window.__download.lines.join('\n'));
      assert.match(markdown,/이번 수업 목표: 저장 실패 중에도 남길 목표/);assert.match(markdown,/6과12-03/);assert.match(markdown,/개인 확인/);
      assert.equal((await saved())[0].selectionContexts[0].lessonGoal,'내보내기 중 새 목표');assert.equal(await first().locator('[data-choice-field="lessonGoal"]').inputValue(),'내보내기 중 새 목표');assert.equal(await first().evaluate(e=>e.open),true);
      await page.unroute('**/api/curi/discover/resources?*');
    });
    await check('관리자 집계 경로·권한·모바일 문맥 입력',async()=>{
      assert.equal((await fetch(`${fixture.base}/api/admin/workspace`)).status,401);
      assert.equal((await fetch(`${fixture.base}/api/admin/automatic-assets`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
      await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('#shelf-dialog').screenshot({path:'docs/r07-09-shelf-mobile.png'});
    });
    assert.deepEqual(errors,[]);assert.deepEqual(await hashes(),before);
    await fs.writeFile('docs/r07-09-context-check.json',JSON.stringify({date:new Date().toISOString(),cases,errors,protectedHashes:before,paidApiCalls:0,scope:'임시 복제 서버·합성 방송·공식 기준과 개인 문맥 연결. 사람 승인/교사 의미 평가 아님'},null,2)+'\n');
  } finally {await browser?.close();await fixture.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
