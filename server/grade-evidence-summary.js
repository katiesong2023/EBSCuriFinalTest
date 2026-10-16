const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { assetPath } = require("./automatic-asset-store");
const { loadEvidenceContext } = require("./automatic-evidence-service");
const { sourceSnapshot, standardSnapshot } = require("./automatic-evidence");
const { fingerprint, getEligibleStandards } = require("./data-quality");
const { validateAsset, humanDecisions } = require("./automatic-asset-validity");
const { ruleVersion } = require("./automatic-relation-rules");
const { candidateCourse } = require("./candidate-retrieval");
const { relationKey } = require("./human-review-contract");
const { courseOptions, standardCourse } = require("../public/grade-context");

function readHistory(filename) {
  if (!fs.existsSync(filename)) return { runs: [], relations: [], assets: [], projections: new Set() };
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    return { runs: db.prepare("SELECT rowid sequence,* FROM runs ORDER BY rowid").all().map((row) => ({ ...row, request: JSON.parse(row.request), report: row.report ? JSON.parse(row.report) : null })),
      relations: db.prepare("SELECT rowid sequence,* FROM relations ORDER BY rowid").all().map((row) => ({ ...row, evidence: JSON.parse(row.evidence) })),
      assets: db.prepare("SELECT * FROM assets").all(), projections: new Set(db.prepare("SELECT asset_id FROM search_projection").all().map((row) => row.asset_id)) };
  } finally { db.close(); }
}
const counters = (names) => Object.fromEntries(names.map((name) => [name, 0]));
function emptySegment(courseId, subject) {
  return { courseId, subject, automatic: { historicalRuns: 0, latestRuns: 0,
    runStates: counters(["CHECKED", "HELD", "FAILED", "RUNNING", "INTERRUPTED", "STALE", "UNKNOWN"]),
    historicalRelations: 0, latestRelations: 0, currentRelations: 0, staleRelations: 0,
    inspection: counters(["PASS", "FAIL", "HELD", "UNKNOWN"]),
    semantic: counters(["SUPPORTED", "PARTIAL", "UNSUPPORTED", "HELD", "CONFLICT", "NOT_EVALUATED"]),
    currentPublicRelations: 0, blockedByHuman: 0, staleReasons: {} },
  human: { latestDecidedRelations: 0, decisions: counters(["approve", "edit", "exclude", "hold"]), currentApprovedRelations: 0 } };
}
const increment = (values, key, fallback) => { values[Object.hasOwn(values, key) ? key : fallback] += 1; };

// 검색 준비·무효화 쓰기를 하지 않는다. 최신 관계를 현재 근거와 읽기 전용으로 비교한다.
async function summarizeGradeEvidence(store, { filename = assetPath, broadcasts, loadContext } = {}) {
  const segments = courseOptions.flatMap((course) => ["사회", "과학"].map((subject) => emptySegment(course.value, subject)));
  const byScope = new Map(segments.map((segment) => [`${segment.courseId}:${segment.subject}`, segment]));
  const standards = new Map(store.curriculumStandards.map((standard) => [standard.curiId, standard]));
  const eligible = new Set(getEligibleStandards(store.curriculumStandards).map((standard) => standard.curiId));
  const contents = new Map(store.contents.map((content) => [content.curiId, content]));
  const unscoped = { runs: 0, relations: 0, humanDecisions: 0 };
  const scope = (standard) => byScope.get(`${standardCourse(standard)}:${standard?.metadata?.subject || standard?.subject}`);
  let history, available = true;
  try { history = readHistory(filename); }
  catch { available = false; history = { runs: [], relations: [], assets: [], projections: new Set() }; }
  const runs = new Map(history.runs.map((run) => [run.id, run])), latestRuns = new Map(), latestRelations = new Map();
  for (const run of history.runs) {
    const content = contents.get(run.request.contentCuriId);
    const target = store.curriculumStandards.find((standard) => standard.metadata.achievementStandardId === run.request.standardId);
    const subject = run.report?.scope?.requestedSubject || run.request.subject || target?.metadata.subject || content?.metadata.subjectSeed;
    const course = candidateCourse(run.report?.scope?.requestedGradeBand || run.request.gradeBand || target?.metadata.courseId || target?.metadata.gradeBand || content?.metadata.gradeBandSeed || "5~6학년군");
    const segment = byScope.get(`${course}:${subject}`);
    if (!segment) { unscoped.runs += 1; continue; }
    segment.automatic.historicalRuns += 1;
    const source = run.report?.source || content?.sourceIdentity || run.request;
    latestRuns.set(fingerprint([source.sourceSystem, source.sourceContentId || run.request.resourceId || run.request.contentCuriId, source.variant || content?.metadata.variant, course, subject, run.request.standardId || "*"]), { run, segment });
  }
  for (const { run, segment } of latestRuns.values()) {
    segment.automatic.latestRuns += 1;
    const state = run.state === "RUNNING" && run.lease_until <= new Date().toISOString() ? "INTERRUPTED" : run.state;
    increment(segment.automatic.runStates, state, "UNKNOWN");
  }
  for (const relation of history.relations) {
    const evidence = relation.evidence, segment = scope(evidence.standard);
    if (!segment) { unscoped.relations += 1; continue; }
    segment.automatic.historicalRelations += 1;
    latestRelations.set(relationKey(evidence.source, evidence.standard.curriculumCuriId), { relation, segment });
  }
  const contexts = new Map();
  const contextFor = (request) => {
    const key = JSON.stringify(request);
    if (!contexts.has(key)) contexts.set(key, Promise.resolve().then(() => loadContext ? loadContext(request) : loadEvidenceContext(request, store, broadcasts)).catch(() => null));
    return contexts.get(key);
  };
  for (const { relation, segment } of latestRelations.values()) {
    const output = segment.automatic, evidence = relation.evidence, run = runs.get(relation.run_id), reasons = [];
    output.latestRelations += 1;
    const context = run && await contextFor(run.request), standard = standards.get(evidence.standard.curriculumCuriId);
    if (!context || sourceSnapshot(context.resource).contentHash !== evidence.source.contentHash) reasons.push("SOURCE_CHANGED_OR_UNAVAILABLE");
    if (!standard || !eligible.has(standard.curiId) || fingerprint(standardSnapshot(standard)) !== fingerprint(evidence.standard)) reasons.push("STANDARD_CHANGED_OR_UNAVAILABLE");
    if (evidence.ruleVersion !== ruleVersion) reasons.push("RULE_CHANGED");
    if (!run || !["CHECKED", "HELD"].includes(run.state)) reasons.push("RUN_NOT_CURRENT");
    if (reasons.length) {
      output.staleRelations += 1;
      for (const reason of reasons) output.staleReasons[reason] = (output.staleReasons[reason] || 0) + 1;
      continue;
    }
    output.currentRelations += 1;
    increment(output.inspection, evidence.inspection?.status, "UNKNOWN");
    increment(output.semantic, evidence.semantic?.status, "NOT_EVALUATED");
    const decisions = humanDecisions(context);
    if (decisions.has(evidence.standard.curriculumCuriId) || decisions.has("*")) output.blockedByHuman += 1;
    const asset = history.assets.find((row) => row.relation_id === relation.id && row.state === "CURRENT" && row.search_state === "READY" && history.projections.has(row.id));
    if (asset && validateAsset(evidence, context).valid) output.currentPublicRelations += 1;
  }

  const decisions = new Map();
  for (const run of store.mappingRuns || []) {
    const content = contents.get(run.contentCuriId); if (!content) continue;
    const source = { ...content.sourceIdentity, variant: content.metadata.variant };
    for (const review of run.reviewHistory || []) {
      if (review.confirmed !== true || review.reviewerRole !== "LOCAL_HUMAN_REVIEWER" || !review.reviewId || !["approve", "edit", "exclude"].includes(review.decision)) continue;
      const selected = review.result?.curriculumCuriIds || [];
      const ids = new Set([...selected, ...(store.contentCurriculumMaps || []).filter((map) => map.mappingRunId === run.mappingRunId).map((map) => map.curriculumCuriId)]);
      if (!ids.size) unscoped.humanDecisions += 1;
      for (const id of ids) {
        const key = relationKey(source, id), previous = decisions.get(key);
        if (!previous || String(previous.reviewedAt) <= String(review.reviewedAt)) decisions.set(key, { standard: standards.get(id) || review.result?.officialStandards?.find((item) => item.curiId === id),
          reviewedAt: review.reviewedAt, decision: review.decision === "exclude" || !selected.includes(id) ? "exclude" : review.decision });
      }
    }
  }
  for (const review of store.relationReviews || []) {
    if (review.confirmed !== true || review.reviewerRole !== "LOCAL_HUMAN_REVIEWER" || !review.reviewId || !["approve", "edit", "exclude", "hold"].includes(review.decision)) continue;
    if (review.relationKey !== relationKey(review.source, review.curriculumCuriId)) continue;
    decisions.set(review.relationKey, { standard: standards.get(review.curriculumCuriId) || review.standardSnapshot, decision: review.decision, reviewedAt: review.reviewedAt });
  }
  for (const decision of decisions.values()) {
    const segment = scope(decision.standard);
    if (!segment) { unscoped.humanDecisions += 1; continue; }
    segment.human.latestDecidedRelations += 1; segment.human.decisions[decision.decision] += 1;
  }
  for (const asset of store.verifiedAssets || []) {
    const segment = scope(asset.standard); if (segment) segment.human.currentApprovedRelations += 1;
  }
  return { available, segments, unscoped,
    note: "자동 이력은 저장된 자료·기준별 최신 관계를 현재 원문/기준/규칙과 읽기 전용으로 대조합니다. 구조 통과와 의미 미지원은 중복될 수 있습니다. 사람 결정은 관계별 최신 실제 기록이며 현재 승인 자산 수와 다릅니다." };
}
module.exports = { summarizeGradeEvidence };
