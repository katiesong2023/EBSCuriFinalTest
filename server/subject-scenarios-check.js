// 사회·과학 요청의 자료 공백과 문장 해석 공백을 분리한다. 교육적 정답 평가는 아니다.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");

async function main() {
  const startedAt = new Date().toISOString();
  let networkAttempts = 0;
  const blocked = () => { networkAttempts += 1; throw new Error("오프라인 검증 중 네트워크 호출 금지"); };
  const originalFetch = global.fetch;
  const originalConnect = net.Socket.prototype.connect;
  const originalPaid = process.env.CURI_ALLOW_PAID_API;
  global.fetch = blocked;
  net.Socket.prototype.connect = blocked;
  process.env.CURI_ALLOW_PAID_API = "false";
  try {
    const { loadDiscoveryCatalog, catalogPaths } = require("./discovery-catalog");
    const { discoverContents } = require("./discovery-search");
    const { broadcastPath } = require("./broadcast-store");
    const digest = async (filename) => crypto.createHash("sha256").update(await fs.readFile(filename)).digest("hex");
    const before = { approval: await digest(catalogPaths.store), broadcasts: await digest(broadcastPath) };
    const catalog = await loadDiscoveryCatalog();
    // 사전 고정한 12개씩의 가상 요구. 과학은 생태·기후·인체·우주를 먼저 배치한다.
    const definitions = {
      사회: [
        ["동고서저", "우리나라 동고서저 지형을 비교할 방송을 찾아줘"],
        ["인구", "인구 감소가 지역에 미치는 영향을 보여주는 자료를 찾아줘"],
        ["민주주의", "민주주의와 시민 참여를 설명하는 방송을 찾아줘"],
        ["경제", "생활 속 경제 활동을 비교할 자료를 찾아줘"],
        ["다문화", "다문화 사회의 생활 모습을 보여주는 방송을 찾아줘"],
        ["고인돌", "고인돌을 통해 옛사람들의 생활을 알아볼 자료를 찾아줘"],
        ["대동여지도", "대동여지도와 오늘날 지도를 비교할 방송을 찾아줘"],
        ["물가", "물가 변화가 가정생활에 미치는 영향을 찾아줘"],
        ["문화", "지역마다 다른 문화를 비교할 방송을 찾아줘"],
        ["해안 지형", "해안 지형의 모습을 비교할 방송을 찾아줘"],
        ["유관순", "유관순의 독립운동을 알아볼 방송을 찾아줘"],
        ["기후 변화", "기후 변화에 대응하는 지역 사회의 노력을 찾아줘"]
      ],
      과학: [
        ["생태", "생태계의 다양한 생물 관계를 보여주는 다큐를 찾아줘"],
        ["꿀벌", "꿀벌과 식물의 관계를 관찰할 다큐를 찾아줘"],
        ["야생동물", "야생동물이 환경에 적응하는 모습을 찾아줘"],
        ["기후 변화", "기후 변화가 지구 환경에 미치는 영향을 찾아줘"],
        ["구름", "구름이 생기는 과정을 관찰할 방송을 찾아줘"],
        ["인체", "인체 기관의 역할을 알아볼 다큐를 찾아줘"],
        ["면역", "우리 몸의 면역 작용을 설명하는 방송을 찾아줘"],
        ["우주", "우주를 탐사하는 방법을 알아볼 다큐를 찾아줘"],
        ["달의 모양", "달의 모양 변화를 관찰할 방송을 찾아줘"],
        ["전기 회로", "전기 회로에서 전구가 켜지는 조건을 찾아줘"],
        ["용해", "물질의 용해를 관찰할 수 있는 방송을 찾아줘"],
        ["자석", "자석 사이에 작용하는 힘을 보여주는 방송을 찾아줘"]
      ]
    };
    const rows = [];
    for (const [subject, scenarios] of Object.entries(definitions)) {
      for (const [index, [keyword, query]] of scenarios.entries()) {
        const started = performance.now();
        const request = await discoverContents({ q: query }, catalog);
        const probe = await discoverContents({ q: keyword }, catalog);
        const direct = await discoverContents({ q: keyword, access: "direct" }, catalog);
        for (const result of [request, probe, direct]) {
          assert.equal(result.paidApiCalls, 0);
          assert.ok(Number.isInteger(result.total) && result.total >= 0);
          assert.ok(result.results.every((item) => item.curriculumStatus === "NOT_ASSESSED"));
          assert.equal(new Set(result.results.map((item) => item.id)).size, result.results.length);
        }
        rows.push({ id: `${subject === "사회" ? "SOC" : "SCI"}-${String(index + 1).padStart(2, "0")}`,
          subject, keyword, query, requestTotal: request.total, keywordTotal: probe.total, directTotal: direct.total,
          requestTerms: request.terms, elapsedMs: +(performance.now() - started).toFixed(2),
          gap: !probe.total ? "자료 또는 표현 공백" : !request.total ? "요청 해석 공백" : "후보 존재·적합성 미판정",
          samples: probe.results.slice(0, 3).map((item) => ({ id: item.id, title: item.title,
            program: item.program, evidenceLevel: item.evidenceLevel, url: item.navigation.url })) });
      }
    }
    const after = { approval: await digest(catalogPaths.store), broadcasts: await digest(broadcastPath) };
    assert.deepEqual(after, before);
    assert.equal(networkAttempts, 0);
    const summary = Object.fromEntries(Object.keys(definitions).map((subject) => {
      const selected = rows.filter((row) => row.subject === subject);
      return [subject, { scenarios: selected.length, requestsWithResults: selected.filter((row) => row.requestTotal > 0).length,
        keywordsWithResults: selected.filter((row) => row.keywordTotal > 0).length,
        keywordsWithDirectResults: selected.filter((row) => row.directTotal > 0).length,
        gaps: selected.filter((row) => !row.keywordTotal).map((row) => row.keyword) }];
    }));
    const report = { startedAt, finishedAt: new Date().toISOString(), method: "사회 12·과학 12개 가상 요청을 문장·핵심어·대조 링크 조건으로 각 1회 실행. 72개 검색 함수 직접 호출. HTTP·유료 API·모델 다운로드 없음.",
      contractChecksPassed: rows.length, searchExecutions: rows.length * 3, networkAttempts, paidApiCalls: 0,
      storageUnchanged: true, hashes: after, catalog: catalog.stats, summary, rows,
      limitations: ["후보 존재는 정답률이나 수업 적합성 통과가 아니다.", "태그가 원문에 존재해도 요청한 관계·장면·학년 적합성을 충족한다는 뜻은 아니다.", "개발에 사용한 24개 질문의 회귀 결과이며 독립 정답률 평가가 아니다. 최초 기준선은 subject-before-semantic.json에 보존한다."] };
    await fs.writeFile(path.join(__dirname, "../docs/subject-simulation.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ summary, searchExecutions: report.searchExecutions, networkAttempts, storageUnchanged: true }, null, 2));
  } finally {
    global.fetch = originalFetch;
    net.Socket.prototype.connect = originalConnect;
    if (originalPaid === undefined) delete process.env.CURI_ALLOW_PAID_API;
    else process.env.CURI_ALLOW_PAID_API = originalPaid;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
