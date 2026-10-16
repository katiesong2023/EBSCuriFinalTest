// 실제 수집물의 무결성과 임시 DB의 반복 적재·실패 복구·검색 규모를 확인한다.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { performance } = require("node:perf_hooks");
const { DatabaseSync } = require("node:sqlite");
const { broadcastPath, openBroadcastStore, saveBroadcastPage, broadcastSummary, fingerprint } = require("./broadcast-store");
const { loadDiscoveryCatalog, catalogPaths } = require("./discovery-catalog");
const { discoverContents } = require("./discovery-search");

async function main() {
  const before = fingerprint(await fs.readFile(catalogPaths.store));
  const actual = new DatabaseSync(broadcastPath, { readOnly: true });
  const rows = actual.prepare("SELECT * FROM episodes ORDER BY id").all();
  const summary = broadcastSummary(actual);
  assert.ok(summary.distinctProgramTitles >= 5000);
  assert.equal(new Set(rows.map((row) => row.identity)).size, rows.length);
  for (const row of rows) {
    const url = new URL(row.url);
    assert.equal(url.protocol, "https:");
    assert.ok(url.hostname.endsWith(".ebs.co.kr"));
    const news = require('./news-source').newsIdentity({url:row.url,newsIdentity:JSON.parse(row.payload).newsIdentity});
    assert.equal(row.identity, `EBS:${news?.courseId || url.searchParams.get("courseId")}:${news?.lectId || url.searchParams.get("lectId")}`);
    assert.ok(row.title && row.program && row.source_url && row.content_hash);
  }
  assert.equal(actual.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.equal(actual.prepare("SELECT count(*) n FROM episode_text").get().n, rows.length);
  assert.equal(actual.prepare("SELECT count(*) n FROM link_checks l JOIN episodes e ON l.id=e.id WHERE l.status='MATCHED' AND (l.title<>e.title OR l.url<>e.url)").get().n, 0);
  const items = rows.map((row) => ({ title: row.title, program: row.program, summary: row.synopsis, url: row.url, newsIdentity: JSON.parse(row.payload).newsIdentity, date: row.broadcast_date }));
  const page = { job: "fixture:1", sourceUrl: rows[0].source_url, fetchedAt: new Date().toISOString(), hash: fingerprint("fixture") };
  const db = openBroadcastStore(":memory:");
  try {
    assert.equal(saveBroadcastPage(db, page, items.slice(0, 2)), 2);
    assert.equal(saveBroadcastPage(db, page, items.slice(0, 2)), 0);
    assert.equal(broadcastSummary(db).total, 2);
    const prior = db.prepare("SELECT * FROM episodes ORDER BY id LIMIT 1").get();
    db.prepare("INSERT INTO link_checks VALUES (?,?,?,?,?,?)").run(prior.id, prior.title, prior.url, "MATCHED", page.fetchedAt, JSON.stringify({ description: prior.synopsis }));
    const source = items.find((item) => item.url === prior.url);
    saveBroadcastPage(db, page, [{ ...source, summary: "" }]);
    assert.equal(db.prepare("SELECT synopsis FROM episodes WHERE id=?").get(prior.id).synopsis, prior.synopsis);
    const alias = new URL(source.url); alias.hostname = "home.ebs.co.kr"; alias.pathname = "/alias";
    saveBroadcastPage(db, { ...page, sourceUrl: "https://www.ebs.co.kr/new-list", fetchedAt: "2099-01-01" }, [{ ...source, url: alias.href, summary: "" }]);
    const preserved = db.prepare("SELECT * FROM episodes WHERE id=?").get(prior.id);
    assert.equal(preserved.url, prior.url);
    assert.equal(db.prepare("SELECT status FROM link_checks WHERE id=?").get(prior.id).status, "MATCHED");
    if (prior.synopsis) {
      assert.equal(JSON.parse(preserved.payload).synopsisSourceUrl, prior.url);
      assert.equal(JSON.parse(preserved.payload).synopsisCheckedAt, page.fetchedAt);
    }
    saveBroadcastPage(db, page, [{ ...source, title: "변경된 제목" }]);
    assert.equal(db.prepare("SELECT count(*) n FROM link_checks").get().n, 0);
    assert.equal(broadcastSummary(db).total, 2);
    saveBroadcastPage(db, page, [{ ...source, title: "소개문 없는 새 제목", summary: "" }]);
    assert.equal(db.prepare("SELECT synopsis FROM episodes WHERE id=?").get(prior.id).synopsis, "");
    assert.equal(db.prepare("SELECT synopsis FROM episode_text WHERE id=?").get(prior.id).synopsis, "");
    const duplicateTitle = new URL(source.url); duplicateTitle.searchParams.set("lectId", "fixture-another-id");
    saveBroadcastPage(db, { ...page, job: "fixture:2" }, [{ ...source, url: duplicateTitle.href }]);
    assert.equal(broadcastSummary(db).total, 3, "같은 제목의 다른 회차 ID를 원본에서 지우면 안 됨");
    assert.throws(() => saveBroadcastPage(db, { ...page, job: "fixture:failed" }, [items[2], { ...items[3], url: "https://example.com/wrong" }]));
    assert.equal(broadcastSummary(db).total, 3, "실패 페이지의 일부 항목까지 롤백");
    assert.equal(db.prepare("SELECT count(*) n FROM pages WHERE job='fixture:failed'").get().n, 0);
    saveBroadcastPage(db, { ...page, job: "fixture:empty" }, []);
    assert.equal(broadcastSummary(db).total, 3, "빈 목록·부분 수집으로 기존 회차를 삭제하지 않음");
    assert.equal(db.prepare("SELECT status FROM pages WHERE job='fixture:1'").get().status, "COMPLETE");
  } finally { db.close(); }

  const catalog = await loadDiscoveryCatalog();
  const programs = ["지식채널e", "한국기행", "EBS 다큐프라임"];
  for (const program of programs) {
    const result = await discoverContents({ program }, catalog);
    assert.ok(result.total > 0);
    assert.ok(result.results.every((item) => item.program === program));
  }
  await assert.rejects(discoverContents({ program: "없는 프로그램" }, catalog));
  const queries = {};
  for (const q of ["동고서저", "민주주의", "기후 변화", "화산 지형", "해안 지형"]) {
    const result = await discoverContents({ q }, catalog);
    queries[q] = result.total;
    assert.ok(result.total > 0);
  }
  const benchmarks = [];
  for (const size of [500, 2000, 5000]) {
    const scratch = openBroadcastStore(":memory:");
    const start = performance.now();
    saveBroadcastPage(scratch, page, items.slice(0, size));
    const importAndIndexMs = +(performance.now() - start).toFixed(2);
    assert.equal(scratch.prepare("SELECT count(*) n FROM episode_text").get().n, size);
    assert.ok(scratch.prepare("SELECT count(*) n FROM episode_text WHERE episode_text MATCH ?").get('"한국기행" OR "지식채널e" OR "다큐프라임"').n > 0);
    scratch.close();
    const sample = { ...catalog, resources: catalog.resources.filter((item) => item.id.startsWith("BCAST-")).slice(0, size) };
    const times = [];
    for (let n = 0; n < 30; n += 1) {
      const started = performance.now();
      await discoverContents({ q: Object.keys(queries)[n % 5] }, sample);
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    benchmarks.push({ size, localImportAndFtsIndexMs: importAndIndexMs, queryMedianMs: +times[14].toFixed(2), queryP95Ms: +times[28].toFixed(2) });
  }
  const baseline = JSON.parse(await fs.readFile(require.resolve("../docs/classroom-before-expansion.json"), "utf8"));
  const current = JSON.parse(await fs.readFile(require.resolve("../docs/classroom-simulation.json"), "utf8"));
  assert.equal(fingerprint(await fs.readFile(catalogPaths.store)), before);
  const report = { generatedAt: new Date().toISOString(), summary, catalog: catalog.stats, queries, benchmarks,
    methodology: "500/2000/5000건 실제 수집물의 임시 메모리 SQLite 재적재·FTS 색인과 캐시된 메모리 카탈로그 검색 각 30회. 외부 수집 시간·HTTP·화면 렌더는 벤치마크에 포함하지 않음. 제품 질의는 현재 메모리 검색이며 FTS로 처리했다고 주장하지 않음.",
    collectionPages: actual.prepare("SELECT substr(job,1,instr(job,':')-1) source,count(*) pages FROM pages GROUP BY source").all(),
    titleRepeatedAsDescription: actual.prepare("SELECT count(*) n FROM episodes WHERE title=synopsis").get().n,
    verifiedContracts: ["공식 회차 ID·DB 무결성", "중복 재실행", "빈 소개문 보존", "확인된 URL·소개문 출처·확인일 보존", "변경된 링크 대조 무효화", "다른 ID·같은 제목 원본 보존", "실패 페이지 전체 롤백", "빈 수집의 기존 항목 삭제 방지", "완료 체크포인트", "프로그램 조건", "5개 주제 검색", "실제 승인 저장소 불변"],
    classroomBefore: baseline.summary, classroomAfter: current.summary,
    paidApiCalls: 0, storeUnchanged: true, storeSha256: before };
  actual.close();
  await fs.writeFile(require("node:path").join(__dirname, "../docs/broadcast-simulation.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ total: summary.total, distinctProgramTitles: summary.distinctProgramTitles, queries, benchmarks, storeUnchanged: true, paidApiCalls: 0 }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
