const { parseArgs } = require("node:util");
const { automaticAssets } = require("./automatic-assets");
const { backupAssetStore } = require("./automatic-asset-store");

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: Object.fromEntries(
    ["content", "resource", "subject", "grade", "standard", "run", "destination"].map((name) => [name, { type: "string" }])) });
  const command = positionals[0];
  const allowed = { process: ["content", "resource", "subject", "grade", "standard"], status: ["run"], search: ["run"], backup: ["destination"] };
  if (positionals.length !== 1 || !allowed[command] || Object.keys(values).some((key) => !allowed[command].includes(key))) {
    throw new Error("사용법: data:automatic -- process --resource ID --subject 과학 | status [--run ID] | search --run ID | backup --destination 새파일.sqlite");
  }
  let result;
  if (command === "process") {
    const input = {};
    for (const [flag, field] of [["content", "contentCuriId"], ["resource", "resourceId"], ["subject", "subject"], ["grade", "gradeBand"], ["standard", "standardId"]]) {
      if (values[flag]) input[field] = values[flag];
    }
    result = await automaticAssets.process(input);
  } else if (command === "search") result = await automaticAssets.prepare(values.run);
  else if (command === "backup") {
    if (!values.destination) throw new Error("새 백업 파일 경로를 지정하세요.");
    result = backupAssetStore(values.destination);
  } else { await automaticAssets.readLinks(); result = automaticAssets.history(values.run); }
  console.log(JSON.stringify(result, null, 2));
  if (["FAILED", "STALE"].includes(result.saveStatus) || result.searchPreparation?.status === "FAILED") process.exitCode = 1;
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
