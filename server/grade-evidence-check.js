const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { findCandidates } = require("./candidate-retrieval");
const { fingerprint, getEligibleStandards, reconcileVerifiedAssets } = require("./data-quality");
const { loadEvidenceContext } = require("./automatic-evidence-service");
const { createAutomaticEvidence, standardSnapshot, checkRelation } = require("./automatic-evidence");
const { validateAsset } = require("./automatic-asset-validity");
const { createAutomaticAssetService } = require("./automatic-assets");
const { createHumanReviewService } = require("./human-review");
const { reviewValidity } = require("./human-review-contract");
const { summarizeGradeEvidence } = require("./grade-evidence-summary");
const { readAutomaticAdminState } = require("./admin-automatic-state");
const { summarize } = require("./curriculum-discovery");
const { parseGradeRequest } = require("../public/grade-context");

const cases = [];
const check = async (name, run) => { await run(); cases.push({ name, passed: true }); };
const clone = structuredClone;
const protectedFiles = ["curi-store.json", "broadcast-catalog.sqlite", "semantic-layer.sqlite", "automatic-assets.sqlite"];
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async (file) => [file,
  crypto.createHash("sha256").update(await fs.readFile(path.join(__dirname, "data", file))).digest("hex")])));
// 실제 성취기준/사람 판단이 아닌 격리된 계약 시험용 문장이다.
const fixtureText = "지구의 자전과 하천 지형을 관찰하고 지역 환경의 특징을 비교한다.";
function expandedStandard(template, id, courseId, subject) {
  const standard = clone(template);
  Object.assign(standard, { curiId: `CURI-CURR-2022-${id}`, sourceIdentity: { sourceSystem: "MOE_2022_CURRICULUM", sourceStandardId: id },
    provenance: { classification: "SOURCE" }, review: { status: "SOURCE_CHECKED", humanConfirmed: false } });
  Object.assign(standard.metadata, { achievementStandardId: id, achievementStandard: fixtureText, unitTitle: "합성 지구와 환경", subject, courseId,
    schoolLevel: courseId === "middle1" ? "중학교" : "초등학교", gradeBand: courseId === "middle1" ? "1~3학년군" : "3~4학년군" });
  standard.source.contentFingerprint = fingerprint([id, fixtureText]);
  standard.source.documentSha256 = fingerprint("합성 공식 문서 지문 · 실제 원문 아님");
  standard.placement = { version: "fixture-placement-v1", status: "REFERENCE_MAPPED", schoolPlacementConfirmed: false,
    courseId, sourceUrl: "https://mid.ebs.co.kr/course/view?courseId=fixture", checkedAt: "2026-10-10", note: "합성 편성 근거 · 실제 매핑 아님" };
  return standard;
}
function legacySnapshot(standard) {
  const snapshot = { curriculumCuriId: standard.curiId, sourceSystem: standard.sourceIdentity?.sourceSystem,
    sourceStandardId: standard.sourceIdentity?.sourceStandardId, standardId: standard.metadata.achievementStandardId,
    requirement: standard.metadata.achievementStandard, subject: standard.metadata.subject,
    gradeBand: standard.metadata.gradeBand, curriculumVersion: standard.curriculumVersion,
    document: standard.source?.sourceDocument, page: standard.source?.sourcePdfPage, sourceFingerprint: standard.source?.contentFingerprint };
  return { ...snapshot, evidenceHash: fingerprint(snapshot) };
}

async function main() {
  const before = await hashes(), original = JSON.parse(await fs.readFile(path.join(__dirname, "data/curi-store.json"), "utf8"));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "curi-grade-evidence-"));
  const legacy = original.curriculumStandards.filter((standard) => standard.metadata.gradeBand === "5~6학년군");
  const additions = [expandedStandard(legacy[0], "4사01-01", "elementary34", "사회"), expandedStandard(legacy[0], "4과01-01", "elementary34", "과학"),
    expandedStandard(legacy[0], "9사(지리)01-01", "middle1", "사회"), expandedStandard(legacy[0], "9과01-01", "middle1", "과학")];
  const store = clone(original); store.curriculumStandards = [...legacy, ...additions];
  const content = clone(original.contents[0]);
  content.curiId = "GRADE-FIXTURE"; content.sourceIdentity = { sourceSystem: "EBS_TEST", sourceContentId: "GRADE-FIXTURE" };
  Object.assign(content.metadata, { title: "합성 지구와 환경", synopsis: fixtureText, subjectSeed: "과학", gradeBandSeed: "초등 5학년", contentLevel: "episode", variant: "EPISODE" });
  content.source.sourceUrl = "https://www.ebs.co.kr/grade-fixture"; content.provenance.descriptionSourceUrl = content.source.sourceUrl;
  store.contents.push(content);
  const target = { contentCuriId: content.curiId }, middle = additions[3], middleInput = { ...target, standardId: middle.metadata.achievementStandardId };
  try {
    await check("여섯 과정·교과 구간의 공식 범위와 후보가 교차하지 않음", () => {
      for (const [grade, course] of [["초등 3학년", "elementary34"], ["초등 6학년", "elementary56"], ["중1", "middle1"]]) {
        for (const subject of ["사회", "과학"]) {
          const eligible = getEligibleStandards(store.curriculumStandards, subject, grade);
          assert.ok(eligible.length, `${grade} ${subject}`);
          assert.ok(eligible.every((item) => (item.metadata.courseId || "elementary56") === course));
          const result = findCandidates({ ...target, subject, gradeBand: grade }, store);
          assert.ok(result.candidates.every((item) => (item.courseId || "elementary56") === course));
          if (course !== "elementary56") assert.equal(result.candidates.length, 1);
        }
      }
    });
    await check("광범위 기존 표기는 기존5~6만 유지·중1과 중학 전체를 구별", () => {
      for (const gradeBand of ["초등고~고등", "중등~고등"]) {
        const result = findCandidates({ ...target, subject: "과학", gradeBand }, store);
        assert.equal(result.retrievalScope.courseId, "elementary56"); assert.ok(result.retrievalScope.contextNote);
        assert.ok(result.candidates.every((candidate) => !candidate.courseId));
      }
      for (const gradeBand of ["초등 1학년", "중2", "1~3학년군"]) assert.equal(findCandidates({ ...target, subject: "과학", gradeBand }, store).hold.code, "UNSUPPORTED_GRADE_BAND");
    });
    await check("공식 코드·교과·학교급·학년군과 선언 과정의 충돌 거절", () => {
      const disguised = clone(legacy[0]); disguised.metadata.courseId = "elementary34";
      assert.equal(getEligibleStandards([disguised], "사회", "초4").length, 0);
      for (const change of [{ subject: "사회" }, { schoolLevel: "초등학교" }, { gradeBand: "3~4학년군" }, { courseId: "elementary56" }]) {
        const changed = clone(middle); Object.assign(changed.metadata, change);
        assert.equal(getEligibleStandards([changed]).length, 0);
      }
    });
    await check("서로 다른 학교급 열거는 각각 보존하고 이종 범위는 미확인", () => {
      for (const text of ["초4, 중1", "초등 4학년과 중학교 1학년", "초4/중1"]) {
        const parsed = parseGradeRequest(text);
        assert.equal(parsed.needsClarification, false); assert.deepEqual(parsed.courses, ["elementary34", "middle1"]);
      }
      assert.equal(parseGradeRequest("초4~중1").needsClarification, true);
    });
    await check("현재 승인 집계는 탐색 후보 밖 자산도 세고 다른 교과·과정은 제외", () => {
      const rows = [{ plan: { standardId: "6과12-02", subject: "과학", courseId: "elementary56" }, candidates: [], total: 0, counts: {} }];
      const links = [
        { standardId: "6과12-02", subject: "과학", grade: "5~6학년군" },
        { standardId: "6과12-02", subject: "사회", grade: "5~6학년군" },
        { standardId: "6과12-02", subject: "과학", courseId: "middle1", grade: "1~3학년군" }
      ];
      const result = summarize(rows, links.map((link, index) => ({ id: `summary-${index}`, approvedLinks: [link] })));
      assert.equal(result.candidateRelations, 0); assert.equal(result.humanApprovedRelations, 1);
    });
    await check("선택 기준의 과정이 방송 기존 학년보다 우선·충돌은 거절", async () => {
      const context = await loadEvidenceContext(middleInput, store, []);
      assert.equal(context.options.gradeBand, "middle1"); assert.equal(context.resource.gradeBand, "초등 5학년");
      await assert.rejects(loadEvidenceContext({ ...middleInput, gradeBand: "초등 5학년" }, store, []), /일치/);
      await assert.rejects(loadEvidenceContext({ ...middleInput, subject: "사회" }, store, []), /일치/);
      await assert.rejects(loadEvidenceContext({ ...middleInput, gradeBand: "1~3학년군" }, store, []), /일치/);
    });
    await check("편성 미확인·공식 원문 대조 누락은 중1 지원으로 계산하지 않음", () => {
      for (const mutate of [(standard) => { standard.placement.status = "UNCONFIRMED"; },
        (standard) => { delete standard.placement.version; }, (standard) => { standard.review.status = "REVIEW_REQUIRED"; },
        (standard) => { delete standard.source.documentSha256; }]) {
        const changed = clone(middle); mutate(changed);
        assert.equal(getEligibleStandards([changed], "과학", "중1").length, 0);
      }
    });
    await check("추가 네 구간은 공식 구조를 확인해도 규칙 미지원·자동 공개0", async () => {
      for (const standard of additions) {
        const context = await loadEvidenceContext({ ...target, standardId: standard.metadata.achievementStandardId }, store, []);
        const report = createAutomaticEvidence(context.resource, context.standards, context.options);
        assert.equal(report.relations.length, 1); assert.equal(report.relations[0].inspection.status, "PASS");
        assert.equal(report.relations[0].semantic.status, "UNSUPPORTED"); assert.equal(report.summary.publishable, 0);
        assert.equal(report.relations[0].inspection.humanReview.status, "NOT_EVALUATED");
      }
    });
    await check("기존78 기준 스냅샷 바이트와 승인4는 그대로", () => {
      for (const standard of legacy) assert.equal(JSON.stringify(standardSnapshot(standard)), JSON.stringify(legacySnapshot(standard)));
      assert.deepEqual(reconcileVerifiedAssets(clone(store)).verifiedAssets, original.verifiedAssets);
    });
    await check("중1 편성 변경은 해당 관계 버전을 무효화·다른 과정 보존", async () => {
      const context = await loadEvidenceContext(middleInput, store, []), report = createAutomaticEvidence(context.resource, context.standards, context.options);
      const relation = report.relations[0], next = clone(context), elementaryBefore = standardSnapshot(next.standards[0]);
      next.standards.find((standard) => standard.curiId === middle.curiId).placement.version = "fixture-placement-v2";
      const inspection = checkRelation(relation, { resource: next.resource, standards: next.standards, ...next.options });
      assert.equal(inspection.currentValidity, "STALE"); assert.equal(inspection.publicationEligible, false);
      assert.equal(validateAsset(relation, next).reason, "STANDARD_CHANGED");
      assert.deepEqual(standardSnapshot(next.standards[0]), elementaryBefore);
    });
    await check("미지원 관계 저장·재실행은 이력 재사용하고 검색 공개하지 않음", async () => {
      const filename = path.join(directory, "automatic.sqlite");
      const service = createAutomaticAssetService({ filename, loadContext: (input) => loadEvidenceContext(input, clone(store), []) });
      const first = await service.process(middleInput), second = await service.process(middleInput);
      assert.equal(second.reused, true); assert.equal(first.runId, second.runId); assert.equal(first.assets.length, 0);
      assert.equal(first.relations[0].evidence.semantic.status, "UNSUPPORTED"); assert.equal((await service.readLinks()).length, 0);
      const databaseBefore = await fs.readFile(filename);
      const summary = await summarizeGradeEvidence(store, { filename, broadcasts: [] });
      const counted = summary.segments.find((segment) => segment.courseId === "middle1" && segment.subject === "과학");
      assert.equal(counted.automatic.latestRuns, 1); assert.equal(counted.automatic.currentRelations, 1);
      assert.equal(counted.automatic.inspection.PASS, 1); assert.equal(counted.automatic.semantic.UNSUPPORTED, 1);
      assert.equal(counted.automatic.currentPublicRelations, 0);
      const admin = await readAutomaticAdminState(store, { resources: [] }, { filename, refresh: async () => [] });
      assert.deepEqual(admin.byResource.get(content.sourceIdentity.sourceContentId).latest[0].relations[0].currentReasons, []);
      const changed = clone(store); changed.contents.find((item) => item.curiId === content.curiId).metadata.synopsis += " 바뀐 원문";
      const changedSummary = await summarizeGradeEvidence(changed, { filename, broadcasts: [] });
      const invalid = changedSummary.segments.find((segment) => segment.courseId === "middle1" && segment.subject === "과학");
      assert.equal(invalid.automatic.currentRelations, 0); assert.equal(invalid.automatic.staleRelations, 1);
      assert.deepEqual(await fs.readFile(filename), databaseBefore);
    });
    await check("중1 사람 결정은 격리 저장·편성 변경은 해당 승인만 무효화", async () => {
      let working = clone(store);
      const service = createHumanReviewService({ filename: path.join(directory, "human.sqlite"), broadcasts: [],
        readStore: async () => reconcileVerifiedAssets(clone(working)), writeStore: async (value) => { working = clone(value); }, prepare: async () => ({ state: "READY" }) });
      const view = await service.workspace({ ...target, standardId: middle.curiId });
      assert.equal(view.gradeBand, "middle1"); assert.ok(view.standards.every((standard) => standard.courseId === "middle1" && standard.subject === "과학"));
      const relation = view.relations.find((item) => item.curriculumCuriId === middle.curiId);
      assert.ok(relation); assert.equal(relation.standardSnapshot.placement.schoolPlacementConfirmed, false);
      const result = await service.save({ target, subject: "과학", gradeBand: "중1", curriculumCuriId: middle.curiId, expectedVersion: relation.expectedVersion,
        requestId: crypto.randomUUID(), decision: "edit", confirmed: true, reasonCode: "REVIEWED", note: "합성 사람 입력 기능 시험 · 실제 평가 아님",
        changes: { quote: { field: "synopsis", start: 0, end: fixtureText.length, quote: fixtureText }, rationale: "합성 관계 비교", teachingUse: "합성 활동", coreConcepts: ["지구"], connectedParts: "원문 표현", unconfirmedParts: "실제 수업 적합성 미확인", coverage: "PARTIAL" } });
      assert.equal(result.saved, true); assert.equal(working.verifiedAssets.length, original.verifiedAssets.length + 1);
      const summarized = await summarizeGradeEvidence(working, { filename: path.join(directory, "human-summary-empty.sqlite"), broadcasts: [] });
      const human = summarized.segments.find((segment) => segment.courseId === "middle1" && segment.subject === "과학").human;
      assert.equal(human.latestDecidedRelations, 1); assert.equal(human.decisions.edit, 1); assert.equal(human.currentApprovedRelations, 1);
      working.curriculumStandards.find((standard) => standard.curiId === middle.curiId).placement.version = "fixture-placement-v2";
      const context = await loadEvidenceContext(middleInput, working, []);
      assert.equal(reviewValidity(result.review, working, context.resource), "STANDARD_CHANGED");
      const after = reconcileVerifiedAssets(clone(working));
      assert.deepEqual(after.verifiedAssets, original.verifiedAssets); assert.equal(after.relationReviews.length, 1);
      const invalidSummary = await summarizeGradeEvidence(after, { filename: path.join(directory, "human-summary-empty.sqlite"), broadcasts: [] });
      const keptDecision = invalidSummary.segments.find((segment) => segment.courseId === "middle1" && segment.subject === "과학").human;
      assert.equal(keptDecision.latestDecidedRelations, 1); assert.equal(keptDecision.currentApprovedRelations, 0);
    });
    await check("실제 원본4저장소 해시·기존 승인 이력 보존", async () => { assert.deepEqual(await hashes(), before); });
    await fs.writeFile("docs/r09-01-grade-evidence-check.json", JSON.stringify({ date: new Date().toISOString(), cases, protectedHashes: before,
      fixture: "합성 공식 문장·편성·사람 입력을 사용하는 임시 저장소 계약 시험. 실제 공식 원문 검증/사람 평가 아님", paidApiCalls: 0 }, null, 2) + "\n");
    console.log(`R09-01 과정별 후보·자동/사람 근거 ${cases.length}개 통과`);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
