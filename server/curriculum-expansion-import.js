const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { readDataStore, writeDataStore } = require("./data-store");
const { getEligibleStandards, fingerprint } = require("./data-quality");
const { standardCourse } = require("../public/grade-context");
const sourceFile = path.join(__dirname, "data", "curriculum-expansion.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function validateExpansion(payload) {
  if (!payload?.version || !Array.isArray(payload.standards) || !payload.standards.length) throw new Error("확장 기준 자료가 없습니다.");
  const seen = new Set(), documentHashes = new Map();
  for (const standard of payload.standards) {
    const id = standard.metadata?.achievementStandardId;
    if (seen.has(id) || standard.curiId !== `CURI-CURR-2022-${id}`) throw new Error(`중복/잘못된 기준 ID: ${id}`);
    seen.add(id);
    const expected = sha256(`${id}\n${standard.metadata.achievementStandard}`);
    if (expected !== standard.source?.contentFingerprint) throw new Error(`기준 원문 지문 불일치: ${id}`);
    const document = standard.source.sourceLocalPath;
    if (!["[별책7] 사회과 교육과정.pdf", "[별책9] 과학과 교육과정.pdf"].includes(document)) throw new Error(`허용되지 않은 공식 문서: ${document}`);
    const source = payload.sources?.find((entry) => entry.sourceLocalPath === document);
    if (!source || source.sourceDocument !== standard.source.sourceDocument ||
        source.subject !== standard.metadata.subject || source.documentSha256 !== standard.source.documentSha256) {
      throw new Error(`공식 문서 출처 연결 오류: ${id}`);
    }
    if (!documentHashes.has(document)) documentHashes.set(document, sha256(await fs.readFile(path.join(__dirname, "..", document))));
    if (standard.source.documentSha256 !== documentHashes.get(document)) throw new Error(`공식 PDF 판본 불일치: ${id}`);
    if (!["elementary34", "middle1"].includes(standardCourse(standard)) ||
        getEligibleStandards([standard]).length !== 1 || standard.provenance.classification !== "SOURCE" || standard.review.humanConfirmed !== false) {
      throw new Error(`공식 지원 범위/출처 대조 상태 오류: ${id}`);
    }
    if (standardCourse(standard) === "middle1") {
      const placement = payload.placements?.find((entry) => entry.placementId === standard.placement?.placementId);
      if (!placement || fingerprint(placement) !== fingerprint(standard.placement) ||
          placement.subject !== standard.metadata.subject || placement.subjectArea !== standard.metadata.subjectArea ||
          placement.officialUnitNo !== standard.metadata.unitNo) throw new Error(`중1 참고 편성 연결 오류: ${id}`);
    }
  }
  return payload.standards;
}

function mergeExpansion(store, incoming) {
  const next = structuredClone(store), summary = { created: 0, updated: 0, unchanged: 0, total: 0 };
  for (const record of incoming) {
    const position = next.curriculumStandards.findIndex((entry) => entry.curiId === record.curiId);
    if (position < 0) { next.curriculumStandards.push(structuredClone(record)); summary.created += 1; }
    else if (fingerprint(next.curriculumStandards[position]) === fingerprint(record)) summary.unchanged += 1;
    else {
      // 기존 초등5~6 원문 확인·검수 기록을 확장 적재로 대체하지 않는다.
      if (!next.curriculumStandards[position].metadata?.courseId) throw new Error(`기존 기준 덮어쓰기 금지: ${record.curiId}`);
      next.curriculumStandards[position] = structuredClone(record); summary.updated += 1;
    }
  }
  summary.total = next.curriculumStandards.length;
  return { store: next, summary };
}

async function importExpansion({ apply = false } = {}) {
  const payload = JSON.parse(await fs.readFile(sourceFile, "utf8"));
  const incoming = await validateExpansion(payload), previous = await readDataStore();
  const result = mergeExpansion(previous, incoming);
  if (apply && (result.summary.created || result.summary.updated)) {
    result.store.updatedAt = new Date().toISOString();
    result.store.curriculumExpansion = { version: payload.version, importedAt: result.store.updatedAt,
      source: "server/data/curriculum-expansion.json", count: incoming.length, humanConfirmationPerformed: false };
    await writeDataStore(result.store);
  }
  return { ...result.summary, applied: apply, expansionVersion: payload.version, humanConfirmationPerformed: false };
}

if (require.main === module) importExpansion({ apply: process.argv.includes("--apply") })
  .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateExpansion, mergeExpansion, importExpansion };
