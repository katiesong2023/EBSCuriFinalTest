const crypto = require("node:crypto");
const { createFingerprint, parseCsv, readDataStore, writeDataStore } = require("./data-store");

const requiredFields = ["source_system", "source_content_id", "source_url", "title"];
const educationalFields = [
  "source_url",
  "program_name",
  "episode_no",
  "title",
  "synopsis",
  "content_level",
  "grade_band_seed",
  "subject_seed",
  "curriculum_unit_seed"
];

function parseContentCsv(csvText) {
  return parseCsv(csvText).map((row) => normalizeRow(row));
}

async function previewIngestion(input) {
  const store = await readDataStore();
  const prepared = prepareInput(input);
  const result = compareRows(store, prepared.rows, prepared.sourceSnapshot);

  return createPreviewResponse(prepared, result);
}

async function applyIngestion(input) {
  const store = await readDataStore();
  const prepared = prepareInput(input);
  if (prepared.inputErrors.length > 0) {
    const error = new Error(prepared.inputErrors.map((item) => item.reason).join(" "));
    error.code = "INVALID_INGESTION_INPUT";
    throw error;
  }
  const result = compareRows(store, prepared.rows, prepared.sourceSnapshot);
  const processedAt = new Date().toISOString();
  const runId = `INGEST-${processedAt.replace(/[-:.TZ]/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
  const recordsByKey = new Map(
    store.contents.map((record) => [record.sourceIdentity.stableKey, record])
  );
  // 방송 원본의 알려진 판본은 가져오기·소개문 보강 뒤에도 유지한다.
  // 판본이 사라져 실제 사람 제외/보류를 새 관계처럼 우회하지 않게 한다.
  const broadcastVariants = prepared.rows.some((row) => row.source_system === "EBS_BROADCAST")
    ? new Map(require("./broadcast-store").readBroadcastResources().map((item) => [item.id, item.variant])) : new Map();

  for (const candidate of result.candidates) {
    if (candidate.outcome === "new") {
      recordsByKey.set(candidate.stableKey, createNewContent(candidate.row, processedAt));
    } else if (candidate.outcome === "changed" || candidate.outcome === "reactivated") {
      recordsByKey.set(
        candidate.stableKey,
        updateExistingContent(candidate.existingRecord, candidate.row, processedAt, candidate.outcome)
      );
    } else if (candidate.outcome === "same") {
      recordsByKey.set(candidate.stableKey, updateSeenDetails(candidate.existingRecord, candidate.row, processedAt));
    }
  }
  for (const candidate of result.candidates) {
    const record = recordsByKey.get(candidate.stableKey);
    const variant = candidate.row.source_system === "EBS_BROADCAST" && broadcastVariants.get(candidate.row.source_content_id);
    if (record && variant) record.metadata.variant = variant;
  }

  for (const candidate of result.inactivationCandidates) {
    recordsByKey.set(candidate.stableKey, deactivateContent(candidate.existingRecord, processedAt));
  }

  store.contents = Array.from(recordsByKey.values());
  store.updatedAt = processedAt;
  const run = {
    runId,
    processedAt,
    mode: prepared.mode,
    inputType: prepared.inputType,
    sourceSnapshot: prepared.sourceSnapshot,
    status: result.errors.length > 0 ? "PARTIAL_FAILURE" : "COMPLETED",
    summary: result.summary,
    errors: result.errors,
    changes: result.changes
  };
  store.ingestionRuns.push(run);
  store.lastIngestion = run;
  await writeDataStore(store);

  return { run, preview: createPreviewResponse(prepared, result) };
}

function prepareInput(input) {
  const inputType = input?.csvText ? "CSV" : "SINGLE";
  let rows;

  try {
    rows = inputType === "CSV" ? parseContentCsv(input.csvText) : [normalizeRow(input?.record ?? input)];
  } catch (error) {
    rows = [];
    return {
      mode: normalizeMode(input?.mode),
      inputType,
      sourceSnapshot: false,
      rows,
      inputErrors: [{ rowNumber: null, reason: error.message }]
    };
  }

  const sourceSnapshot = input?.sourceSnapshot === true;
  const sourceSystems = new Set(rows.map((row) => row.source_system).filter(Boolean));
  const inputErrors = [];

  if (sourceSnapshot && sourceSystems.size !== 1) {
    inputErrors.push({
      rowNumber: null,
      reason: "전체 출처 내보내기는 하나의 source_system만 포함해야 비활성 항목을 안전하게 판별할 수 있습니다."
    });
  }

  return {
    mode: normalizeMode(input?.mode),
    inputType,
    sourceSnapshot,
    rows,
    inputErrors
  };
}

function compareRows(store, rows, sourceSnapshot) {
  const existingByKey = new Map(
    store.contents.map((record) => [record.sourceIdentity.stableKey, record])
  );
  const seenKeys = new Set();
  const candidates = [];
  const errors = [];
  const changes = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const error = validateRow(row, seenKeys);

    if (error) {
      errors.push({ rowNumber, stableKey: stableKeyFor(row), reason: error });
      continue;
    }

    const stableKey = stableKeyFor(row);
    seenKeys.add(stableKey);
    const existingRecord = existingByKey.get(stableKey);
    const educationalFingerprint = createEducationalFingerprint(row);
    let outcome = "new";

    if (existingRecord) {
      if (!existingRecord.lifecycle.isActive) {
        outcome = "reactivated";
      } else if (existingRecord.source.contentFingerprint === educationalFingerprint) {
        outcome = "same";
      } else {
        outcome = "changed";
      }
    }

    const candidate = { rowNumber, stableKey, row, existingRecord, outcome };
    candidates.push(candidate);
    if (outcome !== "same") {
      changes.push(createChangeSummary(candidate));
    }
  }

  const inactivationCandidates = getInactivationCandidates(
    store.contents,
    candidates,
    sourceSnapshot && errors.length === 0
  );
  changes.push(
    ...inactivationCandidates.map((candidate) => ({
      rowNumber: null,
      stableKey: candidate.stableKey,
      outcome: "inactive",
      title: candidate.existingRecord.metadata.title,
      reason: "전체 출처 내보내기에 더 이상 포함되지 않았습니다."
    }))
  );

  const summary = {
    received: rows.length,
    new: countOutcome(candidates, "new"),
    changed: countOutcome(candidates, "changed"),
    reactivated: countOutcome(candidates, "reactivated"),
    same: countOutcome(candidates, "same"),
    inactive: inactivationCandidates.length,
    errors: errors.length
  };

  return { candidates, errors, changes, inactivationCandidates, summary };
}

function createPreviewResponse(prepared, result) {
  return {
    mode: prepared.mode,
    inputType: prepared.inputType,
    sourceSnapshot: prepared.sourceSnapshot,
    summary: {
      ...result.summary,
      errors: result.summary.errors + prepared.inputErrors.length
    },
    changes: result.changes,
    errors: [...prepared.inputErrors, ...result.errors],
    canApply: prepared.inputErrors.length === 0 && result.candidates.length > 0
  };
}

function createNewContent(row, processedAt) {
  const stableKey = stableKeyFor(row);
  const sourceContentId = row.source_content_id;

  return {
    curiId: `CURI-CONTENT-${createFingerprint(stableKey).slice(0, 12).toUpperCase()}`,
    sourceIdentity: {
      stableKey,
      sourceSystem: row.source_system,
      sourceContentId,
      sourceRecordId: sourceContentId
    },
    sourceVersion: row.source_version,
    source: createSource(row, processedAt, processedAt),
    provenance: { classification: "SOURCE", descriptionClassification: null, descriptionSourceUrl: null, descriptionVerifiedAt: null },
    lifecycle: createDraftLifecycle(),
    review: createReviewRequired(null, processedAt, "새 콘텐츠를 CuriMap 검수 대기열에 추가했습니다."),
    metadata: createMetadata(row)
  };
}

function updateExistingContent(existingRecord, row, processedAt, outcome) {
  const priorReview = structuredClone(existingRecord.review);
  const history = [...(existingRecord.review.history ?? []), {
    recordedAt: processedAt,
    status: priorReview.status,
    required: priorReview.required,
    reason: "교육 의미에 영향을 줄 수 있는 원본 콘텐츠가 변경되었습니다."
  }];
  const firstSeenAt = existingRecord.source.sourceFirstSeenAt;
  const updated = {
    ...existingRecord,
    sourceVersion: row.source_version,
    source: createSource(row, firstSeenAt, processedAt),
    lifecycle: createDraftLifecycle(),
    review: createReviewRequired(history, processedAt, outcome === "reactivated"
      ? "비활성 콘텐츠가 다시 확인되어 CuriMap 재검수가 필요합니다."
      : "제목·소개문·콘텐츠 단위 등의 변경으로 CuriMap 재검수가 필요합니다."),
    metadata: { ...createMetadata(row), ...(existingRecord.metadata.variant ? { variant: existingRecord.metadata.variant } : {}) }
  };

  return updated;
}

function updateSeenDetails(existingRecord, row, processedAt) {
  return {
    ...existingRecord,
    sourceVersion: row.source_version,
    source: createSource(row, existingRecord.source.sourceFirstSeenAt, processedAt)
  };
}

function deactivateContent(existingRecord, processedAt) {
  return {
    ...existingRecord,
    source: { ...existingRecord.source, sourceLastSeenAt: processedAt },
    lifecycle: {
      ...existingRecord.lifecycle,
      isActive: false,
      isSearchEligible: false,
      curiMapQueueStatus: "INACTIVE_CANDIDATE"
    }
  };
}

function createSource(row, firstSeenAt, lastSeenAt) {
  return {
    sourceUrl: row.source_url,
    sourceOriginalModifiedAt: row.source_original_modified_at,
    sourceFirstSeenAt: firstSeenAt,
    sourceLastSeenAt: lastSeenAt,
    contentFingerprint: createEducationalFingerprint(row)
  };
}

function createDraftLifecycle() {
  return {
    isActive: true,
    assetClassification: "DRAFT_INPUT",
    isCuriBaseVerified: false,
    isSearchEligible: false,
    curiMapQueueStatus: "PENDING"
  };
}

function createReviewRequired(history, processedAt, reason) {
  return {
    status: "REVIEW_REQUIRED",
    required: true,
    queuedAt: processedAt,
    queueReason: reason,
    ...(history?.length ? { history } : {})
  };
}

function createMetadata(row) {
  return {
    candidateTier: null,
    mappingReadiness: null,
    sourceGroup: null,
    contentLevel: row.content_level,
    programName: row.program_name,
    episodeNo: row.episode_no,
    title: row.title,
    synopsis: row.synopsis,
    gradeBandSeed: row.grade_band_seed,
    subjectSeed: row.subject_seed,
    curriculumUnitSeed: row.curriculum_unit_seed,
    sourceLinkQuality: null,
    workingSetStatus: null
  };
}

function getInactivationCandidates(contents, candidates, sourceSnapshot) {
  if (!sourceSnapshot || candidates.length === 0) {
    return [];
  }

  const sourceSystem = candidates[0].row.source_system;
  const incomingKeys = new Set(candidates.map((candidate) => candidate.stableKey));
  return contents
    .filter((record) => record.lifecycle.isActive)
    .filter((record) => record.sourceIdentity.sourceSystem === sourceSystem)
    .filter((record) => !incomingKeys.has(record.sourceIdentity.stableKey))
    .map((existingRecord) => ({ stableKey: existingRecord.sourceIdentity.stableKey, existingRecord }));
}

function validateRow(row, seenKeys) {
  for (const field of requiredFields) {
    if (!row[field]) {
      return `필수 필드가 비어 있습니다: ${field}`;
    }
  }

  if (!isHttpUrl(row.source_url)) {
    return "source_url은 http 또는 https URL이어야 합니다.";
  }

  if (row.source_original_modified_at && Number.isNaN(Date.parse(row.source_original_modified_at))) {
    return "source_original_modified_at은 ISO 날짜 형식이어야 합니다.";
  }

  if (seenKeys.has(stableKeyFor(row))) {
    return "같은 source_system + source_content_id가 입력 안에 중복되었습니다.";
  }

  return null;
}

function createChangeSummary(candidate) {
  const existing = candidate.existingRecord;
  const changedFields = existing ? educationalFields.filter((field) => {
    const existingValue = contentValueFromRecord(existing, field);
    return existingValue !== candidate.row[field];
  }) : educationalFields.filter((field) => candidate.row[field]);

  return {
    rowNumber: candidate.rowNumber,
    stableKey: candidate.stableKey,
    outcome: candidate.outcome,
    title: candidate.row.title,
    changedFields,
    requiresReview: true,
    queueStatus: "PENDING"
  };
}

function contentValueFromRecord(record, field) {
  const map = {
    source_url: record.source.sourceUrl,
    source_original_modified_at: record.source.sourceOriginalModifiedAt,
    program_name: record.metadata.programName,
    episode_no: record.metadata.episodeNo,
    title: record.metadata.title,
    synopsis: record.metadata.synopsis,
    content_level: record.metadata.contentLevel,
    grade_band_seed: record.metadata.gradeBandSeed,
    subject_seed: record.metadata.subjectSeed,
    curriculum_unit_seed: record.metadata.curriculumUnitSeed
  };

  return map[field] ?? null;
}

function createEducationalFingerprint(row) {
  return createFingerprint(
    Object.fromEntries(educationalFields.map((field) => [field, row[field] ?? null]))
  );
}

function normalizeRow(row) {
  const normalized = {};
  for (const field of [...requiredFields, "source_original_modified_at", "source_version", ...educationalFields]) {
    normalized[field] = normalizeValue(row?.[field]);
  }
  normalized.source_version ??= "MANUAL_INCREMENTAL";

  return normalized;
}

function normalizeValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function stableKeyFor(row) {
  return row.source_system && row.source_content_id
    ? `${row.source_system}:${row.source_content_id}`
    : null;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeMode(value) {
  return value === "SCHEDULED" ? "SCHEDULED" : "MANUAL";
}

function countOutcome(candidates, outcome) {
  return candidates.filter((candidate) => candidate.outcome === outcome).length;
}

module.exports = { applyIngestion, parseContentCsv, previewIngestion };
