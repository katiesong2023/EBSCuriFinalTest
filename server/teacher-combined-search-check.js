const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { discoverTeacherContents } = require("./teacher-discovery");
const { discoverCurriculum } = require("./curriculum-discovery");
const { readDataStore } = require("./data-store");
const { loadDiscoveryCatalog } = require("./discovery-catalog");
const { automaticAssets } = require("./automatic-assets");
const { variantKey } = require("./teacher-curation");
const { validDate } = require("./teacher-filters");
const protectedNames = ["curi-store.json", "broadcast-catalog.sqlite", "semantic-layer.sqlite", "automatic-assets.sqlite"];
const hashes = async () => Object.fromEntries(await Promise.all(protectedNames.map(async (name) => [name,
  crypto.createHash("sha256").update(await fs.readFile(path.join(__dirname, "data", name))).digest("hex")])));
const resource = (id, title, summary = "", broadcastDate = null, extra = {}) => ({ id, title, summary, broadcastDate,
  kind: "episode", program: "격리 A", sourceSystem: "FIXTURE", variant: "ORIGINAL", sourceUrl: `https://www.ebs.co.kr/${id}`,
  navigation: { status: "PUBLISHED", kind: "EPISODE" }, ...extra });
const election = "시민은 투표로 대표를 선출한다. 시민은 선거 참여를 통해 주권을 행사한다.";
const rotation = "지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.";
const resources = [
  ...Array.from({ length: 24 }, (_, i) => resource(`ELECTION-${i}`, `선거 기록 ${String(i).padStart(2, "0")}`,
    `${election} ${i % 2 ? "도시" : "농촌"}의 민주주의와 시민 생활을 소개한다.`, `${2000 + i}-02-03`, { program: i % 2 ? "격리 B" : "격리 A" })),
  resource("PARTIAL", "시민의 선택", election, "2025-01-01"),
  resource("LIST", "선거 시민 주권 민주주의 투표", "선거 시민 주권 민주주의 투표 대표라는 단어를 나열한다. 다양한 도시의 문화를 살펴보고 여러 나라 사람의 생활과 풍경을 긴 시간 소개한다. 대표와 시민이라는 이름이 거리의 책에도 등장한다.", "2024-01-01"),
  resource("LOW", "선거의 역할", "", "2010-01-01"), resource("HIGH", "선거의 역할 (더빙)", election, "2026-01-01"),
  resource("ROTATE", "지구 자전", rotation, "2022-01-01"),
  resource("SCI-SOCIAL", "지구 자전과 민주주의", `${rotation} 민주주의와 시민의 일상을 함께 소개한다.`, "2020-01-01"),
  resource("CONFLICT", "선거의 부정", "시민은 투표로 대표를 선출하지 않는다. 선거는 시민이 주권을 행사하는 방법이 아니다.", "2023-01-01"),
  resource("HELD", "선거의 의문", "시민은 투표로 대표를 선출하는가? 시민이 주권을 행사하는 방법인지를 질문한다.", "2023-01-02"),
  resource("UNSUPPORTED", "산지와 하천의 위치", "산지와 하천의 위치를 지도에서 확인하고 여러 지역의 지형 분포를 살펴본다."),
  resource("U-LOW", "산지와 하천"),
  resource("UNKNOWN", "선거 날짜 미확인", election, "2023-02-29"),
  resource("FREE", "가구 수선", "오래된 가구를 수선하는 장인의 하루를 소개한다."),
  resource("COLLECTION", "선거 프로그램 목록", "", null, { kind: "collection", program: "목록 전용" })
];
const cases = [], live = [];
const check = async (name, run) => { await run(); cases.push({ name, passed: true }); };
const flatten = (rows) => rows.flatMap((item) => [item, ...(item.alternatives || [])]);
async function collect(search, input) {
  const first = await search(input), rows = [...first.results];
  for (let page = 2; page <= first.pages; page++) rows.push(...(await search({ ...input, page })).results);
  assert.equal(rows.length, first.total);
  assert.equal(new Set(rows.map(variantKey)).size, rows.length);
  assert.equal(new Set(flatten(rows).map((item) => item.id)).size, flatten(rows).length);
  return rows;
}
async function main() {
  const before = await hashes(), originalStore = await readDataStore();
  const catalog = { concepts: [], stats: {}, resources, version: "combined-contract-fixture" };
  const store = { ...originalStore, verifiedAssets: [] };
  const search = (input = {}, source = catalog, data = store) => discoverTeacherContents(input, source, data);
  const ids = (rows) => flatten(rows).map((item) => item.id).sort();
  await check("질문만·기준만·결합·전체와 기준/질문 개별 해제", async () => {
    const q = "농촌", standard = "6사08-01";
    const query = await collect(search, { q }), selected = await collect(search, { standard });
    const both = await collect(search, { q, standard });
    const expected = ids(query).filter((id) => ids(selected).includes(id));
    assert.deepEqual(ids(both), expected); assert.ok(expected.length > 9);
    assert.equal((await search({ q })).searchMode, "QUERY"); assert.equal((await search({ standard })).searchMode, "STANDARD");
    assert.equal((await search({ q, standard })).searchMode, "COMBINED"); assert.equal((await search()).searchMode, "ALL");
    const input = { q, standard, program: "격리 A", sort: "oldest", description: "present" };
    assert.deepEqual((await search({ ...input, standard: "" })).results, (await search({ q, program: input.program, sort: input.sort, description: input.description })).results);
    assert.deepEqual((await search({ ...input, q: "" })).results, (await search({ standard, program: input.program, sort: input.sort, description: input.description })).results);
  });
  await check("기준 후보는 전체 페이지에서 기존 역방향 검색과 동일", async () => {
    const old = await collect((input) => discoverCurriculum(input, catalog, store), { standard: "6사08-01" });
    assert.deepEqual(ids(await collect(search, { standard: "6사08-01" })), ids(old));
  });
  await check("AND/OR·제외 조건을 기준 결합에서도 유지", async () => {
    const selected = ids(await collect(search, { standard: "6사08-01" }));
    for (const q of ["선거 농촌", "농촌 또는 도시", "선거 도시 제외"]) {
      const expected = ids(await collect(search, { q })).filter((id) => selected.includes(id));
      assert.deepEqual(ids(await collect(search, { q, standard: "6사08-01" })), expected, q);
    }
    const source = { ...catalog, resources: [resources[0], { ...resources[1], kind: "lesson" }] };
    const result = await search({ q: "선거 강의 제외", standard: "6사08-01" }, source);
    assert.deepEqual(result.results.map((item) => item.id), [resources[0].id]);
  });
  await check("필수 프로그램과 선호·미확인 요청 경고 보존", async () => {
    for (const q of ["격리 A 프로그램에서 선거", "선거 영상은 격리 A를 선호해", "선거 장면을 5분 영상으로 보여줘"]) {
      const plain = await search({ q }), combined = await search({ q, standard: "6사08-01" });
      assert.deepEqual(combined.understanding.requiredPrograms, plain.understanding.requiredPrograms);
      assert.deepEqual(combined.understanding.preferences, plain.understanding.preferences);
      for (const warning of plain.understanding.warnings) assert.ok(combined.understanding.warnings.includes(warning));
    }
  });
  await check("같은 제목 다른 ID는 교집합·근거를 공유하지 않음", async () => {
    const variants = { ...catalog, resources: [resource("SAME-S", "같은 제목", election), resource("SAME-Q", "같은 제목", "가구 수선 작업을 소개한다.")] };
    assert.equal((await search({ q: "수선", standard: "6사08-01" }, variants)).total, 0);
  });
  await check("전체 정렬 뒤 판본 대표·필터 밖 판본 제외", async () => {
    const input = { q: "선거의 역할", standard: "6사08-01" };
    const variants = { ...catalog, resources: resources.filter((item) => ["LOW", "HIGH"].includes(item.id)) };
    assert.equal((await search({ ...input, sort: "oldest" }, variants)).results[0].id, "LOW");
    assert.equal((await search({ ...input, sort: "newest" }, variants)).results[0].id, "HIGH");
    const filtered = await search({ ...input, state: "TITLE_ONLY" }, variants);
    assert.equal(filtered.results[0].id, "LOW"); assert.deepEqual(filtered.results[0].alternatives, []);
  });
  await check("날짜 정렬·미확인 마지막·페이지 초과 보정", async () => {
    for (const sort of ["newest", "oldest"]) {
      const rows = await collect(search, { standard: "6사08-01", sort });
      const dates = rows.map((item) => validDate(item.broadcastDate)), known = dates.filter(Boolean);
      assert.deepEqual(known, [...known].sort((a, b) => sort === "newest" ? b.localeCompare(a) : a.localeCompare(b)));
      assert.ok(dates.slice(dates.indexOf("")).every((date) => !date));
      const last = await search({ standard: "6사08-01", sort, page: "999" }); assert.equal(last.page, last.pages);
    }
  });
  await check("각 필터 건수는 결합 전체에서 해당 필터만 변경한 묶음 수", async () => {
    const input = { q: "선거", standard: "6사08-01", program: "격리 A", description: "present", state: "PARTIAL_SUPPORTED" };
    const result = await search(input);
    for (const key of ["kind", "program", "concept", "subject", "description", "curriculum", "access", "state", "year"]) {
      for (const option of result.filters[key]) assert.equal(option.count, (await search({ ...input, [key]: option.value })).total, `${key}:${option.value}`);
    }
    for (const option of result.filters.conceptGroup) assert.equal(option.count, (await search({ ...input, conceptGroup: option.value, concept: "" })).total);
  });
  await check("원문 부족·미지원 중복과 미지원 후보·요구 원문 유지", async () => {
    const result = await search({ standard: "6사01-01", state: "UNSUPPORTED" });
    assert.equal(result.total, 2); const low = result.results.find((item) => item.id === "U-LOW");
    assert.ok(low.candidateStates.includes("DESCRIPTION_LOW")); assert.ok(low.candidateStates.includes("TITLE_ONLY"));
    assert.equal(low.curriculumComparison.ruleSupport.supported, false);
    assert.equal(low.curriculumComparison.requirementComparisons[0].requirement, result.standard.standardText);
    assert.deepEqual(low.curriculumComparison.requirementComparisons[0].quotes, []);
    assert.equal((await search({ standard: "6사01-01", state: "DESCRIPTION_LOW" })).total, 1);
  });
  await check("관계 설명이 많은 단어 나열보다 우선·인용은 해당 회차 원문", async () => {
    const result = await search({ standard: "6사08-01" });
    const all = await collect(search, { standard: "6사08-01" });
    assert.ok(all.findIndex((item) => item.id === "PARTIAL") < all.findIndex((item) => item.id === "LIST"));
    for (const item of flatten(result.results)) for (const requirement of item.curriculumComparison.requirementComparisons) for (const quote of requirement.quotes) {
      assert.equal(item.summary.slice(quote.start, quote.end), quote.quote); assert.equal(quote.sourceContentId, item.id);
      assert.equal(quote.offsetUnit, "UTF16_CODE_UNIT"); assert.ok(quote.contentHash); assert.ok(quote.sourceVersion);
    }
    assert.equal(result.results[0].searchText, undefined);
  });
  await check("명시적 상충·해석 보류·개념 일치·부분근거 독립 필터", async () => {
    for (const [state, id] of [["EXPLICIT_CONFLICT", "CONFLICT"], ["INTERPRETATION_HELD", "HELD"], ["CONCEPT_ONLY", "LIST"], ["PARTIAL_SUPPORTED", "PARTIAL"]]) {
      const result = await collect(search, { standard: "6사08-01", state });
      assert.ok(result.some((item) => item.id === id), state);
      assert.ok(flatten(result).every((item) => item.candidateStates.includes(state)));
    }
    assert.equal((await search({ standard: "6사08-01", state: "RELATION_MISSING" })).state, "CONCEPT_ONLY");
  });
  await check("대상 학년과 공식 기준 과정 차이로 후보·선택 관계를 제거하지 않음", async () => {
    const result = await search({ standard: "6과12-02", grade: "초등 3학년" });
    assert.equal(result.grade, "초등 3학년"); assert.equal(result.standard.courseId, "elementary56"); assert.match(result.contextWarning, /다릅니다/);
    assert.deepEqual(ids(result.results), ids((await search({ standard: "6과12-02" })).results));
    assert.equal(result.results[0].teachingContext.targetGrade, "초등 3학년"); assert.equal(result.results[0].teachingContext.suitability, "UNCONFIRMED");
  });
  await check("일반 교과 태그와 공식 기준 교과는 독립 필터", async () => {
    const result = await search({ standard: "6과12-02", subject: "사회" });
    assert.equal(result.standard.subject, "과학"); assert.deepEqual(result.results.map((item) => item.id), ["SCI-SOCIAL"]);
    assert.equal(result.results[0].teachingContext.subject, "과학");
  });
  await check("다른 기준 승인과 선택 기준 승인·원문 변경·다른 판본 분리", async () => {
    const asset = (id, code) => {
      const item = resources.find((entry) => entry.id === id), standard = store.curriculumStandards.find((entry) => entry.metadata.achievementStandardId === code);
      return { verifiedAssetId: `fixture-${id}-${code}`, reviewKind: "RELATION_REVIEW", content: {
        sourceIdentity: { sourceContentId: id, sourceSystem: item.sourceSystem }, sourceUrl: item.sourceUrl,
        metadata: { title: item.title, synopsis: item.summary, variant: item.variant } }, standard, review: { result: { rationale: "기능 시험용 확인" } } };
    };
    const data = { ...store, verifiedAssets: [asset("SCI-SOCIAL", "6사08-01"), asset("LOW", "6사08-01"), asset("PARTIAL", "6사08-01")] };
    const other = await search({ standard: "6과12-02" }, catalog, data);
    const mixed = other.results.find((item) => item.id === "SCI-SOCIAL");
    assert.deepEqual(mixed.approvedLinks, []); assert.equal(mixed.otherStandardLinks.approvedLinks.length, 1);
    assert.equal((await search({ standard: "6과12-02", curriculum: "approved" }, catalog, data)).total, 0);
    const own = await search({ standard: "6사08-01", curriculum: "approved", grade: "초등 3학년" },
      { ...catalog, resources: resources.filter((item) => ["LOW", "HIGH"].includes(item.id)) }, data);
    assert.equal(own.results[0].id, "LOW"); assert.deepEqual(own.results[0].alternatives, []);
    const changed = { ...catalog, resources: resources.map((item) => item.id === "PARTIAL" ? { ...item, summary: election + "원문 변경" } : item) };
    const changedRows = await collect((input) => search(input, changed, data), { standard: "6사08-01", curriculum: "approved" });
    assert.ok(!ids(changedRows).includes("PARTIAL"));
  });
  await check("자동 공개는 선택 기준/회차에만, 계산한 부분 설명은 공개 검사 자산이 아님", async () => {
    const readLinks = automaticAssets.readLinks, item = resources.find((entry) => entry.id === "SCI-SOCIAL");
    automaticAssets.readLinks = async () => [{ sourceContentId: item.id, sourceSystem: item.sourceSystem, sourceUrl: item.sourceUrl,
      title: item.title, synopsis: item.summary, variant: item.variant, standardId: "6과12-02", subject: "과학", courseId: "elementary56" }];
    try {
      const source = { ...catalog, liveSource: true };
      const own = await search({ standard: "6과12-02", curriculum: "automatic", subject: "사회" }, source);
      assert.equal(own.total, 1); assert.equal(own.results[0].id, item.id);
      // 공식 기준의 교과가 과학이어도 이 자료의 실제 탐색 태그는 사회다.
      assert.equal(own.filters.subject.find((option) => option.value === "과학").count, 0);
      assert.equal((await search({ standard: "6사08-01", curriculum: "automatic" }, source)).total, 0);
    } finally { automaticAssets.readLinks = readLinks; }
    assert.equal((await search({ standard: "6사08-01", curriculum: "automatic" })).total, 0);
  });
  await check("공식 보조문서는 후보 발견만·소개문 품질과 요구 충족 승격 없음", async () => {
    const source = { ...catalog, resources: [resource("SUPPLEMENT", "보조 문서 회차", "", null, { sourceSupplements: [{ id: "test-doc", text: rotation,
      sourceUrl: "https://www.ebs.co.kr/test", contentHash: "fixture-hash", checkedAt: "2026-10-11", originalStart: 0, scope: "DISCOVERY_ONLY" }] })] };
    const result = await search({ standard: "6과12-02" }, source);
    assert.equal(result.total, 1); const item = result.results[0]; assert.equal(item.descriptionStatus, "none");
    assert.ok(item.curriculumComparison.supplementEvidence.length); assert.ok(item.curriculumComparison.requirementComparisons.every((entry) => !entry.quotes.length));
    assert.equal((await search({ q: "자전", standard: "6과12-02" }, source)).total, 0);
  });
  await check("잘못된 기준·조건·페이지는 오류, 조건 무시 없음", async () => {
    for (const input of [{ standard: "fake" }, { standard: ["6사08-01"] }, { standard: "6사08-01", state: ["TITLE_ONLY"] }, { standard: "6사08-01", state: "fake" }, { state: "UNSUPPORTED" },
      { standard: "6사08-01", unknown: "x" }, { standard: "6사08-01", from: "2023-02-29" }, { standard: "6사08-01", from: "2025-01-01", to: "2024-01-01" },
      { standard: "6사08-01", page: "0" }, { standard: "6사08-01", sort: "fake" }]) await assert.rejects(search(input));
  });
  await check("기준 후보 없음·교집합 없음·필터 후 빈 결과 구분", async () => {
    const empty = await search({ standard: "6과12-02" }, { ...catalog, resources: [resources.find((item) => item.id === "FREE")] });
    assert.equal(empty.emptyReason, "STANDARD_NO_CANDIDATES");
    const combined = await search({ q: "가구 수선", standard: "6사08-01" }); assert.equal(combined.emptyReason, "COMBINED_NO_MATCH");
    const filtered = await search({ standard: "6사08-01", kind: "collection" }); assert.equal(filtered.emptyReason, "FILTERED_OUT");
    for (const result of [empty, combined, filtered]) { assert.equal(result.total, 0); assert.equal(result.pages, 0); assert.equal(result.page, 1); assert.deepEqual(result.results, []); assert.match(result.emptyMessage, /해제/); }
  });
  await check("실제 자료 사회·과학 대표10입력·여섯 과정/교과·해제·전체 후보 교집합", async () => {
    const source = await loadDiscoveryCatalog();
    const samples = [
      ["S-Q", "선거에서 시민이 대표를 뽑는 자료를 찾아줘", "", "초등 5학년"], ["S-S", "", "6사04-01", "all"],
      ["S-QS", "농경문 청동기", "6사04-01", "all"], ["S-U34", "주변 장소", "4사01-01", "초등 3학년"],
      ["S-UM1", "사막", "9사(지리)01-01", "중학교 1학년"], ["C-Q", "지구 자전과 낮과 밤을 설명하는 자료", "", "초등 6학년"],
      ["C-S", "", "6과12-02", "all"], ["C-QS", "지구 자전", "6과12-02", "all"],
      ["C-U34", "물체를 밀거나 당기는 현상", "4과01-01", "초등 4학년"], ["C-UM1", "마찰력", "9과05-02", "중학교 1학년"]
    ];
    const find = (input) => search(input, source, originalStore);
    for (const [id, q, standard, grade] of samples) {
      const input = { q, standard, grade }, result = await find(input);
      const rows = await collect(find, input);
      if (standard && q) {
        const query = ids(await collect(find, { q, grade })), selected = ids(await collect(find, { standard, grade }));
        assert.deepEqual(ids(rows), query.filter((item) => selected.includes(item)), id);
      }
      if (standard) {
        assert.equal(result.standard.standardId, standard); assert.equal(result.grade, grade);
        if (standard.startsWith("9")) { assert.equal(result.standard.gradeBand, "1~3학년군"); assert.equal(result.standard.placement.schoolPlacementConfirmed, false); }
      }
      live.push({ id, input, total: result.total, searchMode: result.searchMode, emptyReason: result.emptyReason,
        standardRuleSupported: result.standard?.ruleSupported ?? null, firstIds: result.results.map((item) => item.id) });
    }
  });
  await check("원본4저장소·독립평가 입력·승인 취소 이력 보존", async () => { assert.deepEqual(await hashes(), before); });
  const report = { checkedAt: new Date().toISOString(), passed: cases.length, cases, live, protectedHashes: before, paidApiCalls: 0,
    scope: "기능 fixture와 실제 대표 입력의 전체 판본 후보 대조. 독립 품질/교사 효용/영상 학년 적합성 평가 아님" };
  await fs.writeFile(process.env.CURI_REPORT_PATH || "docs/r07-07-combined-search-check.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: cases.length, live }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
