const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

async function main() {
  const listener = net.createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  // 기능 검사 전용 운영자 코드. 환경 파일을 읽거나 기존 서버를 재시작하지 않는다.
  const child = spawn(process.execPath, ["server/server.js"], { cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", CURI_ADMIN_TOKEN: "combined-http-fixture-authorization-20261011", CURI_ALLOW_PAID_API: "false" },
    stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(child, "exit");
  const ready = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => { if (String(chunk).includes(`http://127.0.0.1:${port}`)) resolve(); });
    child.once("error", reject); child.once("exit", () => reject(new Error("격리 HTTP 서버가 시작되지 않았습니다.")));
  });
  const cases = [], rows = [];
  try {
    await Promise.race([ready, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("격리 서버 시작 시간 초과")), 10000); timer.unref(); })]);
    const get = async (query, expected = 200, route = "/api/curi/discover") => {
      const result = await fetch(`http://127.0.0.1:${port}${route}?${query}`, { signal: AbortSignal.timeout(60000) });
      assert.equal(result.status, expected); assert.match(result.headers.get("content-type"), /application\/json/);
      const payload = await result.json(); rows.push({ route, query, status: result.status, total: payload.total ?? null,
        standard: payload.standard?.standardId ?? null, searchMode: payload.searchMode ?? null, error: payload.error ?? null });
      return payload;
    };
    const check = async (name, run) => { await run(); cases.push({ name, passed: true }); };
    await check("공개 교사 API의 세 경우와 전체 목록", async () => {
      const query = await get(new URLSearchParams({ workspace: "teacher", q: "농경문 청동기" })); assert.equal(query.searchMode, "QUERY");
      const standard = await get(new URLSearchParams({ workspace: "teacher", standard: "6사04-01" })); assert.equal(standard.searchMode, "STANDARD");
      const combined = await get(new URLSearchParams({ workspace: "teacher", standard: "6사04-01", q: "농경문 청동기" }));
      assert.equal(combined.searchMode, "COMBINED"); assert.ok(combined.total <= standard.total); assert.ok(combined.total <= query.total);
      assert.equal((await get("workspace=teacher")).searchMode, "ALL");
    });
    await check("학년 차이·공식 원문·선택 관계·필터·페이지 응답", async () => {
      const result = await get(new URLSearchParams({ workspace: "teacher", standard: "6과12-02", q: "지구 자전", grade: "초등 3학년", sort: "newest", description: "present", page: "999" }));
      assert.equal(result.grade, "초등 3학년"); assert.equal(result.standard.courseId, "elementary56"); assert.match(result.contextWarning, /다릅니다/);
      assert.equal(result.page, Math.max(1, result.pages)); assert.ok(result.filters.state.length);
      for (const item of result.results) assert.equal(item.curriculumComparison.standardId, "6과12-02");
    });
    await check("중1 괄호 코드와 자동 비교 미지원은 정상 탐색", async () => {
      const result = await get(new URLSearchParams({ workspace: "teacher", standard: "9사(지리)01-01", q: "사막", grade: "중학교 1학년" }));
      assert.equal(result.standard.ruleSupported, false); assert.equal(result.standard.gradeBand, "1~3학년군");
      assert.equal(result.standard.placement.schoolPlacementConfirmed, false);
    });
    await check("입력 오류와 중복 조건은400·기준을 조용히 해제하지 않음", async () => {
      for (const query of ["workspace=teacher&standard=fake", "workspace=teacher&standard=6사04-01&state=fake", "workspace=teacher&unknown=x",
        "workspace=teacher&standard=6사04-01&standard=6과12-02", "workspace=teacher&standard=6사04-01&page=0", "workspace=teacher&state=UNSUPPORTED",
        "standard=6사04-01"]) {
        assert.ok((await get(query, 400)).error);
      }
    });
    await check("기존 기준 API·일반 API는 유지, 관리자 쓰기는401", async () => {
      assert.equal((await get(new URLSearchParams({ standard: "6사04-01" }), 200, "/api/curi/curriculum")).standard.standardId, "6사04-01");
      const original = await get(new URLSearchParams({ q: "자전" })); assert.equal(original.mode, "LOCAL_SOURCE_DISCOVERY");
      const denied = await fetch(`http://127.0.0.1:${port}/api/admin/automatic-assets`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId: "not-written", standardId: "6사04-01" }) }); assert.equal(denied.status, 401);
    });
    await fs.writeFile("docs/r07-07-http-check.json", JSON.stringify({ checkedAt: new Date().toISOString(), passed: cases.length, cases, rows, paidApiCalls: 0,
      scope: "격리 로컬 서버의 실제 읽기 응답·입력 오류·미인증 쓰기 차단. 통합 화면/교사 효용 검증 아님" }, null, 2) + "\n");
    console.log(`R07-07 HTTP ${cases.length}묶음 통과`);
  } finally { child.kill("SIGTERM"); await exited; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
