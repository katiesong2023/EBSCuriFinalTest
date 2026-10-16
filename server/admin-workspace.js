const fs = require("node:fs/promises");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const { readDataStore } = require("./data-store");
const { loadDiscoveryCatalog, safeSourceUrl } = require("./discovery-catalog");
const { readBroadcastResources, broadcastPath, broadcastSummary } = require("./broadcast-store");
const { getSemanticIndex, tagResource } = require("./semantic-layer");
const { resolveSourceLink } = require("./source-links");
const { evaluateVerification } = require("./data-quality");
const { VerifiedSaveError } = require("./verified-save");
const { readAutomaticAdminState } = require("./admin-automatic-state");
const { workState, selectWorkRows } = require("./admin-work-items");
const { currentSource, reviewValidity } = require("./human-review-contract");
const { projectionMatches } = require("./search-index-contract");
let cachedCatalog, cachedBase;

async function loadBase() {
  const catalog = await loadDiscoveryCatalog();
  if (cachedCatalog === catalog) return cachedBase;
  const resources = new Map(catalog.resources.map((item) => [item.id, item]));
  // 관리 목록은 교사 화면의 판본 묶음과 달리 모든 회차 ID를 유지한다.
  for (const item of readBroadcastResources()) if (!resources.has(item.id)) resources.set(item.id, item);
  const mismatches = new Set();
  let broadcast = { total: 0, programs: [], pages: [] }, failedPages = [];
  let db;
  try {
    db = new DatabaseSync(broadcastPath, { readOnly: true });
    broadcast = broadcastSummary(db);
    for (const row of db.prepare("SELECT e.id,e.title,e.url FROM episodes e JOIN link_checks l ON e.id=l.id WHERE l.status='MISMATCH' AND l.title=e.title AND l.url=e.url").all()) {
      const current = resources.get(row.id);
      if (current?.title === row.title && current.sourceUrl === row.url) mismatches.add(row.id);
    }
    failedPages = db.prepare("SELECT job,status,error,fetched_at FROM pages WHERE status<>'COMPLETE' ORDER BY fetched_at DESC LIMIT 20").all();
  } finally { db?.close(); }
  const audit = JSON.parse(await fs.readFile(path.join(__dirname, "data/source-link-audit.json"), "utf8"));
  for (const record of audit.records) {
    const resource = resources.get(record.id);
    if (record.status === "MISMATCH" && resource?.title === record.title && [record.originalUrl, record.storedOriginalUrl].includes(resource.sourceUrl)) mismatches.add(record.id);
  }
  cachedCatalog = catalog;
  const value = { resources: [...resources.values()], mismatches, broadcast, failedPages };
  value.tags = getSemanticIndex(value);
  cachedBase = value;
  return value;
}

function buildRows(base, store, automatic = { byResource: new Map() }) {
  const contents = new Map(store.contents.map((content) => [content.sourceIdentity.sourceContentId, content]));
  const resources = new Map(base.resources.map((item) => [item.id, item]));
  // 비활성·검색 제외 자료도 관리자가 이력을 확인할 수 있다.
  for (const [id, content] of contents) if (!resources.has(id)) {
    const sourceUrl = safeSourceUrl(content.source.sourceUrl);
    const item = { id, title: content.metadata.title, program: content.metadata.programName, summary: content.metadata.synopsis || "", sourceUrl,
      evidenceUrl: sourceUrl, evidenceLevel: "TITLE_ONLY", kind: content.metadata.contentLevel };
    item.navigation = resolveSourceLink(item);
    resources.set(id, item);
  }
  for (const [id, entry] of automatic.byResource) if (!resources.has(id)) {
    const source = entry.history.findLast((run) => run.report)?.report.source;
    resources.set(id, { id, title: source?.fields.title || `원본 미확인 ${id}`, summary: source?.fields.synopsis || "",
      sourceSystem: source?.sourceSystem, variant: source?.variant, sourceUrl: source?.sourceUrl,
      kind: source?.kind, missingSource: true, navigation: { status: "UNCONFIRMED" } });
  }
  const latestRuns = new Map(store.mappingRuns.map((run) => [run.contentCuriId, run]));
  const saved = new Set(store.verifiedAssets.map((asset) => asset.contentCuriId));
  return [...resources.values()].map((item) => {
    const content = contents.get(item.id);
    if (content) item = { ...item, title: content.metadata.title, summary: content.metadata.synopsis || "",
      sourceSystem: content.sourceIdentity.sourceSystem, variant: content.metadata.variant || "UNSPECIFIED",
      sourceUrl: content.source.sourceUrl, changedAt: content.updatedAt };
    const run = latestRuns.get(content?.curiId);
    const review = run?.reviewHistory?.at(-1);
    const tags = base.tags.get(item.id) || tagResource({ ...item, summary: "" });
    const active = !item.missingSource && content?.lifecycle?.isActive !== false;
    const humanAssets = store.verifiedAssets.filter((asset) => asset.content.sourceIdentity.sourceContentId === item.id);
    const approved = saved.has(content?.curiId) || humanAssets.length > 0;
    const humanSearchReady = humanAssets.length > 0 && humanAssets.every((asset) => store.searchProjection.some((projection) => projectionMatches(projection, asset)));
    const latestHuman = [...new Map((store.relationReviews || []).filter((review) => review.source.sourceContentId === item.id).map((review) => [review.relationKey, review])).values()];
    const humanChanged = latestHuman.some((review) => reviewValidity(review, store, currentSource(store, review.target, base.resources)));
    const staleReview = Boolean(content && review && ["HUMAN_APPROVED", "HUMAN_EDITED"].includes(review.status) && !evaluateVerification(store, content.curiId).eligible);
    const row = { id: item.id, title: item.title, program: item.program, contentCuriId: content?.curiId || null,
      active, sourceStatus: base.mismatches.has(item.id) ? "MISMATCH" : item.navigation.status,
      tagStatus: tags.supported.length ? "SOURCE_MENTION" : "VOCABULARY_NOT_FOUND",
      tagCount: tags.supported.length, inferenceCount: tags.candidates.length,
      relationStatus: "RELATION_NOT_VERIFIED", evidenceLevel: item.evidenceLevel,
      approvalStatus: approved ? "APPROVED" : staleReview || humanChanged ? "STALE_REVIEW" : latestHuman.at(-1)?.status || review?.status || "NOT_ASSESSED",
      mappingStatus: run?.result?.status || "NOT_RUN",
      human: { decisions: latestHuman.length, approved: humanAssets.length, changed: humanChanged,
        searchPending: approved && !humanSearchReady,
        held: latestHuman.filter((review) => review.decision === "hold").length, excluded: latestHuman.filter((review) => review.decision === "exclude").length },
      reviewPending: active && (humanChanged || latestHuman.some((review) => review.decision === "hold") || !approved && !latestHuman.length && (staleReview || run?.result?.status === "DRAFT" && !review || run?.result?.hold?.code === "MODEL_HELD" && !review)),
      searchStatus: humanSearchReady ? "READY" : approved ? "PENDING" : "NOT_SAVED",
      automaticAllowed: active && Boolean(content || item.id.startsWith("BCAST-")) };
    return { ...row, work: workState(item, row, automatic.byResource.get(item.id)) };
  });
}

async function getAdminWorkspace(input, dependencies) {
  const base = dependencies?.base || await loadBase();
  const store = dependencies?.store || await readDataStore();
  const automatic = dependencies?.automatic || (dependencies ? { byResource: new Map(), totals: { runs: 0, relations: 0, assets: 0 } } : await readAutomaticAdminState(store, base));
  const rows = buildRows(base, store, automatic);
  const selection = selectWorkRows(rows, input);
  if (input.id) {
    const row = rows.find((item) => item.id === input.id);
    if (!row) throw new VerifiedSaveError("자료를 찾지 못했습니다. 관리 목록에서 다시 선택하세요.", 404);
    const content = store.contents.find((item) => item.curiId === row.contentCuriId);
    const historical = automatic.byResource.get(row.id)?.history.findLast((run) => run.report)?.report.source;
    let resource = base.resources.find((item) => item.id === row.id) || { ...row, summary: content?.metadata.synopsis || historical?.fields.synopsis || "", sourceUrl: safeSourceUrl(content?.source.sourceUrl || historical?.sourceUrl) };
    if (content) resource = { ...resource, title: content.metadata.title, summary: content.metadata.synopsis || "", sourceSystem: content.sourceIdentity.sourceSystem,
      variant: content.metadata.variant || "UNSPECIFIED", sourceUrl: content.source.sourceUrl };
    const index = selection.matched.findIndex((item) => item.id === row.id), cursor = Math.max(0, Number.parseInt(input.cursor, 10) || 0);
    const position = index < 0 ? cursor : index;
    const entry = automatic.byResource.get(row.id);
    const runs = store.mappingRuns.filter((run) => run.contentCuriId === row.contentCuriId);
    const mappingAllowed = Boolean(content && row.active && ["사회", "과학", "환경/생태", "사회/경제"].includes(content.metadata.subjectSeed));
    const gate = content ? evaluateVerification(store, content.curiId) : null;
    return { resource: { ...resource, ...row }, tags: base.tags.get(row.id) || tagResource({ ...resource, summary: "" }),
      mappingAllowed, sourceRecord: content || null,
      automatic: { latest: entry?.latest || [], history: (entry?.history || []).map(({ id, state, started_at, finished_at, error, subject, retry_of }) => ({ id, state, started_at, finished_at, error, subject, retry_of })) },
      navigation: { matching: index >= 0, position, total: selection.total,
        previous: selection.matched[Math.min(position - 1, selection.total - 1)]?.id || null,
        next: selection.matched[index < 0 ? position : position + 1]?.id || null },
      gate: gate ? { eligible: gate.eligible, reasons: gate.reasons } : null,
      runs: runs.map((run) => ({ mappingRunId: run.mappingRunId, status: run.result?.status, createdAt: run.createdAt, reviewHistory: run.reviewHistory || [] })),
      assets: store.verifiedAssets.filter((asset) => asset.content.sourceIdentity.sourceContentId === row.id),
      invalidatedAssets: store.verifiedAssetHistory.filter((asset) => asset.content.sourceIdentity.sourceContentId === row.id),
      importRecord: { source_system: content?.sourceIdentity.sourceSystem || "EBS_BROADCAST", source_content_id: row.id,
        source_url: resource.sourceUrl, title: row.title, synopsis: resource.summary || "", program_name: row.program || "", content_level: resource.kind || "episode",
        subject_seed: content?.metadata.subjectSeed || "", grade_band_seed: content?.metadata.gradeBandSeed || "" } };
  }
  const { matched, scoped, ...listing } = selection;
  return { ...listing,
    statistics: { allResources: rows.length, queryResources: scoped.length,
      latestRelations: scoped.reduce((sum, row) => sum + row.work.automatic.relationCount, 0),
      executions: scoped.reduce((sum, row) => sum + row.work.automatic.runCount, 0),
      allExecutions: automatic.totals.runs, allHistoricalRelations: automatic.totals.relations,
      currentAutomaticAssets: scoped.reduce((sum, row) => sum + row.work.automatic.published, 0),
      note: "상태별 수치는 검색어에 맞는 고유 자료 수이며 서로 중복될 수 있습니다. 관계 수는 교과·학년 범위별 최신 실행의 후보 수, 실행 수는 보존된 전체 이력입니다. 선택적 사람 검토는 기존 초안·사람 보류·근거 변경 자료를 세며 전체 자동 작업량이 아닙니다." },
    collection: { ...base.broadcast, programs: base.broadcast.programs.length, failedPages: base.failedPages },
    ingestionRuns: store.ingestionRuns.slice(-10).reverse(),
    policy: "등록 어휘 미발견은 자료 오류가 아닙니다. 원문 부족·인용 실패·관계 미확인·자동 검사·사람 검수는 별도 상태입니다." };

}
module.exports = { getAdminWorkspace, buildRows };
