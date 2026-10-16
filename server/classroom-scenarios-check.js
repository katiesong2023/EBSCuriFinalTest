// 가상 수업 요청의 검색 범위를 측정한다. 결과 존재는 정답·수업 적합성 판정이 아니다.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { loadDiscoveryCatalog, catalogPaths } = require("./discovery-catalog");
const { discoverContents } = require("./discovery-search");

async function main() {
  const scenarios = JSON.parse(await fs.readFile(path.join(__dirname, "data/classroom-scenarios.json"), "utf8"));
  assert.equal(scenarios.length, 30);
  assert.equal(new Set(scenarios.map((item) => item.id)).size, 30);
  const hashStore = async () => crypto.createHash("sha256").update(await fs.readFile(catalogPaths.store)).digest("hex");
  const before = await hashStore();
  const catalog = await loadDiscoveryCatalog();
  const rows = [];
  const uniqueCandidates = new Set();
  for (const scenario of scenarios) {
    for (const field of ["id", "area", "situation", "teacherQuery", "keyword", "need"]) assert.ok(scenario[field]);
    const query = await discoverContents({ q: scenario.teacherQuery }, catalog);
    const probe = await discoverContents({ q: scenario.keyword }, catalog);
    const direct = await discoverContents({ q: scenario.keyword, access: "direct" }, catalog);
    const matches = [...probe.results];
    for (let page = 2; page <= probe.pages; page += 1) {
      matches.push(...(await discoverContents({ q: scenario.keyword, page }, catalog)).results);
    }
    matches.forEach((item) => uniqueCandidates.add(item.id));
    assert.equal(query.paidApiCalls + probe.paidApiCalls + direct.paidApiCalls, 0);
    rows.push({ ...scenario, requestTotal: query.total, requestTerms: query.terms,
      keywordTotal: probe.total, directTotal: direct.total,
      candidateIds: matches.map((item) => item.id),
      samples: matches.slice(0, 3).map((item) => ({ id: item.id, title: item.title, kind: item.kind, evidenceLevel: item.evidenceLevel, url: item.navigation.url })),
      gap: probe.total === 0 ? "핵심어도 0건 · 자료·표현 추가 조사" : query.total === 0
        ? "핵심어 후보 있음 · 요청 해석 부족" : "검색 후보 있음 · 내용 적합성 미판정" });
  }
  const after = await hashStore();
  assert.equal(after, before, "실제 승인 저장소가 변경되면 안 됩니다.");
  const summary = {
    scenarios: rows.length,
    requestsWithResults: rows.filter((row) => row.requestTotal > 0).length,
    keywordsWithResults: rows.filter((row) => row.keywordTotal > 0).length,
    keywordsWithDirectResults: rows.filter((row) => row.directTotal > 0).length,
    uniqueKeywordCandidates: uniqueCandidates.size,
    keywordGaps: rows.filter((row) => row.keywordTotal === 0).map((row) => row.id)
  };
  const report = { generatedAt: new Date().toISOString(), method: "현재 출처 기반 탐색 엔진의 가상 수업 요청·핵심어 전수 실행. 교사 평가·정답셋 아님.",
    catalog: catalog.stats, summary, paidApiCalls: 0, storeUnchanged: before === after, storeSha256: after, rows };
  const cell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  const lines = ["# 수업 탐색 시나리오 30개", "", `실행: ${report.generatedAt} · 재실행: \`npm run simulate:classroom\``, "",
    "교사가 사용할 법한 가상 상황을 5개 영역에 6개씩 구성했다. 초등 수업 준비를 위한 요구 목록이며, 공식 성취기준 매핑·학년 적합성 승인·실제 교사 평가를 뜻하지 않는다.", "",
    "## 현재 결과", "",
    `- 보유 개별 자료 ${catalog.stats.individual}건, 개별 도착 페이지 확인 ${catalog.stats.directLinks}건. 시나리오 추가로 콘텐츠가 늘어난 것은 아니다.`,
    `- 요청 문장 그대로 후보가 나온 경우: ${summary.requestsWithResults}/30.`,
    `- 작성자가 고른 핵심어로 후보가 나온 경우: ${summary.keywordsWithResults}/30. 이 수치는 자연어 검색 성공률이 아니다.`,
    `- 핵심어 결과에 개별 페이지 확인 자료가 있는 경우: ${summary.keywordsWithDirectResults}/30.`,
    `- 핵심어 결과 전체의 중복 제거 자료: ${summary.uniqueKeywordCandidates}건. 여러 시나리오의 결과 수를 콘텐츠 수로 합산하지 않는다.`,
    "- 유료 API 호출 0회. 실제 승인 저장소 변경 없음. 영상 재생·정답률·교육적 적합성은 측정하지 않았다.", "",
    "## 읽는 방법", "",
    "요청은 문장을 그대로 검색한 건수, 핵심어는 문서 작성자가 명시적으로 줄인 검색어의 건수, 개별 링크는 핵심어 결과 중 클립·회차 도착 페이지가 확인된 건수다. 모두 프로그램 묶음을 제외한다. 0건은 현재 검색에서 못 찾았다는 뜻이며 EBS 전체에 자료가 없다는 뜻은 아니다.", "",
    "일반 검색은 제목·소개문의 단어 조건을 사용한다. 장소 확장은 기존 3개 개념만 지원한다. 후보가 많아도 부분 문자열 일치나 소개문 주변 문맥 때문에 무관한 자료가 섞일 수 있다. 재생 시간·자막 조건은 아직 지원하지 않는다.", "",
    "## 시나리오별 결과", "",
    "| ID · 영역 | 수업 상황 / 실제 요청 | 핵심어 | 요청 | 핵심어 | 개별 링크 | 현재 한계 |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
    ...rows.map((row) => `| ${row.id} · ${row.area} | ${cell(row.situation)} / ${cell(row.teacherQuery)} | ${cell(row.keyword)} | ${row.requestTotal} | ${row.keywordTotal} | ${row.directTotal} | ${row.gap}${row.unsupportedConstraint ? ` · ${row.unsupportedConstraint}` : ""} |`), "",
    "## 필요한 근거와 실제 검색 표본", "",
    "아래는 검색 순서상 최대 3건의 표본이다. 추천 승인 목록이 아니다. 전체 ID는 JSON 보고서의 candidateIds에 기록한다.", "",
    "| ID | 수업 활용에 필요한 근거 | 검색 표본 |", "| --- | --- | --- |",
    ...rows.map((row) => `| ${row.id} | ${cell(row.need)} | ${row.samples.map((sample) => `${sample.id} · [${cell(sample.title)}](${sample.url})`).join(" / ") || "없음"} |`), "",
    "## 다음 작업의 우선순위", "",
    "모집단 확대는 [일반방송 회차 5,000건 이상 설계](DATA_EXPANSION_5000.md)를 따른다. 이 30개 시나리오는 자료 범위를 제한하는 목록이 아니라 확대 전후의 검색 공백을 비교하는 기준선이다.", "",
    `1. 핵심어도 0건인 ${rows.filter((row) => !row.keywordTotal).map((row) => row.keyword).join("·")}부터 공식 개별 회차·클립의 확보 가능성을 조사한다. 단어가 달라 못 찾은 것인지도 확인한다.`,
    "2. 후보가 있으나 요청 문장으로 못 찾는 경우는 학년·수업 목적·주제·제약의 분리 문제다. 자료 수집과 별도 개선 대상으로 둔다. 미지원 시간·자막 조건을 무시한 채 검색 성공으로 처리하지 않는다.",
    "3. 지리 개념은 소개문·상품 목록·강의 목록보다 실제 해당 회차·클립 링크와 장면 근거를 보강한다.",
    "4. 각 우선 주제에서 서로 비교 가능한 자료 3건 이상을 확보하는 것을 다음 수집 목표로 제안한다. 이는 설계 목표이며 검증된 출시 기준은 아니다. 사람에게는 근거가 확보된 후보의 최종 적합성만 요청한다.", "",
    "홈페이지의 예시는 현재 후보가 있는 검색어를 쉽게 실행하는 진입점이다. 여기의 30개 요구가 모두 지원된다는 뜻은 아니다.", ""];
  const docs = path.resolve(__dirname, "../docs");
  await fs.writeFile(path.join(docs, "classroom-simulation.json"), JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(docs, "CLASSROOM_SCENARIOS.md"), lines.join("\n"));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
