const { randomUUID } = require("node:crypto");
const { readDataStore, writeDataStore } = require("./data-store");
const { VerifiedSaveError } = require("./verified-save");
const { createLocalEmbedder } = require("./local-embedding");
const { embeddingSpec, documentForAsset, embeddingKey, validEmbedding, projectionMatches } = require("./search-index-contract");

// 실행 중 여부는 현재 프로세스 기준이다. 재시작 뒤 남은 RUNNING 기록은 중단으로 표시한다.
const activeRuns = new Set();

function indexStatus(store, contentCuriId) {
  const assets = store.verifiedAssets.filter((asset) => asset.contentCuriId === contentCuriId);
  const ready = assets.length > 0 && assets.every((asset) =>
    store.searchProjection.some((item) => projectionMatches(item, asset)));
  const lastRun = store.searchIndexRuns?.findLast((run) => run.contentCuriId === contentCuriId);
  const currentAttempt = assets.length > 0 && lastRun?.assetIds.join() === assets.map((asset) => asset.verifiedAssetId).join();
  const running = lastRun?.status === "RUNNING" && activeRuns.has(lastRun.runId);
  return { contentCuriId, state: !assets.length ? "NOT_SAVED" : ready ? "READY" :
    running && currentAttempt ? "RUNNING" : currentAttempt && lastRun.status === "RUNNING" ? "INTERRUPTED" :
      currentAttempt && lastRun.status === "FAILED" ? "FAILED" : "PENDING",
    ready, assetCount: assets.length, indexedCount: store.searchProjection.filter((item) => item.contentCuriId === contentCuriId).length,
    spec: embeddingSpec, lastRun: lastRun ? { ...lastRun,
      status: lastRun.status === "RUNNING" && !running ? "INTERRUPTED" : lastRun.status } : null };
}

async function getSearchIndexStatus(contentCuriId) {
  const store = await readDataStore();
  if (!store.contents.some((content) => content.curiId === contentCuriId) && !(store.relationReviews || []).some((review) => review.contentCuriId === contentCuriId)) {
    throw new VerifiedSaveError("콘텐츠를 찾지 못했습니다.", 404);
  }
  return indexStatus(store, contentCuriId);
}

async function prepareSearchIndex(input, { createEmbedder = createLocalEmbedder } = {}) {
  if (!input || typeof input.contentCuriId !== "string") throw new VerifiedSaveError("검색 준비할 콘텐츠를 지정하세요.", 400);
  if (activeRuns.size) throw new VerifiedSaveError("검색 준비가 실행 중입니다. 완료 후 다시 확인하세요.");
  let store = await readDataStore();
  const assets = store.verifiedAssets.filter((asset) => asset.contentCuriId === input.contentCuriId && (!input.relationReviewId || asset.reviewId === input.relationReviewId));
  if (!assets.length) throw new VerifiedSaveError("최신 사람 승인·수정 결과를 먼저 CuriBase에 저장하세요.");
  if (input.relationReviewId ? assets.some((asset) => asset.reviewKind !== "RELATION_REVIEW") : assets.some((asset) => asset.reviewId !== input.reviewId || asset.contentVersion !== input.contentVersion ||
      asset.mappingRunId !== input.mappingRunId)) {
    throw new VerifiedSaveError("콘텐츠 또는 검수 기록이 변경되었습니다. 새로고침하세요.");
  }
  const status = indexStatus(store, input.contentCuriId);
  if (assets.every((asset) => store.searchProjection.some((item) => projectionMatches(item, asset)))) return { ...status, state: "READY", ready: true, reused: true };
  if (activeRuns.size) throw new VerifiedSaveError("검색 준비가 실행 중입니다. 완료 후 다시 확인하세요.");
  const now = () => new Date().toISOString();
  store.searchIndexRuns ??= [];
  store.embeddingCache ??= [];
  for (const previous of store.searchIndexRuns.filter((run) => run.status === "RUNNING")) {
    previous.status = "INTERRUPTED";
    previous.finishedAt = now();
    previous.error = "서버 또는 검색 준비 실행이 중단되었습니다. 저장된 임베딩을 재사용해 재시도합니다.";
  }
  const run = { runId: `INDEX-${randomUUID()}`, contentCuriId: input.contentCuriId,
    assetIds: assets.map((asset) => asset.verifiedAssetId), status: "RUNNING", startedAt: now(), finishedAt: null,
    spec: embeddingSpec, usage: { embeddedDocuments: 0, reusedDocuments: 0, inputTokens: 0,
      inputCharacters: 0, truncatedDocuments: 0, externalApiCalls: 0, apiCostUsd: 0 }, error: null };
  store.searchIndexRuns.push(run);
  activeRuns.add(run.runId);
  let embedder;
  try {
    await writeDataStore(store);
    const items = [];
    for (const asset of assets) {
      const text = documentForAsset(asset);
      const key = embeddingKey(text);
      let embedding = store.embeddingCache.find((item) => validEmbedding(item, key));
      if (embedding) run.usage.reusedDocuments += 1;
      else {
        embedder ??= createEmbedder();
        const result = await embedder.embed(text);
        embedding = { embeddingKey: key, spec: embeddingSpec, vector: result.vector,
          inputTokens: result.inputTokens, truncated: result.truncated, createdAt: now() };
        if (!validEmbedding(embedding, key)) throw new Error("로컬 임베딩 결과가 올바르지 않습니다. 재시도하세요.");
        run.usage.embeddedDocuments += 1;
        run.usage.inputTokens += embedding.inputTokens;
        run.usage.inputCharacters += text.length;
        run.usage.truncatedDocuments += Number(embedding.truncated);
        store.embeddingCache = store.embeddingCache.filter((item) => item.embeddingKey !== key);
        store.embeddingCache.push(embedding);
        // 다음 관계에서 실패해도 완료된 계산과 실측 사용량은 재시도에 보존한다.
        await writeDataStore(store);
      }
      items.push({ ...embedding, verifiedAssetId: asset.verifiedAssetId, contentCuriId: asset.contentCuriId,
        curriculumCuriId: asset.curriculumCuriId, curiMapId: asset.curiMapId, version: asset.version,
        contentVersion: asset.contentVersion, evidenceFingerprint: asset.evidenceFingerprint, indexedAt: now() });
    }
    // 공용 서버 잠금 밖의 파일 변경이 있었다면 오래된 자산을 색인하지 않는다.
    const latest = await readDataStore();
    if (assets.some((asset) => !latest.verifiedAssets.some((current) =>
      current.verifiedAssetId === asset.verifiedAssetId && current.evidenceFingerprint === asset.evidenceFingerprint))) {
      throw new Error("검색 준비 중 검증 자산이 변경되었습니다. 새로고침 후 재시도하세요.");
    }
    store.searchProjection = store.searchProjection.filter((item) => !assets.some((asset) => asset.verifiedAssetId === item.verifiedAssetId));
    store.searchProjection.push(...items);
    run.status = "SUCCEEDED";
    run.finishedAt = now();
    run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
    store.updatedAt = run.finishedAt;
    await writeDataStore(store);
    return { ...indexStatus(store, input.contentCuriId), state: "READY", ready: true, reused: false };
  } catch (error) {
    // 실패한 게시 내용을 덮어쓰지 않고 마지막으로 안전하게 저장된 파일에서 이력을 갱신한다.
    store = await readDataStore();
    const failedRun = store.searchIndexRuns?.find((item) => item.runId === run.runId);
    if (failedRun) {
      Object.assign(failedRun, { status: "FAILED", finishedAt: now(), usage: run.usage,
        durationMs: Date.now() - Date.parse(run.startedAt),
        error: error.message.startsWith("로컬") || error.message.startsWith("검색 준비") ? error.message :
          "검색 준비 결과를 저장하지 못했습니다. 저장소 상태를 확인하고 재시도하세요." });
      await writeDataStore(store);
    } else throw error;
    return { ...indexStatus(store, input.contentCuriId), state: "FAILED", ready: false, reused: false };
  } finally {
    activeRuns.delete(run.runId);
    await embedder?.close();
  }
}

module.exports = { getSearchIndexStatus, prepareSearchIndex };
