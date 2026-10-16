const fs = require("node:fs/promises");
const path = require("node:path");
const { parseCsv } = require("./data-store");
const { resolveSourceLink } = require("./source-links");
const { broadcastPath, readBroadcastResources } = require("./broadcast-store");
const { programFormMatcher } = require("./program-form-source");
const { sourceQualityStats } = require("./source-text-quality");
const { teacherResourcePath, readTeacherResources } = require("./teacher-resource-store");
let cachedCatalog;
let cachedSignature;

const root = path.resolve(__dirname, "..");
const catalogPaths = {
  raw: path.join(root, "EBS_Curi_FINAL_PACKAGE_v1.4/data/raw/ebs_content_unified_604_with_status.csv"),
  store: path.join(__dirname, "data/curi-store.json"),
  geography: path.join(__dirname, "data/discovery-geography.json"),
  programs: path.join(__dirname, "data/broadcast-programs.json")
};

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    const allowed = ["ebs.co.kr", "ebsmedia.net", "encykorea.aks.ac.kr"];
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
  } catch { return null; }
}

async function loadDiscoveryCatalog() {
  const files = [...Object.values(catalogPaths), broadcastPath, teacherResourcePath];
  const signature = (await Promise.all(files.map(async (file) => {
    try { const stat = await fs.stat(file); return `${stat.mtimeMs}:${stat.size}`; }
    catch (error) { if ([broadcastPath, teacherResourcePath].includes(file) && error.code === "ENOENT") return "missing"; throw error; }
  }))).join("|");
  if (cachedCatalog && signature === cachedSignature) return cachedCatalog;
  const [raw, storeText, geographyText, programsText] = await Promise.all([
    fs.readFile(catalogPaths.raw, "utf8"), fs.readFile(catalogPaths.store, "utf8"),
    fs.readFile(catalogPaths.geography, "utf8"), fs.readFile(catalogPaths.programs, "utf8")
  ]);
  cachedCatalog = buildCatalog(parseCsv(raw), JSON.parse(storeText), JSON.parse(geographyText), readBroadcastResources(), JSON.parse(programsText));
  const registered = readTeacherResources();
  const present = new Set([...cachedCatalog.resources, ...cachedCatalog.searchVariants].map(r => r.id));
  for (const resource of registered) if (resource.provenance?.classification === "TEACHER_CAPTURE" && !present.has(resource.id)) {
    cachedCatalog.resources.push(resource); present.add(resource.id);
    cachedCatalog.stats.catalog++;
    if (resource.kind === "collection") cachedCatalog.stats.collections++; else cachedCatalog.stats.individual++;
  }
  cachedCatalog = require("./source-description-patches").applyDescriptionPatches(cachedCatalog);
  cachedCatalog.liveSource = true;
  cachedSignature = signature;
  return cachedCatalog;
}

function buildCatalog(rows, store, geography, broadcasts = [], programRegistry = {}) {
  const overlays = new Map(store.contents.map((item) => [item.sourceIdentity.sourceContentId, item]));
  const currentRows = new Map(rows.map((row) => [row.record_id, row]));
  // 증분 가져오기의 신규·변경·비활성 자료도 다음 검색부터 반영한다.
  for (const content of store.contents) {
    const id = content.sourceIdentity.sourceContentId;
    const previous = currentRows.get(id) || {};
    currentRows.set(id, { ...previous, record_id: id,
      title: content.metadata.title, program_name: content.metadata.programName,
      content_level: content.metadata.contentLevel,
      source_url: content.source.sourceUrl, collected_at: content.source.sourceLastSeenAt,
      synopsis: previous.synopsis || "" });
  }
  const resources = new Map();
  for (const row of currentRows.values()) {
    const overlay = overlays.get(row.record_id);
    if (overlay?.lifecycle?.isActive === false) continue;
    // 교육용 추측 태그는 검색 근거에 쓰지 않고 출처의 본문·제목만 사용한다.
    const hasSourceDescription = overlay?.provenance?.descriptionClassification === "EBS_PUBLIC_DESCRIPTION";
    const sourceTextAllowed = overlay?.provenance?.classification === "SOURCE" &&
      [null, undefined, "EBS_PUBLIC_DESCRIPTION", "SOURCE_SYNOPSIS", "OFFICIAL_CLIP_METADATA", "OFFICIAL_CLIP_PAGE"].includes(overlay.provenance.descriptionClassification);
    const summary = (overlay ? sourceTextAllowed ? overlay.metadata.synopsis : "" : row.synopsis) || "";
    const sourceUrl = safeSourceUrl(row.source_url);
    if (!row.record_id || !row.title || !sourceUrl) continue;
    const kind = ["clip", "episode"].includes(row.content_level) ? row.content_level : "collection";
    resources.set(row.record_id, {
      id: row.record_id, kind, program: row.program_name, title: row.title,
      sourceSystem: overlay?.sourceIdentity.sourceSystem, variant: overlay?.metadata.variant || "UNSPECIFIED",
      summary, sourceUrl, evidenceUrl: safeSourceUrl(hasSourceDescription ? overlay.provenance.descriptionSourceUrl : row.source_url),
      linkLabel: kind === "clip" ? "EBS 강좌 목록" : "EBS 프로그램 목록",
      evidenceLevel: summary ? "SOURCE_DESCRIPTION" : "TITLE_ONLY",
      evidenceLabel: summary ? overlay && !overlay.provenance.descriptionClassification ? "가져온 소개문 · 원문 대조 필요" : "보유 공개 소개문" : "원본 목록 · 제목 근거",
      checkedAt: hasSourceDescription ? overlay.provenance.descriptionVerifiedAt : row.collected_at,
      durationMinutes: null, curriculumStatus: "NOT_ASSESSED", playbackStatus: "NOT_CHECKED",
      limitation: kind === "collection" ? "프로그램 묶음 또는 회차 탐색용 목록입니다. 개별 영상 자료가 아닙니다." :
        "목록에서 제목을 찾아야 합니다. 개별 재생 주소·영상 장면·학년 적합성은 미확인입니다."
    });
  }
  for (const resource of geography.resources) {
    if (resources.has(resource.id)) throw new Error(`중복 자료 ID: ${resource.id}`);
    if (!safeSourceUrl(resource.sourceUrl)) throw new Error("허용하지 않은 자료 출처");
    resources.set(resource.id, { ...resource, evidenceUrl: resource.sourceUrl,
      curriculumStatus: "NOT_ASSESSED", playbackStatus: "NOT_CHECKED" });
  }
  for (const concept of geography.concepts) {
    if (!safeSourceUrl(concept.sourceUrl)) throw new Error("허용하지 않은 개념 출처");
    for (const id of [...concept.directResourceIds, ...concept.places.flatMap((place) => place.resourceIds)]) {
      // 알려진 원본이 비활성화돼도 다른 자료 탐색까지 중단하지 않는다.
      if (!resources.has(id) && !currentRows.has(id)) throw new Error(`개념 연결 자료 누락: ${id}`);
    }
  }
  const items = [...resources.values()].map((item) => {
    const navigation = resolveSourceLink(item);
    return { ...item, navigation, limitation: navigation.status === "MATCHED" && ["CLIP", "EPISODE"].includes(navigation.kind)
      ? "해당 콘텐츠가 선택된 도착 페이지를 확인했습니다. 실제 재생·로그인 조건·장면 시점·학년 적합성은 별도 확인이 필요합니다." : item.limitation };
  });
  const titleKey = (item) => `${item.program}:${item.title}`.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const grouped = new Map();
  // 원본 ID는 보존한다. 동일 프로그램·동일 제목은 검색에서 한 대표만 보여 중복 후보를 줄인다.
  for (const item of [...broadcasts].sort((a, b) => Number(b.navigation.status === "MATCHED") - Number(a.navigation.status === "MATCHED") || String(a.broadcastDate).localeCompare(String(b.broadcastDate)))) {
    const key = titleKey(item);
    if (!grouped.has(key)) grouped.set(key, item);
  }
  for (const item of grouped.values()) {
    if (!safeSourceUrl(item.sourceUrl)) throw new Error("방송 카탈로그 출처 오류");
    if (overlays.get(item.id)?.lifecycle?.isActive === false) continue;
    // 관리자가 같은 방송 ID를 검수 저장소에 가져와도 중복 적재하지 않는다.
    // 수정한 제목·소개문·출처는 저장소 값을 유지하고 방송일만 보완한다.
    if (resources.has(item.id)) {
      const imported = items.find((entry) => entry.id === item.id);
      imported.broadcastDate = item.broadcastDate;
      if (imported.title === item.title && imported.sourceUrl === item.sourceUrl) imported.navigation = item.navigation;
      continue;
    }
    const previous = items.find((entry) => entry.id.startsWith("GEO-") && entry.kind === "episode" && titleKey(entry) === titleKey(item));
    if (previous) {
      previous.navigation = item.navigation;
      previous.canonicalEpisodeId = item.id;
      previous.collectionUrl = previous.sourceUrl;
      previous.sourceUrl = item.sourceUrl;
      previous.durationMinutes = item.durationMinutes;
      previous.broadcastDate = item.broadcastDate;
      if (item.summary && item.summary !== item.title && (item.summary.length >= 40 || previous.evidenceLevel === "TITLE_ONLY")) {
        previous.summary = item.summary; previous.evidenceLevel = item.evidenceLevel;
        previous.evidenceLabel = item.evidenceLabel; previous.evidenceUrl = item.sourceUrl;
      }
      previous.limitation = item.limitation;
      continue;
    }
    items.push(item);
  }
  for (const item of require('./program-announcements').programAnnouncements(programRegistry)) {
    if (!resources.has(item.id) && overlays.get(item.id)?.lifecycle?.isActive !== false) items.push(item);
  }
  const visibleIds = new Set(items.flatMap((item) => [item.id, item.canonicalEpisodeId]).filter(Boolean));
  const searchVariants = broadcasts.filter((item) => !visibleIds.has(item.id) && overlays.get(item.id)?.lifecycle?.isActive !== false);
  if (searchVariants.some((item) => !safeSourceUrl(item.sourceUrl))) throw new Error("방송 판본 카탈로그 출처 오류");
  const classifyProgram = programFormMatcher(programRegistry);
  for (const resource of [...items, ...searchVariants]) {
    const classification = classifyProgram(resource);
    if (classification) resource.programClassification = classification;
  }
  return {
    resources: items,
    // 교사 필터/날짜 정렬은 같은 제목의 다른 회차까지 먼저 대조한 뒤 묶는다.
    searchVariants,
    concepts: geography.concepts, version: geography.version,
    stats: {
      catalog: items.length,
      individual: items.filter((item) => item.kind !== "collection").length,
      collections: items.filter((item) => item.kind === "collection").length,
      withDescription: sourceQualityStats(items).minimumPassed,
      sourceQuality: sourceQualityStats(items),
      workingSet: store.contents.filter((item) => item.lifecycle?.isActive !== false).length,
      indexedContents: new Set((store.searchProjection || []).map((item) => item.contentCuriId)).size,
      concepts: geography.concepts.length, paidApiCallsPerSearch: 0,
      broadcastEpisodes: broadcasts.filter((item) => item.variant === "EPISODE").length,
      broadcastCatalog: broadcasts.length,
      broadcastDescriptions: sourceQualityStats(broadcasts).minimumPassed,
      broadcastPrograms: new Set(broadcasts.map((item) => item.program)).size,
      broadcastTitleGroups: grouped.size,
      directLinks: items.filter((item) => item.navigation.status === "MATCHED" && ["CLIP", "EPISODE"].includes(item.navigation.kind)).length
    }
  };
}

module.exports = { loadDiscoveryCatalog, buildCatalog, safeSourceUrl, catalogPaths };
