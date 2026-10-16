(async () => {
  const parameters = new URLSearchParams(location.search), status = document.querySelector("#review-route-status");
  try {
    const target = parameters.has("contentCuriId") ? { contentCuriId: parameters.get("contentCuriId") } : { resourceId: parameters.get("resourceId") };
    for (const key of ["gradeBand", "subject", "standardId"]) if (parameters.has(key)) target[key] = parameters.get(key);
    const response = await fetch(`/api/admin/human-review?${new URLSearchParams(target)}`), result = await response.json();
    if (!response.ok) throw new Error(result.error);
    let destination = new URL("/admin.html", location.origin);
    try { const requested = new URL(parameters.get("returnTo") || "/admin.html", location.origin); if (requested.origin === location.origin && requested.pathname === "/admin.html") destination = requested; } catch { /* 관리 작업공간으로만 복귀한다. */ }
    destination.searchParams.set("id", result.source.sourceContentId); destination.searchParams.set("human", "1");
    for (const key of ["standardId", "subject", "gradeBand", "automaticRunId", "automaticRelationId"]) if (parameters.has(key)) destination.searchParams.set(key, parameters.get(key));
    location.replace(destination.pathname + destination.search);
  } catch (error) { status.textContent = `${error.message} 새로고침으로 다시 시도하거나 관리 목록에서 자료를 선택하세요.`; }
})();
