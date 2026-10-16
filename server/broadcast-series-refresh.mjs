// 지정한 공식 시리즈만 회차 누락·목록 소개문을 보완한다. 기본은 미리보기이며 유료 모델 호출은 없다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { backup } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { openBroadcastStore, fingerprint } = require('./broadcast-store');
const { applyOfficialListDescription, officialUrl } = require('./source-enrichment');
const { parseBroadcastList, validateSeriesEpisodes } = require('./broadcast-list-parser');
const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE || 'playwright');
const args = new Map(process.argv.slice(2).map(v => { const at = v.indexOf('='); return at < 0 ? [v.slice(2), true] : [v.slice(2, at), v.slice(at + 1)]; }));
const ids = String(args.get('ids') || '').split(',').filter(Boolean);
if (!ids.length || ids.length > 10 || ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id))) throw Error('시리즈 ID 1~10개 필요');
const catalog = await loadDiscoveryCatalog();
const series = ids.map(id => {
  const item = catalog.resources.find(r => r.id === id);
  const url = officialUrl(item?.sourceUrl);
  if (item?.kind !== 'collection' || url?.hostname !== 'docuprime.ebs.co.kr' || !url.pathname.endsWith('/newReplayList') || !url.searchParams.get('courseId') || !url.searchParams.get('stepId')) throw Error('공식 시리즈 목록 식별 실패: ' + id);
  return item;
});
const browser = await chromium.launch({ headless: true, ...(process.env.CURI_BROWSER_EXECUTABLE ? { executablePath: process.env.CURI_BROWSER_EXECUTABLE } : {}) });
const context = await browser.newContext(), parser = await context.newPage();
const report = { applied: args.has('apply'), startedAt: new Date().toISOString(), rows: [], paidApiCalls: 0, whole370Test: 'NOT_RUN_USER_INSTRUCTION' };
const db = openBroadcastStore();
try {
  // 수정 전 SQLite 일관 사본을 남기고 전체 재수집 없이 지정 회차만 갱신한다.
  if (args.has('apply')) { report.backup = path.join(os.tmpdir(), 'curi-series-before-' + Date.now() + '.sqlite'); await backup(db, report.backup); }
  for (const item of series) {
    const response = await context.request.get(item.sourceUrl, { timeout: 20000, maxRedirects: 0 });
    if (response.status() !== 200) throw Error('공식 페이지 HTTP_' + response.status());
    const html = await response.text(); await response.dispose();
    const items = await parser.evaluate(parseBroadcastList, { html, sourceUrl: item.sourceUrl, type: 'docu', program: item.program });
    const sourceText = await parser.evaluate(html => new DOMParser().parseFromString(html, 'text/html').body.textContent, html);
    validateSeriesEpisodes(item.sourceUrl, items);
    const result = { seriesId: item.id, title: item.title, sourceUrl: item.sourceUrl, responseHash: fingerprint(html), episodes: [] };
    if (args.has('apply')) result.added = require('./broadcast-store').saveBroadcastPage(db, { job: 'series:' + item.id, sourceUrl: item.sourceUrl, fetchedAt: new Date().toISOString(), hash: result.responseHash }, items);
    for (const episode of items) {
      const url = new URL(episode.url), id = 'BCAST-' + fingerprint('EBS:' + url.searchParams.get('courseId') + ':' + url.searchParams.get('lectId')).slice(0, 20);
      const row = db.prepare('SELECT * FROM episodes WHERE id=?').get(id);
      const enrichment = args.has('apply') ? applyOfficialListDescription(db, id, { sourceUrl: item.sourceUrl, itemUrl: episode.url, title: episode.title,
        description: episode.summary, sourceText, responseHash: result.responseHash }, { expectedHash: row.content_hash }) : { status: row ? 'EXISTING' : 'MISSING' };
      result.episodes.push({ id, title: episode.title, sourceUrl: episode.url, descriptionLength: episode.summary.length, enrichment });
    }
    report.rows.push(result);
  }
  fs.writeFileSync(String(args.get('report') || 'docs/r12-40-parasitism-source-refresh.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { db.close(); await browser.close(); }
