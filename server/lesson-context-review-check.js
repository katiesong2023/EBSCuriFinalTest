const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const vm = require('node:vm');
const { createAdminBrowserFixture } = require('./admin-browser-fixture');
async function main() {
  const cases = [], values = new Map(), sandbox = { window: {}, URL, URLSearchParams, AbortSignal, setTimeout,
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  sandbox.globalThis = sandbox; vm.createContext(sandbox);
  for (const name of ['grade-context.js', 'teacher-storage.js']) vm.runInContext(await fs.readFile(`public/${name}`, 'utf8'), sandbox);
  sandbox.CuriTeacher = sandbox.window.CuriTeacher; sandbox.window.GradeContext = sandbox.GradeContext;
  for (const name of ['teacher-guidance.js', 'teacher-evidence.js', 'lesson-context.js']) vm.runInContext(await fs.readFile(`public/${name}`, 'utf8'), sandbox);
  const teacher = sandbox.CuriTeacher;
  const resource = { id: 'REVIEW_CONTEXT', title: '개인 선택 문맥 기능 검사', sourceUrl: 'https://www.ebs.co.kr/fixture', approvedLinks: [], automaticLinks: [],
    teachingContext: { grade: '초4 또는 중1', courses: ['elementary34', 'middle1'], subject: '과학', needsClarification: false } };
  const selected = teacher.newChoice(resource, true), reopened = teacher.choicesFor({ ...resource, selectionContexts: JSON.parse(JSON.stringify([selected])) })[0];
  assert.deepEqual([...teacher.choiceContext(reopened).courses], ['elementary34', 'middle1']); assert.equal(reopened.courseId, '');
  const ambiguous = teacher.newChoice({ ...resource, teachingContext: { ...resource.teachingContext, grade: '1학년', needsClarification: true } }, true);
  assert.equal(teacher.choiceContext(ambiguous).needsClarification, true);
  const approved = { ...resource, curriculumStatus: 'APPROVED', approvedLinks: [{ standardId: '9과01-01', subject: '과학', courseId: 'middle1' }] };
  assert.doesNotMatch(teacher.currentChoiceStatus(approved, ambiguous), /사람 검수 완료/);
  assert.match(teacher.selectionContextsMarkdown({ ...resource, selectionContexts: [ambiguous] }, String).join('\n'), /추가 확인/);
  assert.doesNotMatch(teacher.selectionContextsMarkup({ ...resource, selectionContexts: [selected] }, { targetGrade: '중학교 1학년' }), /class="context-difference" >선택/);
  cases.push('복수 과정·모호한 학년 문맥을 저장/재열기/현재 대조에 그대로 보존');
  const first = { ...resource, teachingContext: { standardId: '6과12-02', standard: '처음 고른 공식 기준의 문장 A', subject: '과학', courses: ['elementary56'], grade: '초등 5~6학년군' } };
  const choice = teacher.newChoice(first, true);
  teacher.setSelectionStandards([{ id: '6과12-03', text: '나중에 고른 공식 기준의 문장 B', subject: '과학', courseId: 'elementary56', courseLabel: '초등 5~6학년군' }]);
  teacher.updateChoice(choice, { dataset: { choiceField: 'standardId' }, value: '6과12-03' });
  const edited = { ...first, selectionContexts: [choice] }, markup = teacher.selectionContextsMarkup(edited, {}), markdown = teacher.selectionContextsMarkdown(edited, String).join('\n');
  assert.equal(choice.snapshot.standardId, '6과12-02'); assert.equal(choice.standardId, '6과12-03');
  assert.match(markup, /당시 공식 기준 원문: 처음 고른 공식 기준의 문장 A/); assert.match(markup, /나중에 고른 공식 기준의 문장 B/);
  assert.match(markdown, /선택 당시 공식 기준 원문: 처음 고른 공식 기준의 문장 A/); assert.match(markdown, /활용 기준: 6과12-03/);
  assert.equal(choice.snapshot.checkedAt, ''); assert.ok(choice.snapshot.capturedAt);
  cases.push('활용 기준 편집 뒤에도 원래 공식 문장을 화면/내보내기에 구분해 보존');

  const fixture = await createAdminBrowserFixture(); let browser;
  try {
    const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CURI_BROWSER_EXECUTABLE });
    const page = await browser.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${fixture.base}/?q=${encodeURIComponent('관리회귀')}`);
    await page.waitForFunction(() => document.querySelector('#result-cards')?.getAttribute('aria-busy') === 'false', {}, { timeout: 60000 });
    for (const id of fixture.ids.slice(0, 2)) await page.locator(`#result-cards [data-save="${id}"]`).click();
    await page.locator('#open-shelf').click();
    await page.waitForFunction(() => ![...document.querySelectorAll('#shelf-items .approval-status')].some((element) => /재확인 중/.test(element.textContent)));
    await page.evaluate(() => { CuriTeacher.download = (filename, lines) => { window.__download = { filename, lines }; }; });
    let release, requestStarted;
    const pending = new Promise((resolve) => { release = resolve; }), started = new Promise((resolve) => { requestStarted = resolve; });
    await page.route('**/api/curi/discover/resources?**', async (route) => { requestStarted(); await pending; await route.continue(); });
    await page.locator('#export-shelf').click(); await started;
    await page.locator(`#shelf-items [data-remove="${fixture.ids[0]}"]`).click();
    assert.equal(await page.locator('#export-shelf').isDisabled(), true);
    await page.locator('#close-shelf').click();
    await page.locator(`#result-cards [data-save="${fixture.ids[2]}"]`).click();
    release(); await page.waitForFunction(() => window.__download);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('curi.discovery.shelf.v1')));
    assert.deepEqual(saved.map((entry) => entry.id).sort(), fixture.ids.slice(1).sort());
    assert.ok(saved.every((entry) => entry.selectionContexts.length));
    const downloaded = await page.evaluate(() => window.__download.lines.join('\n'));
    assert.match(downloaded, /관리회귀 A/); assert.match(downloaded, /관리회귀 B/); assert.doesNotMatch(downloaded, /관리회귀 C/);
    assert.deepEqual(errors, []);
    cases.push('내 자료 내보내기 대기 중 삭제·새 담기 보존 및 클릭 시점 snapshot 출력·중복 요청 차단');
  } finally { await browser?.close(); await fixture.close(); }
  await fs.writeFile('docs/r07-05-review-check.json', JSON.stringify({ checkedAt: new Date().toISOString(), cases, scope: '리뷰에서 발견한 개인 문맥 3개 회귀. 격리 VM·로컬 브라우저 기능 검사이며 실제 교사 평가는 아님.', paidApiCalls: 0 }, null, 2) + '\n');
  console.log(`수업 문맥 리뷰 회귀 ${cases.length}개 통과`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
