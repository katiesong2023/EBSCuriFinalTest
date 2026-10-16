// 실제 승인 저장소는 읽기만 하고, 같은 자산의 메모리 복사본으로 고유사도 오탐을 검사한다.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const net = require("node:net");
const { readDataStore } = require("./data-store");
const { createNaturalSearch, searchVerifiedContents } = require("./natural-search");
async function main() {
  const file = require.resolve("./data/curi-store.json");
  const digest = async () => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
  const before = await digest();
  const store = await readDataStore();
  // 모든 벡터가 완벽하게 유사해도 원문·검수 기록에 없는 주제는 통과하면 안 된다.
  const vector = [1, ...Array(383).fill(0)];
  for (const row of store.searchProjection) row.vector = vector;
  const originalFetch = global.fetch, originalConnect = net.Socket.prototype.connect;
  let networkAttempts = 0;
  const block = () => { networkAttempts++; throw new Error("오프라인 주제 검사에서 네트워크 금지"); };
  global.fetch = block; net.Socket.prototype.connect = block;
  const service = createNaturalSearch({ readStore: async () => structuredClone(store),
    createEmbedder: () => ({ async embed() { return { vector }; }, async close() {} }) });
  const cases = [];
  const input = { grade: "초등 5~6학년군", subject: "과학" };
  const check = async (name, query, expected, extras = {}) => {
    const r = await service({ ...input, query, ...extras });
    assert.deepEqual(r.results.map(x => x.title), expected, name);
    cases.push({ name, query, passed: true, total: r.total, state: r.state });
  };
  try {
    for (const sort of ["oldest", "newest", "relevance"]) {
      await check(`우주 요청의 날씨 오탐 차단: ${sort}`, "우주 관련 수업을 하고 싶어 주제를 선정해줘", [], { sort });
      await check(`정상 날씨 요청 유지: ${sort}`, "날씨 관련 수업을 하고 싶어 주제를 선정해줘", ["계절별 날씨의 특징"], { sort });
    }
    await check("새 우주 표현", "행성의 특징을 알아볼 자료를 찾아주세요", []);
    await check("일반어 미보유 주제", "양자중력", []);
    await check("일반어 정상 주제", "산맥", ["동고서저 지형, 산맥"], { subject: "사회" });
    await check("OR 주제", "우주 또는 날씨", ["계절별 날씨의 특징"]);
    await check("AND 주제", "우주와 날씨", []);
    await check("제외 주제", "날씨 제외하고 우주", []);
    const long = await service({ ...input, query: "가".repeat(250) });
    assert.equal(long.state, "NEEDS_CLARIFICATION");assert.ok(long.warnings.some(w=>w.includes("200자")));
    cases.push({ name: "긴 내용어는 서버 오류 대신 설명", passed: true });
    assert.equal(networkAttempts, 0);
  } finally { global.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; }
  const actual = [];
  for (const query of ["우주 관련 수업을 하고 싶어 주제를 선정해줘", "계절별 날씨의 특징"]) {
    const r = await searchVerifiedContents({ ...input, query, sort: "oldest" });
    assert.equal(r.total, query.startsWith("우주") ? 0 : 1);
    actual.push({ query, total: r.total, titles: r.results.map(x=>x.title), usage: r.usage });
  }
  assert.equal(await digest(), before);
  const report = { generatedAt: new Date().toISOString(), mockVectorContractCases: cases, passed: cases.length,
    mockVectorNetworkAttempts: networkAttempts, actualLocalEmbeddingQueries: actual,
    approvalUnchanged: true, approvalSha256: before, paidApiCalls: 0,
    limits: ["고정 자산의 주제·조건 계약 검사이며 검색 정답률 평가가 아니다.", "승인 기록의 직접 표현·동의어가 없는 관련 자료는 보수적으로 누락될 수 있다."] };
  await fs.writeFile(process.env.CURI_REPORT_PATH || require("node:path").join(__dirname,"../docs/verified-topic-after.json"), JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({ passed:cases.length, actual, approvalUnchanged:true },null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
