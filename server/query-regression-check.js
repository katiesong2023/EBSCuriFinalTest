#!/usr/bin/env node
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

// This check never loads the live catalog. It exercises the current modules against
// a small, immutable in-memory catalog so concurrent collection cannot affect it.
let networkAttempts = 0;
const blocked = () => { networkAttempts += 1; throw new Error("Network disabled for query regression"); };
global.fetch = blocked;
net.Socket.prototype.connect = blocked;

const { discoverContents } = require("./discovery-search");
const { tagResource, getSemanticIndex } = require("./semantic-layer");
const { getInferenceContext } = require("./semantic-context");

const resource = (id, title, summary = "") => ({
  id, title, summary, kind: "episode", program: "검증용 가상 자료",
  sourceUrl: `https://www.ebs.co.kr/${id}`, evidenceUrl: `https://www.ebs.co.kr/${id}`,
  evidenceLevel: summary ? "SOURCE_DESCRIPTION" : "TITLE_ONLY",
  navigation: { url: `https://www.ebs.co.kr/${id}`, status: "PUBLISHED", kind: "EPISODE" },
  curriculumStatus: "NOT_ASSESSED", playbackStatus: "NOT_CHECKED"
});

const fixture = Object.freeze({
  version: "query-regression-fixture-1",
  stats: { fixture: true },
  concepts: [{
    id: "coast", label: "해안 지형", aliases: ["해안 지형", "해안지형"],
    places: [{ name: "한려해상", role: "해안 지형 사례", note: "fixture", resourceIds: ["COAST"] }],
    directResourceIds: [], sourceUrl: "https://www.ebs.co.kr/coast"
  }],
  resources: [
    resource("SPACE", "우주 탐사", "우주와 행성의 탐사 방법을 소개합니다."),
    resource("BODY", "인체 탐험", "인체와 소화 기관을 소개합니다."),
    resource("MOUNTAIN", "설악산 풍경", "설악산의 산세와 능선을 소개합니다."),
    resource("PLAIN", "김제 풍경", "김제평야의 지평선을 소개합니다."),
    resource("COAST", "한려해상 해안 지형", "해안 지형과 바닷물의 침식을 소개합니다."),
    resource("DISSOLVE", "물에 녹는 소금", "물에 녹는 소금의 용해를 소개합니다."),
    resource("FALSE", "자료를 활용해 보세요"),
    resource("BEE", "꿀벌의 하루", "꿀벌과 식물의 관계를 소개합니다."),
    resource("CLIMATE", "기후 변화", "기후 변화의 원인을 소개합니다."),
    resource("WEATHER", "날씨 관측", "날씨를 관측합니다.")
  ]
});

const ids = async (q, catalog = fixture) => (await discoverContents({ q }, catalog)).results.map((item) => item.id).sort();
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const codeFiles = ["discovery-search.js", "discovery-intent.js", "semantic-layer.js", "semantic-context.js", "discovery-request.js"];
const approvalFile = path.join(__dirname, "data/curi-store.json");

const tests = [
  ["알려진 주제 검색", "우주", async () => assert.deepEqual(await ids("우주"), ["SPACE"])],
  ["요청 문장 주제 추출", "우주를 탐사하는 자료를 찾아줘", async () => assert.deepEqual(await ids("우주를 탐사하는 자료를 찾아줘"), ["SPACE"])],
  ["알려진 주제의 OR", "우주 또는 인체", async () => assert.deepEqual(await ids("우주 또는 인체"), ["BODY", "SPACE"])],
  ["고유명사 OR", "설악산 또는 김제", async () => assert.deepEqual(await ids("설악산 또는 김제"), ["MOUNTAIN", "PLAIN"])],
  ["단일어 제외", "우주 말고 인체", async () => assert.deepEqual(await ids("우주 말고 인체"), ["BODY"])],
  ["구 제외 후 주제 보존", "해안 지형 제외하고 우주", async () => assert.deepEqual(await ids("해안 지형 제외하고 우주"), ["SPACE"])],
  ["주제 조건 시간 자막 경고", "우주 5분 이내 자막 포함", async () => {
    const result = await discoverContents({ q: "우주 5분 이내 자막 포함" }, fixture);
    assert.equal(result.total, 1); assert.equal(result.understanding.warnings.length, 2);
  }],
  ["고유명사 시간 조건 분리", "김제 5분 이내", async () => assert.deepEqual(await ids("김제 5분 이내"), ["PLAIN"])],
  ["부분문자열 오탐 방지", "용해", async () => assert.deepEqual(await ids("용해"), ["DISSOLVE"])],
  ["추론 후보를 검색 근거에서 제외", "생태계", async () => assert.deepEqual(await ids("생태계"), [])],
  ["미보유 주제의 빈 결과", "양자중력", async () => assert.deepEqual(await ids("양자중력"), [])],
  ["복수 개념 AND 유지", "우주와 인체", async () => assert.deepEqual(await ids("우주와 인체"), [])],
  ["근거 구절과 오프셋 일치", "전체 fixture", async () => {
    for (const item of fixture.resources) for (const tag of tagResource(item).supported)
      assert.equal(item[tag.evidence.field].slice(tag.evidence.start, tag.evidence.end), tag.evidence.quote);
  }],
  ["변경 자료의 새 카탈로그에서 태그 재생성", "우주 → 인체", async () => {
    const a = { ...fixture, resources: [resource("X", "우주", "우주와 행성의 탐사를 소개한다.")] };
    const b = { ...fixture, resources: [resource("X", "인체", "인체의 기관과 기능을 설명한다.")] };
    assert.notEqual(getSemanticIndex(a).get("X").contentHash, getSemanticIndex(b).get("X").contentHash);
    assert.deepEqual(await ids("우주", b), []); assert.deepEqual(await ids("인체", b), ["X"]);
  }],
  ["검색 입력 길이 검증", "201자", async () => assert.rejects(discoverContents({ q: "x".repeat(201) }, fixture))],
  ["프로덕션 근거 묶음 상한", "우주", async () => {
    const result = await getInferenceContext({ q: "우주" }, fixture);
    assert.equal(result.resources.length, 1); assert.ok(JSON.stringify(result).length <= result.constraints.maxSerializedCharacters);
    assert.equal(result.constraints.paidApiCalls, 0);
  }],
  ["일반 검색어 OR", "설악산 또는 김제 풍경", async () => assert.deepEqual(await ids("설악산 또는 김제 풍경"), ["MOUNTAIN", "PLAIN"])],
  ["여러 단어 제외", "우주 말고 인체 탐험", async () => assert.deepEqual(await ids("우주 말고 인체 탐험"), ["BODY"])],
  ["혼합 개념·일반어 OR", "우주 또는 설악산", async () => assert.deepEqual(await ids("우주 또는 설악산"), ["MOUNTAIN", "SPACE"])],
  ["혼합 개념·일반어 AND", "우주와 설악산", async () => assert.deepEqual(await ids("우주와 설악산"), [])],
  ["원문 근거 검색 결과 보존", "우주", async () => {
    const result = await discoverContents({ q: "우주" }, fixture);
    assert.equal(result.results[0].semanticTags[0].evidence.quote, "우주");
    assert.equal(result.results[0].semanticTags[0].evidence.field, "summary");
  }]
];

const afterTests = [
  ["새 표현 OR", "설악산 혹은 김제", async () => assert.deepEqual(await ids("설악산 혹은 김제"), ["MOUNTAIN", "PLAIN"])],
  ["지리 개념 제외 후 주제 보존", "해안지형을 빼고 우주", async () => {
    const result = await discoverContents({ q: "해안지형을 빼고 우주" }, fixture);
    assert.deepEqual(result.results.map((item) => item.id), ["SPACE"]);
    assert.equal(result.concepts.some((concept) => concept.id === "coast"), false);
    assert.equal(result.terms.some((term) => /해안|지형/.test(term)), false);
    assert.equal(result.understanding.concepts.some((concept) => concept.id === "coast"), false);
    assert.ok(result.understanding.excluded.some((term) => /해안/.test(term)));
  }],
  ["복합 개념 제외 후 주제 보존", "기후 변화를 제외하고 인체", async () => assert.deepEqual(await ids("기후 변화를 제외하고 인체"), ["BODY"])],
  ["새 시간 조건 분리", "김제 7분 이하", async () => assert.deepEqual(await ids("김제 7분 이하"), ["PLAIN"])],
  ["분기별 AND와 전체 OR", "우주 설악산 또는 김제", async () => {
    const result = await discoverContents({ q: "우주 설악산 또는 김제" }, fixture);
    assert.deepEqual(result.results.map((item) => item.id), ["PLAIN"]);
    assert.equal(result.results.some((item) => /설악산|우주/.test(item.reason)), false);
  }],
  ["따옴표 복합 제외", "\"인체 탐험\" 제외하고 우주", async () => {
    const result = await discoverContents({ q: "\"인체 탐험\" 제외하고 우주" }, fixture);
    assert.deepEqual(result.results.map((item) => item.id), ["SPACE"]);
    assert.ok(result.understanding.excluded.includes("인체 탐험"));
  }]
];

async function main() {
  const phase = process.argv.includes("--phase=after") ? "after" : "before";
  const approvalBefore = sha256(approvalFile);
  const rows = [];
  for (const [name, input, run] of tests) {
    try { await run(); rows.push({ name, input, passed: true }); }
    catch (error) { rows.push({ name, input, passed: false, error: error.message }); }
  }
  const newRows = [];
  if (phase === "after") for (const [name, input, run] of afterTests) {
    try { await run(); newRows.push({ name, input, passed: true }); }
    catch (error) { newRows.push({ name, input, passed: false, error: error.message }); }
  }
  const approvalAfter = sha256(approvalFile);
  const sourceHashes = Object.fromEntries(codeFiles.map((name) => [name, sha256(path.join(__dirname, name))]));
  const fixtureHash = crypto.createHash("sha256").update(JSON.stringify(fixture)).digest("hex");
  const report = {
    phase, generatedAt: new Date().toISOString(), scope: "고정 가상 자료·현재 server 모듈; 실제 검색 정확도 평가 아님",
    codeHashes: sourceHashes, fixtureHash, approvalFile: path.relative(path.join(__dirname, ".."), approvalFile),
    approvalSha256Before: approvalBefore, approvalSha256After: approvalAfter, approvalUnchanged: approvalBefore === approvalAfter,
    networkAttempts, passed: rows.filter((row) => row.passed).length, failed: rows.filter((row) => !row.passed).length, rows,
    newCasePassed: newRows.filter((row) => row.passed).length, newCaseFailed: newRows.filter((row) => !row.passed).length,
    newCases: newRows
  };
  const output = process.env.CURI_REPORT_PATH || path.join(__dirname, "..", "docs", `query-regression-${phase}.json`);
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (networkAttempts || !report.approvalUnchanged || (phase === "after" && (report.failed || report.newCaseFailed))) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
