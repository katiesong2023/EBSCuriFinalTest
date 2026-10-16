const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { sourceQualityStats } = require("./source-text-quality");
const broadcastPath = path.join(__dirname, "data/broadcast-catalog.sqlite");
const fingerprint = (value) => crypto.createHash("sha256").update(value).digest("hex");

function openBroadcastStore(filename = broadcastPath) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY, identity TEXT UNIQUE NOT NULL, program TEXT NOT NULL,
      title TEXT NOT NULL, synopsis TEXT NOT NULL, url TEXT NOT NULL, source_url TEXT NOT NULL,
      broadcast_date TEXT, course_id TEXT NOT NULL, step_id TEXT NOT NULL, lect_id TEXT NOT NULL,
      variant TEXT NOT NULL, collected_at TEXT NOT NULL, content_hash TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pages (job TEXT PRIMARY KEY, source_url TEXT NOT NULL, request_body TEXT,
      response_hash TEXT, count INTEGER, fetched_at TEXT NOT NULL, status TEXT NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS link_checks (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
      status TEXT NOT NULL, checked_at TEXT NOT NULL, detail TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS episode_text USING fts5(id UNINDEXED, title, program, synopsis);
    CREATE INDEX IF NOT EXISTS episodes_program ON episodes(program);`);
  return db;
}

function saveBroadcastPage(db, page, items) {
  const insert = db.prepare(`INSERT INTO episodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(identity) DO UPDATE SET program=excluded.program,title=excluded.title,
      synopsis=excluded.synopsis,
      url=excluded.url,source_url=excluded.source_url,step_id=excluded.step_id,broadcast_date=excluded.broadcast_date,
      variant=excluded.variant,collected_at=excluded.collected_at,content_hash=excluded.content_hash,payload=excluded.payload`);
  let added = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of items) {
      const u = new URL(item.url);
      if (u.protocol !== "https:" || u.username || u.password || u.port || !(u.hostname === "ebs.co.kr" || u.hostname.endsWith(".ebs.co.kr"))) throw new Error("공식 회차 주소 아님");
      const news = require('./news-source').newsIdentity(item);
      const course = news?.courseId || u.searchParams.get("courseId"), step = news?.stepId || u.searchParams.get("stepId"), lect = news?.lectId || u.searchParams.get("lectId");
      if (!course || !step || !lect || !item.title?.trim() || !item.program?.trim()) throw new Error("회차 식별 필드 누락");
      // 같은 EBS 강좌·회차가 다른 메뉴/주소에 나와도 하나로 누적한다.
      const identity = `EBS:${course}:${lect}`;
      const id = `BCAST-${fingerprint(identity).slice(0, 20)}`;
      const previous = db.prepare("SELECT title,synopsis,url,source_url,collected_at,payload FROM episodes WHERE identity=?").get(identity);
      const variant = news ? "NEWS_CLIP" : /스페셜|종합|재방송|\(재\)|다시 보는|다시보는|베스트|하이라이트/.test(item.title) ? "COMPILATION_OR_REPEAT" : "EPISODE";
      const verifiedDetail = db.prepare("SELECT detail,url,checked_at FROM link_checks WHERE id=? AND title=? AND status='MATCHED'").get(id, item.title);
      const destination = previous && verifiedDetail?.url === previous.url ? previous.url : item.url;
      const verifiedDescription = verifiedDetail && verifiedDetail.url === destination ? JSON.parse(verifiedDetail.detail).description : "";
      const textKey = (value) => (value || "").normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
      const incoming = item.summary && (textKey(item.summary) !== textKey(item.title) || !previous?.synopsis) ? item.summary : "";
      const synopsis = verifiedDescription || incoming || (previous?.title === item.title ? previous.synopsis : "") || "";
      const previousPayload = previous ? JSON.parse(previous.payload) : {};
      const synopsisSourceUrl = verifiedDescription ? destination : incoming ? page.sourceUrl : previousPayload.synopsisSourceUrl || previous?.source_url || page.sourceUrl;
      const synopsisCheckedAt = verifiedDescription ? verifiedDetail.checked_at : incoming ? page.fetchedAt : previousPayload.synopsisCheckedAt || previous?.collected_at || page.fetchedAt;
      insert.run(id, identity, item.program, item.title, synopsis, destination, page.sourceUrl,
        item.date || null, course, step, lect, variant, page.fetchedAt,
        fingerprint(JSON.stringify([item.title, synopsis, destination])), JSON.stringify({ ...previousPayload, ...item, url: destination, summary: synopsis, synopsisSourceUrl, synopsisCheckedAt, collectionJob: page.job }));
      if (!previous) added += 1;
      if (previous && (previous.title !== item.title || previous.url !== destination)) db.prepare("DELETE FROM link_checks WHERE id=?").run(id);
      db.prepare("DELETE FROM episode_text WHERE id=?").run(id);
      db.prepare("INSERT INTO episode_text VALUES (?,?,?,?)").run(id, item.title, item.program, synopsis);
    }
    db.prepare("INSERT OR REPLACE INTO pages VALUES (?,?,?,?,?,?,?,?)").run(page.job, page.sourceUrl, page.requestBody || null,
      page.hash || null, items.length, page.fetchedAt, "COMPLETE", null);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return added;
}

function broadcastSummary(db) {
  const sourceQuality = sourceQualityStats(db.prepare("SELECT title,synopsis FROM episodes").all());
  return {
    total: db.prepare("SELECT count(*) n FROM episodes").get().n,
    originalEpisodes: db.prepare("SELECT count(*) n FROM episodes WHERE variant='EPISODE'").get().n,
    distinctProgramTitles: db.prepare("SELECT count(*) n FROM (SELECT program,title FROM episodes WHERE variant='EPISODE' GROUP BY program,title)").get().n,
    withDescription: sourceQuality.minimumPassed, sourceQuality,
    withAnySynopsis: db.prepare("SELECT count(*) n FROM episodes WHERE synopsis<>''").get().n,
    matchedLinks: db.prepare("SELECT count(*) n FROM link_checks WHERE status='MATCHED'").get().n,
    programs: db.prepare("SELECT program,count(*) count,sum(synopsis<>'') descriptions FROM episodes GROUP BY program ORDER BY count DESC").all(),
    pages: db.prepare("SELECT status,count(*) count FROM pages GROUP BY status").all()
  };
}

function readBroadcastResources({ lectId = null, courseId = null, resourceId = null } = {}) {
  if (!fs.existsSync(broadcastPath)) return [];
  const db = new DatabaseSync(broadcastPath, { readOnly: true });
  try {
    const where = resourceId ? " WHERE e.id=?" : lectId ? " WHERE e.lect_id=?" + (courseId ? " AND e.course_id=?" : "") : "";
    const parameters = resourceId ? [resourceId] : lectId ? courseId ? [lectId,courseId] : [lectId] : [];
    return db.prepare(`SELECT e.*,l.status link_status,l.title link_title,l.url link_url,l.checked_at,l.detail link_detail
      FROM episodes e LEFT JOIN link_checks l ON e.id=l.id${where}`).all(...parameters).map((row) => {
      const matched = row.link_status === "MATCHED" && row.link_title === row.title && row.link_url === row.url;
      const textKey = (value) => value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
      const hasDescription = Boolean(row.synopsis) && textKey(row.synopsis) !== textKey(row.title);
      const payload = JSON.parse(row.payload);
      const detail = matched && row.link_detail ? JSON.parse(row.link_detail) : {};
      const durationSeconds = matched && Number.isFinite(payload.durationSeconds) ? payload.durationSeconds : null;
      const isNews = row.variant === 'NEWS_CLIP' && require('./news-source').newsIdentity({url:row.url,newsIdentity:payload.newsIdentity});
      return { id: row.id, sourceSystem: isNews ? 'EBS_NEWS' : "EBS_BROADCAST", kind: isNews ? 'clip' : "episode",
        publishedDate: isNews ? payload.publishedDate || null : null,
        ...(isNews ? {programClassification:{forms:['뉴스·보도'],category:'EBS NEWS',program:row.program,sourceUrl:row.url,checkedAt:row.collected_at,match:'NEWS_ARTICLE_AND_PAGE_ID'}} : {}), program: row.program, title: row.title, summary: row.synopsis,
        sourceSupplements: require('./source-supplements').readSupplements(row),
        sourceUrl: row.url, collectionUrl: row.source_url, evidenceUrl: payload.synopsisSourceUrl || (matched ? row.url : row.source_url),
        evidenceLevel: hasDescription ? "SOURCE_DESCRIPTION" : "TITLE_ONLY",
        evidenceLabel: hasDescription ? matched ? "공식 회차 소개문" : "공식 회차 목록 · 소개문" : "공식 회차 목록 · 제목 근거",
        checkedAt: row.collected_at, descriptionCheckedAt: payload.synopsisCheckedAt || row.collected_at, durationMinutes: durationSeconds ? Math.round(durationSeconds / 60 * 10) / 10 : null, durationSeconds,
        durationSourceUrl: durationSeconds ? payload.durationSourceUrl : null, durationCheckedAt: payload.durationCheckedAt || null,
        descriptionMatchStatus: matched && detail.description === row.synopsis ? "MATCHED" : "NOT_CHECKED", broadcastDate: row.broadcast_date,
        variant: row.variant, curriculumStatus: "NOT_ASSESSED", playbackStatus: "NOT_CHECKED",
        navigation: row.link_status === "MISMATCH" ? {
          url: `https://www.ebs.co.kr/search?${new URLSearchParams({ query: `${row.program} ${row.title}` })}`,
          label: "EBS에서 제목 검색", kind: "SEARCH", status: "UNCONFIRMED", checkedAt: row.checked_at,
          note: "도착 페이지 대조가 일치하지 않아 제목 검색으로 안내합니다."
        } : { url: row.url, label: isNews ? "해당 뉴스 클립 열기" : "해당 회차 열기", kind: isNews ? "CLIP" : "EPISODE", status: matched ? "MATCHED" : "PUBLISHED",
          checkedAt: matched ? row.checked_at : null, note: matched ? "개별 페이지의 제목·회차 ID 일치 확인 · 재생은 별도" : "공식 목록에서 제공한 회차 주소 · 도착 페이지 대조·재생은 미확인" },
        limitation: "EBS 공개 메타데이터입니다. 실제 재생·장면 시점·학년 적합성은 별도 확인이 필요합니다." };
    });
  } finally { db.close(); }
}

module.exports = { broadcastPath, fingerprint, openBroadcastStore, saveBroadcastPage, broadcastSummary, readBroadcastResources };
