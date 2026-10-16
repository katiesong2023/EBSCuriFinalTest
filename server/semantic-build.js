// 검색과 같은 규칙으로 근거 태그를 SQLite에 재생성한다. 원본·승인 저장소는 읽기 전용이다.
const fs = require("node:fs/promises");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { loadDiscoveryCatalog } = require("./discovery-catalog");
const { concepts, ruleVersion, getSemanticIndex, hash } = require("./semantic-layer");
async function buildSemanticStore(catalog, options = {}) {
  const index = getSemanticIndex(catalog);
  const filename = options.filename || path.join(__dirname, "data/semantic-layer.sqlite");
  const temporary = `${filename}.${process.pid}.tmp`;
  const db = new DatabaseSync(temporary);
  const ruleHashes = Object.fromEntries(await Promise.all(['semantic-layer.js','semantic-pattern.js','keyword-context.js',
    'content-keywords.js','keyword-vocabulary.js','source-editorial.js','source-context.js','supplement-search.js','source-supplements.js',
    'broadcast-guide-text.js','source-text-quality.js','source-literal.js'].map(async name=>[name,hash(await fs.readFile(path.join(__dirname,name),'utf8'))])));
  const buildId = hash(ruleVersion + JSON.stringify(ruleHashes) + [...index.values()].map((row) => row.resourceId + row.contentHash).join("|")).slice(0, 24);
  let mentions = 0, candidates = 0, sourceKeywords = 0;
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE builds(id TEXT PRIMARY KEY, rule_version TEXT, created_at TEXT, resource_count INTEGER);
      CREATE TABLE concepts(id TEXT PRIMARY KEY, label TEXT, subject TEXT, aliases TEXT, broader_id TEXT);
      CREATE TABLE resources(id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, build_id TEXT REFERENCES builds(id));
      CREATE TABLE context_reviews(resource_id TEXT PRIMARY KEY REFERENCES resources(id),
        source_status TEXT NOT NULL, meaning_review TEXT NOT NULL, record TEXT NOT NULL);
      CREATE TABLE source_keywords(resource_id TEXT REFERENCES resources(id),label TEXT NOT NULL,kind TEXT NOT NULL,
        concept_id TEXT REFERENCES concepts(id),field TEXT NOT NULL,start INTEGER,end INTEGER,quote TEXT,source_url TEXT,context TEXT,
        supplement_id TEXT,content_hash TEXT,
        PRIMARY KEY(resource_id,label));
      CREATE INDEX source_keywords_label ON source_keywords(label);
      CREATE TABLE tags(resource_id TEXT REFERENCES resources(id), concept_id TEXT REFERENCES concepts(id),
        status TEXT NOT NULL, field TEXT, start INTEGER, end INTEGER, quote TEXT, excerpt TEXT, source_url TEXT,
        from_concept_id TEXT, rule_version TEXT, checked_at TEXT, PRIMARY KEY(resource_id,concept_id,status,from_concept_id));
      CREATE INDEX tags_concept ON tags(concept_id,status); BEGIN;`);
    db.prepare("INSERT INTO builds VALUES(?,?,?,?)").run(buildId, ruleVersion, new Date().toISOString(), index.size);
    const conceptInsert = db.prepare("INSERT INTO concepts VALUES(?,?,?,?,?)");
    for (const concept of concepts) conceptInsert.run(concept.id, concept.label, concept.subject, JSON.stringify(concept.aliases), concept.broader);
    const resourceInsert = db.prepare("INSERT INTO resources VALUES(?,?,?)");
    const tagInsert = db.prepare("INSERT INTO tags VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
    const reviewInsert = db.prepare("INSERT INTO context_reviews VALUES(?,?,?,?)");
    const keywordInsert = db.prepare('INSERT INTO source_keywords VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const row of index.values()) {
      resourceInsert.run(row.resourceId, row.contentHash, buildId);
      reviewInsert.run(row.resourceId,row.review.sourceStatus,row.review.meaningReview,JSON.stringify(row.review));
      for(const keyword of row.contentKeywords){const evidence=keyword.evidence;
        keywordInsert.run(row.resourceId,keyword.label,keyword.kind,keyword.conceptId||null,evidence.field,evidence.start,evidence.end,
          evidence.quote,evidence.sourceUrl||'',evidence.context||'',evidence.supplementId||null,evidence.contentHash||null);sourceKeywords++;
      }
      for (const tag of [...row.supported, ...row.candidates]) {
        const evidence = tag.evidence;
        tagInsert.run(row.resourceId, tag.conceptId, tag.status, evidence.field, evidence.start, evidence.end,
          evidence.quote, evidence.excerpt, evidence.sourceUrl || "", tag.fromConceptId || "", ruleVersion, evidence.checkedAt);
      }
      mentions += row.supported.length; candidates += row.candidates.length;
    }
    db.exec("COMMIT");
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("시맨틱 저장소 무결성 오류");
  } finally { db.close(); }
  await fs.rename(temporary, filename);
  const report = { generatedAt: new Date().toISOString(), buildId, ruleVersion, ruleHashes, resources: index.size,
    concepts: concepts.length, resourcesWithSourceTags: [...index.values()].filter((row) => row.supported.length).length,
    sourceMentions: mentions, inferredCandidates: candidates, sourceKeywords, paidApiCalls: 0,
    note: "SOURCE_MENTION은 원문 표현의 존재 확인이며 개념 설명·장면·학년·교육과정 적합성 승인이 아니다. 추론 후보는 기본 검색의 일치 근거로 사용하지 않는다." };
  await fs.writeFile(options.reportFilename || path.join(__dirname, "../docs/semantic-build.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}
async function main() {
  const report = await buildSemanticStore(await loadDiscoveryCatalog());
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { buildSemanticStore };
