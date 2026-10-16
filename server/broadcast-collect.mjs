// 공개 목록의 회차 메타데이터만 누적한다. 로그인·영상·유료 모델 API는 사용하지 않는다.
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { openBroadcastStore, saveBroadcastPage, broadcastSummary, fingerprint } = require("./broadcast-store");
const { applyOfficialDetail } = require("./source-enrichment");
const { parseCsv } = require("./data-store");
const { parseBroadcastList } = require("./broadcast-list-parser");
const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => arg.slice(2).split("=")));
const maxPages = Number(args.get("max-pages") || 1100);
const target = Number(args.get("target") || 5500);
if (!Number.isInteger(maxPages) || maxPages < 1 || !Number.isInteger(target) || target < 1) throw new Error("수집 상한 오류");
const refresh = args.has("refresh");
const searchTerms = (args.get("search") || "").split(",").filter(Boolean);
const enrichLimit = Number(args.get("enrich") || 0);
if (!Number.isInteger(enrichLimit) || enrichLimit < 0 || enrichLimit > 10000) throw new Error("상세 보강 상한 오류");
const db = openBroadcastStore();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const parser = await context.newPage();
let requests = 0;
const startedAt = new Date().toISOString();
const hostTimes = new Map();
const failures = [];
const stoppedHosts = new Set();

async function requestPage(url, body) {
  const host = new URL(url).hostname;
  if (stoppedHosts.has(host)) throw new Error("호스트 접근 중단 상태");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const delay = Math.max(0, 1100 - (Date.now() - (hostTimes.get(host) || 0)));
    await new Promise((resolve) => setTimeout(resolve, delay));
    hostTimes.set(host, Date.now());
    requests += 1;
    try {
      const response = await context.request.fetch(url, { method: body ? "POST" : "GET", data: body || undefined,
        headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}, timeout: 20000 });
      if ([401, 403, 429].includes(response.status())) {
        stoppedHosts.add(host); throw new Error(`접근 중단 HTTP ${response.status()}`);
      }
      if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
      const html = await response.text();
      await response.dispose();
      return html;
    } catch (error) {
      if (stoppedHosts.has(host) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
}

async function parseList(html, sourceUrl, type, program) {
  return parser.evaluate(parseBroadcastList, { html, sourceUrl, type, program });
}

async function collectJob(job) {
  const previous = db.prepare("SELECT status,count FROM pages WHERE job=?").get(job.key);
  if (!refresh && previous?.status === "COMPLETE") return { count: previous.count, added: 0, skipped: true };
  if (requests >= maxPages || (!refresh && !searchTerms.length && broadcastSummary(db).originalEpisodes >= target)) return null;
  const fetchedAt = new Date().toISOString();
  try {
    const html = await requestPage(job.url, job.body);
    const items = await parseList(html, job.url, job.type, job.program);
    if (job.type === "docu" && !items.length && !/itemList/.test(html)) throw new Error("시리즈 목록 구조 미확인");
    if (job.type === "jisike" && !items.length && !/frmSrch/.test(html)) throw new Error("다시보기 목록 구조 미확인");
    const added = saveBroadcastPage(db, { job: job.key, sourceUrl: job.url, requestBody: job.body, fetchedAt, hash: fingerprint(html) }, items);
    if (requests % 25 === 0) console.log(JSON.stringify({ requests, ...broadcastSummary(db) }));
    return { count: items.length, added };
  } catch (error) {
    const message = error.message.split("\n")[0];
    failures.push({ job: job.key, message });
    db.prepare("INSERT OR REPLACE INTO pages VALUES (?,?,?,?,?,?,?,?)").run(job.key, job.url, job.body || null, null, 0, fetchedAt, "FAILED", message);
    console.log(`실패 ${job.key}: ${message}`);
    return null;
  }
}

try {
  const raw = parseCsv(await fs.readFile(`${root}EBS_Curi_FINAL_PACKAGE_v1.4/data/raw/ebs_content_unified_604_with_status.csv`, "utf8"));
  // 공급원별 작업은 독립 실행하되 같은 호스트의 요청은 한 흐름에서 순차 처리한다.
  if (!searchTerms.length && !enrichLimit) await Promise.all([
    (async () => {
      for (const row of raw.filter((item) => item.content_level === "program_series")) {
        const result = await collectJob({ key: `series:${row.record_id}`, url: row.source_url, type: "docu", program: row.program_name });
        if (!result && (requests >= maxPages || stoppedHosts.has("docuprime.ebs.co.kr") || (!refresh && broadcastSummary(db).originalEpisodes >= target))) break;
      }
    })(),
    (async () => {
      for (let page = 1; page <= 369; page += 1) {
        const result = await collectJob({ key: `jisike:${page}`, url: `https://jisike.ebs.co.kr/jisike/replayListNew?c.page=${page}`, type: "jisike", program: "지식채널e" });
        if (!result || result.count === 0 || (!refresh && !result.skipped && result.added === 0)) break;
      }
    })(),
    (async () => {
      for (let page = 1; page <= 700; page += 1) {
        const body = new URLSearchParams({ orderHit: "N", orderSortSeq: "DESC", startDt: "", endDt: "", currentPage: String(page), clsfnId: "", courseId: "", stepId: "", searchText: "", catgryCd1: "", catgryCd2: "", catgryCd3: "", catgryCd4: "" }).toString();
        const result = await collectJob({ key: `travel-all:${page}`, url: "https://home.ebs.co.kr/worldtrip/vodSearchList", body, type: "travel" });
        if (!result || result.count === 0 || (!refresh && !result.skipped && result.added === 0)) break;
      }
    })()
  ]);
  for (const term of searchTerms) {
    for (let page = 1; page <= 10; page += 1) {
      const body = new URLSearchParams({ orderHit: "N", orderSortSeq: "DESC", currentPage: String(page), courseId: "", stepId: "01BP0PAPD0000000022", searchText: term }).toString();
      const result = await collectJob({ key: `travel-search:${term}:${page}`, url: "https://home.ebs.co.kr/worldtrip/vodSearchList", body, type: "travel" });
      if (!result || result.count < 9) break;
    }
  }
  if (enrichLimit) {
    const all = db.prepare(`SELECT e.* FROM episodes e LEFT JOIN link_checks l ON e.id=l.id WHERE ${args.has("retry-details") ? "l.status='MISMATCH'" : "l.id IS NULL"} ORDER BY e.id`).all();
    const chosen = new Map();
    // 지형 비교 후보와 분야별 검색 표본을 우선 보강한다. 무작위 적합성 평가가 아니다.
    const priorities = [/설악|김제|평야|지평선/, /한라산|해안|갯벌|화산|태백산맥/, /민주주의|기후|인구|쓰레기|유관순|전기 회로|헌옷|다문화|고인돌/];
    for (const regex of priorities) for (const row of all.filter((row) => regex.test(row.title)).slice(0, 55)) chosen.set(row.id, row);
    for (const program of new Set(all.map((row) => row.program))) for (const row of all.filter((row) => row.program === program).slice(0, 8)) chosen.set(row.id, row);
    for (const row of all) { if (chosen.size >= enrichLimit) break; chosen.set(row.id, row); }
    const selected = [...chosen.values()].slice(0, enrichLimit);
    const normalize = (text) => text.replace(/<br\s*\/?\s*>/gi, " ").normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    const groups = Map.groupBy(selected, (row) => new URL(row.url).hostname);
    await Promise.all([...groups.values()].map(async (rows) => {
      for (const row of rows) {
        if (requests >= maxPages || stoppedHosts.has(new URL(row.url).hostname)) break;
        const checkedAt = new Date().toISOString();
        try {
          const html = await requestPage(row.url);
          const detail = await parser.evaluate((html) => {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const decode = (value) => { const area = doc.createElement("textarea"); area.innerHTML = value; const first = area.value; area.innerHTML = first; return area.value; };
            let video;
            for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
              try { const value = JSON.parse(script.textContent); if (value['@type'] === 'VideoObject') video = value; } catch {}
            }
            return { title: decode(video?.name || doc.querySelector('meta[property="og:title"]')?.content || ""),
              description: decode(video?.description || doc.querySelector('.player_title_wrap > p')?.textContent || "").trim(),
              url: doc.querySelector('meta[property="og:url"]')?.content || video?.embedUrl || "",
              duration: video?.duration || null };
          }, html);
          applyOfficialDetail(db, row.id, { ...detail, responseHash: fingerprint(html) }, { checkedAt, expectedHash: row.content_hash });
        } catch (error) {
          failures.push({ job: `detail:${row.id}`, message: error.message.split("\n")[0] });
        }
      }
    }));
  }
} finally {
  const report = { startedAt, finishedAt: new Date().toISOString(), requests, target, maxPages,
    ...broadcastSummary(db), failures, paidApiCalls: 0, note: "공식 회차 목록 메타데이터. 목록 제공 주소와 개별 도착 대조는 별도 집계. 재생·학년 적합성 미판정." };
  await fs.writeFile(`${root}docs/${searchTerms.length || enrichLimit ? "broadcast-enrichment" : "broadcast-collection"}.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  db.close(); await browser.close();
}
