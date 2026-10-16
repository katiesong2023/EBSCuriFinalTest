const { assessSourceText } = require("./source-text-quality");
const { automaticSummary } = require("./admin-automatic-state");

function workState(resource, row, entry) {
  const automatic = automaticSummary(entry), quality = assessSourceText(resource.title, resource.summary || ""), reasons = [];
  const add = (code, priority, label, action) => reasons.push({ code, priority, label, action });
  if (row.sourceStatus === "MISMATCH") add("source", 0, "저장 출처 불일치", "출처 점검·원문 보강");
  if (automatic.citationFailed) add("citation", 0, "인용 검사 실패", "인용 위치·원문 확인 후 재검사");
  if (automatic.conflict) add("conflict", 1, "관계 설명 상충", "상충 문장 확인·원문 보강");
  if (automatic.changed || row.human?.changed) add("changed", 2, "원문·기준·규칙 변경", "변경 근거 확인 후 재검사·선택적 사람 확인");
  if (automatic.failed) add("failed", 3, "자동 처리 실패·중단", "실패 단계 재시도");
  if (automatic.searchFailed || automatic.searchPending || row.human?.searchPending) add("search", 3, "검색 준비 실패·대기", "검색 준비만 재시도");
  if (automatic.inspectionFailed && !automatic.citationFailed) add("inspection", 3, "자동 구조 검사 실패", "실패 조건 확인 후 재검사");
  if (!quality.detailedMappingAllowed) add("text", 4, "원문 보강 필요", "공개 소개문 보강");
  if (automatic.unsupported) add("unsupported", 5, "관계 규칙 지원 밖", "지원 범위 확인·주제 자료 유지");
  if (automatic.held && !automatic.conflict && !automatic.unsupported && quality.detailedMappingAllowed) add("held", 6, "관계 근거 미확인·후보 없음", "보류 이유 확인·주제 자료 유지");
  if (!automatic.processed) add("new", 7, "자동 처리 이력 없음", "교과 선택 후 후보·근거 검사");
  if (automatic.blocked) add("human", 8, "사람 결정 우선", "실제 검토 이력 확인");
  if (automatic.running) add("running", 8, "자동 처리 실행 중", "완료 후 다시 조회");
  if (!reasons.length) add("ready", 9, "자동 검사 결과 보유", "현재 공개 범위 확인");
  return { automatic, quality, reasons, priority: reasons[0].priority,
    nextAction: !row.active ? "비활성 원문·이력 확인" : row.automaticAllowed === false ? "원본 등록·보강" : reasons[0].action, changedAt: resource.changedAt || resource.descriptionCheckedAt || resource.checkedAt || null };
}

const has = (code) => (row) => row.work.reasons.some((reason) => reason.code === code);
const filters = {
  all: () => true, exceptions: (row) => row.work.priority <= 3,
  source: has("source"), citation: has("citation"), conflict: has("conflict"), changed: has("changed"), failed: has("failed"),
  text: has("text"), unsupported: has("unsupported"), held: (row) => row.work.automatic.held,
  new: (row) => !row.work.automatic.processed,
  candidates: (row) => row.work.automatic.relationCount > 0,
  passed: (row) => row.work.automatic.passed > 0,
  inspection: (row) => row.work.automatic.inspectionFailed > 0,
  tags: (row) => !row.tagCount, inference: (row) => row.inferenceCount > 0,
  review: (row) => row.reviewPending, approved: (row) => row.approvalStatus === "APPROVED",
  mapping: (row) => Boolean(row.contentCuriId) && row.active, inactive: (row) => !row.active,
  search: (row) => row.work.automatic.searchFailed || row.work.automatic.searchPending || row.searchStatus === "PENDING"
};
function selectWorkRows(rows, input) {
  const query = String(input.q || "").trim().normalize("NFKC").toLowerCase();
  const filter = Object.hasOwn(filters, input.filter) ? input.filter : "all";
  const sort = ["priority", "title", "checked"].includes(input.sort) ? input.sort : "priority";
  const scoped = rows.filter((row) => `${row.id} ${row.title} ${row.program}`.normalize("NFKC").toLowerCase().includes(query));
  const matched = scoped.filter(filters[filter]).sort((a, b) => (sort === "priority" ? a.work.priority - b.work.priority :
    sort === "checked" ? String(b.work.automatic.lastCheckedAt || "").localeCompare(String(a.work.automatic.lastCheckedAt || "")) : 0) || a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(matched.length / 30)), page = Math.min(pages, Math.max(1, Number.parseInt(input.page, 10) || 1));
  return { matched, scoped, filter, sort, page, pages, total: matched.length,
    results: matched.slice((page - 1) * 30, page * 30),
    counts: Object.fromEntries(Object.entries(filters).map(([key, predicate]) => [key, scoped.filter(predicate).length])) };
}
module.exports = { workState, selectWorkRows };
