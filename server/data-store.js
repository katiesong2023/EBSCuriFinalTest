const fs = require("node:fs/promises");
const path = require("node:path");
const { reconcileVerifiedAssets, fingerprint: createFingerprint } = require("./data-quality");

const projectDirectory = process.cwd();
const dataDirectory = path.join(projectDirectory, "server", "data");
const storePath = path.join(dataDirectory, "curi-store.json");
const workingSetPath = path.join(
  projectDirectory,
  "EBS_Curi_FINAL_PACKAGE_v1.4",
  "data",
  "p0",
  "p0_working_set_144.csv"
);
const socialCurriculumPath = path.join(
  projectDirectory,
  "EBS_Curi_FINAL_PACKAGE_v1.4",
  "data",
  "p0",
  "p0_social_curriculum_qa_27.csv"
);
const scienceCurriculumPath = path.join(
  projectDirectory,
  "EBS_Curi_FINAL_PACKAGE_v1.4",
  "data",
  "p0",
  "p0_science_curriculum_qa_51.csv"
);

const provenanceClassifications = [
  "SOURCE",
  "SILVER_EXISTING_LINKAGE",
  "AI_GENERATED_BY_CURIMAP",
  "HUMAN_VERIFIED"
];
const reviewStatuses = [
  "SOURCE_CHECKED",
  "AI_GENERATED",
  "REVIEW_REQUIRED",
  "HUMAN_APPROVED",
  "HUMAN_EDITED",
  "EXCLUDED"
];

async function seedDataStore() {
  const seededAt = new Date().toISOString();
  const [workingSetText, socialCurriculumText, scienceCurriculumText, existingStore] = await Promise.all([
    fs.readFile(workingSetPath, "utf8"),
    fs.readFile(socialCurriculumPath, "utf8"),
    fs.readFile(scienceCurriculumPath, "utf8"),
    readStoreOrCreate()
  ]);
  const contentRows = parseCsv(workingSetText);
  const curriculumRows = [...parseCsv(socialCurriculumText), ...parseCsv(scienceCurriculumText)];
  const store = existingStore ?? createEmptyStore();
  store.createdAt ??= seededAt;

  const contentResult = mergeRecords(
    store.contents,
    contentRows.map((row) => createContentRecord(row, seededAt)),
    (record) => record.sourceIdentity.stableKey,
    seededAt
  );
  const curriculumResult = mergeRecords(
    store.curriculumStandards,
    curriculumRows.map((row) => createCurriculumRecord(row, seededAt)),
    (record) => record.sourceIdentity.stableKey,
    seededAt
  );

  store.contents = contentResult.records;
  store.curriculumStandards = curriculumResult.records;
  store.officialEvidenceChecks = store.curriculumStandards.map((standard) =>
    createOfficialEvidenceCheck(standard, seededAt)
  );
  store.updatedAt = seededAt;
  store.lastSeed = {
    seededAt,
    sources: [
      relativeProjectPath(workingSetPath),
      relativeProjectPath(socialCurriculumPath),
      relativeProjectPath(scienceCurriculumPath)
    ],
    contents: contentResult.summary,
    curriculumStandards: curriculumResult.summary
  };

  await writeDataStore(store);

  return {
    storePath: relativeProjectPath(storePath),
    contents: contentResult.summary,
    curriculumStandards: curriculumResult.summary,
    mappings: store.contentCurriculumMaps.length,
    verifiedAssets: store.verifiedAssets.length,
    invalidatedVerifiedAssets: store.verifiedAssetHistory.length,
    searchProjection: store.searchProjection.length
  };
}

async function readDataStore() {
  const text = await fs.readFile(storePath, "utf8");
  return reconcileVerifiedAssets(ensureStoreShape(JSON.parse(text)));
}

async function writeDataStore(store) {
  const normalizedStore = reconcileVerifiedAssets(ensureStoreShape(store));
  const temporaryPath = `${storePath}.${process.pid}.tmp`;

  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(normalizedStore, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, storePath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function getDataStoreSummary() {
  const store = await readDataStore();

  return {
    schemaVersion: store.schemaVersion,
    updatedAt: store.updatedAt,
    contents: store.contents.length,
    curriculumStandards: store.curriculumStandards.length,
    contentCurriculumMaps: store.contentCurriculumMaps.length,
    officialEvidenceChecks: store.officialEvidenceChecks.length,
    // 이전 원문 대조 이력 행과 신규 출처 대조 상태는 서로 다른 분모다.
    sourceCheckedStandards: store.curriculumStandards.filter((standard) => standard.review?.status === "SOURCE_CHECKED").length,
    functionalVerificationRuns: store.functionalVerificationRuns.length,
    verifiedAssets: store.verifiedAssets.length,
    invalidatedVerifiedAssets: store.verifiedAssetHistory.length,
    searchProjection: store.searchProjection.length,
    searchIndexRuns: store.searchIndexRuns.length,
    ingestionRuns: store.ingestionRuns.length,
    mappingRuns: store.mappingRuns.length,
    relationReviews: (store.relationReviews || []).length,
    lastSeed: store.lastSeed,
    lastIngestion: store.lastIngestion
  };
}

async function getDataStoreModel() {
  const store = await readDataStore();

  return {
    schemaVersion: store.schemaVersion,
    provenanceClassifications,
    reviewStatuses,
    mappingContract: store.mappingContract,
    assetBoundaries: store.assetBoundaries
  };
}

async function readStoreOrCreate() {
  try {
    return await readDataStore();
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function createEmptyStore() {
  return {
    schemaVersion: "1.4",
    createdAt: null,
    updatedAt: null,
    contents: [],
    curriculumStandards: [],
    contentCurriculumMaps: [],
    officialEvidenceChecks: [],
    functionalVerificationRuns: [],
    verifiedAssets: [],
    verifiedAssetHistory: [],
    searchProjection: [],
    searchIndexRuns: [],
    embeddingCache: [],
    ingestionRuns: [],
    mappingRuns: [],
    lastIngestion: null,
    mappingContract: {
      entity: "CONTENT_CURRICULUM_MAP",
      naturalKey: "contentCuriId + curriculumCuriId",
      requiredFields: [
        "curiMapId",
        "contentCuriId",
        "curriculumCuriId",
        "curriculumVersion",
        "provenanceClassification",
        "reviewStatus",
        "assetClassification"
      ],
      searchEligibilityRule:
        "HUMAN_APPROVED 또는 HUMAN_EDITED, 공식 근거 연결, 활성 콘텐츠일 때만 verifiedAssets와 searchProjection에 포함"
    },
    assetBoundaries: {
      draft: "AI 생성 또는 검수 전 연계 초안. 검증 자산·검색 결과에 포함하지 않음.",
      officialEvidence: "공식 원문 대조 이력. 콘텐츠 연계 승인이나 검색 공개를 뜻하지 않음.",
      functionalVerification: "기능 검증 실행 이력. 교육과정 적합성 승인이나 검색 공개를 뜻하지 않음.",
      verifiedAsset: "사람이 승인 또는 수정한 연계만 저장하는 CuriBase 검증 자산.",
      searchProjection: "CuriBase 검증 자산 중 검색 조건을 통과해 제공되는 결과."
    },
    lastSeed: null
  };
}

function ensureStoreShape(store) {
  store.schemaVersion = "1.4";
  store.searchIndexRuns ??= [];
  store.embeddingCache ??= [];
  store.verifiedAssetHistory ??= [];
  store.ingestionRuns ??= [];
  store.mappingRuns ??= [];
  store.lastIngestion ??= null;
  hydrateModelHeldCandidates(store);

  return store;
}

// 이전 실행 기록에는 AI 보류 사유와 후보 ID만 있을 수 있다. 새 검수 화면에서
// 사람이 후보를 선택해 수정할 수 있도록 현재 공식 기준 메타데이터로 화면용 후보를 복원한다.
function hydrateModelHeldCandidates(store) {
  const standards = Array.isArray(store.curriculumStandards) ? store.curriculumStandards : [];
  const byAchievementId = new Map(
    standards.map((standard) => [standard.metadata?.achievementStandardId, standard])
  );
  for (const run of store.mappingRuns) {
    const result = run.result;
    if (result?.status !== "HELD" || result.hold?.code !== "MODEL_HELD" ||
        Array.isArray(result.candidateOptions) || !Array.isArray(run.input?.officialCandidateIds)) {
      continue;
    }
    result.candidateOptions = run.input.officialCandidateIds
      .map((id) => byAchievementId.get(id))
      .filter(Boolean)
      .map((standard) => ({
        curriculumCuriId: standard.curiId,
        achievementStandardId: standard.metadata.achievementStandardId,
        achievementStandard: standard.metadata.achievementStandard,
        subject: standard.metadata.subject,
        gradeBand: standard.metadata.gradeBand,
        unit: { number: standard.metadata.unitNo, title: standard.metadata.unitTitle },
        officialSource: {
          document: standard.source?.sourceDocument,
          pdfPage: standard.source?.sourcePdfPage,
          curriculumVersion: standard.curriculumVersion
        },
        matchedTerms: []
      }));
  }
}

function createContentRecord(row, seenAt) {
  const sourceSystem = "EBS_WORKING_SET";
  const sourceContentId = requiredValue(row, "record_id");
  const curiId = requiredValue(row, "content_id");
  const fingerprint = createFingerprint(row);

  return {
    curiId,
    sourceIdentity: {
      stableKey: `${sourceSystem}:${sourceContentId}`,
      sourceSystem,
      sourceContentId,
      sourceRecordId: sourceContentId
    },
    sourceVersion: "P0_WORKING_SET_2026-09-16",
    source: {
      sourceUrl: nullableValue(row.source_url),
      sourceOriginalModifiedAt: null,
      sourceFirstSeenAt: seenAt,
      sourceLastSeenAt: seenAt,
      contentFingerprint: fingerprint
    },
    provenance: {
      classification: "SOURCE",
      descriptionClassification: nullableValue(row.description_provenance),
      descriptionSourceUrl: nullableValue(row.description_source_url),
      descriptionVerifiedAt: nullableValue(row.description_verified_at)
    },
    lifecycle: {
      isActive: true,
      assetClassification: "DRAFT_INPUT",
      isCuriBaseVerified: false,
      isSearchEligible: false
    },
    review: {
      status: "REVIEW_REQUIRED",
      required: true
    },
    metadata: {
      candidateTier: nullableValue(row.candidate_tier),
      mappingReadiness: nullableValue(row.mapping_readiness),
      sourceGroup: nullableValue(row.source_group),
      contentLevel: nullableValue(row.content_level),
      programName: nullableValue(row.program_name),
      episodeNo: nullableValue(row.episode_no),
      title: nullableValue(row.title),
      synopsis: nullableValue(row.synopsis),
      gradeBandSeed: nullableValue(row.grade_band_seed),
      subjectSeed: nullableValue(row.subject_seed),
      curriculumUnitSeed: nullableValue(row.curriculum_unit_seed),
      sourceLinkQuality: nullableValue(row.source_link_quality),
      workingSetStatus: nullableValue(row.working_set_status)
    }
  };
}

function createCurriculumRecord(row, seenAt) {
  const sourceSystem = "MOE_2022_CURRICULUM";
  const sourceStandardId = requiredValue(row, "achievement_standard_id");
  const curriculumVersion = requiredValue(row, "curriculum_version");
  const fingerprint = createFingerprint(row);

  return {
    curiId: `CURI-CURR-2022-${sourceStandardId}`,
    sourceIdentity: {
      stableKey: `${sourceSystem}:${curriculumVersion}:${sourceStandardId}`,
      sourceSystem,
      sourceStandardId
    },
    curriculumVersion,
    source: {
      sourceDocument: nullableValue(row.source_document),
      sourcePdfPage: nullableValue(row.source_pdf_page),
      sourceOriginalModifiedAt: null,
      sourceFirstSeenAt: seenAt,
      sourceLastSeenAt: seenAt,
      contentFingerprint: fingerprint
    },
    provenance: {
      classification: "HUMAN_VERIFIED",
      evidenceClassification: "SOURCE",
      qaNotes: nullableValue(row.qa_notes),
      agentCheckedOn: nullableValue(row.agent_checked_on)
    },
    lifecycle: {
      isActive: true,
      assetClassification: "OFFICIAL_EVIDENCE",
      isCuriBaseVerified: false,
      isSearchEligible: false
    },
    review: {
      status: requiredValue(row, "human_review_status"),
      usabilityStatus: nullableValue(row.usability_status),
      agentPdfTextCheck: nullableValue(row.agent_pdf_text_check),
      agentStructureCheck: nullableValue(row.agent_structure_check)
    },
    metadata: {
      schoolLevel: nullableValue(row.school_level),
      gradeBand: nullableValue(row.grade_band),
      subject: nullableValue(row.subject),
      unitNo: nullableValue(row.unit_no),
      unitTitle: nullableValue(row.unit_title),
      achievementStandardId: sourceStandardId,
      achievementStandard: nullableValue(row.achievement_standard)
    }
  };
}

function createOfficialEvidenceCheck(standard, checkedAt) {
  return {
    evidenceCheckId: `OFFICIAL-EVIDENCE-${standard.curiId}`,
    curriculumCuriId: standard.curiId,
    category: "OFFICIAL_EVIDENCE",
    sourceDocument: standard.source.sourceDocument,
    sourcePdfPage: standard.source.sourcePdfPage,
    outcome: standard.review.status,
    checkedAt,
    isMappingApproval: false,
    isSearchEligibilityApproval: false
  };
}

function mergeRecords(existingRecords, incomingRecords, getKey, seenAt) {
  const existingByKey = new Map(existingRecords.map((record) => [getKey(record), record]));
  const recordsByKey = new Map(existingByKey);
  const summary = { created: 0, updated: 0, unchanged: 0, total: 0 };

  for (const incomingRecord of incomingRecords) {
    const key = getKey(incomingRecord);
    const existingRecord = existingByKey.get(key);

    if (!existingRecord) {
      recordsByKey.set(key, incomingRecord);
      summary.created += 1;
      continue;
    }

    const hasChanged =
      existingRecord.source.contentFingerprint !== incomingRecord.source.contentFingerprint;
    const mergedRecord = hasChanged ? incomingRecord : existingRecord;
    mergedRecord.source.sourceFirstSeenAt = existingRecord.source.sourceFirstSeenAt;
    mergedRecord.source.sourceLastSeenAt = seenAt;
    recordsByKey.set(key, mergedRecord);
    summary[hasChanged ? "updated" : "unchanged"] += 1;
  }

  const records = Array.from(recordsByKey.values());
  summary.total = records.length;
  return { records, summary };
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  const normalizedText = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < normalizedText.length; index += 1) {
    const character = normalizedText[index];
    const nextCharacter = normalizedText[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      currentField += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentField);
      if (currentRow.some((value) => value !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += character;
    }
  }

  currentRow.push(currentField);
  if (currentRow.some((value) => value !== "")) {
    rows.push(currentRow);
  }

  const [headers, ...dataRows] = rows;
  if (!headers) {
    throw new Error("CSV 헤더를 찾지 못했습니다.");
  }

  return dataRows.map((dataRow) =>
    Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ""]))
  );
}

function requiredValue(row, fieldName) {
  const value = nullableValue(row[fieldName]);
  if (!value) {
    throw new Error(`필수 CSV 필드가 비어 있습니다: ${fieldName}`);
  }

  return value;
}

function nullableValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function relativeProjectPath(filePath) {
  return path.relative(projectDirectory, filePath).split(path.sep).join("/");
}

module.exports = {
  createFingerprint,
  getDataStoreModel,
  getDataStoreSummary,
  parseCsv,
  readDataStore,
  seedDataStore,
  writeDataStore
};
