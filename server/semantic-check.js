// 외부·로컬 네트워크를 막고 고정 원문으로 의미 검색 계약을 검증한다.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const net = require("node:net");
const { tagResource, getSemanticIndex, ruleVersion } = require("./semantic-layer");
const { parseDiscoveryIntent } = require("./discovery-intent");
const { discoverContents } = require("./discovery-search");
const { getInferenceContext } = require("./semantic-context");
async function main() {
  const originalFetch = global.fetch, originalConnect = net.Socket.prototype.connect;
  let networkAttempts = 0;
  const block = () => { networkAttempts++; throw new Error("네트워크 금지"); };
  global.fetch = block; net.Socket.prototype.connect = block;
  const resource = (id, title, summary = "") => ({ id, title, summary, program: "검증용 원문",
    kind: "episode", sourceUrl: "https://www.ebs.co.kr/test", evidenceUrl: "https://www.ebs.co.kr/list",
    checkedAt: "2026-09-30", evidenceLevel: summary ? "SOURCE_DESCRIPTION" : "TITLE_ONLY",
    navigation: { url: "https://www.ebs.co.kr/test", status: "PUBLISHED" },
    curriculumStatus: "NOT_ASSESSED", playbackStatus: "NOT_CHECKED" });
  const catalog = { version: "fixture", concepts: [], stats: {}, resources: [
    resource("A", "꿀벌과 식물", "꿀벌의 행동과 식물을 관찰한다."),
    resource("B", "우리 몸의 면역", "백혈구와 항체의 역할"),
    resource("C", "우주", "태양계와 행성 이야기"),
    resource("D", "기후변화와 바다", "기후 변화에 따른 해양 환경"),
    resource("E", "빛나는 이야기", "도구를 활용해 만든 작품"),
    resource("F", "생태계", "야생 동물과 생태계"),
    resource("G", "면역", "항체"),
    resource("H", "면역 만화", "항체")
  ] };
  const cases = [];
  async function check(name, operation) { await operation(); cases.push({ name, passed: true }); }
  try {
    await check("근거 위치·구절·출처는 원문과 일치", () => {
      for (const item of catalog.resources) for (const tag of tagResource(item).supported) {
        assert.equal(item[tag.evidence.field].slice(tag.evidence.start, tag.evidence.end), tag.evidence.quote);
        assert.ok(tag.evidence.sourceUrl.startsWith("https://www.ebs.co.kr/"));
        assert.equal(tag.ruleVersion, ruleVersion);
      }
    });
    await check("제목만 있는 자료에 소개문 근거를 생성하지 않음", () => {
      assert.equal(tagResource(resource("X", "우주")).supported.length, 0);
    });
    await check("프로그램명·추측 메타데이터로 주제 태그를 만들지 않음", () => {
      assert.equal(tagResource({ ...resource("X", "제목 없음"), program: "우주", subject: "면역" }).supported.length, 0);
    });
    await check("활용해·빛나는 부분 일치 오탐 방지", () => {
      assert.equal(tagResource(catalog.resources[4]).supported.length, 0);
    });
    await check("동의어·띄어쓰기·조사 해석", async () => {
      for (const q of ["면역", "항체를 설명하는 영상을 찾아줘"]) assert.equal((await discoverContents({ q }, catalog)).total, 3);
      assert.equal((await discoverContents({ q: "기후 변화" }, catalog)).total, 1);
    });
    await check("개발 예문과 다른 자연어 문장", async () => {
      const result = await discoverContents({ q: "백혈구의 역할을 쉽게 설명할 자료를 보여주세요" }, catalog);
      assert.deepEqual(result.terms, []); assert.equal(result.total, 3);
    });
    await check("복수 주제 AND는 같은 자료의 원문 근거 필요", async () => {
      assert.equal((await discoverContents({ q: "꿀벌과 식물" }, catalog)).total, 1);
      assert.equal((await discoverContents({ q: "꿀벌과 면역" }, catalog)).total, 0);
    });
    await check("또는 OR 해석", async () => {
      assert.equal((await discoverContents({ q: "꿀벌 또는 면역" }, catalog)).total, 4);
    });
    await check("복합 개념 내부 단어를 별도 AND 조건으로 중복 해석하지 않음", () => {
      assert.deepEqual(parseDiscoveryIntent("전기 회로에서 전구가 켜지는 조건").concepts.map((item) => item.id), ["circuit"]);
    });
    await check("제외어를 결과에도 적용", async () => {
      const result = await discoverContents({ q: "면역 영상 중 만화는 빼고 찾아줘" }, catalog);
      assert.equal(result.total, 2); assert.ok(result.results.every((item) => !item.title.includes("만화")));
    });
    await check("알려지지 않은 이름·조건은 검색어로 보존", async () => {
      const result = await discoverContents({ q: "우주 트라피스트X999 자료를 찾아줘" }, catalog);
      assert.equal(result.total, 0); assert.ok(result.terms.includes("트라피스트x999"));
    });
    await check("시간·자막·학년·무료 조건을 충족했다고 주장하지 않음", async () => {
      const result = await discoverContents({ q: "5학년이 볼 자막 포함 5분 이내 무료 면역 영상" }, catalog);
      assert.equal(result.total, 3);
      assert.equal(result.understanding.constraints.durationMinutes, 5);
      assert.ok(result.understanding.warnings.length >= 4);
    });
    await check("관계·비교·장르 요청의 확인 한계 표시", () => {
      const parsed = parseDiscoveryIntent("꿀벌과 식물의 관계를 비교할 다큐를 찾아줘");
      assert.equal(parsed.intent, "COMPARE"); assert.ok(parsed.warnings.length >= 2);
    });
    await check("상위 개념 추론 후보를 직접 원문 일치로 승격하지 않음", async () => {
      const tag = tagResource(resource("X", "면역", "항체의 역할을 소개한다."));
      assert.ok(tag.candidates.some((item) => item.conceptId === "body" && item.status === "INFERRED_CANDIDATE"));
      const result = await discoverContents({ q: "인체" }, { ...catalog, resources: [resource("X", "면역", "항체의 역할을 소개한다.")] });
      assert.equal(result.total, 0);
    });
    await check("원문 변경은 내용 지문과 태그를 갱신", () => {
      const before = tagResource(resource("X", "우주")), after = tagResource(resource("X", "면역", "항체의 역할을 소개한다."));
      assert.notEqual(before.contentHash, after.contentHash);
      assert.ok(after.supported.every((tag) => tag.conceptId !== "space"));
    });
    await check("카탈로그 스냅샷 캐시 재사용·다음 스냅샷 분리", () => {
      assert.equal(getSemanticIndex(catalog), getSemanticIndex(catalog));
      assert.notEqual(getSemanticIndex(catalog), getSemanticIndex(structuredClone(catalog)));
    });
    await check("추론용 컨텍스트 크기·개수 상한과 출처 보존", async () => {
      const large = { ...catalog, resources: Array.from({ length: 20 }, (_, i) => resource(`L${i}`, "우주", "우주와 행성 ".repeat(4000))) };
      const context = await getInferenceContext({ q: "우주" }, large);
      assert.ok(context.resources.length > 0 && context.resources.length <= 6);
      assert.ok(JSON.stringify(context).length <= 24000);
      assert.ok(context.resources.every((item) => item.resourceId && item.sourceMentions.length && item.synopsis.length <= 1000));
      assert.equal(context.constraints.paidApiCalls, 0);
    });
    await check("빈 검색 결과의 컨텍스트에 가짜 자료 없음", async () => {
      assert.equal((await getInferenceContext({ q: "외계어Z99" }, catalog)).resources.length, 0);
    });
    await check("승인·재생 상태는 검색 후에도 미판정", async () => {
      const result = await discoverContents({ q: "면역" }, catalog);
      assert.ok(result.results.every((item) => item.curriculumStatus === "NOT_ASSESSED" && item.playbackStatus === "NOT_CHECKED"));
    });
    assert.equal(networkAttempts, 0);
    const report = { generatedAt: new Date().toISOString(), ruleVersion, cases, passed: cases.length, networkAttempts, paidApiCalls: 0,
      note: "고정 원문 기반 계약 검사. 실데이터 정답률 및 교육적 적합성 평가와 별도." };
    await fs.writeFile(process.env.CURI_REPORT_PATH || new URL("../docs/semantic-check.json", `file://${__filename}`), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { global.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
