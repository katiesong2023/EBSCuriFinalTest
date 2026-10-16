const { seedDataStore } = require("./data-store");

seedDataStore()
  .then((summary) => {
    console.log("Curi 저장소 초기 적재를 완료했습니다.");
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error("Curi 저장소 초기 적재에 실패했습니다.", error.message);
    process.exitCode = 1;
  });
