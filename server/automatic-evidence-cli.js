// API와 동일한 읽기 전용 검사. 원문/검토/자산 저장소에 기록하지 않는다.
const { inspectAutomaticEvidence } = require("./automatic-evidence-service");

async function main() {
  const args = process.argv.slice(2), input = {};
  const names = { "--content": "contentCuriId", "--resource": "resourceId", "--subject": "subject", "--grade": "gradeBand" };
  if (!args.length || args.includes("--help")) {
    console.log('사용법: node server/automatic-evidence-cli.js --content CURI-ID [--subject 사회|과학] [--grade "5~6학년군"]\n방송 원본: --content 대신 --resource BCAST-ID');
    return;
  }
  for (let i = 0; i < args.length; i += 2) {
    const key = names[args[i]], value = args[i + 1];
    if (!key || !value || value.startsWith("--") || Object.hasOwn(input, key)) throw new Error("옵션을 확인하세요. --help로 사용법을 볼 수 있습니다.");
    input[key] = value;
  }
  console.log(JSON.stringify(await inspectAutomaticEvidence(input), null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAILED", code: error.code || "EVIDENCE_EXECUTION_FAILED", error: error.message }));
  process.exitCode = 1;
});
