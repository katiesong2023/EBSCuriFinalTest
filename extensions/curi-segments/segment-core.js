// 웹 화면과 확장 프로그램이 공유하는 회차 식별·시간 계약.
(() => {
  "use strict";
  function publicUrl(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || u.port || u.username || u.password ||
          !(u.hostname === "ebs.co.kr" || u.hostname.endsWith(".ebs.co.kr")) ||
          ["sso.ebs.co.kr", "auth.ebs.co.kr"].includes(u.hostname) || /(?:login|logout|password|passwd|infoChangePwd|mypage|join|oauth|auth|sso|member|account|payment|purchase|checkout)(?:\/|$|\.)/i.test(u.pathname)) return null;
      const clean = new URL(u.origin + u.pathname);
      for (const key of ["siteCd", "prodId", "courseId", "stepId", "lectId", "hmpMnuId", "hmpId", "boardId", "articleId", "bbsId", "pstId", "newsId", "newsID", "news_id", "contentId", "content_id", "vodId", "lectureId", "programId", "pageId"]) {
        const values = u.searchParams.getAll(key);
        if (values.length > 1 || values.some(v => !/^[A-Za-z0-9_-]{1,100}$/.test(v))) return null;
        if (values.length) clean.searchParams.set(key, values[0]);
      }
      return clean.href;
    } catch { return null; }
  }
  function identity(value) {
    const clean = publicUrl(value); if (!clean) return null;
    const u = new URL(clean), keys = ["courseId", "stepId", "lectId"];
    if (keys.every(k => u.searchParams.has(k))) return keys.map(k => u.searchParams.get(k)).join(":");
    if (u.searchParams.has("lectId")) return `LECT:${u.searchParams.get("lectId")}`;
    return "PAGE:" + clean;
  }
  function sameSource(a,b) {
    const left=publicUrl(a),right=publicUrl(b); if(!left || !right)return false;
    if(identity(left)===identity(right))return true;
    const x=new URL(left).searchParams,y=new URL(right).searchParams;
    if(!x.get('lectId') || x.get('lectId')!==y.get('lectId'))return false;
    return ['courseId','prodId'].some(key=>x.get(key) && x.get(key)===y.get(key));
  }
  function origin(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(u.hostname) || u.username || u.password || u.pathname !== "/" || u.search || u.hash) return null;
      return u.origin;
    } catch { return null; }
  }
  function seconds(value) {
    const s = String(value).trim();
    if (!/^\d+(?:\.\d{1,3})?$/.test(s) && !/^\d{1,3}:\d{2}(?::\d{2})?(?:\.\d{1,3})?$/.test(s)) throw new Error("시간은 초 또는 분:초 / 시:분:초로 입력하세요.");
    const parts = s.split(":").map(Number);
    if (parts.length > 1 && parts.slice(1).some(n => n >= 60)) throw new Error("분·초 자리에는 60 미만을 입력하세요.");
    const result = parts.reduce((sum, n) => sum * 60 + n, 0);
    if (!Number.isFinite(result) || result > 86400) throw new Error("시간 범위를 확인하세요.");
    return result;
  }
  function time(value) {
    const n = Math.max(0, Number(value) || 0);
    const millis = Math.round(n * 1000), whole = Math.floor(millis / 1000), fraction = millis % 1000;
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}${fraction ? "." + String(fraction).padStart(3, "0").replace(/0+$/, "") : ""}`;
  }
  function boundary(value, edge = 'start') {
    const n = typeof value === 'number' ? value : seconds(value);
    if (!Number.isFinite(n) || n < 0 || n > 86400) throw new Error('시간 범위를 확인하세요.');
    return edge === 'end' ? Math.ceil(n) : Math.floor(n);
  }
  function validate(input) {
    if (!input || typeof input.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(input.id) || typeof input.resourceId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(input.resourceId) || typeof input.folderId !== "string" || input.folderId.length > 100) throw new Error("자료 연결 정보를 확인하세요.");
    if (!identity(input.sourceUrl)) throw new Error("EBS 공개 페이지 주소를 확인하세요.");
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 200 || typeof input.note !== "string" || input.note.length > 4000) throw new Error("구간 이름과 메모 길이를 확인하세요.");
    const rawStart = seconds(input.start), rawEnd = seconds(input.end);
    if (rawEnd <= rawStart) throw new Error("끝 시간은 시작 시간보다 뒤여야 합니다.");
    const start = boundary(rawStart), end = boundary(rawEnd, 'end');
    if (input.duration !== null && input.duration !== undefined && (!Number.isFinite(input.duration) || input.duration <= 0 || start >= input.duration || end > Math.ceil(input.duration))) throw new Error("영상 전체 길이를 넘는 구간입니다.");
    return { id: input.id, resourceId: input.resourceId, folderId: input.folderId, sourceUrl: input.sourceUrl,
      variant: String(input.variant || "").slice(0, 100), name: input.name.trim(), note: input.note, start, end,
      duration: input.duration ?? null, capture: input.capture === "PLAYER" ? "PLAYER" : "MANUAL", player: ({ "docuprime.ebs.co.kr": "EBS_DOCUPRIME_HTML5", "anikids.ebs.co.kr": "EBS_ANIKIDS_HTML5" }[new URL(input.sourceUrl).hostname] || "EBS_JISIKE_HTML5") };
  }
  const core = { publicUrl, sameSource, identity, origin, seconds, time, boundary, validate };
  if (typeof module !== "undefined") module.exports = core;
  else globalThis.CuriSegmentCore = core;
})();
