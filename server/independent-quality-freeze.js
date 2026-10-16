const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { buildIndex } = require('./curriculum-discovery');
const { getEligibleStandards } = require('./data-quality');
const { variantKey } = require('./teacher-curation');
const { assessSourceText } = require('./source-text-quality');
const { hash, writeGzip } = require('./independent-quality-capture');
const root = path.resolve(__dirname, '..');
const readGzip = filename => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, filename))));
const normalized = text => String(text || '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const shards = item => {
  const text = normalized(item.summary);
  return text.length < 80 ? [] : Array.from({ length: Math.floor((text.length - 80) / 40) + 1 }, (_, i) => text.slice(i * 40, i * 40 + 80));
};

function freeze() {
  if (fs.existsSync(path.join(root, 'docs/r09-02-holdout.json.gz'))) throw new Error('독립 표본을 덮어쓰지 않습니다.');
  const { catalog, store, developmentIds } = readGzip('docs/r09-02-frozen-input.json.gz');
  const index = buildIndex(catalog, getEligibleStandards(store.curriculumStandards));
  const baseline = index.rows.map(row => ({ standardId: row.plan.standardId, courseId: row.plan.courseId,
    subject: row.plan.subject, ruleSupported: row.plan.ruleSupported, total: row.total, counts: row.counts,
    candidates: row.candidates.map(item => ({ id: item.id, score: item.score, state: item.candidateState,
      ruleStatus: item.semantic.status, evidence: item.semantic.evidence, connectedParts: item.semantic.connectedParts })),
    groups: row.grouped.map((item, offset) => ({ rank: offset + 1, id: item.id, alternatives: item.alternatives.map(i => i.id) })) }));
  writeGzip('docs/r09-02-baseline-search.json.gz', baseline);
  const dev = new Set(developmentIds);
  const developmentResources = catalog.resources.filter(item => dev.has(item.id));
  const developmentFamilies = new Set(developmentResources.map(variantKey));
  const developmentShards = new Set(developmentResources.flatMap(shards));
  const eligible = catalog.resources.filter(item => item.sourceSystem === 'EBS_BROADCAST' && item.kind !== 'collection' &&
    !dev.has(item.id) && !developmentFamilies.has(variantKey(item)) && !shards(item).some(s => developmentShards.has(s)));
  // 별도 어휘로 결과 밖에서도 자료를 회수한다. 실제 관련성은 고정 후 에이전트가 원문을 판독한다.
  const targets = [
    ['4사04-02', /철도|증기기관|마차|교통|기차/u],
    ['4과07-01', /진동|공명|떨림|울림|소리/u],
    ['6사08-01', /선거|투표|참정권|유권자|정권교체/u],
    ['6과12-02', /자전|밤낮|낮과\s*밤|지구.{0,15}(?:회전|돌)/u],
    ['9사(지리)03-02', /유럽|덴마크|코펜하겐|독일|프라이부르크|암스테르담/u],
    ['9과03-02', /열전달|열\s*전달|전도|대류|복사열|햇볕|온돌/u]
  ];
  const usedFamilies = new Set(), samples = [];
  for (const [standardId, independentPattern] of targets) {
    const row = index.rows.find(row => row.plan.standardId === standardId);
    const ranks = new Map(row.grouped.flatMap((item, offset) => [item, ...item.alternatives].map(i => [i.id, offset + 1])));
    const candidates = new Set(row.candidates.map(item => item.id));
    const available = eligible.filter(item => !usedFamilies.has(variantKey(item)));
    const eligibleIds = new Set(available.map(item => item.id));
    const add = (item, route) => {
      if (!item || usedFamilies.has(variantKey(item))) return false;
      usedFamilies.add(variantKey(item));
      samples.push({ sampleId: `H${String(samples.length + 1).padStart(2, '0')}`, standardId,
        courseId: row.plan.courseId, subject: row.plan.subject, resourceId: item.id, selectionRoute: route,
        sourceQuality: assessSourceText(item.title, item.summary), baselineCandidate: candidates.has(item.id),
        baselineRank: ranks.get(item.id) || null, judgment: null });
      return true;
    };
    const qualified = row.grouped.flatMap(item => [item, ...item.alternatives]).filter(item => eligibleIds.has(item.id));
    let selected = 0;
    for (const item of qualified.filter(item => item.sourceQuality.detailedMappingAllowed)) {
      if (add(item, 'RANKED_CANDIDATE_SUFFICIENT_TEXT') && ++selected === 2) break;
    }
    add(qualified.find(item => !item.sourceQuality.detailedMappingAllowed && !usedFamilies.has(variantKey(item))), 'RANKED_CANDIDATE_LOW_TEXT');
    const outside = available.filter(item => !usedFamilies.has(variantKey(item)) && independentPattern.test(`${item.title} ${item.summary}`) && (ranks.get(item.id) || Infinity) > 9)
      .sort((a, b) => Number(candidates.has(a.id)) - Number(candidates.has(b.id)) || hash(a.id).localeCompare(hash(b.id)));
    let outsideCount = 0;
    for (const item of outside) if (add(item, candidates.has(item.id) ? 'INDEPENDENT_SCAN_OUTSIDE_TOP9' : 'INDEPENDENT_SCAN_NOT_RETRIEVED') && ++outsideCount === 3) break;
  }
  const selectedResources = samples.map(sample => catalog.resources.find(item => item.id === sample.resourceId));
  const heldFamilies = new Set(selectedResources.map(variantKey)), heldShards = new Set(selectedResources.flatMap(shards));
  const excludedResources = catalog.resources.filter(item => heldFamilies.has(variantKey(item)) || shards(item).some(s => heldShards.has(s)));
  const createdAt = new Date().toISOString();
  const holdout = { createdAt, judgmentAuthority: 'AGENT_SOURCE_TEXT_REVIEW_NOT_TEACHER', topK: 9, samples,
    policy: { frozenBeforeProductChanges: true, developmentResourcesExcluded: developmentIds.length,
      familyAndNearTextExclusion: 'variantKey family and normalized 80-character windows at 40-character stride',
      selection: 'Per segment: first two eligible sufficient-text ranked candidates, first low-text candidate, three independent lexical-scan records outside top nine; unseen variant families only.',
      noGeneralRecallClaim: true, teacherResponses: 0 } };
  const descriptor = writeGzip('docs/r09-02-holdout.json.gz', holdout);
  fs.writeFileSync(path.join(root, 'docs/r09-02-exclusions.json'), JSON.stringify({ createdAt,
    purpose: '독립 표본 및 같은 회차 판본·근접 원문을 제품 개발·보강 대상에서 제외하기 위한 해시',
    algorithm: 'sha256(UTF-8 resourceId)', resourceIdHashes: [...new Set(excludedResources.map(item => hash(item.id)))].sort(),
    sampleRelationHashes: samples.map(sample => hash(`${sample.resourceId}:${sample.standardId}`)).sort() }, null, 2) + '\n');
  const preparation = { createdAt, status: 'FROZEN_BEFORE_IMPLEMENTATION', topK: 9, holdout: descriptor,
    sampleRelations: samples.length, segments: [...new Set(samples.map(s => `${s.courseId}:${s.subject}`))].map(segment => ({ segment, count: samples.filter(s => `${s.courseId}:${s.subject}` === segment).length })),
    originalDatabasesWritten: false, independentJudgments: 'PENDING_AGENT_REVIEW', teacherEvaluation: 'NOT_PERFORMED',
    exclusions: { path: 'docs/r09-02-exclusions.json', resourceFamiliesAndNearTextCount: excludedResources.length },
    input: 'docs/r09-02-frozen-input.json.gz', code: 'docs/r09-02-frozen-code.json.gz', baseline: 'docs/r09-02-baseline-search.json.gz' };
  fs.writeFileSync(path.join(root, 'docs/r09-02-preparation.json'), JSON.stringify(preparation, null, 2) + '\n');
  console.log(JSON.stringify({ status: preparation.status, sampleRelations: samples.length, segments: preparation.segments, exclusions: preparation.exclusions }));
}
if (require.main === module) freeze();
module.exports = { freeze, readGzip };
