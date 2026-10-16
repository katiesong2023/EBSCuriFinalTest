// EBS 공개 프로그램 인벤토리와 각 회차 목록을 수집한다. 미디어·로그인·LLM 호출 없음.
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { openBroadcastStore, saveBroadcastPage, broadcastSummary, fingerprint } = require("./broadcast-store");
const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE || "playwright");
const args = new Map(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const maxRequests = Number(args.get("max-requests") || 1500);
const maxIndexPages = Number(args.get("index-pages") || 100);
const maxPrograms = Number(args.get("programs") || 80);
for (const limit of [maxRequests, maxIndexPages, maxPrograms]) if (!Number.isInteger(limit) || limit < 1) throw new Error("수집 상한 오류");
const root = new URL("../", import.meta.url);
const registryFile = new URL("server/data/broadcast-programs.json", root);
const db = openBroadcastStore();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const parser = await context.newPage();
const startedAt = new Date().toISOString();
const before = broadcastSummary(db);
let requests = 0, lastRequestAt = 0;
const failures = [], outcomes = [], stoppedHosts = new Set();
async function request(url, body) {
  const host = new URL(url).hostname;
  if (stoppedHosts.has(host)) throw new Error(`접근 중단 호스트: ${host}`);
  if (requests >= maxRequests) throw new Error("요청 상한 도달");
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1100 - (Date.now() - lastRequestAt))));
  lastRequestAt = Date.now(); requests += 1;
  const response = await context.request.fetch(url, { method: body ? "POST" : "GET", data: body,
    headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}, timeout: 25000 });
  try {
    if ([401, 403, 429].includes(response.status())) stoppedHosts.add(host);
    if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
    return { html: await response.text(), url: response.url() };
  } finally { await response.dispose(); }
}
async function parse(html, url, mode, program) {
  return parser.evaluate(({ html, url, mode, program }) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const clean = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
    const absolute = (value) => { try { const u = new URL(value, url); if (u.hostname.endsWith(".ebs.co.kr")) u.protocol = "https:"; return u.href; } catch { return ""; } };
    if (mode === "programs") return [...doc.querySelectorAll("li")].filter((li) => li.querySelector(".mainTit")).map((li) => ({
      name: clean(li.querySelector(".mainTit")), homeUrl: absolute(li.querySelector(".mainTit a")?.getAttribute("href")),
      episodeUrl: absolute(li.querySelector(".col2 a")?.getAttribute("href")),
      listedEpisodes: Number(clean(li.querySelector(".col2")).replace(/,/g, "")), category: clean(li.querySelector(".col3"))
    })).filter((p) => p.name && p.episodeUrl.includes("courseId="));
    const found = [];
    for (const a of doc.querySelectorAll("a[href*='lectId=']")) {
      const target = absolute(a.getAttribute("href"));
      const u = new URL(target);
      if (u.searchParams.get("courseId") !== program.courseId || !u.searchParams.get("stepId")) continue;
      const item = a.closest(".half-list__item") || a.closest(".item") || a.closest("li") || a;
      const title = clean(item.querySelector(".half-list__title, .vod_title, .tit_info, .tit, .cnt")) || clean(a.querySelector("p"));
      const summary = clean(item.querySelector(".vod_disk, .stit_info, .con"));
      const date = clean(item.querySelector(".half-list__date, .vod_date, .date_info, .date, .data")) || clean(item).match(/\d{4}[.-]\d{2}[.-]\d{2}/)?.[0];
      if (title) found.push({ title: title.replace(/^\d+\.\s*/, ""), summary, url: target, program: program.name,
        date: date?.match(/\d{4}[.-]\d{2}[.-]\d{2}/)?.[0]?.replaceAll(".", "-") || null });
    }
    // 일반 홈페이지의 공식 fn_view 클릭 계약: 회차 ID와 프로그램/시즌 ID를 함께 보존한다.
    const course = html.match(/var COURSE_ID\s*=\s*'([^']+)'/)?.[1];
    const step = html.match(/var STEP_ID\s*=\s*'([^']+)'/)?.[1];
    if (course === program.courseId && step) for (const a of doc.querySelectorAll("a[onclick*='fn_view(']")) {
      const lect = a.getAttribute("onclick").match(/fn_view\('([^']+)'/)?.[1];
      const li = a.closest("li"); const title = clean(li?.querySelector(".tit_info"));
      if (lect && title) found.push({ title, summary: clean(li.querySelector(".stit_info")), program: program.name,
        date: clean(li.querySelector(".date_info")).replaceAll(".", "-") || null,
        url: `https://www.ebs.co.kr/tv/show?${new URLSearchParams({ courseId: course, stepId: step, lectId: lect })}` });
    }
    const menus = [...doc.querySelectorAll("a[href*='/replay/'][href*='/list']")].map((a) => absolute(a.getAttribute("href")))
      .filter((value) => new URL(value).searchParams.get("courseId") === program.courseId);
    const seasons = [...doc.querySelectorAll(".sell_menu a[data-id]")].map((a) => a.getAttribute("data-id"));
    return { items: [...new Map(found.map((item) => [new URL(item.url).searchParams.get("lectId"), item])).values()], menus: [...new Set(menus)], seasons };
  }, { html, url, mode, program });
}
let registry;
try {
  if (args.has("reuse-inventory")) registry = JSON.parse(await fs.readFile(registryFile, "utf8"));
  else {
    const programs = new Map();
    for (let page = 1; page <= maxIndexPages && requests < maxRequests; page += 1) {
      const url = "https://www.ebs.co.kr/tv/search/programListNew";
      const body = new URLSearchParams({ srchBrdc: "ING,END", srchText: "", srchClsfn: "", pageNum: String(page), mobHmpYn: "N", pcMobileYn: "N", srchSrt: "NEW", listKind: "list", tabKind: "tabProgram", frmWeek: "" }).toString();
      const response = await request(url, body);
      const list = await parse(response.html, response.url, "programs");
      let added = 0;
      for (const p of list) {
        const u = new URL(p.episodeUrl), courseId = u.searchParams.get("courseId");
        if (!programs.has(courseId)) { programs.set(courseId, { ...p, courseId, stepId: u.searchParams.get("stepId"), sourceUrl: url, sourcePage: page, checkedAt: new Date().toISOString() }); added += 1; }
      }
      if (page % 10 === 0) console.log(`프로그램 조사 ${page}페이지 · ${programs.size}개`);
      if (!added && /listEnd/.test(response.html)) break;
    }
    registry = { checkedAt: new Date().toISOString(), sourceUrl: "https://www.ebs.co.kr/tv/program", note: "공식 목록의 프로그램·시즌 단위. listedEpisodes는 EBS 표시 수이며 로컬 적재 실적이 아니다.", programs: [...programs.values()] };
    await fs.writeFile(registryFile, JSON.stringify(registry, null, 2) + "\n");
  }
  if (!args.has("inventory-only")) {
    const priorities = /과학|지구|야생|인체|명의|우주|기후|호기심|동물|자연|생태|환경|비욘드|딩동댕/;
    const eligible = registry.programs.filter((p) => /다큐|과학|사회|역사|생활|문화|어린이|유아|직업|지식/.test(p.category) && p.listedEpisodes > 0 && (!args.get("names") || new RegExp(args.get("names")).test(p.name)));
    eligible.sort((a, b) => Number(priorities.test(b.name)) - Number(priorities.test(a.name)) || b.listedEpisodes - a.listedEpisodes);
    const selected = eligible.slice(Number(args.get("offset") || 0), Number(args.get("offset") || 0) + maxPrograms);
    async function collect(url, program, body, key) {
      if (!/^wide:(show|home):/.test(key) && db.prepare("SELECT 1 FROM pages WHERE job=? AND status='COMPLETE'").get(key) && !args.has("refresh")) return { skipped: true, items: [], menus: [], seasons: [] };
      const response = await request(url, body);
      const parsed = await parse(response.html, response.url, "episodes", program);
      const added = saveBroadcastPage(db, { job: key, sourceUrl: response.url, requestBody: body,
        fetchedAt: new Date().toISOString(), hash: fingerprint(response.html) }, parsed.items);
      return { ...parsed, url: response.url, html: response.html, added };
    }
    for (const program of selected) {
      if (requests >= maxRequests) break;
      const startCount = broadcastSummary(db).total;
      const existing = db.prepare("SELECT program FROM episodes WHERE course_id=? LIMIT 1").get(program.courseId);
      if (existing) program.name = existing.program;
      try {
        const sample = await collect(program.episodeUrl, program, undefined, `wide:show:${program.courseId}`);
        const home = await collect(program.homeUrl, program, undefined, `wide:home:${program.courseId}`);
        const menus = [...new Set([...sample.menus, ...home.menus])];
        for (const menu of menus) {
          if (requests >= maxRequests) break;
          const seenPages = new Set();
          for (let page = 1; page <= Number(args.get("pages-per-program") || 100) && requests < maxRequests; page += 1) {
            const url = new URL(menu); url.searchParams.set("c.page", String(page));
            const result = await collect(url.href, program, undefined, `wide:menu:${program.courseId}:${url.searchParams.get("stepId")}:${page}`);
            if (!result.skipped) {
              const signature = fingerprint(JSON.stringify(result.items.map((item) => item.url)));
              if (!result.items.length || seenPages.has(signature)) break;
              seenPages.add(signature);
            }
          }
        }
        const kidsUrl = [sample.url, home.url].find((url) => url?.includes("anikids.ebs.co.kr"));
        if (kidsUrl) for (const step of new Set([...sample.seasons, ...home.seasons, program.stepId])) {
          for (let page = 1; page <= Number(args.get("pages-per-program") || 100) && requests < maxRequests; page += 1) {
            const body = new URLSearchParams({ courseId: program.courseId, stepId: step, pageNumber: String(page), orderby: "" }).toString();
            const result = await collect("https://anikids.ebs.co.kr/anikids/getVodListAjax", program, body, `wide:kids:${program.courseId}:${step}:${page}`);
            if (!result.skipped && result.items.length < 6) break;
          }
        }
        outcomes.push({ program: program.name, courseId: program.courseId, added: broadcastSummary(db).total - startCount });
        console.log(JSON.stringify({ program: program.name, added: outcomes.at(-1).added, requests, total: broadcastSummary(db).total }));
      } catch (error) { failures.push({ program: program.name, error: error.message }); console.log(`수집 보류 ${program.name}: ${error.message}`); }
    }
  }
} finally {
  const report = { startedAt, finishedAt: new Date().toISOString(), requests, before, after: broadcastSummary(db),
    inventoryPrograms: registry?.programs.length || 0, outcomes, failures, paidApiCalls: 0 };
  await fs.writeFile(new URL("docs/broadcast-expansion.json", root), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ requests, programs: report.inventoryPrograms, total: report.after.total, failures: failures.length }));
  db.close(); await browser.close();
}
