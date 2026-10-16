(() => {
  "use strict";
  const keys = { shelf: "curi.discovery.shelf.v1", plan: "curi.teacher.lesson.v1", search: "curi.teacher.search.v1" };
  const notices = [];
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  function sourceLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.port &&
        ["ebs.co.kr", "ebsmedia.net", "encykorea.aks.ac.kr"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : "";
    } catch { return ""; }
  }
  function destination(item) {
    return sourceLink(item.navigation?.url) ? item.navigation : {
      url: `https://www.ebs.co.kr/search?${new URLSearchParams({ query: [item.program, item.title].filter(Boolean).join(" ") })}`,
      label: "EBS에서 제목 검색", note: "개별 콘텐츠 주소 미확인 · 제목 검색으로 안내합니다." };
  }
  function savedVideoLink(item, folderId = "") {
    const nav = destination(item);
    const directVideo = ["EPISODE", "CLIP"].includes(nav.kind);
    const label = directVideo ? "EBS에서 해당 영상 보기" : nav.label;
    return `<div class="saved-video-link"><a href="${escape(sourceLink(nav.url))}" target="_blank" rel="noopener noreferrer" aria-label="${escape(item.title)} · ${escape(label)} · 새 창">${directVideo ? "▶ " : ""}${escape(label)} ↗</a><small>${directVideo ? "해당 회차 페이지로 이동 · 재생 조건은 EBS에서 확인" : escape(nav.note || "개별 영상 주소 미확인")}</small></div>${window.CuriSegments?.markup(item, folderId) || ""}`;
  }
  function broadcastDateText(item) {
    if (item.kind === "collection") return "회차별 확인";
    const date = item.broadcastDate;
    // 자료 수집일·기록일을 방송일로 대체하지 않는다. 날짜만 다뤄 시간대 변환을 피한다.
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "미확인";
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return "미확인";
    return date.replaceAll("-", ". ") + ".";
  }
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { notices.push("이 브라우저의 저장 내용을 읽지 못했습니다. 저장 공간을 확인해 주세요."); return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }
  function validResource(item) {
    return item && /^[A-Za-z0-9_-]{1,100}$/.test(item.id) && typeof item.title === "string" && sourceLink(item.sourceUrl);
  }
  const unconfirmedResource = (item, evidenceRefresh = "PENDING") => ({ ...item, approvedLinks: [], automaticLinks: [], otherStandardLinks: { approvedLinks: [], automaticLinks: [] }, curriculumComparison: null, curriculumStatus: "NOT_ASSESSED", evidenceCheckedAt: null, evidenceRefresh });
  function readShelf() {
    const items = read(keys.shelf, []);
    if (!Array.isArray(items)) { notices.push("자료 모음 형식을 읽지 못했습니다."); return []; }
    return items.filter(validResource).filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index).slice(0, 100)
      .map((item) => ({ ...unconfirmedResource(item), questions: Array.isArray(item.questions) ? item.questions.filter((q) => typeof q === "string").slice(0, 20) : [] }));
  }
  function readSearch() {
    const saved = read(keys.search, {});
    return saved && typeof saved === "object" && !Array.isArray(saved) ? Object.fromEntries(
      ["grade", "q", "kind", "access", "place", "program", "page", "curriculum", "topic", "sort", "conceptGroup", "concept", "subject", "description", "year", "from", "to", "standard", "state", "standardSubject", "standardGrade", "standardQuery", "standardView", "legacyScope", "invalidConditions"].filter((key) => typeof saved[key] === "string").map((key) => [key, saved[key]])) : {};
  }
  const text = (value, max = 4000) => typeof value === "string" ? value.slice(0, max) : "";
  function readPlan() {
    const saved = read(keys.plan, {});
    const value = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    return { title: text(value.title, 200), topic: text(value.topic, 200), note: text(value.note), updatedAt: text(value.updatedAt, 60),
      items: (Array.isArray(value.items) ? value.items : []).filter((item) => item && validResource(item.resource))
        .filter((item, index, all) => all.findIndex((other) => other.resource?.id === item.resource.id) === index).slice(0, 100)
        .map((item) => ({ resource: item.resource, role: ["도입", "탐구", "정리"].includes(item.role) ? item.role : "탐구",
          note: text(item.note), question: text(item.question), activity: text(item.activity) })) };
  }
  async function refreshResources(items) {
    if (!items.length) return [];
    const response = await fetch(`/api/curi/discover/resources?${new URLSearchParams({ ids: items.map((i) => i.id).join(",") })}`, { signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "자료 확인 실패");
    const current = new Map(data.resources.map((item) => [item.id, item]));
    return items.map((item) => {
      const latest = current.get(item.id);
      return latest?.title === item.title ? withTeachingContext({ ...item, ...latest, curriculumComparison: latest.curriculumComparison || null, evidenceCheckedAt: new Date().toISOString(), otherStandardLinks: latest.otherStandardLinks || null }, item.teachingContext)
        : { ...unconfirmedResource(item, "UNAVAILABLE"), navigation: null, limitation: "현재 목록에서 같은 자료를 확인하지 못했습니다. 저장 당시 정보이며 제목 검색으로 안내합니다." };
    });
  }
  // 저장된 수업 문맥과 서버의 현재 관계를 다시 대조한다. 원본의 학년 적합성으로 저장하지 않는다.
  function withTeachingContext(item, context = item.teachingContext) {
    const courses = context?.courses || [];
    const matches = (link) => (!context?.standardId || link.standardId === context.standardId) &&
      (!context?.subject || link.subject === context.subject) && !context?.needsClarification &&
      (!courses.length || courses.includes(link.courseId || window.GradeContext?.courseForGrade(link.grade)));
    const unique = (links) => links.filter((link, index) => links.findIndex((other) =>
      other.standardId === link.standardId && other.subject === link.subject && other.courseId === link.courseId &&
      other.grade === link.grade && other.assetId === link.assetId) === index);
    const approved = item.curriculumStatus === "APPROVED" ? item.approvedLinks || [] : [];
    const allApproved = unique([...approved, ...(item.otherStandardLinks?.approvedLinks || [])]);
    const allAutomatic = unique([...(item.automaticLinks || []), ...(item.otherStandardLinks?.automaticLinks || [])]);
    const approvedLinks = allApproved.filter(matches), automaticLinks = allAutomatic.filter(matches);
    return { ...item, teachingContext: context || null, approvedLinks, automaticLinks,
      otherStandardLinks: { approvedLinks: allApproved.filter((link) => !matches(link)), automaticLinks: allAutomatic.filter((link) => !matches(link)) },
      curriculumStatus: approvedLinks.length ? "APPROVED" : "NOT_ASSESSED" };
  }

  function teachingContext(grade, extra = {}) {
    if (!grade || grade === "all") return null;
    const parsed = GradeContext.parseGradeRequest("", grade);
    return { grade: parsed.value, courses: parsed.courses, needsClarification: parsed.needsClarification, suitability: "UNCONFIRMED", ...extra };
  }
  function download(filename, lines) {
    const url = URL.createObjectURL(new Blob(["\ufeff", lines.join("\n")], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const resourceDateLabel = item => item.sourceSystem === 'EBS_NEWS' ? '뉴스 게시일' : item.sourceSystem === 'EBS_PROGRAM_ANNOUNCEMENT' ? '첫 방송 예정일' : '방송일';
  const resourceDateText = item => broadcastDateText(item.sourceSystem === 'EBS_NEWS' ? {...item,broadcastDate:item.publishedDate} : item.sourceSystem === 'EBS_PROGRAM_ANNOUNCEMENT' ? {...item,kind:'episode',broadcastDate:item.announcedPremiereDate} : item);
  window.CuriTeacher = { resourceDateLabel, resourceDateText, teachingContext, withTeachingContext, escape, sourceLink, destination, savedVideoLink, broadcastDateText, validResource, unconfirmedResource, readShelf, readSearch, readPlan, refreshResources, download, notices,
    saveShelf: (items) => write(keys.shelf, items), saveSearch: (state) => write(keys.search, state), savePlan: (plan) => write(keys.plan, plan) };
})();
