// 원문 보강 사유와 규칙 미지원은 독립적이다. 미지원 자체로 내용을 부족하다고 판정하지 않는다.
function buildQueue(rows) {
  const queue = new Map();
  for (const row of rows) for (const item of row.candidates) {
    if (item.sourceSystem !== 'EBS_BROADCAST') continue;
    const titleOnly = ['none', 'repeated'].includes(item.sourceQuality.category) && !(item.sourceSupplements || []).some(source => source.text);
    const lowText = !item.sourceQuality.detailedMappingAllowed;
    const missingRelation = row.plan.ruleSupported && !item.semantic.supportedRequirements?.length && item.semantic.status !== 'CONFLICT';
    if (!lowText && !missingRelation) continue;
    const reason = titleOnly ? '제목뿐인 회차의 내용 원문 필요' : lowText ? '요구를 대조할 소개문 부족' : '소개문은 있으나 필요한 관계 설명 미확인';
    if (!queue.has(item.id)) queue.set(item.id, { id: item.id, title: item.title, program: item.program,
      sourceUrl: item.sourceUrl, sourceQuality: item.sourceQuality, standards: [], subjects: [], courses: [], reasons: [], priority: 0 });
    const entry = queue.get(item.id);
    if (!entry.standards.includes(row.plan.standardId)) entry.standards.push(row.plan.standardId);
    if (!entry.subjects.includes(row.plan.subject)) entry.subjects.push(row.plan.subject);
    if (!entry.courses.includes(row.plan.courseId)) entry.courses.push(row.plan.courseId);
    entry.reasons.push({ standardId: row.plan.standardId, reason, ruleSupported: row.plan.ruleSupported });
    entry.priority = Math.max(entry.priority, (titleOnly ? 300 : lowText ? 200 : 100) + (row.plan.subject === '과학' ? 20 : 0));
  }
  return [...queue.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
function gapTopics(rows) {
  return rows.filter(row => !row.total).map(({ plan }) => ({ standardId: plan.standardId, standardText: plan.standardText,
    subject: plan.subject, courseLabel: plan.courseLabel, terms: plan.anchors.length ? plan.anchors : plan.terms,
    reason: '보유 원문에서 후보 없음. 공식 공개 자료 탐색·수집이 필요하며 EBS 전체에 자료가 없다는 뜻은 아닙니다.',
    sourceSearchUrl: `https://www.ebs.co.kr/search?${new URLSearchParams({ query: (plan.anchors.length ? plan.anchors : plan.terms).slice(0, 3).join(' ') })}`
  })).sort((a, b) => Number(b.subject === '과학') - Number(a.subject === '과학') || a.standardId.localeCompare(b.standardId));
}
module.exports = { buildQueue, gapTopics };
