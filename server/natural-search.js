const { readDataStore } = require("./data-store");
const { createLocalEmbedder } = require("./local-embedding");
const { embeddingSpec, projectionMatches } = require("./search-index-contract");
const { SearchError, parseSearchInput } = require("./search-conditions");
const { resolveSourceLink } = require("./source-links");
const { filterVerifiedTopics, topicQuery } = require("./verified-topic-filter");

const { matchesStandard, gradeLabel, standardCourse } = require("../public/grade-context");
const pageSize = 10;
// DEV 평가 전의 초기값이다. 날짜 정렬에도 같은 기준을 적용한다.
const defaultMinRelevance = 0.82;

function configuredThreshold(value = process.env.CURI_SEARCH_MIN_RELEVANCE) {
  if (value === undefined) return defaultMinRelevance;
  const parsed = Number(value);
  if (String(value).trim() === "" || !Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new SearchError("CURI_SEARCH_MIN_RELEVANCE를 0~1 사이 숫자로 설정하고 서버를 재시작하세요.", 503);
  }
  return parsed;
}

function validVector(vector) {
  return Array.isArray(vector) && vector.length === embeddingSpec.dimensions &&
    vector.every(Number.isFinite) && Math.abs(Math.hypot(...vector) - 1) < 0.01;
}

function cosine(left, right) {
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
  return Math.max(-1, Math.min(1, dot / (Math.hypot(...left) * Math.hypot(...right))));
}

function broadcastDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value ? value : null;
}

function compareDates(left, right, oldest = false) {
  if (!left.date && !right.date) return 0;
  if (!left.date) return 1;
  if (!right.date) return -1;
  return oldest ? left.date.localeCompare(right.date) : right.date.localeCompare(left.date);
}

function eligibleRelations(store, applied) {
  return store.verifiedAssets.flatMap((asset) => {
    const standard = asset.standard.metadata;
    const grade = gradeLabel(asset.standard);
    if (!matchesStandard(asset.standard, applied.grade)) return [];
    if (applied.subject.value !== "all" && applied.subject.value !== standard.subject) return [];
    const projection = store.searchProjection.find((item) => projectionMatches(item, asset));
    return projection ? [{ asset, projection, grade }] : [];
  });
}

function rankResults(relations, vector, threshold, sort) {
  const byContent = new Map();
  for (const { asset, projection, grade } of relations) {
    const score = cosine(vector, projection.vector);
    if (score < threshold) continue;
    const metadata = asset.content.metadata;
    const standard = asset.standard.metadata;
    let result = byContent.get(asset.contentCuriId);
    if (!result) {
      result = { contentCuriId: asset.contentCuriId, title: metadata.title,
        program: metadata.programName ?? metadata.sourceGroup ?? "프로그램 미확인",
        date: broadcastDate(metadata.broadcastDate), sourceUrl: asset.content.sourceUrl,
        navigation: resolveSourceLink({ id: asset.content.sourceIdentity?.sourceContentId, title: metadata.title,
          program: metadata.programName ?? metadata.sourceGroup, sourceUrl: asset.content.sourceUrl }),
        score, relations: [] };
      byContent.set(asset.contentCuriId, result);
    }
    result.score = Math.max(result.score, score);
    result.relations.push({ verifiedAssetId: asset.verifiedAssetId, version: asset.version,
      curriculumCuriId: asset.curriculumCuriId, grade, courseId: standardCourse(asset.standard), officialGradeBand: standard.gradeBand, placement: asset.standard.placement || null, subject: standard.subject,
      standardId: standard.achievementStandardId, standard: standard.achievementStandard,
      reason: asset.review.result.rationale, teachingUse: asset.review.result.teachingUse,
      coreConcepts: asset.review.result.coreConcepts, score });
  }
  const results = [...byContent.values()];
  for (const result of results) result.relations.sort((a, b) => b.score - a.score || a.standardId.localeCompare(b.standardId));
  return results.sort((a, b) => {
    const relevance = b.score - a.score;
    const dates = compareDates(a, b, sort === "oldest");
    return (sort === "relevance" ? relevance || dates : dates || relevance) || a.contentCuriId.localeCompare(b.contentCuriId);
  });
}

function createNaturalSearch({ readStore = readDataStore, createEmbedder = createLocalEmbedder,
  getThreshold = configuredThreshold } = {}) {
  // 결과는 매번 최신 저장소에서 구한다. 재사용하는 것은 질의 벡터뿐이다.
  const queryCache = new Map();
  let pending;
  async function embedQuery(query) {
    if (queryCache.has(query)) {
      const result = queryCache.get(query);
      queryCache.delete(query); queryCache.set(query, result);
      return { ...result, cached: true };
    }
    if (pending) {
      if (pending.query === query) return pending.promise;
      throw new SearchError("다른 검색을 처리 중입니다. 잠시 후 다시 검색하세요.", 503);
    }
    const promise = (async () => {
      const embedder = createEmbedder();
      try {
        const result = await embedder.embed(`query: ${query}`);
        if (!validVector(result.vector)) throw new Error("잘못된 질의 벡터");
        const entry = { vector: result.vector, truncated: result.truncated === true };
        queryCache.set(query, entry);
        if (queryCache.size > 32) queryCache.delete(queryCache.keys().next().value);
        return { ...entry, cached: false };
      } catch {
        throw new SearchError("검색 계산에 실패했습니다. 로컬 모델 설치·연결 상태를 확인하고 다시 검색하세요.", 503);
      } finally { await embedder.close(); }
    })();
    pending = { query, promise };
    try { return await promise; } finally { if (pending?.promise === promise) pending = null; }
  }

  return async function search(input) {
    const startedAt = Date.now();
    const parsed = parseSearchInput(input);
    const threshold = getThreshold();
    const response = { query: parsed.query, applied: parsed.applied, warnings: parsed.warnings,
      sort: parsed.sort, threshold, pageSize, page: 1, totalPages: 0, total: 0, results: [],
      state: "EMPTY", discoveryUrl: `/?${new URLSearchParams({ q: parsed.query, grade: input.grade || "all" })}`,
      usage: { externalApiCalls: 0, queryEmbedded: false, queryCacheHit: false } };
    if (parsed.needsClarification) return { ...response, state: "NEEDS_CLARIFICATION" };
    let store = await readStore();
    let relations = eligibleRelations(store, parsed.applied);
    let results = [];
    if (relations.length) {
      const embedding = await embedQuery(parsed.query);
      // 추론 대기 중 수정·제외된 관계가 결과에 남지 않도록 다시 읽는다.
      store = await readStore();
      relations = eligibleRelations(store, parsed.applied);
      response.usage.queryEmbedded = !embedding.cached;
      response.usage.queryCacheHit = embedding.cached;
      const topics = await filterVerifiedTopics(relations, parsed.query);
      response.warnings.push(...topics.warnings);
      if (topics.needsTopic) return { ...response, state: "NEEDS_CLARIFICATION",
        clarificationMessage: "찾고 싶은 내용 주제를 함께 적어주세요. 예: 우주, 계절별 날씨, 산맥." };
      results = rankResults(topics.relations, embedding.vector, threshold, parsed.sort);
      if (embedding.truncated) response.warnings.push("긴 질의가 모델 입력 상한에서 잘렸습니다. 질의를 줄여 다시 검색하세요.");
    }
    const totalPages = Math.ceil(results.length / pageSize);
    const page = Math.min(parsed.requestedPage, totalPages || 1);
    return { ...response, state: results.length ? "RESULTS" : "EMPTY", total: results.length,
      totalPages, page, results: results.slice((page - 1) * pageSize, page * pageSize),
      indexedContents: new Set(store.searchProjection.map((item) => item.contentCuriId)).size,
      durationMs: Date.now() - startedAt };
  };
}

const searchVerifiedContents = createNaturalSearch();
module.exports = { SearchError, searchVerifiedContents, createNaturalSearch, configuredThreshold };
