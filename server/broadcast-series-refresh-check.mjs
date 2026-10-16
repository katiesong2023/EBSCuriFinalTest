import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseBroadcastList, validateSeriesEpisodes } = require('./broadcast-list-parser');
const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CURI_BROWSER_EXECUTABLE ? { executablePath: process.env.CURI_BROWSER_EXECUTABLE } : {}) });
const cases = [], sourceUrl = 'https://docuprime.ebs.co.kr/docuprime/newReplayList?courseId=1&stepId=2';
try {
  const page = await browser.newPage();
  const html = `<script>window.injected=true</script><p>시리즈 전체 설명을 회차에 복사하면 안 된다.</p><ul id="itemList">
  <li><a href="/docuprime/vodReplayView?courseId=1&amp;stepId=2&amp;lectId=3"><span class="tit_info">서로 다른 관계 1부</span><span class="stit_info">첫 회차에서 공생을 관찰한다.</span><span class="item_info">5 2023.02.20</span></a></li>
  <li><a href="/docuprime/vodReplayView?courseId=1&amp;stepId=2&amp;lectId=4"><span class="tit_info">서로 다른 관계 2부</span><span class="stit_info">둘째 회차에서 기생을 관찰한다.</span><span class="item_info">6 2023.02.21</span></a></li></ul>`;
  const items = await page.evaluate(parseBroadcastList, { html, sourceUrl, type: 'docu', program: '합성 다큐' });
  assert.equal(items.length, 2); assert.equal(items[0].date, '2023-02-20'); validateSeriesEpisodes(sourceUrl, items); cases.push('개별 회차 제목·날짜·식별 URL 대조');
  assert.equal(items[0].summary, '첫 회차에서 공생을 관찰한다.'); assert.equal(items[1].summary, '둘째 회차에서 기생을 관찰한다.'); assert(!items[0].summary.includes('시리즈 전체')); cases.push('시리즈 전체 설명과 다른 회차 본문 전파 없음');
  assert.equal(await page.evaluate(() => window.injected), undefined); cases.push('공식 원문에 포함된 스크립트 실행 없음');
  for (const url of ['https://example.com/watch?courseId=1&stepId=2&lectId=3','https://docuprime.ebs.co.kr/vodReplayView?courseId=9&stepId=2&lectId=3','https://docuprime.ebs.co.kr/vodReplayView?courseId=1&stepId=9&lectId=3','https://docuprime.ebs.co.kr/vodReplayView?courseId=1&stepId=2']) assert.throws(() => validateSeriesEpisodes(sourceUrl, [{ ...items[0], url }])); cases.push('비공식 주소·다른 강좌/시리즈·회차 ID 누락 차단');
  const travel = await page.evaluate(parseBroadcastList, { html: '<a href="replayView?lectId=5"><span class="cnt">지역의 생활</span><span class="tit">합성 기행</span><span class="data">2024.01.02</span></a>', sourceUrl: 'https://home.ebs.co.kr/worldtrip/replayList', type: 'travel', program: '' }); assert.equal(travel[0].program, '합성 기행'); assert.equal(travel[0].title, '지역의 생활'); cases.push('기존 기행 목록 파싱 보존');
  const jisike = await page.evaluate(parseBroadcastList, { html: '<div class="vodmeta"><a href="vodReplayView?lectId=6"><span class="tit">권리</span><span class="con">차별을 살펴본다.</span><span class="view">2024.03.04</span></a></div>', sourceUrl: 'https://jisike.ebs.co.kr/jisike/replayListNew', type: 'jisike', program: '합성 지식' }); assert.equal(jisike[0].summary, '차별을 살펴본다.'); cases.push('기존 지식채널 목록 소개문 파싱 보존');
  fs.writeFileSync('docs/r12-40-parasitism-source-checks.json', JSON.stringify({ passed: cases.length, failed: 0, cases, paidCalls: 0, whole370Test: 'NOT_RUN_USER_INSTRUCTION' }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: cases.length, failed: 0, paidCalls: 0 }));
} finally { await browser.close(); }
