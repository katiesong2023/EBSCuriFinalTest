#!/usr/bin/env node
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const zlib = require("node:zlib");

let networkAttempts = 0;
const blockNetwork = () => { networkAttempts += 1; throw new Error("Network disabled for teacher query check"); };
global.fetch = blockNetwork;
net.Socket.prototype.connect = blockNetwork;

const { discoverContents } = require("./discovery-search");
const { parseDiscoveryIntent } = require("./discovery-intent");
const { tagResource } = require("./semantic-layer");

const root = path.resolve(__dirname, "..");
const queryPath = path.join(__dirname, "data", "teacher-queries.json");
const defaultCatalogPath = path.join(__dirname, "data", "quality-catalog-20260930.json.gz");
const catalogPath = process.argv.find((arg) => arg.startsWith("--catalog="))?.slice("--catalog=".length) || defaultCatalogPath;
const approvalPath = path.join(__dirname, "data", "curi-store.json");
const codeFiles = ["discovery-search.js", "discovery-intent.js", "semantic-layer.js", "semantic-context.js"];
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Bytes = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const digestObject = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourceQueries = JSON.parse(fs.readFileSync(queryPath, "utf8"));
const catalogBytes = catalogPath.endsWith(".gz") ? zlib.gunzipSync(fs.readFileSync(catalogPath)) : fs.readFileSync(catalogPath);
const catalog = JSON.parse(catalogBytes.toString("utf8"));

// Small, separate precision draft. These expectations are deliberately strict and
// are recorded as observations; they are not used to turn an empty teacher search
// into a failure or to claim educational correctness.
const precisionResource = (id, title, summary = "", program = "검증용 프로그램") => ({
  id, kind: "episode", program, title, summary, sourceUrl: `https://www.ebs.co.kr/${id}`,
  evidenceUrl: `https://www.ebs.co.kr/${id}`, evidenceLevel: summary ? "SOURCE_DESCRIPTION" : "TITLE_ONLY",
  navigation: { url: `https://www.ebs.co.kr/${id}`, status: "PUBLISHED", kind: "EPISODE" },
  curriculumStatus: "NOT_ASSESSED", playbackStatus: "NOT_CHECKED"
});
const precisionCatalog = {
  version: "teacher-precision-draft-1", concepts: [], stats: {}, resources: [
    precisionResource("APRIL", "4·19 시민 참여 민주화"),
    precisionResource("MARATHON", "42.195km 달리기"),
    precisionResource("MINE1942", "1942 조세이 탄광"),
    precisionResource("DIGEST", "소화기관의 움직임", "소화기관이 움직이는 모습을 설명합니다."),
    precisionResource("FROZEN", "냉동인간 이야기"),
    precisionResource("HEART", "심장 박동 관찰"),
    precisionResource("CITY", "도시의 심장"),
    precisionResource("FOSSIL", "화석 발굴 현장"),
    precisionResource("PERSON", "화석 씨의 하루"),
    precisionResource("MYUNG", "명의 의학 다큐", "명의에서 실제 의학 사례를 다룹니다.", "명의"),
    precisionResource("CAREER", "진로 안내"),
    precisionResource("GREAT", "위대한 수업 강연", "석학 강연입니다.", "위대한 수업, 그레이트 마인즈"),
    precisionResource("ROME", "위대한 로마", "로마의 역사 다큐.", "EBS 다큐프라임"),
    precisionResource("WORLD", "사막의 사람들", "극한 기후의 삶을 소개합니다.", "세계테마기행"),
    precisionResource("OTHER", "여행 다큐 일반편", "여행 다큐입니다.", "다른 프로그램"),
    precisionResource("CIRCUIT", "전기 회로에서 전구가 켜지는 자료", "전기 회로에서 전구가 켜지는 과정을 원문으로 설명합니다."),
    precisionResource("MAGFORCE", "자석에 작용하는 힘", "자석에 작용하는 힘을 보여주는 자료입니다.")
  ]
};
const precisionCases = [
  ["사건 숫자 경계", "4·19", ["APRIL"]],
  ["소화기관 직접 근거", "소화기관", ["DIGEST"]],
  ["심장 비유 제외", "심장", ["HEART"]],
  ["화석 인명 제외", "화석", ["FOSSIL"]],
  ["명의 끝 조사 보존", "명의", ["MYUNG"]],
  ["진로 끝 조사 보존", "진로", ["CAREER"]],
  ["프로그램 고유명", "위대한 수업", ["GREAT"]],
  ["같은 프로그램 선호", "세계테마기행 같은 여행 다큐", ["WORLD"]]
];
const postfixPrecisionCases = [
  ["전기 회로에서 조사 제거", "전기 회로에서 전구가 켜지는 자료", ["CIRCUIT"]],
  ["한글자 주제 조사 제거", "자석에 작용하는 힘을 보여주세요", ["MAGFORCE"]]
];

function sourceEvidence(item) {
  return {
    id: item.id, title: item.title, program: item.program, summary: item.summary,
    sourceUrl: item.sourceUrl, evidenceUrl: item.evidenceUrl, evidenceLevel: item.evidenceLevel,
    semanticTags: (item.semanticTags || []).slice(0, 5).map((tag) => ({
      conceptId: tag.conceptId, label: tag.label, status: tag.status, evidence: tag.evidence
    }))
  };
}

async function main() {
  const phase = process.argv.includes("--phase=after") ? "after" : "before";
  const approvalBefore = sha256(approvalPath);
  const rows = [];
  for (const question of sourceQueries.queries) {
    const started = Date.now();
    try {
      const result = await discoverContents({ q: question.query }, catalog);
      const understanding = result.understanding || {};
      const topicCandidates = [
        ...(understanding.concepts || []).map((concept) => ({ type: "concept", id: concept.id, label: concept.label })),
        ...(result.results || []).slice(0, 10).flatMap((item) => (item.semanticTags || []).map((tag) => ({ type: "source-mention", id: tag.conceptId, label: tag.label })))
      ].filter((item, index, all) => all.findIndex((other) => other.type === item.type && other.id === item.id) === index);
      rows.push({
        id: question.id, subject: question.subject, unit: question.unit, query: question.query,
        elapsedMs: Date.now() - started, zeroResult: result.total === 0, total: result.total,
        interpretation: { terms: result.terms, concepts: result.concepts, understanding },
        topicCandidates, top3SourceEvidence: result.results.slice(0, 3).map(sourceEvidence), error: null
      });
    } catch (error) {
      rows.push({ id: question.id, subject: question.subject, unit: question.unit, query: question.query,
        elapsedMs: Date.now() - started, zeroResult: false, total: null, interpretation: null,
        topicCandidates: [], top3SourceEvidence: [], error: error.message });
    }
  }

  const precisionRows = [];
  for (const [name, query, expected] of precisionCases) {
    try {
      const result = await discoverContents({ q: query }, precisionCatalog);
      const actual = result.results.map((item) => item.id).sort();
      assert.deepEqual(actual, [...expected].sort());
      precisionRows.push({ name, query, expected, actual, passed: true, interpretation: result.understanding, candidates: result.concepts });
    } catch (error) {
      let actual = [];
      try { actual = (await discoverContents({ q: query }, precisionCatalog)).results.map((item) => item.id).sort(); } catch {}
      precisionRows.push({ name, query, expected, actual, passed: false, error: error.message });
    }
  }
  const postfixRows = [];
  if (phase === "after") for (const [name, query, expected] of postfixPrecisionCases) {
    try {
      const result = await discoverContents({ q: query }, precisionCatalog);
      const actual = result.results.map((item) => item.id).sort();
      assert.deepEqual(actual, [...expected].sort());
      postfixRows.push({ name, query, expected, actual, passed: true, interpretation: result.understanding, candidates: result.concepts });
    } catch (error) {
      let actual = [];
      try { actual = (await discoverContents({ q: query }, precisionCatalog)).results.map((item) => item.id).sort(); } catch {}
      postfixRows.push({ name, query, expected, actual, passed: false, error: error.message });
    }
  }

  const approvalAfter = sha256(approvalPath);
  const report = {
    phase, generatedAt: new Date().toISOString(), scope: "고정 R09 카탈로그·사용자 제공 교사 질의; 교육적 정답률 평가 아님",
    queryFile: path.relative(root, queryPath), queryFileSha256: sha256(queryPath), queryCount: sourceQueries.queries.length,
    catalogFile: catalogPath, catalogFixtureHash: sha256Bytes(catalogBytes), precisionFixtureHash: digestObject(precisionCatalog),
    codeHashes: Object.fromEntries((phase === "after" && fs.existsSync(path.join(__dirname, "discovery-request.js"))
      ? [...codeFiles, "discovery-request.js"] : codeFiles).map((name) => [name, sha256(path.join(__dirname, name))])),
    approvalFile: path.relative(root, approvalPath), approvalSha256Before: approvalBefore, approvalSha256After: approvalAfter,
    approvalUnchanged: approvalBefore === approvalAfter, networkAttempts,
    executionErrors: rows.filter((row) => row.error).length, zeroResultCount: rows.filter((row) => row.zeroResult).length,
    rows,
    precisionDraft: { passed: precisionRows.filter((row) => row.passed).length, failed: precisionRows.filter((row) => !row.passed).length, rows: precisionRows },
    postfixPrecisionDraft: { passed: postfixRows.filter((row) => row.passed).length, failed: postfixRows.filter((row) => !row.passed).length, rows: postfixRows }
  };
  const output = process.env.CURI_REPORT_PATH || path.join(root, "docs", `teacher-query-${phase}.json`);
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (networkAttempts || !report.approvalUnchanged || report.executionErrors) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
