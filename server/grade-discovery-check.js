const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { discoverCurriculum } = require("./curriculum-discovery");
const { loadDiscoveryCatalog } = require("./discovery-catalog");
const { readDataStore } = require("./data-store");
const { requirementPlan } = require("./curriculum-requirements");
const { expansionAnchors, unitAnchors } = require("./curriculum-expansion-anchors");
const { standardCourse } = require("../public/grade-context");
const { approvalState, assertApprovalStateUnchanged, checkOperationalWithdrawals } = require("./regression-approval-state");
const { readLinksWithoutMutation } = require("./independent-quality-capture");
const { automaticAssets } = require("./automatic-assets");

const root = path.join(__dirname, "..");
const cases = [];
const check = async (name, run) => { await run(); cases.push({ name, passed: true }); };
const protectedFiles = ["curi-store.json", "broadcast-catalog.sqlite", "semantic-layer.sqlite", "automatic-assets.sqlite"];
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async (file) => [file,
  crypto.createHash("sha256").update(await fs.readFile(path.join(__dirname, "data", file))).digest("hex")])));
const expectedSegments = [
  ["elementary34", "사회", 22], ["elementary34", "과학", 51],
  ["elementary56", "사회", 27], ["elementary56", "과학", 51],
  ["middle1", "사회", 37], ["middle1", "과학", 26]
];
const metrics = (summary) => Object.fromEntries(Object.entries(summary).filter(([, value]) => typeof value === "number"));

async function main() {
  const startedAt = Date.now(), before = await hashes();
  const store = await readDataStore(), catalog = await loadDiscoveryCatalog();
  const originalApprovals = approvalState(store), operationalApprovals = checkOperationalWithdrawals(store);
  const currentAutomaticLinks = await readLinksWithoutMutation();
  // 조회가 오래된 자동 투영을 운영 DB에 무효화하지 않도록 현재 유효 링크의 읽기 사본을 주입한다.
  automaticAssets.readLinks = async () => currentAutomaticLinks;
  const find = (input) => discoverCurriculum(input, catalog, store);
  const expanded = await find({}), legacy = await find({ grade: "elementary56" });
  const additions = store.curriculumStandards.filter((standard) => standardCourse(standard) !== "elementary56");
  const sixScopes = [];

  await check("전체214 기준과 여섯 과정·교과22/51/27/51/37/26을 반환", () => {
    assert.equal(expanded.standards.length, 214);
    assert.equal(expanded.summary.standards, 214);
    assert.equal(legacy.standards.length, 78);
    assert.equal(expanded.segments.length, 6);
    for (const [courseId, subject, count] of expectedSegments) {
      const segment = expanded.segments.find((item) => item.courseId === courseId && item.subject === subject);
      assert.ok(segment);
      assert.equal(segment.standards, count);
      assert.equal(segment.acquiredStandards, count);
      assert.ok(segment.candidateRelations >= segment.uniqueResources);
    }
  });
  await check("각 구간의 옵션·선택 기준·보완목록이 같은 과정과 교과에 속함", async () => {
    for (const [courseId, subject, count] of expectedSegments) {
      const result = await find({ grade: courseId, subject });
      const expectedIds = store.curriculumStandards.filter((standard) => standardCourse(standard) === courseId && standard.metadata.subject === subject)
        .map((standard) => standard.metadata.achievementStandardId).sort();
      assert.equal(result.standards.length, count);
      assert.deepEqual(result.standards.map((standard) => standard.id).sort(), expectedIds);
      assert.ok(result.standards.every((standard) => standard.courseId === courseId && standard.subject === subject));
      const chosen = await find({ grade: courseId, subject, standard: expectedIds[0] });
      assert.equal(chosen.standard.courseId, courseId);
      assert.equal(chosen.standard.subject, subject);
      for (const item of result.queue) {
        assert.deepEqual(item.courses, [courseId]);
        assert.deepEqual(item.subjects, [subject]);
        assert.ok(item.standards.every((id) => expectedIds.includes(id)));
      }
      const segment = expanded.segments.find((item) => item.courseId === courseId && item.subject === subject);
      for (const [key, value] of Object.entries(metrics(result.summary))) assert.equal(segment[key], value, `${courseId} ${subject} ${key}`);
      sixScopes.push({ courseId, subject, ...metrics(result.summary), queueTotal: result.queueTotal });
    }
  });
  await check("다른 과정·교과의 선택 ID 및 중학 전체를 중1로 요청하는 입력은 거절", async () => {
    for (const [courseId, subject] of expectedSegments) {
      const foreign = expanded.standards.find((standard) => standard.courseId !== courseId && standard.subject === subject);
      const otherSubject = expanded.standards.find((standard) => standard.courseId === courseId && standard.subject !== subject);
      await assert.rejects(find({ grade: courseId, subject, standard: foreign.id }), /공식 목록에 없는/);
      await assert.rejects(find({ grade: courseId, subject, standard: otherSubject.id }), /공식 목록에 없는/);
    }
    for (const grade of ["1~3학년군", "중2", "초등 2학년"]) await assert.rejects(find({ grade }), /과정을 선택/);
  });
  await check("공식 원문 대조·중1 편성 참고가 자동 규칙 또는 사람 승인을 만들지 않음", () => {
    assert.equal(additions.length, 136);
    const newOptions = expanded.standards.filter((standard) => standard.courseId !== "elementary56");
    assert.ok(newOptions.every((standard) => standard.ruleSupported === false));
    assert.ok(newOptions.every((standard) => standard.officialCheck.classification === "SOURCE" && standard.officialCheck.status === "SOURCE_CHECKED" && standard.officialCheck.humanConfirmed === false));
    for (const standard of newOptions.filter((item) => item.courseId === "middle1")) {
      assert.equal(standard.gradeBand, "1~3학년군");
      assert.equal(standard.placement.status, "REFERENCE_MAPPED");
      assert.equal(standard.placement.schoolPlacementConfirmed, false);
    }
    for (const segment of expanded.segments.filter((item) => item.courseId !== "elementary56")) {
      assert.equal(segment.ruleSupported, 0);
      assert.equal(segment.withoutSupportedRelation, 0);
      assert.equal(segment.ruleUnsupported, segment.standards);
      assert.equal(segment.automaticPublicRelations, 0);
      assert.equal(segment.humanApprovedRelations, 0);
    }
    assert.equal(expanded.summary.ruleSupported, 4);
    assert.equal(expanded.summary.automaticPublicRelations, currentAutomaticLinks.length);
    assert.equal(expanded.summary.humanApprovedRelations, originalApprovals.verifiedAssets.length);
    assert.equal(legacy.summary.automaticPublicRelations, currentAutomaticLinks.length);
    assert.equal(legacy.summary.humanApprovedRelations, originalApprovals.verifiedAssets.length);
  });
  await check("45단원 중심어136 기준은 원문 실제 표현만 포함하고 수행어를 제외", () => {
    assert.equal(Object.keys(unitAnchors).length, 45);
    for (const standard of additions) {
      const plan = requirementPlan(standard), vocabulary = expansionAnchors(standard);
      assert.ok(plan.anchors.length);
      assert.deepEqual(plan.terms, vocabulary.terms);
      assert.deepEqual(plan.anchors, vocabulary.anchors);
      for (const term of plan.terms) {
        assert.ok(standard.metadata.achievementStandard.includes(term));
        assert.ok(!["의한", "가진다", "호기심", "수", "있는", "관찰할", "설명할", "조사하여"].includes(term));
      }
    }
    for (const standard of store.curriculumStandards.filter((item) => standardCourse(item) === "elementary56")) assert.equal(expansionAnchors(standard), null);
  });
  await check("호기심·의한·가진다·자전거만 있는 소개문은 천체 후보가 아님", async () => {
    const resource = (id, title, summary) => ({ id, title, summary, kind: "episode", sourceSystem: "EBS_BROADCAST", program: "격리 후보 시험",
      sourceUrl: "https://www.ebs.co.kr/test", navigation: { status: "PUBLISHED", kind: "EPISODE" } });
    const fixture = { resources: [resource("GENERIC", "호기심", "현상에 의한 변화를 관찰하고 호기심을 가진다."),
      resource("BIKE", "자전거", "자전거를 타는 사람들"), resource("ASTRONOMY", "별자리 관찰", "지구 자전에 의한 천체의 겉보기 운동을 살펴본다.")], stats: {}, concepts: [] };
    const result = await discoverCurriculum({ grade: "middle1", subject: "과학", standard: "9과07-03" }, fixture, store);
    assert.deepEqual(result.results.map((item) => item.id), ["ASTRONOMY"]);
    assert.equal(result.results[0].curriculumComparison.ruleStatus, "UNSUPPORTED");
  });

  const baselineStore = structuredClone(store);
  baselineStore.curriculumStandards = baselineStore.curriculumStandards.filter((standard) => standardCourse(standard) === "elementary56");
  const baseline = await discoverCurriculum({ grade: "elementary56" }, catalog, baselineStore);
  const legacyDelta = Object.fromEntries(Object.entries(metrics(legacy.summary)).map(([key, value]) => [key, value - baseline.summary[key]]));
  await check("추가136을 뺀 같은 카탈로그 기준과 기존78 결과가 완전히 같음", () => {
    assert.deepEqual(metrics(legacy.summary), metrics(baseline.summary));
    assert.deepEqual(legacy.standards, baseline.standards);
    assert.deepEqual(legacy.queue, baseline.queue);
    assert.equal(legacy.queueTotal, baseline.queueTotal);
    assert.ok(Object.values(legacyDelta).every((value) => value === 0));
  });
  const previousReport = JSON.parse(await fs.readFile(path.join(root, "docs/r08-05-gaps-current.json"), "utf8"));
  const priorDelta = Object.fromEntries(Object.entries(metrics(previousReport.summary)).map(([key, value]) =>
    [key, key === "withoutSupportedRelation" ? null : legacy.summary[key] - value]));
  await check("R08-05 공식78 기준 원문은 보존하고 변경된 검색/공백 집계는 차이로 기록", () => {
    assert.equal(previousReport.standards.length, legacy.standards.length);
    for (const previous of previousReport.standards) {
      const current = legacy.standards.find((standard) => standard.id === previous.id);
      assert.ok(current);
      for (const key of ["id", "text", "subject", "gradeBand", "ruleSupported"]) {
        if (Object.hasOwn(previous, key)) assert.deepEqual(current[key], previous[key], `${previous.id} ${key}`);
      }
    }
  });
  await check("실제 JSON·방송·시맨틱·자동자산 저장소와 승인/취소 이력은 변경하지 않음", async () => {
    assert.deepEqual(await hashes(), before); assertApprovalStateUnchanged(await readDataStore(), originalApprovals);
  });

  const checkedAt = new Date().toISOString();
  const report = { checkedAt, elapsedMs: Date.now() - startedAt, expanded: expanded.summary, legacy: legacy.summary, sixScopes,
    deltaUniqueResources: expanded.summary.uniqueResources - legacy.summary.uniqueResources,
    deltaRelations: expanded.summary.candidateRelations - legacy.summary.candidateRelations,
    legacyBaseline: { method: "같은 카탈로그와 기존78 기준만 둔 메모리 저장소", summary: metrics(baseline.summary), delta: legacyDelta },
    priorLegacyBaseline: { source: "docs/r08-05-gaps-current.json", summary: previousReport.summary, delta: priorDelta,
      nonComparable: { withoutSupportedRelation: "과거는 미지원까지 포함했지만 현재 분모는 자동 비교 지원 기준이므로 증감 비교하지 않음" } },
    candidateInterpretation: "후보 수는 공식 문장에 포함된 단원 중심어의 원문 언급 수이다. 관계 충족·사람 승인·학년 적합성 확정과 별개다.",
    queueTotal: expanded.queueTotal, operationalApprovals, paidApiCalls: 0 };
  await fs.writeFile(process.env.CURI_REPORT_PATH || path.join(root, "docs/r09-02-regression-grade-discovery.json"), JSON.stringify({ ...report, cases,
    protectedHashes: before }, null, 2) + "\n");
  console.log(JSON.stringify({ passed: cases.length, expanded: metrics(expanded.summary), legacy: metrics(legacy.summary), sixScopes,
    deltaUniqueResources: report.deltaUniqueResources, deltaRelations: report.deltaRelations, legacyDelta }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
