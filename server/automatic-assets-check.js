// 합성 문장·임시 저장소의 기능 회귀 검사. 실제 방송의 의미 정확도 평가는 아니다.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { createAutomaticAssetService } = require("./automatic-assets");
const { openAssetStore, backupAssetStore } = require("./automatic-asset-store");
const { publicAsset } = require("./automatic-asset-validity");
const { createAutomaticEvidence } = require("./automatic-evidence");
const { readDataStore } = require("./data-store");
const { teacherCatalog } = require("./teacher-approvals");
const { buildSemanticStore } = require("./semantic-build");
const { approvalState, assertApprovalStateUnchanged, checkOperationalWithdrawals } = require("./regression-approval-state");

const scienceText = "지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.";
const socialText = "민주주의 선거의 역할을 알아본다. 시민은 투표로 대표를 선출한다. 시민은 선거 참여를 통해 주권을 행사한다.";
const cases = [], clone = structuredClone;
const files = ["server/data/curi-store.json", "server/data/broadcast-catalog.sqlite", "server/data/semantic-layer.sqlite"];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async (file) =>
  [file, crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
async function check(name, run) { await run(); cases.push({ name, passed: true }); }

async function main() {
  const before = await hashes(), original = await readDataStore();
  const originalApprovals = approvalState(original), operationalApprovals = checkOperationalWithdrawals(original);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "curi-automatic-check-"));
  let count = 0;
  const fixture = (options = {}) => {
    const filename = path.join(directory, `${count++}.sqlite`);
    const state = { store: clone(original), resource: { sourceSystem: "TEST_FIXTURE", sourceContentId: "AUTO-TEST",
      variant: "EPISODE", sourceVersion: "fixture-v1", sourceUrl: "https://www.ebs.co.kr/fixture", textSourceUrl: "https://www.ebs.co.kr/fixture",
      kind: "episode", active: true, title: "지구의 자전과 민주주의 선거", synopsis: scienceText } };
    const loadContext = async (input) => {
      if (input.resourceId !== "AUTO-TEST") { const error = new Error("없는 원문"); error.statusCode = 404; throw error; }
      const snapshot = clone(state);
      return { ...snapshot, standards: snapshot.store.curriculumStandards, options: { subject: input.subject || "과학", gradeBand: "5~6학년군" } };
    };
    return { filename, state, loadContext, service: createAutomaticAssetService({ filename, loadContext, ...options }) };
  };
  const input = { resourceId: "AUTO-TEST", subject: "과학" };
  try {
    await check("실행·원문·관계·인용·검사·자산·검색 준비 참조와 FK", async () => {
      const { service, filename } = fixture();
      const result = await service.process(input);
      assert.equal(result.saveStatus, "CHECKED"); assert.equal(result.assets.length, 1);
      assert.equal(result.searchPreparation.status, "READY");
      const evidence = result.relations.find((row) => row.id === result.assets[0].relation_id).evidence;
      assert.ok(evidence.quotes.length); assert.ok(evidence.inspection.checks.length >= 13);
      assert.ok(evidence.semantic.unconfirmedParts.length); assert.equal(result.runs[0].report.persisted, true);
      const db = openAssetStore(filename);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(db.prepare("SELECT count(*) n FROM sources").get().n, 1);
      assert.equal(db.prepare("SELECT count(*) n FROM search_projection").get().n, 1);
      assert.throws(() => db.prepare("DELETE FROM sources").run(), /FOREIGN KEY/);
      db.close();
      const [link] = await service.readLinks();
      assert.equal(link.humanVerified, false); assert.equal(link.coverage, "PARTIAL");
      for (const privateKey of ["request", "run_id", "reviewId", "input_hash", "reviewHistory"]) assert.equal(link[privateKey], undefined);
    });
    await check("반복·재시작 후 실행은 기존 실행·자산을 재사용", async () => {
      const { service, filename, loadContext } = fixture();
      const first = await service.process(input);
      const second = await createAutomaticAssetService({ filename, loadContext }).process(input);
      assert.equal(second.runId, first.runId); assert.equal(second.reused, true);
      assert.equal(second.assets[0].id, first.assets[0].id); assert.equal(service.history().runs.length, 1);
    });
    await check("검색 반영 실패에도 저장 유지·생성 없이 검색만 재시도", async () => {
      let fail = true, generations = 0;
      const { service } = fixture({ project: (...args) => { if (fail) throw new Error("fixture index failure"); return publicAsset(...args); },
        generate: (...args) => { generations++; return createAutomaticEvidence(...args); } });
      const first = await service.process(input);
      assert.equal(first.saveStatus, "CHECKED"); assert.equal(first.searchPreparation.status, "FAILED");
      assert.equal(first.assets[0].search_state, "FAILED"); assert.equal((await service.readLinks()).length, 0);
      fail = false; assert.equal((await service.prepare(first.runId)).ready, 1);
      assert.equal(generations, 1); assert.equal((await service.readLinks()).length, 1);
    });
    await check("후보 0건·관계 보류·없는 원문 실패를 미처리와 구분", async () => {
      const { service, state } = fixture();
      state.resource.title = "자료 소개"; state.resource.synopsis = "자료 소개";
      const held = await service.process(input);
      assert.equal(held.saveStatus, "HELD"); assert.equal(held.relations.length, 0); assert.equal(held.assets.length, 0);
      state.resource.title = "지구의 자전"; state.resource.synopsis = "지구의 자전과 낮과 밤이라는 단어를 소개하고 하늘의 모습을 둘러본다.";
      const relationHeld = await service.process(input);
      assert.ok(relationHeld.relations.length); assert.equal(relationHeld.assets.length, 0);
      const failed = await service.process({ resourceId: "missing" });
      assert.equal(failed.saveStatus, "FAILED"); assert.equal(failed.runs[0].error, "SOURCE_NOT_FOUND");
      assert.equal(failed.searchPreparation.status, "NOT_REQUESTED"); assert.equal(service.history().runs.length, 3);
    });
    await check("처리 실패 재시도·부분 실패가 성공 자산을 지우지 않음", async () => {
      let fail = true;
      const { service } = fixture({ generate: (...args) => { if (fail) throw new Error("fixture processing failure"); return createAutomaticEvidence(...args); } });
      const failed = await service.process(input); assert.equal(failed.saveStatus, "FAILED");
      fail = false;
      const retry = await service.process(input); assert.equal(retry.runs[0].retry_of, failed.runId);
      assert.equal(retry.assets.length, 1);
      await service.process({ resourceId: "missing" }); assert.equal((await service.readLinks()).length, 1);
    });
    await check("저장 트랜잭션 중간 실패 시 관계·자산 롤백 후 재개", async () => {
      const { service, filename } = fixture();
      const db = openAssetStore(filename);
      db.exec("CREATE TRIGGER stop_asset BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT,'fixture disk failure'); END;"); db.close();
      const failed = await service.process(input);
      assert.equal(failed.saveStatus, "FAILED"); assert.equal(failed.relations.length, 0); assert.equal(failed.assets.length, 0);
      const reopened = openAssetStore(filename); reopened.exec("DROP TRIGGER stop_asset"); reopened.close();
      assert.equal((await service.process(input)).assets.length, 1);
    });
    await check("동시 실행 거절·임대 종료 후 중단 기록과 재개", async () => {
      let release, started;
      const ready = new Promise((resolve) => { started = resolve; });
      const pause = new Promise((resolve) => { release = resolve; });
      const f = fixture({ generate: async (...args) => { started(); await pause; return createAutomaticEvidence(...args); } });
      const first = f.service.process(input); await ready;
      const other = createAutomaticAssetService({ filename: f.filename, loadContext: f.loadContext });
      await assert.rejects(other.process(input), (error) => error.statusCode === 409);
      const db = openAssetStore(f.filename);
      db.prepare("UPDATE runs SET lease_until='2000-01-01T00:00:00.000Z'").run(); db.close();
      const resumed = await other.process(input); assert.equal(resumed.assets.length, 1);
      release(); const late = await first;
      assert.equal(late.saveStatus, "INTERRUPTED"); assert.equal(other.history().assets.length, 1);
      assert.ok(other.history().events.some((event) => event.type === "INTERRUPTED"));
    });
    await check("검사 중 원문 변경: 오래된 통과는 저장·제공하지 않고 근거 보존", async () => {
      const f = fixture({ generate: (...args) => { const report = createAutomaticEvidence(...args); f.state.resource.synopsis += " 변경된 원문."; return report; } });
      const result = await f.service.process(input);
      assert.equal(result.saveStatus, "STALE"); assert.equal(result.assets.length, 0);
      assert.ok(result.relations.length); assert.equal((await f.service.readLinks()).length, 0);
    });
    for (const [name, mutate] of [
      ["원문", (state) => { state.resource.synopsis += " 원문 변경."; }],
      ["출처 ID", (state) => { state.resource.sourceContentId = "OTHER-ID"; }],
      ["출처 시스템", (state) => { state.resource.sourceSystem = "OTHER-SOURCE"; }],
      ["출처 URL", (state) => { state.resource.sourceUrl += "-new"; }],
      ["판본", (state) => { state.resource.variant = "REPEAT"; }],
      ["비활성화", (state) => { state.resource.active = false; }],
      ["기준 원문", (state) => { state.store.curriculumStandards.find((s) => s.metadata.achievementStandardId === "6과12-02").metadata.achievementStandard += " 새 요구."; }],
      ["기준 비활성화", (state) => { state.store.curriculumStandards.find((s) => s.metadata.achievementStandardId === "6과12-02").lifecycle.isActive = false; }]
    ]) await check(`${name} 변경: 과거 투영 제거·이력 보존`, async () => {
      const { service, state } = fixture(); const saved = await service.process(input);
      mutate(state); assert.equal((await service.readLinks()).length, 0);
      const history = service.history(saved.runId);
      assert.equal(history.assets[0].state, "STALE"); assert.equal(history.assets[0].search_state, "INVALIDATED");
      assert.ok(history.relations.length); assert.ok(history.events.some((event) => event.type === "INVALIDATED"));
    });
    await check("규칙 버전 변경: 저장된 과거 규칙의 통과를 다시 제공하지 않음", async () => {
      const { service, filename } = fixture(); const saved = await service.process(input);
      const row = saved.relations.find((r) => r.id === saved.assets[0].relation_id); row.evidence.ruleVersion = "older-rule";
      const db = openAssetStore(filename); db.prepare("UPDATE relations SET evidence=? WHERE id=?").run(JSON.stringify(row.evidence), row.id); db.close();
      assert.equal((await service.readLinks()).length, 0); assert.equal(service.history().assets[0].reason, "RULE_CHANGED");
    });
    await check("원문 보강 후 새 버전 재검사·이전 버전 이력과 비교", async () => {
      const { service, state } = fixture(); const first = await service.process(input);
      state.resource.synopsis += " 지구의 모습을 소개한다.";
      assert.equal((await service.readLinks()).length, 0);
      const next = await service.process(input);
      assert.notEqual(first.runId, next.runId); assert.notEqual(first.assets[0].id, next.assets[0].id);
      assert.equal(service.history().assets.length, 2); assert.equal((await service.readLinks()).length, 1);
      assert.equal(next.runs[0].retry_of, first.runId);
    });
    await check("한 자료의 기준 하나 변경은 다른 교과 관계를 무효화하지 않음", async () => {
      const { service, state } = fixture(); state.resource.synopsis = `${scienceText} ${socialText}`;
      await service.process(input); await service.process({ ...input, subject: "사회" });
      assert.equal((await service.readLinks()).length, 2);
      state.store.curriculumStandards.find((s) => s.metadata.achievementStandardId === "6과12-02").metadata.achievementStandard += " 변경.";
      const links = await service.readLinks(); assert.equal(links.length, 1); assert.equal(links[0].subject, "사회");
    });
    for (const decision of ["exclude", "edit", "approve"]) await check(`실제 사람 ${decision} 결정 우선·자동 재실행/원문 변경도 덮어쓰지 않음`, async () => {
      const { service, state } = fixture(); const saved = await service.process(input);
      const standardId = saved.relations.find((r) => r.id === saved.assets[0].relation_id).standard_id;
      state.store.contents.push({ curiId: "PERSON-TEST", sourceIdentity: { sourceSystem: state.resource.sourceSystem, sourceContentId: state.resource.sourceContentId }, metadata: { variant: "EPISODE" } });
      state.store.mappingRuns.push({ contentCuriId: "PERSON-TEST", mappingRunId: "PERSON-RUN", reviewHistory: [
        { reviewId: "PERSON-REVIEW", decision, confirmed: true, reviewerRole: "LOCAL_HUMAN_REVIEWER", reviewedAt: "2026-10-05", result: { curriculumCuriIds: decision === "exclude" ? [] : [standardId] } }
      ] });
      state.store.contentCurriculumMaps.push({ mappingRunId: "PERSON-RUN", curriculumCuriId: standardId });
      assert.equal((await service.readLinks()).length, 0);
      state.resource.synopsis += " 원문 보강.";
      const next = await service.process(input); assert.equal(next.assets[0].state, "BLOCKED");
      assert.equal(next.assets[0].human_review_ref, "PERSON-REVIEW"); assert.equal((await service.readLinks()).length, 0);
    });
    await check("정확한 원본·판본만 교사 카드에 연결·같은 제목과 다른 자동 관계로 승인 전파 금지", async () => {
      const { service, state } = fixture(); await service.process(input);
      const links = await service.readLinks(), r = state.resource;
      const item = { id: r.sourceContentId, sourceSystem: r.sourceSystem, variant: r.variant, title: r.title, summary: r.synopsis, sourceUrl: r.sourceUrl };
      const catalog = { resources: [item, { ...item, id: "OTHER" }, { ...item, variant: "REPEAT" }, { ...item, sourceSystem: "OTHER" }] };
      const first = await teacherCatalog(catalog, { verifiedAssets: [] }, links);
      assert.deepEqual(first.resources.map((r) => r.automaticLinks.length), [1, 0, 0, 0]);
      assert.ok(first.resources.every((r) => r.curriculumStatus === "NOT_ASSESSED" && !r.approvedLinks.length));
      const current = await teacherCatalog(catalog, { verifiedAssets: [] }, []);
      assert.equal(current.resources[0].automaticLinks.length, 0);
    });
    await check("시맨틱 전체 재빌드·백업/복원 후에도 자동 실행·자산·이력 유지", async () => {
      const { service, filename, state, loadContext } = fixture(); await service.process(input);
      const history = service.history();
      await buildSemanticStore({ resources: [{ id: "AUTO-TEST", title: state.resource.title, summary: state.resource.synopsis, sourceUrl: state.resource.sourceUrl }], concepts: [] },
        { filename: path.join(directory, "semantic-layer.sqlite"), reportFilename: path.join(directory, "semantic.json") });
      assert.deepEqual(service.history(), history);
      const backup = path.join(directory, "backup.sqlite"); backupAssetStore(backup, filename);
      const restored = createAutomaticAssetService({ filename: backup, loadContext });
      assert.deepEqual(restored.history(), history); assert.equal((await restored.readLinks()).length, 1);
      assert.throws(() => backupAssetStore(backup, filename));
    });
    await check("실제 원본 방송 2건: 수동 가져오기·AI 초안 없이 보류·검사 결과 영구 보존", async () => {
      const filename = path.join(directory, "raw.sqlite"), service = createAutomaticAssetService({ filename });
      for (const [id, subject] of [["BCAST-4280dd3cf2aaac6c3584", "과학"], ["BCAST-d356777fc3abba17bae4", "사회"]]) {
        assert.ok(!original.contents.some((item) => item.sourceIdentity.sourceContentId === id));
        const result = await service.process({ resourceId: id, subject });
        assert.ok(["HELD", "CHECKED"].includes(result.saveStatus)); assert.equal(result.assets.length, 0);
        assert.equal(result.runs[0].report.source.sourceContentId, id);
      }
      assert.equal(createAutomaticAssetService({ filename }).history().runs.length, 2);
    });
    await check("현재 승인·취소 이력·승인 검색과 저장 파일 불변", async () => {
      const latest = await readDataStore(); assertApprovalStateUnchanged(latest, originalApprovals);
      for (const key of ["verifiedAssets", "verifiedAssetHistory", "mappingRuns", "contentCurriculumMaps", "searchProjection"]) assert.deepEqual(latest[key], original[key]);
      assert.deepEqual(await hashes(), before);
    });
    const report = { date: new Date().toISOString(), passed: cases.length, cases, protectedHashes: before, storesUnchanged: true,
      operationalApprovals, paidApiCalls: 0, note: "자동 저장·무효화 기능 회귀 검사이며 합성 통과 사례를 실제 방송 정확도로 해석하지 않습니다." };
    await fs.writeFile(process.env.CURI_REPORT_PATH || "docs/r09-02-regression-automatic-assets.json", JSON.stringify(report, null, 2) + "\n");
    console.log(`R08-02 저장·무효화 계약 ${cases.length}개 통과 · 현재 승인/취소 이력과 원본 불변`);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
