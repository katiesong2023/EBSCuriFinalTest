const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { performance } = require("node:perf_hooks");
const { loadDiscoveryCatalog, buildCatalog, safeSourceUrl, catalogPaths } = require("./discovery-catalog");
const { discoverContents } = require("./discovery-search");
const { createCuriMapDraft } = require("./curimap-mapping");

async function run() {
  const storeBefore = await fs.readFile(catalogPaths.store);
  const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
  const catalog = await loadDiscoveryCatalog();
  const cases = [];
  async function check(name, operation) { await operation(); cases.push({ name, passed: true }); }
  await check("카탈로그 단위·중복·출처 계약", async () => {
    assert.ok(catalog.stats.broadcastTitleGroups >= 5000);
    assert.ok(catalog.stats.individual >= 5000);
    assert.equal(catalog.stats.collections, 444);
    assert.equal(new Set(catalog.resources.map((item) => item.id)).size, catalog.resources.length);
    assert.ok(catalog.resources.every((item) => safeSourceUrl(item.sourceUrl)));
    assert.ok(catalog.resources.every((item) => item.curriculumStatus === "NOT_ASSESSED"));
  });
  await check("동고서저 → 동쪽 산지·서쪽 평야 → 일반방송 우선", async () => {
    const result = await discoverContents({ q: "동고서저 관련 클립을 추천해줘" }, catalog);
    assert.ok(result.total >= 9);
    for (const id of ["GEO-SEORAK", "GEO-GIMJE"]) assert.ok(result.results.some((item) => item.id === id));
    // 모집단 증가로 클립이 2페이지가 될 수 있다. 유형 필터에서 식별과 접근을 검증한다.
    assert.ok((await discoverContents({ q: result.query, kind: "clip" }, catalog)).results.some((item) => item.id === "ECLIP-046"));
    assert.equal(result.results[0].kind, "episode");
    assert.deepEqual(result.concepts[0].places.map((item) => item.name), ["설악산", "김제"]);
    assert.equal(result.results[0].playbackStatus, "NOT_CHECKED");
    assert.equal(result.paidApiCalls, 0);
  });
  await check("질문 표현·개념 별칭·장소 필터", async () => {
    const expected = (await discoverContents({ q: "동고서저" }, catalog)).total;
    assert.equal((await discoverContents({ q: "동쪽은 높고 서쪽은 낮은 지형" }, catalog)).total, expected);
    const places = await discoverContents({ q: "동고서저", place: "김제" }, catalog);
    assert.equal(places.total, 1); assert.equal(places.results[0].id, "GEO-GIMJE");
    assert.equal((await discoverContents({ q: "동고서저의 국내 지형" }, catalog)).total, expected);
  });
  await check("화산·해안과 보유 소개문 일반 검색", async () => {
    for (const [q, expected] of [["화산 지형", "GEO-PARK-HALLA"], ["해안 지형", "GEO-PARK-HALLYEO"], ["재활용", "PDLOG-"]]) {
      const result = await discoverContents({ q }, catalog);
      assert.ok(result.results.some((item) => item.id.startsWith(expected)), q);
    }
  });
  await check("엉뚱한 국가·장소 공기·미보유 질문에 결과 억지 채움 없음", async () => {
    for (const q of ["동고서저 뉴질랜드", "양자중력", "<script>alert(1)</script>", "자료 추천해줘"]) assert.equal((await discoverContents({ q }, catalog)).total, 0, q);
    const fixture = structuredClone(catalog);
    fixture.resources.push({ id: "BCAST-FOOD-ONLY", kind: "episode", title: "설악산 근처 맛집", summary: "맛있는 국수와 반찬", program: "음식 방송" });
    const foodOnly = { ...fixture, resources: fixture.resources.filter((item) => item.id === "BCAST-FOOD-ONLY") };
    assert.equal((await discoverContents({ q: "동고서저" }, foodOnly)).total, 0);
  });
  await check("자료 유형·전체 페이지·범위 보정", async () => {
    const first = await discoverContents({}, catalog);
    const ids = new Set();
    for (let page = 1; page <= first.pages; page += 1) {
      for (const item of (await discoverContents({ page: String(page) }, catalog)).results) { assert.ok(!ids.has(item.id)); ids.add(item.id); assert.notEqual(item.kind, "collection"); }
    }
    assert.equal(ids.size, catalog.stats.individual);
    assert.equal((await discoverContents({ kind: "collection" }, catalog)).total, 444);
    assert.ok((await discoverContents({ q: "동고서저", kind: "episode" }, catalog)).total >= 7);
    assert.equal((await discoverContents({ q: "동고서저", page: "999" }, catalog)).page, (await discoverContents({ q: "동고서저" }, catalog)).pages);
  });
  await check("잘못된 조건·위장 출처 거부", async () => {
    for (const input of [{ q: "x".repeat(201) }, { page: "-1" }, { page: "1x" }, { kind: "nonsense" }, { q: "화산", place: "김제" }]) await assert.rejects(discoverContents(input, catalog));
    for (const url of ["javascript:alert(1)", "https://ebs.co.kr.evil.test/a", "https://user:pass@ebs.co.kr/a", "http://ebs.co.kr/a"]) assert.equal(safeSourceUrl(url), null);
    const row = { record_id: "X", title: "중립 제목", synopsis: "", source_url: "https://ebs.co.kr/a", content_level: "episode", subject_primary: "동고서저" };
    const fixture = buildCatalog([row, row], { contents: [] }, { concepts: [], resources: [] });
    assert.equal(fixture.resources.length, 1);
    assert.equal((await discoverContents({ q: "동고서저" }, fixture)).total, 0);
  });
  await check("유료 API 기본 차단: 키 접근·fetch·저장 이전", async () => {
    const previous = process.env.CURI_ALLOW_PAID_API;
    const originalFetch = global.fetch;
    delete process.env.CURI_ALLOW_PAID_API;
    let calls = 0;
    global.fetch = async () => { calls += 1; throw new Error("외부 호출 금지"); };
    try {
      await assert.rejects(createCuriMapDraft({}), (error) => error.code === "PAID_API_DISABLED");
      await discoverContents({ q: "동고서저" });
      assert.equal(calls, 0);
    } finally {
      global.fetch = originalFetch;
      if (previous === undefined) delete process.env.CURI_ALLOW_PAID_API;
      else process.env.CURI_ALLOW_PAID_API = previous;
    }
  });
  await check("가져온 신규·변경·비활성 원본의 검색 반영", async () => {
    const row = { record_id: "EXISTING", title: "이전 제목", synopsis: "낡은 본문", source_url: "https://ebs.co.kr/old", content_level: "episode" };
    const content = (id, active) => ({ sourceIdentity: { sourceContentId: id }, lifecycle: { isActive: active },
      source: { sourceUrl: "https://ebs.co.kr/new" }, metadata: { title: "새로운 하천", synopsis: "변경된 수문환경", contentLevel: "episode", programName: "테스트" }, provenance: { classification: "SOURCE" } });
    const fixture = buildCatalog([row], { contents: [content("EXISTING", true), content("NEW", true), content("INACTIVE", false)] }, { concepts: [], resources: [] });
    assert.equal(fixture.resources.length, 2);
    assert.equal((await discoverContents({ q: "하천" }, fixture)).total, 2);
    assert.equal((await discoverContents({ q: "수문환경" }, fixture)).total, 2);
    assert.equal((await discoverContents({ q: "낡은" }, fixture)).total, 0);
    assert.equal((await discoverContents({ q: "이전" }, fixture)).total, 0);
    assert.ok(fixture.resources.every((item) => item.sourceUrl === "https://ebs.co.kr/new"));
    const inactiveLinked = buildCatalog([row], { contents: [content("EXISTING", false)] }, {
      resources: [], concepts: [{ id: "river", label: "하천", aliases: ["하천"], sourceUrl: "https://ebs.co.kr/a", directResourceIds: ["EXISTING"], places: [] }] });
    assert.equal((await discoverContents({ q: "하천" }, inactiveLinked)).total, 0);
  });

  const port = 20000 + crypto.randomInt(20000);
  const adminToken = crypto.randomBytes(32).toString('hex');
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    cwd: path.resolve(__dirname, ".."), env: { ...process.env, PORT: String(port), NODE_ENV: 'test',
      CURI_ADMIN_TOKEN: adminToken, CURI_ADMIN_ORIGIN: `http://127.0.0.1:${port}`, CURI_ALLOW_PAID_API: "false" }, stdio: ["ignore", "pipe", "pipe"]
  });
  let serverError = "";
  child.stderr.on("data", (chunk) => { serverError += chunk; });
  try {
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("서버 시작 시간 초과")), 10000);
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", () => { clearTimeout(timeout); reject(new Error(`서버 시작 실패: ${serverError}`)); });
      child.stdout.on("data", () => { clearTimeout(timeout); resolve(); });
    });
    await ready;
    const base = `http://127.0.0.1:${port}`;
    await check("실제 HTTP: 홈·검색·HEAD·오류·유료 POST 차단", async () => {
      const home = await fetch(base); assert.equal(home.status, 200); assert.match(await home.text(), /내 수업 준비/);
      const result = await fetch(`${base}/api/curi/discover?q=${encodeURIComponent("동고서저")}`);
      assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal((await result.json()).total, (await discoverContents({ q: "동고서저" }, catalog)).total);
      const head = await fetch(`${base}/api/curi/discover`, { method: "HEAD" }); assert.equal(head.status, 200); assert.equal(await head.text(), "");
      assert.equal((await fetch(`${base}/api/curi/discover?kind=bad`)).status, 400);
      const unauthenticated = await fetch(`${base}/api/curimap/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.equal(unauthenticated.status, 401);
      const login = await fetch(`${base}/api/admin/session`, { method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: adminToken }) });
      assert.equal(login.status, 200);
      const blocked = await fetch(`${base}/api/curimap/draft`, { method: "POST", headers: {
        "Content-Type": "application/json", Origin: base, Cookie: login.headers.get('set-cookie').split(';')[0] }, body: "{}" });
      assert.equal(blocked.status, 403); assert.equal((await blocked.json()).code, "PAID_API_DISABLED");
      assert.equal((await (await fetch(`${base}/api/runtime`)).json()).paidApiEnabled, false);
    });
  } finally { if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } }

  const times = [];
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const start = performance.now(); await discoverContents({ q: ["동고서저", "재활용", "양자중력"][iteration % 3] }); times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  await check("실제 저장소 바이트 불변", async () => assert.equal(digest(await fs.readFile(catalogPaths.store)), digest(storeBefore)));
  const report = { generatedAt: new Date().toISOString(), version: "0.2.0", mode: "LOCAL_DETERMINISTIC_SIMULATION", stats: catalog.stats,
    cases, latency: { samples: times.length, medianMs: +times[14].toFixed(2), p95Ms: +times[28].toFixed(2), includes: "파일 읽기·질문 해석·순위 계산, 브라우저 렌더 제외" },
    paidApiCalls: 0, storeSha256: digest(storeBefore), storeUnchanged: true,
    limitations: ["정답 라벨 기반 추천 정확도·교사 시간 절감 측정이 아니다.", "영상 재생·실제 장면·학년 적합성·원문 최신 접근 상태는 검증하지 않았다.", "새 지리 자료는 공식 페이지 검색 색인 기반 메타데이터이며 콘텐츠 복제본이 아니다."] };
  await fs.writeFile(process.env.CURI_REPORT_PATH || path.join(__dirname, "../docs/local-simulation.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Curi 0.2: ${cases.length}개 시나리오 통과 · 유료 API 0회 · 저장소 변경 없음`);
  console.log(`검색 ${times.length}회 중앙값 ${report.latency.medianMs}ms / p95 ${report.latency.p95Ms}ms`);
  console.log("보고서:", process.env.CURI_REPORT_PATH || "docs/local-simulation.json");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
