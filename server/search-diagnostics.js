// 내부 평가 전용이다. 검색 조건·순위를 바꾸지 않고 최초 탈락 단계를 기록한다.
function searchDiagnostics(enabled, query) {
  if (!enabled) return { mark() {}, branch() {}, report: null };
  const report = { query, stages: {}, rejected: {}, closest: [], branchChecks: 0, conditions: {} };
  const mark = (stage, resource, reason) => {
    report.stages[stage] = (report.stages[stage] || 0) + 1;
    if (reason) report.rejected[reason] = (report.rejected[reason] || 0) + 1;
  };
  const branch = (resource, conditions) => {
    report.branchChecks++;
    for (const c of conditions) {
      const record = report.conditions[c.label] ||= { matched: 0, checked: 0 };
      record.checked++; if (c.matched) record.matched++;
    }
    const hits = conditions.filter(c => c.matched).length;
    if (!hits || !conditions.some(c => c.matched && c.label.startsWith('term:'))) return;
    const rank = hits / Math.max(1, conditions.length);
    const row = { id: resource.id, title: resource.title, program: resource.program, summary: resource.summary,
      rank, hits, missing: conditions.filter(c => !c.matched).map(c => c.label) };
    const current = report.closest.findIndex(r => r.id === row.id);
    if (current >= 0 && report.closest[current].rank >= rank) return;
    if (current >= 0) report.closest.splice(current, 1);
    report.closest.push(row);
    report.closest.sort((a, b) => b.rank - a.rank || b.hits - a.hits || a.id.localeCompare(b.id));
    report.closest.length = Math.min(5, report.closest.length);
  };
  return { mark, branch, report };
}
module.exports = { searchDiagnostics };
