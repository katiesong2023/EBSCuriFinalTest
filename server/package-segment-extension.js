// 설치용 파일만 묶는다. 개인 자료·환경 변수·영상 파일은 포함하지 않는다.
const fs = require("node:fs"), path = require("node:path"), { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."), extension = path.join(root, "extensions/curi-segments");
fs.copyFileSync(path.join(root, "public/segment-core.js"), path.join(extension, "segment-core.js"));
for (const file of ["curi-colors.css", "curi-icons.css"]) fs.copyFileSync(path.join(root, "public", file), path.join(extension, file));
// 웹과 확장은 같은 토큰·벡터 원본을 패키징 시 동기화한다.
fs.copyFileSync(path.join(root, "public/curi-tokens.css"), path.join(extension, "curi-tokens.css"));
fs.cpSync(path.join(root, "public/brand"), path.join(extension, "brand"), { recursive: true });
fs.cpSync(path.join(root, "public/fonts"), path.join(extension, "fonts"), { recursive: true });
const output = path.join(root, "public/downloads/curi-segments-extension.zip");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.rmSync(output, { force: true });
const files = ["manifest.json", "segment-core.js", "background.js", "curi-bridge.js", "player.js", "source-reader.js", "popup.html", "popup.css", "popup.js", "panel-v11.js", "panel-updates.js", "panel-v11.css", "curi-colors.css", "curi-icons.css", "README.md", "curi-tokens.css", ...fs.readdirSync(path.join(extension, "fonts")).filter(file => ["plex.css", "plex-400.ttf", "plex-500.ttf", "plex-600.ttf", "OFL.txt"].includes(file)).map(file => "fonts/" + file), ...fs.readdirSync(path.join(extension, "brand")).filter(file => file !== "curi-app-icon.svg").map(file => "brand/" + file)];
execFileSync("zip", ["-q", output, ...files], { cwd: extension });
// ZIP 생성 성공 후에만 최신 배포 버전을 공개한다.
const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"));
fs.writeFileSync(path.join(root, "public/downloads/curi-segments-version.json"), JSON.stringify({ version: manifest.version }) + "\n");
console.log("Chrome 설치용 확장 프로그램:", output);
