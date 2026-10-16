const { fingerprint } = require('./broadcast-store');
const { officialUrl } = require('./source-enrichment');

const labels = { PRESS_RELEASE: 'EBS 공식 보도자료', TRANSCRIPT: 'EBS 공개 대본', LEARNING_MATERIAL: 'EBS 공개 학습자료' };
const normalize = value => String(value || '').normalize('NFKC').replace(/\s/g, '');

// 보조 원문은 소개문을 덮어쓰지 않는다. 회차·판본 대조와 발췌 위치를 별도로 보존한다.
function identityFor(row) {
  return { resourceId: row.id, title: row.title, program: row.program, broadcastDate: row.broadcast_date, variant: row.variant, sourceUrl: row.url };
}
function validSupplement(record, identity) {
  return Boolean(record && labels[record.type] && officialUrl(record.sourceUrl) && typeof record.text === 'string' && record.text &&
    record.identity && Object.keys(identity).every(key => record.identity[key] === identity[key]) &&
    record.contentHash === fingerprint(JSON.stringify([record.type, record.sourceUrl, record.text, record.identity, record.location])));
}
function readSupplements(row) {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {};
  return (Array.isArray(payload.sourceSupplements) ? payload.sourceSupplements : []).filter(record => validSupplement(record, identityFor(row)));
}
function attachOfficialSupplement(db, resourceId, document, { expectedHash, checkedAt = new Date().toISOString() } = {}) {
  const row = db.prepare('SELECT * FROM episodes WHERE id=?').get(resourceId);
  if (!row || !expectedHash || row.content_hash !== expectedHash) throw new Error('보조 원문 연결 전 현재 회차·원문 버전을 확인하세요.');
  const identity = identityFor(row);
  if (!labels[document.type] || !officialUrl(document.sourceUrl) || !document.identity ||
      Object.keys(identity).some(key => identity[key] !== document.identity[key])) throw new Error('공식 보조 원문의 회차·판본 식별 불일치');
  if (!document.title || !document.publishedAt || !document.location || !Array.isArray(document.identityEvidence) ||
      !document.responseHash || typeof document.sourceText !== 'string' || typeof document.text !== 'string' || !document.text || document.text.length > 4000) throw new Error('보조 원문의 출처·위치·회차 대조 근거가 부족합니다.');
  const start = document.sourceText.indexOf(document.text);
  if (start < 0 || !document.identityEvidence.every(value => value && normalize(document.sourceText).includes(normalize(value))) ||
      document.identityEvidence.length < 3) throw new Error('원문 발췌 또는 회차 대조 문구가 실제 공개 문서에 없습니다.');
  const record = { id: fingerprint(`${resourceId}:${document.type}:${document.sourceUrl}:${document.location}`).slice(0, 24),
    type: document.type, label: labels[document.type], title: document.title, sourceUrl: document.sourceUrl,
    publishedAt: document.publishedAt, checkedAt, identity, identityEvidence: document.identityEvidence,
    text: document.text, location: document.location, originalStart: start, originalEnd: start + document.text.length,
    offsetUnit: 'UTF16_CODE_UNIT', responseHash: document.responseHash,
    contentHash: fingerprint(JSON.stringify([document.type, document.sourceUrl, document.text, identity, document.location])),
    scope: '해당 회차의 공식 보조 설명. 실제 영상·재생·장면·학년 적합성 및 성취기준 승인은 미확인.' };
  const payload = JSON.parse(row.payload), previous = readSupplements(row);
  const same = previous.find(value => value.id === record.id && value.contentHash === record.contentHash);
  if (same) return { resourceId, status: 'UNCHANGED', supplement: same };
  const next = [...previous.filter(value => value.id !== record.id), record];
  if (next.length > 10) throw new Error('회차별 보조 자료는 최대 10개입니다.');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare('SELECT content_hash,payload FROM episodes WHERE id=?').get(resourceId).payload !== row.payload) throw new Error('연결 중 원본 변경·재조회 필요');
    db.exec('CREATE TABLE IF NOT EXISTS source_supplement_events (event_id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, checked_at TEXT NOT NULL, record TEXT NOT NULL)');
    db.prepare('INSERT INTO source_supplement_events VALUES (?,?,?,?)').run(fingerprint(JSON.stringify(record)), resourceId, checkedAt, JSON.stringify({ previous, next }));
    db.prepare('UPDATE episodes SET payload=? WHERE id=?').run(JSON.stringify({ ...payload, sourceSupplements: next }), resourceId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { resourceId, status: 'ATTACHED', supplement: record };
}

module.exports = { attachOfficialSupplement, readSupplements, validSupplement, identityFor };
