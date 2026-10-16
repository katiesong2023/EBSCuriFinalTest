const crypto = require("node:crypto");

// 단일 운영자 MVP: 세션은 서버 메모리에만 두며 재시작하면 모두 만료된다.
function createAdminAccess({ port, env = process.env, now = Date.now } = {}) {
  const production = env.NODE_ENV === "production";
  const configured = env.CURI_ADMIN_TOKEN;
  const origin = env.CURI_ADMIN_ORIGIN;
  const minimumLength = production ? 32 : 8;
  if (configured && configured.length < minimumLength) throw new Error(`CURI_ADMIN_TOKEN은 ${minimumLength}자 이상이어야 합니다.`);
  if (production && (!configured || !origin || new URL(origin).protocol !== "https:" || new URL(origin).origin !== origin)) {
    throw new Error("운영 환경에는 CURI_ADMIN_TOKEN과 HTTPS CURI_ADMIN_ORIGIN이 필요합니다.");
  }
  const token = configured || crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const sessions = new Map();
  let failures = [];
  const ttl = 8 * 60 * 60 * 1000;
  const origins = new Set(origin ? [origin] : [`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...[...origins].map((value) => new URL(value).host)]);
  const cookieName = production ? "__Host-curi_admin" : "curi_admin";
  const cookie = (value, age) => `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${production ? "; Secure" : ""}`;
  function send(request, response, status, payload, headers = {}) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify(payload));
  }
  function sessionId(request) {
    return (request.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  }
  async function handle(request, response, pathname) {
    // 로컬 교사 등록 API는 자체 Origin/Host 검사를 수행한다. 관리자 승인은 별도다.
    if (pathname === "/api/curibase/teacher-resources") return false;
    const api = pathname.startsWith("/api/");
    const publicApis = new Set(["/api/curi/search", "/api/curi/discover", "/api/curi/discover/interpretation", "/api/curi/discover/model-preparation", "/api/curi/discover/resources", "/api/curi/discover/thumbnail", "/api/curi/discover/context", "/api/curi/curriculum", "/api/curi/curriculum/related", "/api/runtime", "/api/curi/link-proposals/prepare", "/api/curi/link-proposals"]);
    const protectedPage = ["/admin.html", "/admin-curriculum.html", "/curimap.html", "/review.html", "/ingestion.html"].includes(pathname);
    const authRoute = pathname === "/api/admin/session";
    if (!protectedPage && (!api || publicApis.has(pathname))) return false;
    response.setHeader?.("Cache-Control", "no-store");
    if (!hosts.has(request.headers.host)) { send(request, response, 403, { error: "허용하지 않은 서버 주소입니다." }); return true; }
    for (const [id, expiry] of sessions) if (expiry <= now()) sessions.delete(id);
    const id = sessionId(request);
    const authenticated = sessions.has(id);
    if (authRoute && request.method === "POST") {
      if (!origins.has(request.headers.origin) || !request.headers["content-type"]?.startsWith("application/json")) {
        send(request, response, 403, { error: "관리자 로그인 화면에서 다시 시도하세요." }); return true;
      }
      failures = failures.filter((time) => time > now() - 60000);
      if (failures.length >= 5) { send(request, response, 429, { error: "로그인 시도가 많습니다. 1분 뒤 다시 시도하세요." }, { "Retry-After": "60" }); return true; }
      try {
        let body = "";
        for await (const chunk of request) { body += chunk; if (body.length > 4096) throw new Error("oversized"); }
        const input = JSON.parse(body);
        if (typeof input.token !== "string" || !crypto.timingSafeEqual(crypto.createHash("sha256").update(input.token).digest(), tokenHash)) throw new Error("invalid");
        if (id) sessions.delete(id);
        if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
        const next = crypto.randomBytes(32).toString("base64url");
        sessions.set(next, now() + ttl);
        send(request, response, 200, { authenticated: true }, { "Set-Cookie": cookie(next, ttl / 1000) });
      } catch {
        failures.push(now());
        send(request, response, 401, { error: "관리자 코드가 올바르지 않습니다." });
      }
      return true;
    }
    if (!authenticated) {
      if (protectedPage) {
        response.writeHead(303, { Location: `/admin-login.html?next=${encodeURIComponent(request.url)}`, "Cache-Control": "no-store" }); response.end();
      } else send(request, response, 401, { error: "관리자 로그인이 필요합니다.", loginUrl: "/admin-login.html" });
      return true;
    }
    if (!["GET", "HEAD"].includes(request.method) && !origins.has(request.headers.origin)) {
      send(request, response, 403, { error: "같은 사이트의 관리 화면에서 다시 시도하세요." }); return true;
    }
    if (authRoute) {
      if (request.method === "DELETE") {
        sessions.delete(id); send(request, response, 200, { authenticated: false }, { "Set-Cookie": cookie("", 0) });
      } else if (["GET", "HEAD"].includes(request.method)) send(request, response, 200, { authenticated: true });
      else send(request, response, 405, { error: "지원하지 않는 요청입니다." });
      return true;
    }
    return false;
  }
  return { handle, announce() { if (!configured) console.log(`이번 실행의 관리자 코드: ${token}`); } };
}
module.exports = { createAdminAccess };
