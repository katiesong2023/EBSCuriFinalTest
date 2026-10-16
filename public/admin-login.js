const form = document.querySelector("#login-form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button"), status = document.querySelector("#login-status");
  button.disabled = true; status.textContent = "로그인 중입니다.";
  try {
    const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: document.querySelector("#admin-token").value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    document.querySelector("#admin-token").value = "";
    const next = new URLSearchParams(location.search).get("next");
    const target = new URL(next || "/admin.html", location.origin);
    location.assign(target.origin === location.origin && ["/admin.html", "/admin-curriculum.html", "/curimap.html", "/review.html", "/ingestion.html"].includes(target.pathname) ? target.href : "/admin.html");
  } catch (error) { status.textContent = error.message || "로그인하지 못했습니다. 다시 시도하세요."; }
  finally { button.disabled = false; }
});
