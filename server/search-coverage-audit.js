// 실패한 필수어의 '현재 조건 안 부재'와 '전체 원문에도 명시 단서 없음'을 구분한다.
// 원문에 없는 실제 영상 내용을 미보유로 확정하거나 기대 주제를 검색에 주입하지 않는다.
const fs = require('node:fs');
const zlib = require('node:zlib');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { teacherCatalog } = require('./teacher-approvals');
const { contentSources } = require('./source-context');
const { vocabulary } = require('./keyword-vocabulary');
const { additionalTerms } = require('./content-keywords');
const { specificTerms } = require('./content-preview');
const { unitAnchors } = require('./curriculum-expansion-anchors');
const { isMeaningNoun, queryLiteralAliases } = require('./source-meaning');
const { concepts } = require('./semantic-layer');
const { matchingTerms } = require('./search-term-matching');
const nouns = new Set([...vocabulary,...additionalTerms,...specificTerms,...Object.values(unitAnchors).flat(),...concepts.flatMap(c=>c.aliases)]);
(async()=>{
  const before=JSON.parse(zlib.gunzipSync(fs.readFileSync('docs/r12-40-before.json.gz'))),terms=new Map();
  for (const row of before.rows) if (!row.total && !row.diagnostics.stages.contentMatched) {
    for (const [condition,stats] of Object.entries(row.diagnostics.conditions)) {
      if (stats.matched) continue;
      const term=condition.slice(condition.indexOf(':')+1);
      if (!nouns.has(term)&&!isMeaningNoun(term)&&!concepts.some(c=>c.label===term)) continue;
      if (!terms.has(term)) terms.set(term,[]);
      terms.get(term).push(row.set+'/'+row.id);
    }
  }
  const catalog=await teacherCatalog(await loadDiscoveryCatalog());
  const sources=catalog.resources.map(item=>({id:item.id,title:item.title,program:item.program,fields:contentSources(item)}));
  const rows=[];
  for (const [term,requests] of terms) {
    const aliases=[...queryLiteralAliases(term),...(concepts.find(c=>c.label===term)?.aliases||[])];
    const hits=sources.filter(r=>r.fields.some(s=>matchingTerms(term,s.text,aliases).length));
    rows.push({term,requests,explicitSourceCount:hits.length,examples:hits.slice(0,3).map(({id,title,program})=>({id,title,program}))});
  }
  const zero=rows.filter(r=>!r.explicitSourceCount),programs={};for (const r of catalog.resources) programs[r.program]=(programs[r.program]||0)+1;
  const report={generatedAt:new Date().toISOString(),catalog:catalog.resources.length,recognizedZeroConditions:rows.length,
    noExplicitSourceCueTerms:zero.length,affectedQueries:[...new Set(zero.flatMap(r=>r.requests))].length,
    outsideCurrentScopeTerms:rows.filter(r=>r.explicitSourceCount>0).length,
    scope:'기존370에서 실패한 등록 필수어의 전체 제목/소개/공식 보조 원문 명시 단서 감사. 표현 확장을 포함하지만 의미상 관련 자료 전부나 영상 미보유를 판정하지 않음.',
    topPrograms:Object.entries(programs).sort((a,b)=>b[1]-a[1]).slice(0,15),rows,paidApiCalls:0};
  fs.writeFileSync('docs/r12-40-source-coverage-audit.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({recognized:rows.length,noExplicitSourceCueTerms:zero.length,affectedQueries:report.affectedQueries,outsideScope:report.outsideCurrentScopeTerms}));
})().catch(e=>{console.error(e);process.exitCode=1});
