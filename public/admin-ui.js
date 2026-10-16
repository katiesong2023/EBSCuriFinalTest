(() => {
  const $ = (selector) => document.querySelector(selector);
  const labels = { MISMATCH: "저장 출처 불일치", MATCHED: "도착 페이지 일치", PUBLISHED: "공식 목록 주소 · 도착 미대조", UNCONFIRMED: "출처 미확인",
    SOURCE_MENTION: "등록 어휘 발견", VOCABULARY_NOT_FOUND: "등록 어휘 미발견", APPROVED: "사람 승인 자산 보유", STALE_REVIEW: "기존 사람 검토 변경",
    HUMAN_APPROVED: "사람 승인 · 저장 확인", HUMAN_EDITED: "사람 수정 · 저장 확인", EXCLUDED: "사람 제외", NOT_ASSESSED: "사람 검토 미완료",
    READY: "검색 준비 완료", PENDING: "검색 준비 대기", NOT_SAVED: "사람 승인 검색 미반영", DRAFT: "기존 검토용 초안", NOT_RUN: "기존 초안 없음",
    CHECKED: "검사 수행 완료", HELD: "보류", FAILED: "실패", INTERRUPTED: "중단 · 재개 필요", RUNNING: "실행 중", STALE: "변경 · 재검사 필요",
    PASS: "통과", FAIL: "실패", SUPPORTED: "지원 설명 확인 · 전체 기준 미확인", PARTIAL: "부분 설명 확인", UNSUPPORTED: "지원 규칙 밖", CONFLICT: "상충",
    SOURCE_CHANGED: "원문·출처·판본 변경", STANDARD_CHANGED: "공식 기준 변경", RULE_CHANGED: "규칙 변경", INPUT_CHANGED_DURING_CHECK: "검사 중 입력 변경",
    ASSET_SAVE_FAILED: "자산 저장 실패", AUTOMATIC_CHECK_FAILED: "후보 생성·검사 실패", SOURCE_NOT_FOUND: "원본 없음", AUTOMATIC_PROCESS_FAILED: "자동 처리 실패",
    HUMAN_EXCLUDE: "사람 제외 우선", HUMAN_HOLD: "사람 보류 우선", HUMAN_EDIT: "사람 수정 우선", HUMAN_APPROVE: "사람 승인 우선", BLOCKED: "사람 결정 등으로 제공 차단" };
  function element(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
  function link(text, href) { const node = element("a", text); node.href = href; return node; }
  function externalLink(text, href) {
    try { const url = new URL(href); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); }
    catch { return element("span", "출처 주소 미확인"); }
    const node = link(text, href); node.target = "_blank"; node.rel = "noopener noreferrer"; return node;
  }
  function states(row) {
    const node = element("div", null, "states");
    for (const value of [row.sourceStatus, row.tagStatus, row.approvalStatus]) node.append(element("span", labels[value] || value, `badge${value === "MISMATCH" ? " warning" : ""}`));
    node.append(element("span", `자동 공개 관계 ${row.work.automatic.published} · 기존 초안 ${row.mappingStatus === "NOT_RUN" ? "없음" : "있음"}`, "badge"));
    if (row.human?.decisions) node.append(element("span", `사람 승인 ${row.human.approved} · 보류 ${row.human.held} · 제외 ${row.human.excluded}관계${row.human.changed ? " · 근거 변경" : ""}`, "badge"));
    if (!row.active) node.append(element("span", "비활성·원본 없음", "badge warning"));
    return node;
  }
  const date = (value) => value ? String(value).replace("T", " ").replace(/\.\d+Z$/, " UTC") : "기록 없음";
  const adminUrl = (id, cursor) => { const url = new URL(location.href); if (id) url.searchParams.set("id", id); else url.searchParams.delete("id"); if (cursor !== undefined) url.searchParams.set("cursor", String(cursor)); return url.pathname + url.search; };
  const managedLink = (text, page, values = {}) => {
    const back = new URL(location.href);
    const context = {};
    if (["/curimap.html", "/review.html"].includes(page)) for (const key of ["gradeBand", "subject"]) {
      if (back.searchParams.get(key)) context[key] = back.searchParams.get(key);
    }
    if (values.automaticRelationId) back.searchParams.set("relationId", values.automaticRelationId);
    return link(text, `${page}?${new URLSearchParams({ ...context, ...values, returnTo: back.pathname + back.search })}`);
  };
  window.CuriAdmin = { $, labels, element, link, externalLink, states, date, adminUrl, managedLink };
})();
