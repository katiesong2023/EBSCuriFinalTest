const fs = require("node:fs/promises");
const path = require("node:path");
const { applyIngestion, previewIngestion } = require("./incremental-ingestion");

async function main() {
  const options = readOptions(process.argv.slice(2));
  const input = await createInput(options);
  const result = options.apply ? await applyIngestion(input) : await previewIngestion(input);

  console.log(JSON.stringify(result, null, 2));
  if (!options.apply) {
    console.log("미리보기만 수행했습니다. 실제 반영은 --apply 옵션으로 다시 실행하세요.");
  }
}

async function createInput(options) {
  if (options.scheduled && !process.env.INGESTION_SOURCE_FILE) {
    throw new Error(
      "예약 실행 원본이 설정되지 않았습니다. 공식 API·Feed·내보내기 파일이 확인된 뒤 INGESTION_SOURCE_FILE에 해당 CSV 경로를 설정하세요."
    );
  }

  const csvPath = options.scheduled ? process.env.INGESTION_SOURCE_FILE : options.csvPath;
  if (csvPath) {
    const csvText = await fs.readFile(path.resolve(csvPath), "utf8");
    return {
      csvText,
      sourceSnapshot: options.sourceSnapshot,
      mode: options.scheduled ? "SCHEDULED" : "MANUAL"
    };
  }

  if (options.recordText) {
    return { record: JSON.parse(options.recordText), mode: "MANUAL" };
  }

  throw new Error("--csv 경로 또는 --record JSON을 입력하세요.");
}

function readOptions(args) {
  const options = {
    apply: false,
    scheduled: false,
    sourceSnapshot: false,
    csvPath: null,
    recordText: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") options.apply = true;
    if (argument === "--scheduled") options.scheduled = true;
    if (argument === "--source-snapshot") options.sourceSnapshot = true;
    if (argument === "--csv") options.csvPath = args[index + 1];
    if (argument === "--record") options.recordText = args[index + 1];
  }

  return options;
}

main().catch((error) => {
  console.error("증분 가져오기에 실패했습니다.", error.message);
  process.exitCode = 1;
});
