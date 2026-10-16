const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const os = require("node:os");
const { createAutomaticEvidence, checkRelation } = require("./automatic-evidence");
const { readDataStore } = require("./data-store");
const { inspectAutomaticEvidence } = require("./automatic-evidence-service");
const { approvalState, assertApprovalStateUnchanged, checkOperationalWithdrawals } = require("./regression-approval-state");

const cases = [];
const files = ["server/data/curi-store.json", "server/data/broadcast-catalog.sqlite", "server/data/semantic-layer.sqlite"];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async (file) =>
  [file, crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
const clone = (value) => structuredClone(value);
const scienceText = "지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.";
const socialText = "민주주의 선거의 역할을 알아본다. 시민은 투표로 대표를 선출한다. 시민은 선거 참여를 통해 주권을 행사한다.";
function resource(subject, synopsis, extra = {}) {
  return { sourceSystem: "TEST_FIXTURE", sourceContentId: `test-${subject}`, variant: "EPISODE", sourceVersion: "fixture-v1",
    sourceUrl: "https://www.ebs.co.kr/test-fixture", textSourceUrl: "https://www.ebs.co.kr/test-fixture",
    kind: "episode", active: true, title: subject === "사회" ? "민주주의와 선거" : "지구의 자전", synopsis, ...extra };
}

async function check(name, fn) { await fn(); cases.push({ name, passed: true }); }
async function run() {
  const before = await hashes(), store = await readDataStore(), standards = store.curriculumStandards;
  const originalApprovals = approvalState(store), operationalApprovals = checkOperationalWithdrawals(store);
  const subjectOptions = (subject) => ({ subject, gradeBand: "5~6학년군" });
  const inspect = (subject, text, extra = {}, standardList = standards) =>
    createAutomaticEvidence(resource(subject, text, extra), standardList, subjectOptions(subject));
  const selected = (report, subject) => report.relations.find((entry) => entry.standard.standardId === (subject === "사회" ? "6사08-01" : "6과12-02"));
  for (const [subject, text, partial, mentioned, conflict] of [
    ["과학", scienceText, "지구는 자전한다. 관측 자료에서 지구의 자전 모습을 소개한다.",
      "지구의 자전과 낮과 밤이라는 단어를 소개하고 하늘의 모습을 둘러본다.",
      `${scienceText} 지구의 자전과 낮과 밤은 관계가 없다.`],
    ["사회", socialText, "민주주의 선거의 역할을 알아본다. 시민은 투표로 대표를 선출한다.",
      "시민과 민주주의, 선거와 주권이라는 단어가 등장하고 도시의 풍경을 소개한다.",
      `${socialText} 시민의 선거 참여는 주권과 관계가 없다.`]
  ]) {
    await check(`${subject}: 명시적 설명·인용 통과와 전체 성취기준 미확인`, () => {
      const report = inspect(subject, text), relation = selected(report, subject);
      assert.equal(relation.inspection.status, "PASS");
      assert.equal(relation.inspection.semantic.status, "SUPPORTED");
      assert.equal(relation.inspection.semantic.standardCoverage, "PARTIAL");
      assert.ok(relation.inspection.semantic.unconfirmedParts.length);
      assert.equal(relation.inspection.publicationEligible, true);
      assert.equal(relation.inspection.humanReview.status, "NOT_EVALUATED");
      assert.equal(report.persisted, false);
      assert.ok(!JSON.stringify(report.relations).includes('"HUMAN_VERIFIED"'));
      for (const quote of relation.quotes) assert.equal(text.slice(quote.start, quote.end), quote.quote);
    });
    await check(`${subject}: 부분 설명은 미충족 요구와 함께 제한 제공`, () => {
      const relation = selected(inspect(subject, partial), subject);
      assert.equal(relation.inspection.semantic.status, "PARTIAL");
      assert.equal(relation.inspection.semantic.supportedRequirements.length, 1);
      assert.ok(relation.inspection.semantic.unconfirmedParts.length >= 3);
    });
    await check(`${subject}: 단어 동시 등장만으로 관계 통과 금지`, () => {
      const report = inspect(subject, mentioned), relation = selected(report, subject);
      assert.equal(relation.inspection.status, "PASS");
      assert.equal(relation.inspection.semantic.status, "HELD");
      assert.equal(report.summary.publishable, 0);
    });
    await check(`${subject}: 긍정 문장이 있어도 상충·부정은 보류`, () => {
      const relation = selected(inspect(subject, conflict), subject);
      assert.equal(relation.inspection.semantic.status, "CONFLICT");
      assert.equal(relation.inspection.publicationEligible, false);
    });
    await check(`${subject}: 제목뿐·제목 반복·편성/홍보 안내 보류`, () => {
      const title = resource(subject, "").title;
      for (const synopsis of ["", title.repeat(10), `${title}. 많은 시청 바랍니다. 방송 시간은 홈페이지에서 확인하세요.`]) {
        const report = inspect(subject, synopsis);
        assert.equal(report.status, "HELD");
        assert.equal(report.relations.length, 0);
        assert.equal(report.sourceQuality.detailedMappingAllowed, false);
        assert.equal(report.topicDiscovery.availableText, true);
      }
    });
  }
  await check("무관한 일반방송은 고정 기준 보충 없이 후보 0건", () => {
    for (const subject of ["사회", "과학"]) {
      const report = inspect(subject, "배달 현장에서 일하는 사람들의 하루를 따라갑니다.", { title: "배달 현장의 하루" });
      assert.equal(report.relations.length, 0);
      assert.equal(report.hold.code, "NO_RELATED_OFFICIAL_CANDIDATE");
    }
  });
  await check("꿀벌·식물 언급을 꽃가루받이 학습 관계로 보충하지 않음", () => {
    const report = inspect("과학", "꿀벌과 식물이 등장하는 정원의 아름다운 풍경을 소개한다.", { title: "꿀벌과 식물" });
    assert.equal(report.summary.publishable, 0);
    assert.ok(report.relations.every((entry) => entry.inspection.semantic.status === "UNSUPPORTED"));
  });
  await check("다른 공식 기준은 인용 통과와 관계 미지원을 구분", () => {
    const report = inspect("사회", "우리나라 산지와 하천의 위치를 지도에서 확인하고 지형의 분포 특징을 살펴본다.", { title: "우리나라의 산지와 하천" });
    assert.ok(report.relations.length);
    assert.ok(report.relations.every((entry) => entry.inspection.semantic.status === "UNSUPPORTED"));
    assert.equal(report.summary.publishable, 0);
  });
  await check("의문·추측·잘못된 원인 설명은 현재 통과로 제공하지 않음", () => {
    for (const text of ["지구는 자전한다? 지구의 자전 때문에 낮과 밤이 생긴다.",
      "지구는 자전한다. 지구가 자전하므로 낮과 밤이 생길 수 있다.",
      `${scienceText} 지구의 공전 때문에 낮과 밤이 생긴다.`,
      `${scienceText} 위 설명은 사실이 아니다.`,
      "만약 지구가 멈췄다면 지구는 자전한다. 지구의 자전과 낮과 밤을 소재로 상상한다."]) {
      assert.equal(inspect("과학", text).summary.publishable, 0);
    }
  });
  await check("미지원 학년·교과·시리즈는 후보 제공 보류", () => {
    for (const options of [{ subject: "과학", gradeBand: "중2" }, { subject: "국어", gradeBand: "5~6학년군" }]) {
      assert.equal(createAutomaticEvidence(resource("과학", scienceText), standards, options).status, "HELD");
    }
    assert.equal(inspect("과학", scienceText, { kind: "program_series" }).status, "HELD");
  });
  const originalResource = resource("과학", scienceText), original = selected(inspect("과학", scienceText), "과학");
  const context = { resource: originalResource, standards, ...subjectOptions("과학") };
  for (const [name, mutate, code] of [
    ["위조 인용", (p) => { p.quotes[0].quote = "실제 원문에 없는 설명"; }, "QUOTE_EXISTS"],
    ["틀린 위치", (p) => { p.quotes[0].start += 1; }, "QUOTE_EXISTS"],
    ["범위 밖 위치", (p) => { p.quotes[0].end = 99999; }, "QUOTE_POSITION_VALID"],
    ["다른 원문 필드", (p) => { p.quotes[0].field = "title"; }, "QUOTE_POSITION_VALID"],
    ["인용 누락", (p) => { p.quotes = []; }, "QUOTE_REQUIRED"],
    ["잘못된 인용 형식", (p) => { p.quotes = [null]; }, "QUOTE_POSITION_VALID"],
    ["다른 자료 인용", (p) => { p.quotes[0].sourceContentId = "different-id"; }, "QUOTE_IDENTITY_MATCH"],
    ["다른 판본", (p) => { p.source.variant = "COMPILATION_OR_REPEAT"; }, "SOURCE_IDENTITY_MATCH"],
    ["공식 후보 밖 ID", (p) => { p.standard.curriculumCuriId = "invented-standard"; }, "OFFICIAL_CANDIDATE_ALLOWED"],
    ["공식 코드 위조", (p) => { p.standard.standardId = "6과99-99"; }, "OFFICIAL_VERSION_MATCH"],
    ["기준 버전 위조", (p) => { p.standard.curriculumVersion = "2015 개정"; }, "OFFICIAL_VERSION_MATCH"],
    ["규칙 버전 변경", (p) => { p.ruleVersion = "older-rules"; }, "RULE_VERSION_MATCH"],
    ["연결 설명 위조", (p) => { p.semantic.connectedParts = ["모든 학습 내용이 확인됨"]; }, "RELATION_EVIDENCE_MATCH"],
    ["미확인 요구 삭제", (p) => { p.semantic.unconfirmedParts = []; }, "RELATION_EVIDENCE_MATCH"]
  ]) {
    await check(`${name}: 자동 통과 차단`, () => {
      const proposal = clone(original); mutate(proposal);
      const result = checkRelation(proposal, context);
      assert.equal(result.status, "FAIL");
      assert.equal(result.publicationEligible, false);
      assert.equal(result.checks.find((entry) => entry.code === code).status, "FAIL");
    });
  }
  await check("고유한 원본 버전 변경은 과거 통과를 무효로 판정", () => {
    const changed = { ...originalResource, synopsis: `${scienceText} 새로운 소개문 문장이 추가되었다.` };
    const result = checkRelation(original, { ...context, resource: changed });
    assert.equal(result.currentValidity, "STALE");
    assert.equal(result.publicationEligible, false);
  });
  await check("공식 원문 변경은 이전 근거 무효·새 규칙 미지원", () => {
    const changed = clone(standards), standard = changed.find((entry) => entry.metadata.achievementStandardId === "6과12-02");
    standard.metadata.achievementStandard += " 추가된 요구가 있다.";
    assert.equal(checkRelation(original, { ...context, standards: changed }).currentValidity, "STALE");
    assert.equal(selected(inspect("과학", scienceText, {}, changed), "과학").inspection.semantic.status, "UNSUPPORTED");
  });
  await check("공식 출처 필수값 누락·비활성 기준은 통과 금지", () => {
    const changed = clone(standards), standard = changed.find((entry) => entry.metadata.achievementStandardId === "6과12-02");
    standard.source.sourcePdfPage = null;
    assert.equal(inspect("과학", scienceText, {}, changed).summary.publishable, 0);
    standard.lifecycle.isActive = false;
    assert.equal(inspect("과학", scienceText, {}, changed).summary.candidates, 0);
  });
  await check("비활성 자료·다른 출처·알려진 출처 불일치 통과 금지", () => {
    for (const extra of [{ active: false }, { textSourceUrl: "https://example.com" }, { sourceMismatch: true }]) {
      assert.equal(inspect("과학", scienceText, extra).summary.publishable, 0);
    }
  });
  await check("인용 위치는 이모지·줄바꿈이 있는 실제 원문에서 재현", () => {
    const text = `🌍 관측 자료를 소개한다.\n  ${scienceText}`;
    const report = inspect("과학", text);
    assert.equal(report.summary.publishable, 1);
    for (const quote of selected(report, "과학").quotes) assert.equal(text.slice(quote.start, quote.end), quote.quote);
  });
  await check("유사도·confidence·과거 PASS 플래그로 현재 실패를 덮어쓸 수 없음", () => {
    const proposal = clone(original);
    proposal.confidence = 1; proposal.similarity = 1; proposal.inspection = { status: "PASS", publicationEligible: true };
    proposal.quotes[0].quote = "없는 인용문";
    assert.equal(checkRelation(proposal, context).publicationEligible, false);
  });
  await check("관리 서비스는 임의 원문·검사 결과·모호한 ID를 받지 않음", async () => {
    for (const input of [null, {}, [], { contentCuriId: "x", title: "위조" }, { contentCuriId: "x", resourceId: "y" },
      { contentCuriId: "x", inspection: { status: "PASS" } }]) {
      await assert.rejects(inspectAutomaticEvidence(input), (error) => error.statusCode === 400);
    }
  });
  await check("현재·과거 승인 원본 검사: 읽기 전용·취소 보존·새 사람 기록 없음", async () => {
    assertApprovalStateUnchanged(store, originalApprovals);
    for (const id of new Set([...store.verifiedAssets, ...store.verifiedAssetHistory].map((entry) => entry.contentCuriId))) {
      const result = await inspectAutomaticEvidence({ contentCuriId: id });
      assert.equal(result.persisted, false);
      assert.equal(result.paidApiCalls, 0);
    }
    const after = await readDataStore();
    assertApprovalStateUnchanged(after, originalApprovals);
    for (const key of ["verifiedAssets", "mappingRuns", "contentCurriculumMaps", "searchProjection", "verifiedAssetHistory"]) {
      assert.deepEqual(after[key], store[key], key);
    }
  });
  await check("실제 방송 원본 ID: 가져오기 없이 정확한 판본의 제목·소개문 검사", async () => {
    const { readBroadcastResources } = require("./broadcast-store");
    const item = readBroadcastResources().find((entry) => entry.title === "이상한 선거");
    assert.ok(item);
    const result = await inspectAutomaticEvidence({ resourceId: item.id, subject: "사회" });
    assert.equal(result.source.sourceContentId, item.id);
    assert.equal(result.source.variant, item.variant);
    assert.equal(result.source.fields.synopsis, item.summary);
    assert.equal(result.summary.publishable, 0);
    assert.equal(result.persisted, false);
  });
  await httpChecks(store.contents[0].curiId);
  const after = await hashes();
  assert.deepEqual(after, before);
  const report = { date: new Date().toISOString(), passed: cases.length, cases,
    fixtureNote: "관계 긍정/부정 사례는 합성 개발용 텍스트이며 실제 방송의 의미 정확도 평가가 아닙니다.",
    before, after, storesUnchanged: true, existingApprovedAssets: store.verifiedAssets.length, operationalApprovals, paidApiCalls: 0 };
  await fs.writeFile(process.env.CURI_REPORT_PATH || "docs/r09-02-regression-automatic-evidence.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

async function startServer(cwd) {
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer(); socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const selected = socket.address().port; socket.close(() => resolve(selected)); });
  });
  const token = crypto.randomBytes(32).toString("hex"), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], { cwd,
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", CURI_ADMIN_TOKEN: token, CURI_ADMIN_ORIGIN: base, CURI_ALLOW_PAID_API: "false" },
    stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("테스트 서버 시작 시간 초과")), 10000);
      child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`테스트 서버 종료 ${code}: ${stderr}`)); });
    });
    const login = await fetch(`${base}/api/admin/session`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    assert.equal(login.status, 200);
    return { child, base, headers: { Cookie: login.headers.get("set-cookie").split(";")[0], Origin: base, "Content-Type": "application/json" } };
  } catch (error) { child.kill(); throw error; }
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => { child.once("exit", resolve); child.kill(); });
}

async function httpChecks(contentCuriId) {
  const server = await startServer(process.cwd());
  const url = `${server.base}/api/curimap/evidence`;
  try {
    await check("HTTP: 자동 검사 API의 미인증·다른 Origin·메서드 제한", async () => {
      assert.equal((await fetch(url, { method: "POST", body: "{}" })).status, 401);
      assert.equal((await fetch(url, { method: "POST", headers: { ...server.headers, Origin: "https://example.com" }, body: "{}" })).status, 403);
      assert.equal((await fetch(url, { headers: server.headers })).status, 405);
    });
    await check("HTTP: 실제 원본 검사·no-store·형식/없는 자료 오류 구분", async () => {
      const result = await fetch(url, { method: "POST", headers: server.headers, body: JSON.stringify({ contentCuriId }) });
      assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store");
      const report = await result.json(); assert.ok(["HELD", "CHECKED"].includes(report.status)); assert.equal(report.persisted, false);
      assert.equal((await fetch(url, { method: "POST", headers: server.headers, body: "not-json" })).status, 400);
      assert.equal((await fetch(url, { method: "POST", headers: server.headers, body: '{"contentCuriId":"missing"}' })).status, 404);
      assert.equal((await fetch(url, { method: "POST", headers: server.headers, body: JSON.stringify({ contentCuriId, synopsis: scienceText }) })).status, 400);
    });
  } finally { await stopServer(server.child); }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "curi-evidence-failure-"));
  let failing;
  try {
    failing = await startServer(temporary);
    await check("HTTP: 저장소 읽기 실패는 보류·과거 통과와 구분된 FAILED", async () => {
      const result = await fetch(`${failing.base}/api/curimap/evidence`, { method: "POST", headers: failing.headers, body: JSON.stringify({ contentCuriId }) });
      assert.equal(result.status, 500);
      const report = await result.json();
      assert.equal(report.status, "FAILED"); assert.equal(report.code, "EVIDENCE_EXECUTION_FAILED"); assert.deepEqual(report.relations, []);
    });
  } finally { if (failing) await stopServer(failing.child); await fs.rm(temporary, { recursive: true, force: true }); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
