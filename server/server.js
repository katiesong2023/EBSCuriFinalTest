const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getDataStoreModel, getDataStoreSummary, readDataStore } = require("./data-store");
const { CandidateRetrievalInputError, retrieveCandidates } = require("./candidate-retrieval");
const {
  CuriMapMappingInputError,
  CuriMapMappingServiceError,
  createCuriMapDraft,
  getLatestCuriMapRun
} = require("./curimap-mapping");
const { applyIngestion, previewIngestion } = require("./incremental-ingestion");
const { ReviewInputError, getReviewOptions, saveReviewDecision } = require("./review-actions");
const { VerifiedSaveError, getVerifiedStatus, saveVerifiedAssets } = require("./verified-save");
const { getSearchIndexStatus, prepareSearchIndex } = require("./search-index");
const { SearchError, searchVerifiedContents } = require("./natural-search");
const { discoverContents, getDiscoveryResources, DiscoveryInputError } = require("./discovery-search");
const { resolveSourceLink } = require("./source-links");
const { getInferenceContext } = require("./semantic-context");
const { discoverCurriculum } = require("./curriculum-discovery");
const { discoverRelatedStandards } = require("./curriculum-related");
const { discoverTeacherContents } = require("./teacher-discovery");

const { createAdminAccess } = require("./admin-auth");
const { getAdminWorkspace } = require("./admin-workspace");
const { AutomaticEvidenceInputError, inspectAutomaticEvidence } = require("./automatic-evidence-service");
const { sendAutomaticAssetResponse } = require("./automatic-assets-http");
const { sendSourceCheck } = require("./admin-source-check");
const { sendHumanReview } = require("./human-review-http");

const publicDirectory = path.resolve(process.cwd(), "public");
const host = "127.0.0.1";
const port = readPort(process.env.PORT);
let dataWriteInProgress = false;
const adminAccess = createAdminAccess({ port });

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf"
};

const server = http.createServer(async (request, response) => {
  const requestPath = getRequestPath(request.url);

  if (!requestPath) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad Request");
    return;
  }

  if (requestPath === "/segment-bookmarks.html" && ["GET", "HEAD"].includes(request.method)) {
    const query = new URL(request.url, "http://localhost").search;
    response.writeHead(303, { Location: "/lesson.html" + query }); response.end(); return;
  }

  if (await adminAccess.handle(request, response, requestPath)) return;
  if (requestPath === "/api/curi/discover/thumbnail") {
    try { await require("./ebs-thumbnail").sendThumbnail(request, response); }
    catch { response.writeHead(503, { "Cache-Control": "no-store" }); response.end(); }
    return;
  }
  if (requestPath === "/api/curibase/teacher-resources") {
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
    if (request.method !== "POST") { response.writeHead(405, { ...headers, Allow: "POST" }); response.end(); return; }
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(request.headers.host) ||
        request.headers.origin !== `http://${request.headers.host}` || !request.headers['content-type']?.startsWith('application/json')) {
      response.writeHead(403, headers); response.end(JSON.stringify({ error: "같은 로컬 Curi 페이지에서 등록하세요." })); return;
    }
    try {
      const body = await readJsonBody(request);
      const result = await require('./teacher-resource-store').registerTeacherResource(body);
      response.writeHead(200, headers); response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, headers);
      response.end(JSON.stringify({ error: error.message || "CuriBase 영상 등록 실패" }));
    }
    return;
  }
  if (["/admin.html", "/curimap.html", "/review.html", "/ingestion.html"].includes(requestPath)) {
    response.setHeader("Cache-Control", "no-store");
    const pageQuery = new URL(request.url, "http://localhost").searchParams;
    if (["/curimap.html", "/review.html"].includes(requestPath) && !pageQuery.get("contentCuriId") && !(requestPath === "/review.html" && pageQuery.get("resourceId"))) {
      response.writeHead(303, { Location: "/admin.html?filter=mapping" }); response.end(); return;
    }
  }
  if (requestPath === "/api/admin/workspace" && ["GET", "HEAD"].includes(request.method)) {
    await sendDataStoreResponse(request, response, () => getAdminWorkspace(Object.fromEntries(new URL(request.url, "http://localhost").searchParams)));
    return;
  }
  if (requestPath === "/api/curimap/evidence") {
    await sendAutomaticEvidenceResponse(request, response);
    return;
  }
  if (["/api/admin/human-review", "/api/admin/human-review/search"].includes(requestPath)) {
    const respond = () => sendHumanReview(request, response, readJsonBody);
    if (request.method === "POST") await withDataWriteLock(response, respond); else await respond();
    return;
  }
  if (["/api/curi/link-proposals/prepare","/api/curi/link-proposals","/api/admin/link-proposals"].includes(requestPath)) {
    const proposals=require('./link-proposals'),url=new URL(request.url,'http://localhost');
    try {
      let result;
      if(requestPath==='/api/curi/link-proposals/prepare' && request.method==='GET')result=await proposals.prepare(url.searchParams.get('id'),url.searchParams.get('standard'));
      else if(requestPath==='/api/admin/link-proposals' && request.method==='GET')result={proposals:await proposals.list()};
      else if(request.method==='POST'){
        if(request.headers.origin!==(process.env.CURI_ADMIN_ORIGIN||`http://${request.headers.host}`) || !request.headers['content-type']?.startsWith('application/json'))throw new Error('페이지의 제안/검토 버튼으로 제출하세요.');
        const body=await readJsonBody(request);
        result=requestPath==='/api/curi/link-proposals'?await proposals.submit(body):requestPath==='/api/admin/link-proposals'?await proposals.mark(body.id,body.status):null;
        if(!result)throw new Error('지원하지 않는 요청');
      }else{response.writeHead(405,{Allow:requestPath.endsWith('prepare')?'GET':'GET, POST'});response.end();return;}
      response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(result));
    }catch(error){response.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify({error:error.message}));}
    return;
  }
  if (requestPath === "/api/admin/source-check") {
    await sendSourceCheck(request, response, readJsonBody);
    return;
  }
  if (["/api/admin/automatic-assets", "/api/admin/automatic-assets/search"].includes(requestPath)) {
    const respond = () => sendAutomaticAssetResponse(request, response, readJsonBody);
    if (request.method === "POST") await withDataWriteLock(response, respond);
    else await respond();
    return;
  }

  // 전달된 계약 응답의 검증/탐색만 수행한다. 외부 모델 호출이나 저장은 없다.
  if (requestPath === "/api/curi/discover/model-preparation") {
    await require('./request-model-http').sendModelPreparation(request, response, readJsonBody);
    return;
  }
  if (requestPath === "/api/curi/discover/interpretation") {
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
    if (request.method !== "POST") { response.writeHead(405, { ...headers, Allow: "POST" }); response.end(); return; }
    try {
      const body = await readJsonBody(request);
      if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some(key => !["input", "interpretation"].includes(key)) || !Object.hasOwn(body,"interpretation") || !body.input || Array.isArray(body.input) || typeof body.input !== "object") throw new DiscoveryInputError("input와 interpretation으로 요청하세요.");
      if (body.input.workspace && body.input.workspace !== "teacher") throw new DiscoveryInputError("교사 자료 검색만 지원합니다.");
      const payload = await discoverTeacherContents({ ...body.input, workspace: "teacher" }, undefined, undefined, { interpretation: body.interpretation });
      response.writeHead(200, headers); response.end(JSON.stringify(payload));
    } catch (error) {
      response.writeHead(error instanceof DiscoveryInputError || ["INVALID_JSON_BODY", "PAYLOAD_TOO_LARGE"].includes(error.code) ? (error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400) : 503, headers);
      response.end(JSON.stringify({error:error instanceof DiscoveryInputError ? error.message : "요청 해석 연결을 실행하지 못했습니다."}));
    }
    return;
  }

  const isRelatedRead = request.method === "POST" && requestPath === "/api/curi/curriculum/related";
  const isIngestionWrite =
    request.method === "POST" &&
    ["/api/ingestion/preview", "/api/ingestion/apply"].includes(requestPath);
  const isCuriMapWrite = request.method === "POST" && requestPath === "/api/curimap/draft";
  const isReviewWrite = request.method === "POST" && requestPath === "/api/curimap/review";
  const isVerifiedWrite = request.method === "POST" && requestPath === "/api/curibase/verified";
  const isIndexWrite = request.method === "POST" && requestPath === "/api/curibase/search-index";
  if (request.method !== "GET" && request.method !== "HEAD" && !isIngestionWrite && !isCuriMapWrite && !isReviewWrite && !isVerifiedWrite && !isIndexWrite && !isRelatedRead) {
    response.writeHead(405, { Allow: "GET, HEAD, POST" });
    response.end("Method Not Allowed");
    return;
  }

  if (requestPath === "/api/data-store/summary") {
    await sendDataStoreResponse(request, response, getDataStoreSummary);
    return;
  }

  if (requestPath === "/api/data-store/model") {
    await sendDataStoreResponse(request, response, getDataStoreModel);
    return;
  }

  if (requestPath === "/api/candidate-retrieval") {
    await sendCandidateRetrievalResponse(request, response);
    return;
  }

  if (requestPath === "/api/curi/search") {
    await sendNaturalSearchResponse(request, response);
    return;
  }

  if (["/api/curi/discover", "/api/curi/discover/resources", "/api/curi/discover/context", "/api/curi/curriculum", "/api/curi/curriculum/related"].includes(requestPath)) {
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
    try {
      const parameters = new URL(request.url, "http://localhost").searchParams;
      if (requestPath === "/api/curi/discover" && parameters.get("workspace") !== "teacher" &&
          (parameters.has("standard") || parameters.has("state"))) {
        throw new DiscoveryInputError("성취기준 조건은 교사 자료 검색에서 사용하세요. workspace=teacher가 필요합니다.");
      }
      if ((requestPath === "/api/curi/curriculum/related" || requestPath === "/api/curi/discover" && parameters.get("workspace") === "teacher") &&
          [...parameters.keys()].some((key) => parameters.getAll(key).length > 1)) {
        throw new DiscoveryInputError("같은 검색 조건을 여러 번 지정할 수 없습니다.");
      }
      const operation = requestPath === "/api/curi/curriculum/related" ? discoverRelatedStandards : requestPath === "/api/curi/curriculum" ? discoverCurriculum : requestPath.endsWith("/context") ? getInferenceContext : requestPath.endsWith("/resources") ? getDiscoveryResources : parameters.get("workspace") === "teacher" ? discoverTeacherContents : discoverContents;
      let input = Object.fromEntries(parameters);
      if (requestPath === "/api/curi/curriculum/related" && request.method === "POST") {
        if ([...parameters.keys()].length) throw new DiscoveryInputError("본문과 주소에 조회 조건을 나누어 지정할 수 없습니다.");
        try { input = await readJsonBody(request); }
        catch (error) { throw new DiscoveryInputError(error.code === "PAYLOAD_TOO_LARGE" ? "입력은 1MB 이하로 제한됩니다." : "조회 본문은 JSON 형식이어야 합니다."); }
      }
      const payload = operation === discoverTeacherContents ? await operation(input, undefined, undefined, { allowModelSearch: request.method === 'GET' }) : await operation(input);
      response.writeHead(200, headers);
      response.end(request.method === "HEAD" ? undefined : JSON.stringify(payload));
    } catch (error) {
      response.writeHead(error instanceof DiscoveryInputError ? 400 : 503, headers);
      response.end(request.method === "HEAD" ? undefined : JSON.stringify({ error: error instanceof DiscoveryInputError ? error.message : "로컬 자료를 읽지 못했습니다. 서버와 데이터 파일을 확인한 뒤 다시 시도하세요." }));
    }
    return;
  }

  if (requestPath === "/api/runtime") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify({ version: "0.2.0", paidApiEnabled: process.env.CURI_ALLOW_PAID_API === "true",
      teacherSearchModelEnabled: require('./teacher-model-search').readPolicy().enabled === true }));
    return;
  }

  if (requestPath === "/api/curimap/contents") {
    await sendDataStoreResponse(request, response, getCuriMapContents);
    return;
  }

  if (requestPath === "/api/curimap/review-options") {
    const contentCuriId = new URL(request.url, "http://localhost").searchParams.get("contentCuriId");
    await sendDataStoreResponse(request, response, () => getReviewOptions(contentCuriId));
    return;
  }

  if (requestPath === "/api/curibase/search-index") {
    if (isIndexWrite) {
      await withDataWriteLock(response, () => sendReviewResponse(request, response, prepareSearchIndex));
    } else {
      const contentCuriId = new URL(request.url, "http://localhost").searchParams.get("contentCuriId");
      await sendDataStoreResponse(request, response, () => getSearchIndexStatus(contentCuriId));
    }
    return;
  }

  if (requestPath === "/api/curibase/verified") {
    if (isVerifiedWrite) {
      await withDataWriteLock(response, () => sendReviewResponse(request, response, saveVerifiedAssets));
    } else {
      const contentCuriId = new URL(request.url, "http://localhost").searchParams.get("contentCuriId");
      await sendDataStoreResponse(request, response, () => getVerifiedStatus(contentCuriId));
    }
    return;
  }

  if (isReviewWrite) {
    await withDataWriteLock(response, () => sendReviewResponse(request, response));
    return;
  }

  if (requestPath === "/api/curimap/draft") {
    if (request.method === "POST") {
      await withDataWriteLock(response, () => sendCuriMapDraftResponse(request, response));
    } else {
      await sendCuriMapDraftResponse(request, response);
    }
    return;
  }

  if (requestPath === "/api/ingestion/runs") {
    await sendDataStoreResponse(request, response, getIngestionRuns);
    return;
  }

  if (isIngestionWrite) {
    await withDataWriteLock(response, () => sendIngestionResponse(
      request,
      response,
      requestPath === "/api/ingestion/apply" ? applyIngestion : previewIngestion
    ));
    return;
  }

  const filePath = getPublicFilePath(request.url);

  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[extension] ?? "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    console.error("정적 파일을 읽지 못했습니다.", error.message);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`Curi 로컬 서버가 http://${host}:${port} 에서 실행 중입니다.`);
  adminAccess.announce();
  console.log("종료하려면 이 터미널에서 Ctrl+C를 누르세요.");
});

function readPort(value) {
  const parsedPort = Number.parseInt(value ?? "3000", 10);

  return Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
    ? parsedPort
    : 3000;
}

function getPublicFilePath(requestUrl) {
  try {
    const requestPath = getRequestPath(requestUrl);
    if (!requestPath) {
      return null;
    }
    const relativePath = requestPath === "/" ? "discover.html" : requestPath.replace(/^\/+/, "");
    const filePath = path.resolve(publicDirectory, relativePath);

    return filePath.startsWith(`${publicDirectory}${path.sep}`) ? filePath : null;
  } catch {
    return null;
  }
}

function getRequestPath(requestUrl) {
  try {
    const decoded = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
    if (decoded.includes("\\") || decoded.includes("\0")) return null;
    return path.posix.normalize(decoded).replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
}

async function sendDataStoreResponse(request, response, getPayload) {
  try {
    const payload = await getPayload();
    const body = JSON.stringify(payload, null, 2);

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (error instanceof ReviewInputError || error instanceof VerifiedSaveError) {
      response.writeHead(error.statusCode, { "Content-Type": "application/json; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : JSON.stringify({ error: error.message }));
      return;
    }
    if (error.code === "ENOENT") {
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          error: "Curi 저장소가 아직 적재되지 않았습니다.",
          action: "npm run data:seed"
        })
      );
      return;
    }

    console.error("Curi 저장소를 읽지 못했습니다.", error.message);
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Internal Server Error" }));
  }
}

async function sendNaturalSearchResponse(request, response) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  try {
    const parameters = new URL(request.url, "http://localhost").searchParams;
    const payload = await searchVerifiedContents(Object.fromEntries(parameters.entries()));
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : JSON.stringify(payload));
  } catch (error) {
    const status = error instanceof SearchError ? error.statusCode : 503;
    response.writeHead(status, headers);
    response.end(request.method === "HEAD" ? undefined : JSON.stringify({ error: error instanceof SearchError ? error.message :
      "검색 저장소를 읽지 못했습니다. 서버와 데이터 적재 상태를 확인하고 다시 검색하세요." }));
  }
}

async function getIngestionRuns() {
  const store = await readDataStore();
  return { ingestionRuns: store.ingestionRuns.slice(-20).reverse() };
}

async function getCuriMapContents() {
  const store = await readDataStore();
  const contents = store.contents
    .filter((content) => {
      return (
        content.lifecycle?.isActive === true &&
        ["사회", "과학", "환경/생태", "사회/경제"].includes(content.metadata?.subjectSeed) &&
        Boolean(content.metadata?.title)
      );
    })
    .map((content) => ({
      curiId: content.curiId,
      title: content.metadata.title,
      synopsis: content.metadata.synopsis,
      programName: content.metadata.programName,
      contentLevel: content.metadata.contentLevel,
      gradeBand: content.metadata.gradeBandSeed,
      subject: content.metadata.subjectSeed,
      sourceUrl: content.source?.sourceUrl,
      navigation: resolveSourceLink({ id: content.sourceIdentity?.sourceContentId, title: content.metadata.title,
        program: content.metadata.programName, sourceUrl: content.source?.sourceUrl }),
      descriptionProvenance: content.provenance?.descriptionClassification,
      descriptionSourceUrl: content.provenance?.descriptionSourceUrl,
      descriptionVerifiedAt: content.provenance?.descriptionVerifiedAt,
      mappingReadiness: content.metadata.mappingReadiness
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "ko"));

  return {
    contents,
    paidApiEnabled: process.env.CURI_ALLOW_PAID_API === "true",
    note:
      "사회·과학 P0와 인접 일반 방송을 표시합니다. 일반 방송은 원문을 확인해 사회 또는 과학 공식 후보 교과를 사람이 선택하고, 개별 회차만 승인 대상으로 검수합니다."
  };
}

// 같은 JSON 저장소를 쓰는 요청이 실행 횟수나 초안을 덮어쓰지 않게 한다.
async function withDataWriteLock(response, operation) {
  if (dataWriteInProgress) {
    response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ code: "MAPPING_IN_PROGRESS", error: "다른 데이터 저장 또는 연계가 실행 중입니다. 완료 후 다시 확인하세요." }));
    return;
  }
  dataWriteInProgress = true;
  try {
    await operation();
  } finally {
    dataWriteInProgress = false;
  }
}

async function sendCuriMapDraftResponse(request, response) {
  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const parameters = new URL(request.url, "http://localhost").searchParams;
      const payload = await getLatestCuriMapRun(parameters.get("contentCuriId"));
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : JSON.stringify(payload, null, 2));
      return;
    }

    const input = await readJsonBody(request);
    const payload = await createCuriMapDraft(input);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload, null, 2));
  } catch (error) {
    if (error instanceof CuriMapMappingInputError) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message, code: error.code }));
      return;
    }

    if (error instanceof CuriMapMappingServiceError) {
      response.writeHead(getCuriMapErrorStatus(error.code), {
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(JSON.stringify({ error: error.message, code: error.code, result: error.result, retry: error.retry }));
      return;
    }

    if (["INVALID_JSON_BODY", "PAYLOAD_TOO_LARGE"].includes(error.code)) {
      response.writeHead(error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message, code: error.code }));
      return;
    }

    console.error("CuriMap AI 초안 처리 또는 실행 이력 저장에 실패했습니다.");
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "AI 연계 초안을 만들지 못했습니다." }));
  }
}

async function sendReviewResponse(request, response, save = saveReviewDecision) {
  try {
    const payload = await save(await readJsonBody(request));
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
  } catch (error) {
    const status = (error instanceof ReviewInputError || error instanceof VerifiedSaveError) ? error.statusCode :
      error.code === "INVALID_JSON_BODY" ? 400 : error.code === "PAYLOAD_TOO_LARGE" ? 413 : 500;
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: status === 500 ? "저장에 실패했습니다. 새로고침으로 저장 여부를 확인하세요." : error.message }));
  }
}

function getCuriMapErrorStatus(code) {
  if (code === "PAID_API_DISABLED") return 403;
  if (code === "MAPPING_IN_PROGRESS") return 409;
  if (["MAPPING_RETRY_LIMIT", "OPENAI_RATE_LIMITED"].includes(code)) return 429;
  if (code === "OPENAI_NETWORK_FAILED") return 502;
  if (code === "API_KEY_UNAVAILABLE") {
    return 503;
  }
  if (code === "OPENAI_TIMEOUT") {
    return 504;
  }
  if (code === "OPENAI_API_FAILED") {
    return 502;
  }
  return 422;
}

async function sendCandidateRetrievalResponse(request, response) {
  try {
    const parameters = new URL(request.url, "http://localhost").searchParams;
    const payload = await retrieveCandidates(Object.fromEntries(parameters.entries()));
    const body = JSON.stringify(payload, null, 2);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (error instanceof CandidateRetrievalInputError) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
      return;
    }
    if (error.code === "ENOENT") {
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Curi 저장소가 아직 적재되지 않았습니다.", action: "npm run data:seed" }));
      return;
    }

    console.error("성취기준 후보를 찾지 못했습니다.", error.message);
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Internal Server Error" }));
  }
}

async function sendAutomaticEvidenceResponse(request, response) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (request.method !== "POST") {
    response.writeHead(405, { ...headers, Allow: "POST" });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify({ error: "POST로 검사할 자료를 지정하세요." }));
    return;
  }
  try {
    const result = await inspectAutomaticEvidence(await readJsonBody(request));
    response.writeHead(200, headers);
    response.end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof AutomaticEvidenceInputError ? error.statusCode :
      error.code === "PAYLOAD_TOO_LARGE" ? 413 : error.code === "INVALID_JSON_BODY" ? 400 : 500;
    response.writeHead(status, headers);
    response.end(JSON.stringify({ status: "FAILED", code: status === 500 ? "EVIDENCE_EXECUTION_FAILED" : error.code,
      error: status === 500 ? "현재 원문·공식 목록을 검사하지 못했습니다. 이전 통과 결과를 재사용하지 않습니다." : error.message,
      relations: [], persisted: false }));
  }
}

async function sendIngestionResponse(request, response, processIngestion) {
  try {
    const input = await readJsonBody(request);
    const payload = await processIngestion(input);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload, null, 2));
  } catch (error) {
    const statusCode = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;

    request.on("data", (chunk) => {
      byteLength += chunk.length;
      if (byteLength > 1024 * 1024) {
        const error = new Error("입력은 1MB 이하로 제한됩니다.");
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        const error = new Error("JSON 입력 형식이 올바르지 않습니다.");
        error.code = "INVALID_JSON_BODY";
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
