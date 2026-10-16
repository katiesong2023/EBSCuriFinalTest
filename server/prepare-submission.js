"use strict";

const { restoreSubmissionData } = require("./restore-submission-data");
const { restoreSubmissionModel } = require("./restore-submission-model");

async function prepareSubmission() {
  const data = await restoreSubmissionData();
  const model = await restoreSubmissionModel();
  console.log(`로컬 실행 준비 완료 (DB 복원 ${data.restored.length}개, 검색 모델 복원 ${model.restored.length}개)`);
}
if (require.main === module) prepareSubmission().catch(error => {
  console.error(`실행 준비 실패: ${error.message}`); process.exitCode = 1;
});
module.exports = { prepareSubmission };
