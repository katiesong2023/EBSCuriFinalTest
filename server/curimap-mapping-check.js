const assert = require("node:assert/strict");
const { retrieveCandidates } = require("./candidate-retrieval");
const {
  CuriMapMappingServiceError,
  createInstructions,
  validateModelOutput
} = require("./curimap-mapping");

async function runChecks() {
  const candidateResult = await retrieveCandidates({
    contentCuriId: "CURI-c045ed8d-4a75-5265-aad6-43825fb907a5",
    synopsis: "우리나라의 위치 알아보기. 02강 소중한 우리 국토 (2). 단원차시: 1단원 3/11."
  });

  assert.equal(candidateResult.status, "CANDIDATES_FOUND");
  assert.deepEqual(
    candidateResult.candidates.map((candidate) => candidate.achievementStandardId),
    ["6사01-01", "6사01-02", "6사09-02"]
  );

  const validDraft = validateModelOutput(
    JSON.stringify({
      status: "DRAFT",
      selectedStandardIds: ["6사09-02"],
      coreConcepts: ["우리나라의 위치", "대륙과 대양"],
      rationale: "공개 텍스트의 우리나라 위치 학습과 공식 후보의 국가 위치 이해를 연결한다.",
      teachingUse: "세계지도에서 우리나라와 주변 국가의 위치를 표시한다.",
      confidence: 0.72,
      holdReason: ""
    }),
    candidateResult.candidates
  );
  assert.equal(validDraft.selectedStandardIds[0], "6사09-02");

  assert.throws(
    () =>
      validateModelOutput(
        JSON.stringify({
          status: "DRAFT",
          selectedStandardIds: ["6사99-99"],
          coreConcepts: ["임의 기준"],
          rationale: "후보 밖 코드",
          teachingUse: "사용하지 않음",
          confidence: 0.5,
          holdReason: ""
        }),
        candidateResult.candidates
      ),
    (error) =>
      error instanceof CuriMapMappingServiceError &&
      error.code === "OFFICIAL_CANDIDATE_CONSTRAINT_REJECTED"
  );

  assert.match(createInstructions(), /UNTRUSTED PUBLIC TEXT/);
  assert.match(createInstructions(), /공식 후보 목록의 achievementStandardId만 선택/);

  console.log("curimap mapping checks passed");
}

runChecks().catch((error) => {
  console.error("curimap mapping checks failed", error.message);
  process.exitCode = 1;
});
