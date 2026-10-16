const assert = require("node:assert/strict");

const approvedStandard = createStandard({
  id: "6사01-01",
  unitTitle: "우리나라 국토 여행",
  achievementStandard: "우리나라 산지와 하천의 위치를 확인하고 지형의 분포 특징을 탐구한다."
});
const excludedStandard = createStandard({
  id: "6사99-99",
  achievementStandard: "우리나라 위치를 자유롭게 만든 기준이다.",
  reviewStatus: "REVIEW_REQUIRED"
});
const scienceStandard = createStandard({
  id: "6과06-02",
  subject: "과학",
  unitTitle: "날씨와 우리 생활",
  achievementStandard: "습도와 온도를 측정하여 날씨의 특징을 관찰할 수 있다."
});
const economyStandard = createStandard({
  id: "6사11-01",
  unitTitle: "시장경제와 국가 간 거래",
  achievementStandard: "시장경제에서 가계와 기업의 역할 및 근로자의 권리를 탐색한다."
});
const store = {
  contents: [
    {
      curiId: "CURI-CONTENT-1",
      metadata: {
        title: "우리나라 산지와 하천의 위치",
        synopsis: "우리나라 산지와 하천 지형을 지도에서 살펴봅니다.",
        subjectSeed: "사회",
        gradeBandSeed: "초등 5학년"
      }
    },
    {
      curiId: "CURI-CONTENT-SCIENCE-1",
      metadata: {
        title: "건습구 온도계",
        synopsis: "건습구 온도계로 온도와 습도를 측정합니다.",
        subjectSeed: "과학",
        gradeBandSeed: "초등 5학년"
      }
    },
    {
      curiId: "CURI-CONTENT-GENERAL-1",
      metadata: {
        title: "배달 현장의 하루",
        synopsis: "배달 노동 현장에서 일하는 사람들의 하루를 따라갑니다.",
        subjectSeed: "사회/경제",
        gradeBandSeed: "초등고~고등",
        contentLevel: "episode"
      }
    }
  ],
  curriculumStandards: [approvedStandard, approvedStandard, excludedStandard, scienceStandard, economyStandard]
};

require.cache[require.resolve("./data-store")] = {
  exports: { readDataStore: async () => store }
};
const { retrieveCandidates } = require("./candidate-retrieval");

async function run() {
  const found = await retrieveCandidates({ contentCuriId: "CURI-CONTENT-1" });
  assert.equal(found.status, "CANDIDATES_FOUND");
  assert.equal(found.candidates.length, 1);
  assert.equal(found.candidates[0].achievementStandardId, "6사01-01");
  assert.equal(found.candidates[0].officialSource.pdfPage, "34");
  assert.deepEqual(found.candidates[0].matchedTerms, ["우리나라", "산지", "하천", "위치", "지형"]);

  const scienceFound = await retrieveCandidates({
    contentCuriId: "CURI-CONTENT-SCIENCE-1",
    synopsis: "건습구 온도계로 온도와 습도를 측정하여 날씨의 특징을 관찰합니다."
  });
  assert.equal(scienceFound.status, "CANDIDATES_FOUND");
  assert.equal(scienceFound.retrievalScope.subject, "과학");
  assert.equal(scienceFound.candidates[0].achievementStandardId, "6과06-02");

  const broadScience = await retrieveCandidates({
    title: "한국의 파충류",
    subject: "과학",
    gradeBand: "중등~고등",
    synopsis: "한국에 서식하는 파충류의 특징과 생태를 관찰하고 생물의 다양성을 알아봅니다."
  });
  assert.notEqual(broadScience.hold?.code, "UNSUPPORTED_GRADE_BAND");

  const adjacentSubject = await retrieveCandidates({
    title: "위기의 백두대간을 지켜라",
    subject: "환경/생태",
    gradeBand: "초등고~고등",
    synopsis: "백두대간 생태계를 지키기 위한 현장 활동과 생물 다양성을 살펴봅니다."
  });
  assert.equal(adjacentSubject.status, "HELD");
  assert.equal(adjacentSubject.hold.code, "SUBJECT_SCOPE_UNSUPPORTED");

  const generalBroadcast = await retrieveCandidates({
    contentCuriId: "CURI-CONTENT-GENERAL-1",
    subject: "사회"
  });
  assert.equal(generalBroadcast.status, "HELD");
  assert.equal(generalBroadcast.hold.code, "NO_RELATED_OFFICIAL_CANDIDATE");
  assert.equal(generalBroadcast.candidates.length, 0);

  const held = await retrieveCandidates({
    title: "지도",
    subject: "사회",
    gradeBand: "5~6학년군"
  });
  assert.equal(held.status, "HELD");
  assert.equal(held.hold.code, "INSUFFICIENT_TEXT");

  const noRelatedCandidate = await retrieveCandidates({
    title: "바다 생물",
    synopsis: "산호초 사이에서 헤엄치는 물고기와 해양 생물들의 모습을 관찰합니다.",
    subject: "사회",
    gradeBand: "5~6학년군"
  });
  assert.equal(noRelatedCandidate.status, "HELD");
  assert.equal(noRelatedCandidate.hold.code, "NO_RELATED_OFFICIAL_CANDIDATE");

  for (const synopsis of ["", "우리나라 산지와 하천의 위치", "우리나라 산지와 하천의 위치. 많은 시청 바랍니다. 방송 시간은 홈페이지에서 확인하세요."]) {
    const thin = await retrieveCandidates({ contentCuriId: "CURI-CONTENT-1", synopsis });
    assert.equal(thin.status, "HELD");
    assert.equal(thin.candidates.length, 0);
  }

  const unsupported = await retrieveCandidates({
    title: "우리나라 산지",
    subject: "국어",
    gradeBand: "5~6학년군"
  });
  assert.equal(unsupported.status, "HELD");
  assert.equal(unsupported.hold.code, "UNSUPPORTED_SUBJECT");

  console.log("candidate-retrieval checks passed");
}

function createStandard({ id, subject = "사회", unitTitle = "우리나라 국토 여행", achievementStandard, reviewStatus = "HUMAN_APPROVED" }) {
  return {
    curiId: `CURI-CURR-2022-${id}`,
    curriculumVersion: "2022 개정",
    source: { sourceDocument: "교육부 고시", sourcePdfPage: "34" },
    lifecycle: { isActive: true },
    provenance: { classification: "HUMAN_VERIFIED" },
    review: { status: reviewStatus },
    metadata: {
      subject,
      gradeBand: "5~6학년군",
      unitNo: "1",
      unitTitle,
      achievementStandardId: id,
      achievementStandard
    }
  };
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
