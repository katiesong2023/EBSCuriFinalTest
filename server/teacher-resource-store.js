// 교사가 확장에서 등록한 영상. 공식 원본·사람 승인 저장소와 분리하여 검색에 합친다.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const core = require('../public/segment-core');
const teacherResourcePath = process.env.CURI_TEACHER_RESOURCE_PATH || path.join(__dirname, 'data/teacher-resources.sqlite');
function open(file = teacherResourcePath) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE IF NOT EXISTS teacher_resources(identity TEXT PRIMARY KEY, resource_id TEXT NOT NULL, created_at TEXT NOT NULL, resource TEXT NOT NULL)');
  return db;
}
function readTeacherResources(file = teacherResourcePath) {
  if (!fs.existsSync(file)) return [];
  const db = open(file);
  try { return db.prepare('SELECT resource FROM teacher_resources ORDER BY created_at').all().map(r => JSON.parse(r.resource)); }
  finally { db.close(); }
}
function videoMetadata(input) {
  if (!input || Object.keys(input).some(k => !['title', 'sourceUrl', 'summary', 'duration', 'program', 'kind'].includes(k)) ||
      !core.identity(input.sourceUrl) || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 300 ||
      (input.program !== undefined && (typeof input.program !== 'string' || input.program.length > 200)) || typeof input.summary !== 'string' || input.summary.length > 4000 || (input.duration != null && (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 86400)) || (input.kind !== undefined && !["episode", "collection"].includes(input.kind))) {
    throw new Error('영상 제목·회차 주소·길이를 확인하세요. 지원 본편에서 다시 등록하세요.');
  }
  return { title: input.title.trim(), summary: input.summary.trim(), sourceUrl: core.publicUrl(input.sourceUrl), duration: input.duration ?? null, program: input.program || "", kind: input.kind || "episode" };
}
function saveTeacherResource(input, catalog, file = teacherResourcePath) {
  const video = videoMetadata(input), identity = core.identity(video.sourceUrl);
  const known = [...catalog.resources, ...(catalog.searchVariants || [])].find(r => core.sameSource(r.navigation?.url || r.sourceUrl, video.sourceUrl));
  const db = open(file);
  try {
    const previous = db.prepare('SELECT resource FROM teacher_resources WHERE identity=?').get(identity);
    // 재시도는 기존 등록/공식 메타데이터를 덮어쓰지 않는다.
    if (previous) {
      const saved = JSON.parse(previous.resource);
      if (!known && saved.provenance?.classification !== 'TEACHER_CAPTURE') throw new Error('기존 공식 자료가 현재 목록에서 제외되어 등록을 보류했습니다. 원본 상태를 확인하세요.');
      return { resource: known || saved, stored: true, alreadyStored: true };
    }
    const resource = known || {
      id: 'TEACHER-' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24),
      title: video.title, summary: video.summary, program: video.program || ({'docuprime.ebs.co.kr':'다큐프라임','anikids.ebs.co.kr':'EBS 애니키즈'}[new URL(video.sourceUrl).hostname] || '지식채널e'), kind: video.kind, variant: video.kind === 'collection' ? 'PROGRAM' : 'EPISODE',
      sourceUrl: video.sourceUrl, evidenceUrl: video.sourceUrl, sourceSystem: 'EBS_TEACHER_CAPTURE',
      durationMinutes: video.duration == null ? null : video.duration / 60, broadcastDate: '', checkedAt: new Date().toISOString(),
      evidenceLevel: video.summary ? 'SOURCE_DESCRIPTION' : 'TITLE_ONLY',
      evidenceLabel: '확장에서 가져온 공개 정보 · 원문 재대조 필요', curriculumStatus: 'NOT_ASSESSED', playbackStatus: 'NOT_CHECKED',
      provenance: { classification: 'TEACHER_CAPTURE', verification: 'NOT_VERIFIED', sourceUrl: video.sourceUrl },
      navigation: { url: video.sourceUrl, kind: video.kind === 'collection' ? 'COLLECTION' : 'EPISODE', status: 'NOT_CHECKED', label: video.kind === 'collection' ? 'EBS 프로그램 페이지 보기' : 'EBS에서 해당 영상 보기', note: '교사가 열린 회차에서 등록한 주소 · 원문 재대조 필요' },
      limitation: '확장에서 등록한 영상 정보입니다. 소개문·교육과정 연계·장면·학년 적합성은 별도 확인이 필요합니다.'
    };
    db.prepare('INSERT INTO teacher_resources VALUES(?,?,?,?)').run(identity, resource.id, new Date().toISOString(), JSON.stringify(resource));
    return { resource, stored: true, alreadyStored: false };
  } finally { db.close(); }
}
async function registerTeacherResource(input) {
  const video = videoMetadata(input), query = new URL(video.sourceUrl).searchParams;
  // 저장은 검색 전체의 시맨틱 준비를 기다리지 않고 해당 회차만 조회한다.
  const broadcasts = query.get('lectId') ? require('./broadcast-store').readBroadcastResources({lectId:query.get('lectId'),courseId:query.get('courseId')}) : [];
  const store = JSON.parse(fs.readFileSync(path.join(__dirname,'data/curi-store.json'),'utf8'));
  const overlay = store.contents.find(item => core.sameSource(item.source?.sourceUrl,video.sourceUrl) || broadcasts.some(r=>r.id===item.sourceIdentity?.sourceContentId));
  if (overlay?.lifecycle?.isActive === false) throw new Error('현재 제외된 공식 자료입니다. 원본 상태를 확인하세요.');
  const resources = overlay ? require('./discovery-catalog').buildCatalog([], {...store, contents:[overlay]}, {resources:[],concepts:[],version:'registration'}, broadcasts).resources : broadcasts;
  return saveTeacherResource(video,{resources,searchVariants:[]});
}

const isTeacherResource = resource => resource?.provenance?.classification === "TEACHER_CAPTURE";
module.exports = { isTeacherResource, teacherResourcePath, readTeacherResources, saveTeacherResource, videoMetadata, registerTeacherResource };
