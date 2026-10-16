// 공개 페이지에 실제 있는 식별자만 수집한다. 영상·서명 URL·로그인 정보는 저장하지 않는다.
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { parseCsv } = require("./data-store");
const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const rows = parseCsv(await fs.readFile(`${root}EBS_Curi_FINAL_PACKAGE_v1.4/data/raw/ebs_content_unified_604_with_status.csv`, "utf8"));
const normalize = (text) => text.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
const records = [];
const failures = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.route("**/*", (route) => ["media", "image", "font"].includes(route.request().resourceType()) || /\.(mp4|m3u8)(\?|$)/.test(route.request().url()) ? route.abort() : route.continue());
async function open(url, operation) {
  const page = await context.newPage();
  try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }); return await operation(page); }
  catch (error) { failures.push({ url, reason: error.message.split("\n")[0] }); return []; }
  finally { await page.close(); }
}
try {
  if (process.argv.includes("--verify-pending")) {
    const previous = JSON.parse(await fs.readFile(`${root}server/data/source-link-audit.json`, "utf8"));
    records.push(...previous.records);
    failures.push(...previous.failures);
  } else {
  const clipRows = rows.filter((row) => row.content_level === "clip");
  for (const url of new Set(clipRows.map((row) => row.source_url))) {
    const candidates = await open(url, (page) => page.locator("a[onclick^='mainClipChange']").evaluateAll((elements) => elements.map((element) => {
      const match = element.getAttribute("onclick").match(/^mainClipChange\('([^']+)','([^']+)','([^']+)'/);
      return match ? { title: element.textContent.trim(), clipId: match[1], courseId: match[2], lectureId: match[3] } : null;
    }).filter(Boolean)));
    for (const row of clipRows.filter((item) => item.source_url === url)) {
      const matched = candidates.filter((item) => normalize(item.title) === normalize(row.title));
      if (matched.length !== 1) { failures.push({ id: row.record_id, reason: `제목 일치 ${matched.length}건` }); continue; }
      const target = new URL(url);
      target.searchParams.set("lectureId", matched[0].lectureId); target.searchParams.set("clipId", matched[0].clipId);
      records.push({ id: row.record_id, title: row.title, originalUrl: url, url: target.href, kind: "CLIP", clipId: matched[0].clipId, status: "IDENTIFIER_FOUND" });
    }
    console.log(`클립 목록: ${records.length}건 식별`);
  }
  for (let pageNo = 1; pageNo <= 5; pageNo += 1) {
    const url = `https://docuprime.ebs.co.kr/docuprime/replay/202/list?courseId=40049722&stepId=60053813&c.page=${pageNo}`;
    const candidates = await open(url, (page) => page.locator(".tit_info").evaluateAll((elements) => elements.map((element) => {
      const href = element.closest("li")?.querySelector("a")?.getAttribute("href");
      return href ? { title: element.textContent.trim(), url: new URL(href.replace(/\s/g, ""), location.href).href } : null;
    }).filter(Boolean)));
    for (const candidate of candidates) {
      const number = candidate.title.match(/^(\d+)화/);
      if (!number) continue;
      const id = `PDLOG-${number[1].padStart(3, "0")}`;
      const row = rows.find((item) => item.record_id === id);
      if (!row || normalize(row.title) !== normalize(candidate.title.replace(/^\d+화\s*/, "")) || records.some((item) => item.id === id)) continue;
      records.push({ id, title: row.title, originalUrl: row.source_url, url: candidate.url, kind: "EPISODE", status: "IDENTIFIER_FOUND" });
    }
    console.log(`PD로그 목록 ${pageNo}/5: ${records.filter((item) => item.kind === "EPISODE").length}건 식별`);
  }
  }
  // 새 탭에서 선택된 본문을 대조한다. 목록에 제목이 있다는 것만으로 일치 처리하지 않는다.
  let next = 0;
  const pending = records.filter((record) => record.status !== "MATCHED" && ["CLIP", "EPISODE"].includes(record.kind));
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < pending.length) {
      const record = pending[next++];
      const result = await open(record.url, async (page) => {
        if (record.kind === "CLIP") {
          const selectedId = await page.locator("#course_play_area").getAttribute("data-clipId", { timeout: 6000 });
          return selectedId === record.clipId;
        }
        const heading = await page.locator(".player_title_wrap > strong").first().textContent({ timeout: 6000 });
        return normalize(heading.trim().replace(/^\d+화\s*/, "")) === normalize(record.title) &&
          new URL(page.url()).searchParams.get("lectId") === new URL(record.url).searchParams.get("lectId");
      });
      record.status = result === true ? "MATCHED" : "UNCONFIRMED";
      record.checkedAt = new Date().toISOString();
      if (next % 20 === 0) console.log(`도착 페이지 대조 ${next}/${pending.length}`);
    }
  }));
  const geography = JSON.parse(await fs.readFile(`${root}server/data/discovery-geography.json`, "utf8"));
  for (const url of new Set(geography.resources.map((item) => item.sourceUrl))) {
    const matched = await open(url, async (page) => {
      const text = normalize(await page.locator("body").textContent());
      return geography.resources.filter((item) => item.sourceUrl === url).map((item) => {
        const term = item.id === "GEO-SEORAK" ? "설악이어라" : item.id === "GEO-GIMJE" ? "지평선이야기" : item.title;
        return { id: item.id, title: item.title, originalUrl: url, url: page.url(),
          kind: item.id === "GEO-SEORAK" ? "INTRO" : item.id === "GEO-GIMJE" ? "PRODUCT_LIST" : "LESSON_LIST",
          status: text.includes(normalize(term)) ? "MATCHED" : "UNCONFIRMED", checkedAt: new Date().toISOString() };
      });
    });
    for (const record of matched) {
      const previous = records.findIndex((item) => item.id === record.id);
      if (previous >= 0) records[previous] = record;
      else records.push(record);
    }
  }
  const store = JSON.parse(await fs.readFile(`${root}server/data/curi-store.json`, "utf8"));
  for (const record of records.filter((item) => item.status === "MATCHED")) {
    const content = store.contents.find((item) => item.sourceIdentity.sourceContentId === record.id && normalize(item.metadata.title) === normalize(record.title));
    // 승인 원문의 주소를 덮어쓰지 않고, 대조 시점의 주소와 수정 주소의 대응만 기록한다.
    if (content) record.storedOriginalUrl = content.source.sourceUrl;
  }
  const artifact = { checkedAt: new Date().toISOString(), method: "공식 목록 식별자 추출 후 새 탭의 선택 클립 ID 또는 본문 제목 대조", playbackVerified: false, records, failures };
  await fs.writeFile(`${root}server/data/source-link-audit.json`, JSON.stringify(artifact, null, 2) + "\n");
  console.log(JSON.stringify({ found: records.length, matched: records.filter((item) => item.status === "MATCHED").length, unconfirmed: records.filter((item) => item.status !== "MATCHED").length, failures: failures.length }));
} finally { await browser.close(); }
