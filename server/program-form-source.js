const crypto = require('node:crypto');
const normalizeName = value => String(value || '').normalize('NFKC').replace(/^EBS\s*/iu, '').replace(/\s+/gu, '').toLowerCase();
// 목록의 주제 분류(문화·예술/사회·시사 등)를 방송 형태로 추정하지 않는다.
const categoryForms = { '다큐멘터리': '다큐멘터리', '애니메이션': '애니메이션', '지식특강': '강연·강의' };
function programFormMatcher(registry = {}) {
  const entries = new Map();
  // 공식 분류에 형태가 누락된 경우, 같은 프로그램·강좌·단계의 공식 소개 인용을 사용한다.
  const declarations = (registry.programFormats || []).filter(entry => {
    try { const url=new URL(entry.sourceUrl);return url.protocol==='https:'&&/(^|\.)ebs\.co\.kr$/u.test(url.hostname)&&!url.username&&!url.password&&!url.port&&
      entry.name&&entry.courseId&&Array.isArray(entry.stepIds)&&entry.form==='다큐멘터리'&&
      /다큐멘터리/u.test(entry.quote)&&normalizeName(entry.quote).includes(normalizeName(entry.name))&&
      entry.contentHash===crypto.createHash('sha256').update(JSON.stringify([entry.name,entry.courseId,entry.stepIds,entry.form,entry.quote,entry.sourceUrl])).digest('hex');
    }catch{return false;}
  });
  for (const entry of registry.programs || []) {
    let source;
    try { source = new URL(entry.sourceUrl); } catch { continue; }
    if (source.protocol !== 'https:' || source.hostname !== 'www.ebs.co.kr' || source.username || source.password) continue;
    if (!entry.name || !entry.courseId || !entry.stepId || typeof entry.category !== 'string') continue;
    const key = JSON.stringify([normalizeName(entry.name), entry.courseId, entry.stepId]);
    if (!entries.has(key)) entries.set(key, []);
    entries.get(key).push(entry);
  }
  return resource => {
    let url;
    try { url = new URL(resource.sourceUrl); } catch { return null; }
    const courseId = url.searchParams.get('courseId'), stepId = url.searchParams.get('stepId');
    if (!courseId || !stepId || url.protocol !== 'https:' || !/(^|\.)ebs\.co\.kr$/u.test(url.hostname)) return null;
    const matches = entries.get(JSON.stringify([normalizeName(resource.program), courseId, stepId])) || [];
    const declared=declarations.filter(entry=>normalizeName(entry.name)===normalizeName(resource.program)&&entry.courseId===courseId&&entry.stepIds.includes(stepId));
    if ((!matches.length && !declared.length) || new Set(matches.map(entry => entry.category)).size > 1) return null;
    const formatEvidence=declared.map(entry=>({form:entry.form,quote:entry.quote,sourceUrl:entry.sourceUrl,checkedAt:entry.checkedAt,contentHash:entry.contentHash,responseHash:entry.responseHash}));
    if(!matches.length)return {forms:[...new Set(declared.map(entry=>entry.form))],category:'',courseId,stepId,formatEvidence,match:'NAME_AND_COURSE_STEP_DECLARATION'};
    const entry = matches[0];
    const forms = [...new Set([...entry.category.split('/').map(category => categoryForms[category.trim()]).filter(Boolean),...declared.map(entry=>entry.form)])];
    if (!forms.length) return null;
    return { forms, program: entry.name, category: entry.category, courseId, stepId,
      sourceUrl: entry.sourceUrl, sourcePage: entry.sourcePage, checkedAt: entry.checkedAt,
      sourceRecordHash: crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex'), formatEvidence, match: 'NAME_AND_COURSE_STEP' };
  };
}
module.exports = { programFormMatcher };
