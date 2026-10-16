const fs = require("node:fs");
const path = require("node:path");
const auditPath = path.join(__dirname, "data/source-link-audit.json");
let audit = { records: [] };
try { audit = JSON.parse(fs.readFileSync(auditPath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const records = new Map(audit.records.map((record) => [record.id, record]));
const normalize = (value) => String(value || "").normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

function safeEbsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["ebs.co.kr", "ebsmedia.net"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
  } catch { return null; }
}

function resolveSourceLink({ id, title, program, sourceUrl }, registry = records) {
  const record = registry.get(id);
  if (record?.status === "MATCHED" && ["CLIP", "EPISODE", "INTRO", "LESSON_LIST", "PRODUCT_LIST"].includes(record.kind) &&
      safeEbsUrl(sourceUrl) && normalize(record.title) === normalize(title) &&
      [record.originalUrl, record.storedOriginalUrl].some((value) => safeEbsUrl(value) === safeEbsUrl(sourceUrl)) && safeEbsUrl(record.url)) {
    const labels = { CLIP: "해당 클립 열기", EPISODE: "해당 회차 열기", INTRO: "방송 소개문 보기", LESSON_LIST: "해당 강의 목록 보기", PRODUCT_LIST: "상품 목록 보기 · 유료" };
    return { url: record.url, label: labels[record.kind], kind: record.kind, status: "MATCHED", checkedAt: record.checkedAt,
      note: ["CLIP", "EPISODE"].includes(record.kind) ? "도착 페이지의 콘텐츠 일치 확인 · 재생·로그인 조건은 별도" : "소개문·목록 근거입니다. 개별 영상 재생 링크가 아닙니다." };
  }
  const query = [program, title].filter(Boolean).join(" ").trim().slice(0, 300);
  return { url: `https://www.ebs.co.kr/search?${new URLSearchParams({ query })}`, label: "EBS에서 제목 검색", kind: "SEARCH", status: "UNCONFIRMED", checkedAt: null,
    note: "해당 콘텐츠로 직접 이동하는 주소를 확인하지 못했습니다. 제목 검색으로 안내합니다." };
}

module.exports = { resolveSourceLink, safeEbsUrl };
