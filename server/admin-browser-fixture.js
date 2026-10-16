const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { openBroadcastStore, saveBroadcastPage } = require("./broadcast-store");

// 실제 저장소 대신 임시 JSON 복제본·합성 방송 DB에서만 쓰기 동작을 확인한다.
async function createAdminBrowserFixture({ fakeEmbedding = false } = {}) {
  const root = path.resolve(__dirname, ".."), directory = await fs.mkdtemp(path.join(os.tmpdir(), "curi-admin-browser-"));
  let child;
  const close = async () => {
    if (child && child.exitCode === null) await new Promise((resolve) => { child.once("exit", resolve); child.kill(); });
    await fs.rm(directory, { recursive: true, force: true });
  };
  try {
    await fs.mkdir(path.join(directory, "server/data"), { recursive: true });
    for (const name of await fs.readdir(__dirname)) if (name.endsWith(".js")) await fs.copyFile(path.join(__dirname, name), path.join(directory, "server", name));
    if (fakeEmbedding) await fs.writeFile(path.join(directory, "server/local-embedding.js"), `const fs=require('node:fs'); module.exports.createLocalEmbedder=()=>({async embed(){if(fs.existsSync('server/data/fail-embedding'))throw new Error('로컬 합성 검색 실패');return {vector:[1,...Array(383).fill(0)],inputTokens:12,truncated:false};},async close(){}});`);
    for (const name of await fs.readdir(path.join(__dirname, "data"))) if (name.endsWith(".json")) await fs.copyFile(path.join(__dirname, "data", name), path.join(directory, "server/data", name));
    for (const name of ["public", "EBS_Curi_FINAL_PACKAGE_v1.4", "node_modules"]) await fs.symlink(path.join(root, name), path.join(directory, name));
    const broadcastFile = path.join(directory, "server/data/broadcast-catalog.sqlite"), automaticFile = path.join(directory, "server/data/automatic-assets.sqlite");
    const db = openBroadcastStore(broadcastFile);
    saveBroadcastPage(db, { job: "ADMIN_TEST", sourceUrl: "https://www.ebs.co.kr/fixture", fetchedAt: new Date().toISOString() }, [
      { title: "관리회귀 A 지구의 자전", program: "관리 합성 검사", summary: "지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.", url: "https://www.ebs.co.kr/fixture?courseId=900000&stepId=1&lectId=930001" },
      { title: "관리회귀 B 짧은 원문", program: "관리 합성 검사", summary: "관리회귀 B 짧은 원문", url: "https://www.ebs.co.kr/fixture?courseId=900000&stepId=1&lectId=930002" },
      { title: "관리회귀 C 수선하는 하루", program: "관리 합성 검사", summary: "오래된 가구를 손질하는 장인의 작업 과정을 소개한다.", url: "https://www.ebs.co.kr/fixture?courseId=900000&stepId=1&lectId=930003" }
    ]);
    const ids = ["930001", "930002", "930003"].map((id) => db.prepare("SELECT id FROM episodes WHERE lect_id=?").get(id).id); db.close();
    const port = await new Promise((resolve, reject) => { const listener = net.createServer(); listener.once("error", reject); listener.listen(0, "127.0.0.1", () => { const port = listener.address().port; listener.close(() => resolve(port)); }); });
    const base = `http://127.0.0.1:${port}`, token = crypto.randomBytes(32).toString("hex");
    child = spawn(process.execPath, ["server/server.js"], { cwd: directory, env: { ...process.env, PORT: String(port), CURI_ADMIN_TOKEN: token, CURI_ADMIN_ORIGIN: base, CURI_AUTOMATIC_DB: automaticFile, CURI_ALLOW_PAID_API: "false", NODE_ENV: "test" }, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("임시 서버 시작 시간 초과")), 10000); child.stdout.once("data", () => { clearTimeout(timer); resolve(); }); child.once("error", reject); child.once("exit", (code) => reject(new Error(`임시 서버 종료 ${code}`))); });
    return { root, directory, broadcastFile, automaticFile, ids, base, token, close };
  } catch (error) { await close(); throw error; }
}
module.exports = { createAdminBrowserFixture };
