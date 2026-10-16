// 기존 관리 화면도 세션 만료 시 현재 주소를 보존해 로그인으로 연결한다.
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const target = new URL(typeof args[0] === "string" ? args[0] : args[0].url, location.href);
    if (response.status === 401 && target.origin === location.origin && target.pathname.startsWith("/api/")) {
      location.assign(`/admin-login.html?next=${encodeURIComponent(location.pathname + location.search)}`);
      throw new Error("관리자 세션이 만료되었습니다. 다시 로그인하세요.");
    }
    return response;
  };
  document.addEventListener("DOMContentLoaded", () => {
    const parameters = new URLSearchParams(location.search);
    let returnTo = "/admin.html";
    try {
      const target = new URL(parameters.get("returnTo") || "/admin.html", location.origin);
      if (target.origin === location.origin && target.pathname === "/admin.html") returnTo = target.pathname + target.search;
    } catch { /* 외부 주소나 잘못된 복귀 주소는 관리 목록으로 제한한다. */ }
    const nav = document.createElement("nav"); nav.className = "admin-session-nav"; nav.setAttribute("aria-label", "관리 메뉴");
    const back = document.createElement("a"); back.href = returnTo; back.textContent = "자료·품질 관리";
    const curriculum = document.createElement("a"); curriculum.href = "/admin-curriculum.html"; curriculum.textContent = "교육과정별 확보 현황";
    if (location.pathname === "/admin.html") back.setAttribute("aria-current", "page");
    if (location.pathname === "/admin-curriculum.html") curriculum.setAttribute("aria-current", "page");
    const teacher = document.createElement("a"); teacher.href = "/"; teacher.textContent = "교사 화면";
    const logout = document.createElement("button"); logout.type = "button"; logout.textContent = "로그아웃";
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      try { const response = await originalFetch("/api/admin/session", { method: "DELETE" }); if (!response.ok && response.status !== 401) throw new Error(); location.assign("/admin-login.html"); }
      catch { logout.textContent = "로그아웃 실패 · 재시도"; logout.disabled = false; }
    });
    const brand = document.createElement('a'); brand.className = 'admin-brand'; brand.href = '/admin.html'; brand.setAttribute('aria-label','EBS CURI 관리자 홈');
    brand.innerHTML = '<img src="/brand/ebs-curi-folder.svg" alt="" width="30" height="30"><span><small>EBS</small> CURI</span>';
    nav.append(brand, back, curriculum, teacher, logout); document.body.prepend(nav);
    if (parameters.get("automaticRelationId")) {
      const reference = document.createElement("p"); reference.className = "notice";
      reference.textContent = `참조한 자동 관계: ${parameters.get("automaticRelationId")} · 자동 근거는 관리 작업공간에서 확인할 수 있습니다. 사람 판단은 실제 검토 후 기록하세요.`;
      document.querySelector("main")?.prepend(reference);
    }
    document.addEventListener("click", (event) => {
      const anchor = event.target.closest("a[href]"); if (!anchor || !parameters.has("returnTo")) return;
      const target = new URL(anchor.href, location.href);
      if (target.origin !== location.origin || !["/curimap.html", "/review.html", "/ingestion.html"].includes(target.pathname)) return;
      target.searchParams.set("returnTo", returnTo);
      for (const key of ["automaticRunId", "automaticRelationId"]) if (parameters.has(key)) target.searchParams.set(key, parameters.get(key));
      anchor.href = target.pathname + target.search;
    });
  });
})();
