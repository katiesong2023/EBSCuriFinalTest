// 검증 자산의 승인 여부와 현재 질문의 주제 일치를 별도로 검사한다.
// 일반 방송을 섞지 않고 이미 검색 가능한 승인 관계만 같은 로컬 주제 규칙에 통과시킨다.
const { discoverContents } = require("./discovery-search");
const { stripGradeTerms } = require("../public/grade-context");
const { removeTopicRequest } = require("./topic-request");

function topicQuery(query) {
  return stripGradeTerms(removeTopicRequest(query))
    .replace(/(?<![\p{L}\p{N}])(?:사회|과학|국어|수학|영어|도덕|음악|미술|체육|실과)(?=$|\s|을|를)/gu, " ")
    .replace(/\s+/gu, " ").trim();
}

async function filterVerifiedTopics(relations, query) {
  const q = topicQuery(query);
  if (!q) return { relations: [], query: q, needsTopic: true, warnings: [] };
  if (q.length > 200) return { relations: [], query: q, needsTopic: true,
    warnings: ["주제 근거를 확인할 내용이 너무 깁니다. 수업 주제를 200자 이내로 줄여주세요."] };
  const resources = relations.map(({ asset }) => {
    const metadata = asset.content.metadata, review = asset.review.result, standard = asset.standard.metadata;
    return { id: asset.verifiedAssetId, kind: "clip", title: metadata.title,
      program: metadata.programName || metadata.sourceGroup || "",
      summary: [metadata.synopsis, asset.publicText?.text, ...(review.coreConcepts || []), review.rationale,
        review.teachingUse, standard.unitTitle, standard.achievementStandard].filter(Boolean).join("\n"),
      sourceUrl: asset.content.sourceUrl };
  });
  const catalog = { resources, concepts: [], stats: {}, version: "verified-topic-filter-1" };
  const first = await discoverContents({ q }, catalog);
  const ids = new Set(first.results.map((item) => item.id));
  for (let page = 2; page <= first.pages; page++) {
    for (const item of (await discoverContents({ q, page }, catalog)).results) ids.add(item.id);
  }
  const hasTopic = first.understanding.groups.some((group) => group.conceptIds.length || group.terms.length || group.alternatives.length) ||
    first.understanding.requiredPrograms.length || first.understanding.preferences.programs.length;
  return { relations: relations.filter(({ asset }) => ids.has(asset.verifiedAssetId)), query: q,
    needsTopic: !hasTopic, warnings: first.understanding.warnings };
}

module.exports = { filterVerifiedTopics, topicQuery };
