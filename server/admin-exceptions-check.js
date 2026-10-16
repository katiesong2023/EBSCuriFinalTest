const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { readDataStore } = require("./data-store");
const { loadEvidenceContext } = require("./automatic-evidence-service");
const { createAutomaticAssetService } = require("./automatic-assets");
const { createAutomaticEvidence } = require("./automatic-evidence");
const { readAutomaticAdminState, automaticSummary } = require("./admin-automatic-state");
const { workState, selectWorkRows } = require("./admin-work-items");
const { getAdminWorkspace, buildRows } = require("./admin-workspace");
const { openAssetStore } = require("./automatic-asset-store");
const { tagResource } = require("./semantic-layer");
const { approvalState, assertApprovalStateUnchanged, checkOperationalWithdrawals } = require("./regression-approval-state");
const cases = [];
const check = async (name, operation) => { await operation(); cases.push({ name, passed: true }); };
const files = ["curi-store.json", "broadcast-catalog.sqlite", "semantic-layer.sqlite", "automatic-assets.sqlite"];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async (file) => [file, crypto.createHash("sha256").update(await fs.readFile(path.join(__dirname, "data", file))).digest("hex")])));
async function main() {
  const before = await hashes(), original = await readDataStore(), dir = await fs.mkdtemp(path.join(os.tmpdir(), "curi-admin-exception-"));
  const originalApprovals = approvalState(original), operationalApprovals = checkOperationalWithdrawals(original);
  const store = structuredClone(original), content = structuredClone(original.contents[0]);
  content.curiId = "TEST-CONTENT"; content.sourceIdentity = { sourceSystem: "EBS_BROADCAST", sourceContentId: "TEST-RESOURCE" };
  Object.assign(content.metadata, { title: "지구의 자전", synopsis: "지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.", variant: "EPISODE", contentLevel: "episode", subjectSeed: "과학", gradeBandSeed: "5~6학년군" });
  content.source.sourceUrl = "https://www.ebs.co.kr/test"; content.sourceVersion = "fixture-v1"; content.lifecycle.isActive = true;
  content.provenance.descriptionSourceUrl = content.source.sourceUrl;
  Object.assign(store, { contents: [content], mappingRuns: [], contentCurriculumMaps: [], verifiedAssets: [], verifiedAssetHistory: [], ingestionRuns: [] });
  const resource = () => ({ id: "TEST-RESOURCE", title: content.metadata.title, summary: content.metadata.synopsis, sourceSystem: "EBS_BROADCAST", variant: "EPISODE", sourceUrl: content.source.sourceUrl, kind: "episode", navigation: { status: "PUBLISHED" } });
  const base = { resources: [resource()], tags: new Map(), mismatches: new Set(), broadcast: { total: 1, programs: [], pages: [] }, failedPages: [] };
  base.tags.set("TEST-RESOURCE", tagResource(base.resources[0]));
  const filename = path.join(dir, "automatic.sqlite"), input = { resourceId: "TEST-RESOURCE", subject: "과학" };
  let generations = 0;
  const service = createAutomaticAssetService({ filename, loadContext: (input) => loadEvidenceContext(input, store, []), generate: (...args) => { generations++; return createAutomaticEvidence(...args); } });
  const snapshot = () => readAutomaticAdminState(store, base, { filename, refresh: service.readLinks });
  try {
    await check("초안 없는 신규 자료도 자동 미처리로 집계·선택적 사람 검토와 분리", async () => {
      const data = await getAdminWorkspace({}, { base, store });
      assert.equal(data.counts.new, 1); assert.equal(data.counts.review, 0); assert.equal(data.statistics.executions, 0);
    });
    await check("등록 어휘 0개인 충분한 소개문은 실제 오류로 분류하지 않음", () => {
      const item = { id: "outside", title: "수선하는 하루", summary: "오래된 가구를 손질하는 장인의 작업 과정을 소개한다." };
      const row = { id: item.id, active: true, sourceStatus: "PUBLISHED", tagCount: 0, inferenceCount: 0 };
      row.work = workState(item, row);
      const data = selectWorkRows([row], {}); assert.equal(data.counts.tags, 1); assert.equal(data.counts.exceptions, 0); assert.equal(data.counts.text, 0);
    });
    await check("원문 부족·인용 실패·상충·미지원·보류 지표 분리와 중복 자료 수", () => {
      const evidence = { standard: { standardId: "6과12-02" }, semantic: { status: "CONFLICT" }, inspection: { status: "FAIL", publicationEligible: false,
        checks: [{ code: "QUOTE_EXISTS", status: "FAIL" }] } };
      const entry = { history: [{}], latest: [{ id: "run", displayState: "CHECKED", currentReasons: [], assets: [], relations: [{ evidence, currentReasons: [] }] }] };
      const row = { id: "one", title: "제목", active: true, sourceStatus: "MISMATCH", tagCount: 0 };
      row.work = workState({ title: "제목", summary: "제목" }, row, entry);
      const data = selectWorkRows([row], {});
      assert.equal(data.total, 1); for (const key of ["source", "citation", "conflict", "text", "inspection", "held"]) assert.equal(data.counts[key], 1, key);
      assert.equal(data.counts.exceptions, 1); assert.equal(row.work.priority, 0);
      evidence.semantic.status = "UNSUPPORTED"; assert.equal(automaticSummary(entry).unsupported, true);
    });
    await check("오류 우선·제목순·최근 검사순·검색어 범위 분모", () => {
      const row = (id, title, priority, lastCheckedAt) => ({ id, title, program: "테스트", work: { priority, reasons: [], automatic: { processed: false, lastCheckedAt } } });
      const rows = [row("normal", "가", 7, "2026-10-05"), row("error", "나", 0, "2026-10-01")];
      assert.equal(selectWorkRows(rows, {}).results[0].id, "error");
      assert.equal(selectWorkRows(rows, { sort: "title" }).results[0].id, "normal");
      assert.equal(selectWorkRows(rows, { sort: "checked" }).results[0].id, "normal");
      assert.equal(selectWorkRows(rows, { q: "없는자료" }).total, 0);
      assert.equal(selectWorkRows(rows, { q: "가" }).counts.all, 1);
      assert.equal(selectWorkRows(rows, { page: "9999" }).page, 1);
    });
    await service.process(input);
    await check("후보·구조 통과·공개 자산·실행 단위와 상세 근거 분리", async () => {
      const automatic = await snapshot(), listing = await getAdminWorkspace({}, { base, store, automatic });
      const detail = await getAdminWorkspace({ id: "TEST-RESOURCE" }, { base, store, automatic });
      assert.equal(listing.counts.new, 0); assert.equal(listing.counts.passed, 1); assert.equal(listing.statistics.executions, 1);
      assert.equal(detail.automatic.latest[0].relations[0].persisted, true); assert.ok(detail.automatic.latest[0].relations[0].evidence.quotes.length);
      assert.equal(detail.resource.approvalStatus, "NOT_ASSESSED");
    });
    await check("검색 준비 실패와 생성/검사 실패를 따로 분류", async () => {
      const db = openAssetStore(filename); db.prepare("UPDATE assets SET search_state='FAILED'").run(); db.close();
      const automatic = await snapshot(), rows = buildRows(base, store, automatic);
      assert.equal(selectWorkRows(rows, { filter: "search" }).total, 1); assert.equal(selectWorkRows(rows, { filter: "failed" }).total, 0);
      await service.prepare(automatic.byResource.get("TEST-RESOURCE").latest[0].id);
    });
    await check("변경 후 목록에서 빠져도 선택 자료 유지·다음/마지막 이동", async () => {
      const automatic = await snapshot();
      const matching = await getAdminWorkspace({ id: "TEST-RESOURCE", filter: "passed" }, { base, store, automatic });
      assert.equal(matching.navigation.matching, true); assert.equal(matching.navigation.next, null);
      const removed = await getAdminWorkspace({ id: "TEST-RESOURCE", filter: "new", cursor: "0" }, { base, store, automatic });
      assert.equal(removed.navigation.matching, false); assert.equal(removed.navigation.next, null); assert.equal(removed.resource.id, "TEST-RESOURCE");
    });
    await check("원문 변경은 이력·인용을 유지하며 현재 변경 예외로 표시", async () => {
      content.metadata.synopsis += " 새 소개문.";
      const automatic = await snapshot(), data = await getAdminWorkspace({ filter: "changed" }, { base, store, automatic });
      assert.equal(data.total, 1); assert.equal(data.results[0].work.automatic.published, 0);
      assert.ok(automatic.byResource.get("TEST-RESOURCE").latest[0].relations[0].currentReasons.includes("SOURCE_CHANGED"));
    });
    await check("100개를 넘는 실행·최신 후보 집계가 이력 API 제한에 잘리지 않음", async () => {
      for (let index = 0; index < 102; index++) { content.sourceVersion = `version-${index}`; await service.process(input); }
      const automatic = await snapshot();
      assert.equal(automatic.totals.runs, 103); assert.equal(automatic.byResource.get("TEST-RESOURCE").history.length, 103);
      assert.equal(automatic.byResource.get("TEST-RESOURCE").latest.length, 1);
      const rows = buildRows(base, store, automatic); assert.equal(rows[0].work.automatic.published, 1);
    });
    await check("자산 저장 실패 재시도는 후보 재생성 없이 현재 버전 대조 후 저장", async () => {
      content.sourceVersion = "save-retry";
      const db = openAssetStore(filename); db.exec("CREATE TRIGGER fail_save BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT,'fixture'); END;"); db.close();
      const before = generations, failed = await service.process(input);
      assert.equal(failed.runs[0].error, "ASSET_SAVE_FAILED"); assert.ok(failed.runs[0].report);
      const unlocked = openAssetStore(filename); unlocked.exec("DROP TRIGGER fail_save"); unlocked.close();
      const retry = await service.process(input); assert.equal(retry.saveStatus, "CHECKED"); assert.equal(generations, before + 1);
    });
    await check("공개 자산 없는 후보 0건도 원문 변경 재검사 대상", async () => {
      content.metadata.synopsis = content.metadata.title;
      await service.process(input); content.metadata.synopsis += " 새 내용이 추가되었다.";
      const automatic = await snapshot();
      assert.equal(automaticSummary(automatic.byResource.get("TEST-RESOURCE")).changed, true);
    });
    await check("원본 없는 실행 실패도 관리 작업에서 사라지지 않음", async () => {
      await service.process({ contentCuriId: "missing-content" });
      const automatic = await snapshot(), data = await getAdminWorkspace({ id: "missing-content" }, { base, store, automatic });
      assert.equal(data.resource.active, false); assert.equal(data.resource.work.automatic.failed, true);
      assert.equal(data.automatic.latest[0].error, "SOURCE_NOT_FOUND");
    });
    await check("기존 원본·현재 승인/취소 이력·자동 DB 변경 없음", async () => { assert.deepEqual(await hashes(), before); assertApprovalStateUnchanged(await readDataStore(), originalApprovals); });
    await fs.writeFile(process.env.CURI_REPORT_PATH || "docs/r09-02-regression-admin-exceptions.json", JSON.stringify({ date: new Date().toISOString(), cases, passed: cases.length, protectedHashes: before, operationalApprovals, storesUnchanged: true, paidApiCalls: 0 }, null, 2) + "\n");
    console.log(`R08-03 관리자 상태·저장 재시도 ${cases.length}개 통과`);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
