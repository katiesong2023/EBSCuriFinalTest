const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateExpansion, mergeExpansion } = require("./curriculum-expansion-import");
const { getEligibleStandards } = require("./data-quality");
const { standardCourse, courseForGrade } = require("../public/grade-context");
const { approvalState, assertApprovalStateUnchanged, checkOperationalWithdrawals } = require("./regression-approval-state");

const root = path.join(__dirname, "..");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const cases = [];
const check = async (name, run) => { await run(); cases.push({ name, passed: true }); };
const protectedFiles = ["server/data/curi-store.json", "server/data/broadcast-catalog.sqlite",
  "server/data/semantic-layer.sqlite", "server/data/automatic-assets.sqlite", "server/data/curriculum-expansion.json",
  "[별책7] 사회과 교육과정.pdf", "[별책9] 과학과 교육과정.pdf"];
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async (file) => [file,
  sha256(await fs.readFile(path.join(root, file)))])));
const codeGroups = [
  ["4사", [2, 3, 2, 3, 2, 2, 2, 2, 2, 2]],
  ["4과", [4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3, 4, 3]],
  ["9사(지리)", [3, 4, 3, 3, 3, 3]], ["9사(일사)", [3, 3, 3, 3, 3, 3]],
  ["9과", [3, 5, 3, 4, 4, 3, 4]]
];
const referenceCourses = {
  사회: { textbookId: "TB1000012109", isbn: "9788954789226", lectureCourseId: "100006171", lectureTotal: 70,
    ranges: [[1, 5], [6, 13], [14, 19], [20, 25], [26, 31], [32, 36], [37, 41], [42, 46], [47, 53], [54, 60], [61, 65], [66, 70]] },
  과학: { textbookId: "TB1000012107", isbn: "9788954789233", lectureCourseId: "100006176", lectureTotal: 72,
    ranges: [[1, 5], [6, 16], [17, 26], [27, 36], [37, 48], [49, 59], [60, 72]] }
};

async function main() {
  const before = await hashes();
  const payload = JSON.parse(await fs.readFile(path.join(root, "server/data/curriculum-expansion.json"), "utf8"));
  const actual = JSON.parse(await fs.readFile(path.join(root, "server/data/curi-store.json"), "utf8"));
  const originalApprovals = approvalState(actual), operationalApprovals = checkOperationalWithdrawals(actual);
  const payloadBytes = JSON.stringify(payload), actualBytes = JSON.stringify(actual);
  const legacy = actual.curriculumStandards.filter((standard) => standard.metadata.gradeBand === "5~6학년군");
  // 통합 전·후 어느 시점에서도 같은 병합을 재현하며 저장소에는 쓰지 않는다.
  const baseline = structuredClone(actual);
  baseline.curriculumStandards = structuredClone(legacy);
  const baselineBytes = JSON.stringify(baseline);
  let incoming, first, second;
  const rejectMutation = async (name, mutate, expected) => check(name, async () => {
    const changed = structuredClone(payload);
    mutate(changed);
    await assert.rejects(validateExpansion(changed), expected);
  });

  await check("공식136 기준을 원문 지문·실제 PDF 판본과 대조", async () => {
    incoming = await validateExpansion(payload);
    assert.equal(incoming.length, 136);
    assert.equal(payload.sources.length, 2);
    assert.deepEqual(payload.unresolvedStandards, []);
    assert.equal(new Set(incoming.map((item) => item.curiId)).size, 136);
    const expectedCodes = codeGroups.flatMap(([prefix, units]) => units.flatMap((count, unit) =>
      Array.from({ length: count }, (_, standard) => `${prefix}${String(unit + 1).padStart(2, "0")}-${String(standard + 1).padStart(2, "0")}`)));
    assert.deepEqual(incoming.map((item) => item.metadata.achievementStandardId).sort(), expectedCodes.sort());
    for (const standard of incoming) {
      assert.equal(standard.sourceIdentity.stableKey, `MOE_2022_CURRICULUM:2022 개정:${standard.metadata.achievementStandardId}`);
      assert.equal(Number(standard.source.sourcePdfPage) - Number(standard.source.sourcePrintedPage), 6);
      assert.equal(standard.review.humanConfirmed, false);
      assert.equal(standard.lifecycle.assetClassification, "OFFICIAL_EVIDENCE");
      assert.equal(standard.lifecycle.isCuriBaseVerified, false);
      assert.equal(standard.lifecycle.isSearchEligible, false);
    }
  });
  await check("초등3~4 사회22·과학51과 중1 사회37·과학26을 구별", () => {
    for (const [grade, course, counts] of [["초등 3학년", "elementary34", [22, 51]], ["중1", "middle1", [37, 26]]]) {
      for (const [index, subject] of ["사회", "과학"].entries()) {
        const standards = getEligibleStandards(incoming, subject, grade);
        assert.equal(standards.length, counts[index]);
        assert.ok(standards.every((standard) => standardCourse(standard) === course));
      }
    }
    assert.equal(getEligibleStandards(incoming, null, "초등 5학년").length, 0);
  });
  await check("중학 공식1~3학년군과 중1 참고 편성은 별도 필드", () => {
    const middle = incoming.filter((standard) => standardCourse(standard) === "middle1");
    assert.equal(middle.length, 63);
    assert.equal(courseForGrade("1~3학년군"), null);
    assert.equal(getEligibleStandards(incoming, null, "1~3학년군").length, 0);
    assert.equal(getEligibleStandards(incoming, null, "중2").length, 0);
    for (const standard of middle) {
      assert.equal(standard.metadata.schoolLevel, "중학교");
      assert.equal(standard.metadata.gradeBand, "1~3학년군");
      assert.equal(standard.metadata.officialGradeLabel, "중학교 1~3학년");
      const withoutPlacementCourse = structuredClone(standard);
      delete withoutPlacementCourse.metadata.courseId;
      assert.equal(standardCourse(withoutPlacementCourse), null);
      assert.equal(getEligibleStandards([withoutPlacementCourse]).length, 0);
    }
  });
  await check("EBS 뉴런 교재·강좌19 편성과 단원·강의 범위가 일치", () => {
    assert.equal(payload.placements.length, 19);
    assert.equal(new Set(payload.placements.map((placement) => placement.placementId)).size, 19);
    for (const [subject, reference] of Object.entries(referenceCourses)) {
      const placements = payload.placements.filter((placement) => placement.subject === subject);
      assert.equal(placements.length, reference.ranges.length);
      for (const [index, placement] of placements.entries()) {
        assert.equal(placement.textbookUnitNo, index + 1);
        assert.equal(placement.textbookId, reference.textbookId);
        assert.equal(placement.textbookIsbn, reference.isbn);
        assert.equal(new URL(placement.textbookUrl).searchParams.get("txbkId"), reference.textbookId);
        assert.ok(["book.ebs.co.kr", "ebook.ebs.co.kr"].includes(new URL(placement.textbookUrl).hostname));
        assert.equal(placement.lectureCourseId, reference.lectureCourseId);
        assert.equal(new URL(placement.lectureUrl).hostname, "mid.ebs.co.kr");
        assert.equal(new URL(placement.lectureUrl).searchParams.get("courseId"), reference.lectureCourseId);
        assert.equal(placement.lectureTotal, reference.lectureTotal);
        assert.deepEqual([placement.lectureRange.start, placement.lectureRange.end], reference.ranges[index]);
        assert.equal(placement.status, "REFERENCE_MAPPED");
        assert.equal(placement.version, "ebs-neuron-2022-20261010-v1");
        assert.equal(placement.schoolPlacementConfirmed, false);
        assert.equal(placement.checkedAt, "2026-10-10");
        assert.equal(placement.curriculumRevision, "2022");
        const records = incoming.filter((standard) => standard.placement?.placementId === placement.placementId);
        assert.ok(records.length);
        for (const standard of records) {
          assert.deepEqual(standard.placement, placement);
          assert.equal(standard.metadata.unitTitle, placement.officialUnitTitle);
          assert.equal(standard.metadata.unitNo, placement.officialUnitNo);
        }
      }
    }
  });

  await rejectMutation("중복 성취기준 ID를 거절", (changed) => changed.standards.push(structuredClone(changed.standards[0])), /중복\/잘못된 기준 ID/);
  await rejectMutation("CURI ID와 성취기준 ID 불일치를 거절", (changed) => { changed.standards[0].curiId += "-changed"; }, /중복\/잘못된 기준 ID/);
  await rejectMutation("원본 성취기준 ID 연결 변조를 거절", (changed) => { changed.standards[0].sourceIdentity.sourceStandardId = "4사99-99"; }, /공식 지원 범위/);
  await rejectMutation("성취기준 본문 변조를 거절", (changed) => { changed.standards[0].metadata.achievementStandard += " 변조"; }, /기준 원문 지문 불일치/);
  await rejectMutation("원문 지문 변조를 거절", (changed) => { changed.standards[0].source.contentFingerprint = "0".repeat(64); }, /기준 원문 지문 불일치/);
  await rejectMutation("허용 공식 PDF 밖의 경로를 거절", (changed) => { changed.standards[0].source.sourceLocalPath = "../outside.pdf"; }, /허용되지 않은 공식 문서/);
  await rejectMutation("공식 문서 제목 연결 변조를 거절", (changed) => { changed.standards[0].source.sourceDocument = "변경된 문서"; }, /공식 문서 출처 연결 오류/);
  await rejectMutation("사회·과학 문서 교과 연결 변조를 거절", (changed) => { changed.standards[0].metadata.subject = "과학"; }, /공식 문서 출처 연결 오류/);
  await rejectMutation("성취기준의 문서 지문 변조를 거절", (changed) => { changed.standards[0].source.documentSha256 = "0".repeat(64); }, /공식 문서 출처 연결 오류/);
  await rejectMutation("목록과 기준의 지문을 함께 바꿔도 실제 PDF 판본과 대조", (changed) => {
    const source = changed.sources[0];
    source.documentSha256 = "0".repeat(64);
    for (const standard of changed.standards.filter((item) => item.source.sourceLocalPath === source.sourceLocalPath)) standard.source.documentSha256 = source.documentSha256;
  }, /공식 PDF 판본 불일치/);
  await rejectMutation("중1 편성 누락을 거절", (changed) => { delete changed.standards.find((item) => item.metadata.courseId === "middle1").placement; }, /공식 지원 범위/);
  await rejectMutation("중1 단원 편성 참조의 강의 구간 변조를 거절", (changed) => { changed.standards.find((item) => item.metadata.courseId === "middle1").placement.lectureRange.start = 99; }, /중1 참고 편성 연결 오류/);
  await rejectMutation("학교 편성 확정을 공식 출처 확인으로 대신하지 않음", (changed) => { changed.standards.find((item) => item.metadata.courseId === "middle1").placement.schoolPlacementConfirmed = true; }, /공식 지원 범위/);
  await rejectMutation("원문 확인 자료를 사람 승인 상태로 바꾸는 입력을 거절", (changed) => { changed.standards[0].review.humanConfirmed = true; }, /공식 지원 범위/);
  await rejectMutation("공식 학년군과 충돌하는 과정 ID를 거절", (changed) => { changed.standards[0].metadata.courseId = "middle1"; }, /공식 지원 범위/);

  await check("첫 병합136 추가·전체214·기존78 원문과 현재 승인/취소 이력 완전 보존", () => {
    assert.equal(legacy.length, 78);
    assertApprovalStateUnchanged(baseline, originalApprovals);
    first = mergeExpansion(baseline, incoming);
    assert.deepEqual(first.summary, { created: 136, updated: 0, unchanged: 0, total: 214 });
    assert.equal(JSON.stringify(first.store.curriculumStandards.slice(0, 78)), JSON.stringify(legacy));
    assert.equal(JSON.stringify(first.store.curriculumStandards.slice(78)), JSON.stringify(incoming));
    for (const key of Object.keys(baseline).filter((key) => key !== "curriculumStandards")) {
      assert.equal(JSON.stringify(first.store[key]), JSON.stringify(baseline[key]), `${key} 보존`);
    }
    assert.equal(JSON.stringify(baseline), baselineBytes);
    assert.equal(JSON.stringify(payload), payloadBytes);
    assert.notEqual(first.store, baseline);
    assert.notEqual(first.store.curriculumStandards[78], incoming[0]);
  });
  await check("기존5~6 기준을 덮어쓰려는 병합은 거절", () => {
    const altered = structuredClone(legacy[0]);
    altered.metadata.achievementStandard += " 변경";
    assert.throws(() => mergeExpansion(baseline, [altered]), /기존 기준 덮어쓰기 금지/);
    assert.equal(JSON.stringify(baseline), baselineBytes);
  });
  await check("두 번째 병합은 중복·변경 없이136 모두 재사용", () => {
    const firstBytes = JSON.stringify(first.store);
    second = mergeExpansion(first.store, incoming);
    assert.deepEqual(second.summary, { created: 0, updated: 0, unchanged: 136, total: 214 });
    assert.equal(JSON.stringify(second.store), firstBytes);
    assert.equal(JSON.stringify(first.store), firstBytes);
    assert.equal(new Set(second.store.curriculumStandards.map((item) => item.curiId)).size, 214);
  });
  await check("실제4 저장소·확장 원본·공식 PDF는 파일 해시까지 보존", async () => {
    assert.equal(JSON.stringify(actual), actualBytes);
    assert.equal(JSON.stringify(payload), payloadBytes);
    assert.deepEqual(await hashes(), before);
    assertApprovalStateUnchanged(JSON.parse(await fs.readFile(path.join(root, "server/data/curi-store.json"), "utf8")), originalApprovals);
  });

  const preservedFields = Object.fromEntries(Object.entries(baseline).filter(([key]) => key !== "curriculumStandards")
    .map(([key, value]) => [key, { count: Array.isArray(value) ? value.length : null, sha256: sha256(JSON.stringify(value)) }]));
  const report = { checkedAt: new Date().toISOString(), cases, sourceVersion: payload.version,
    counts: { existing: 78, elementary34: { 사회: 22, 과학: 51 }, middle1: { 사회: 37, 과학: 26 }, added: 136, merged: 214, referencePlacements: 19 },
    firstMerge: first.summary, secondMerge: second.summary, preservedFields, protectedHashes: before, operationalApprovals,
    scope: "현재 저장소의 기존5~6 기준78을 메모리 기준으로 구성한 통합 전후 재현 시험. 실제 저장소·성취기준·PDF 파일 쓰기 없음.",
    sourceFilesMutated: false, storageFilesMutated: false, paidApiCalls: 0 };
  await fs.writeFile(process.env.CURI_REPORT_PATH || path.join(root, "docs/r09-02-regression-grade-curriculum.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`R09-01 공식 성취기준·참고 편성·보존 ${cases.length}개 통과 · 136 추가 / 전체214 / 편성19`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
