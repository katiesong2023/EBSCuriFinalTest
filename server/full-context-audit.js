// 전체 자료의 규칙 판정과 원문 공백을 기록한다. 모델·사람 의미 검수를 가장하지 않는다.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { concepts, auditResource, ruleVersion, aliasRegex } = require('./semantic-layer');
const { contentKeywords } = require('./content-keywords');
const { assessSourceText } = require('./source-text-quality');
const { summaryContext, evaluateSummaryEvidence } = require('./keyword-context');
const { additionalTerms } = require('./content-keywords');
async function fullContextAudit(options = {}) {
  const catalog = options.catalog || await loadDiscoveryCatalog();
  const items = [...new Map([...catalog.resources, ...(catalog.searchVariants || [])].map(item=>[item.id,item])).values()];
  const rowsPath = options.rowsPath || 'docs/r07-17-context-audit.ndjson';
  const rowsFile = await fs.open(rowsPath,'w');
  const stats = { total:items.length,usableSummary:0,heldSource:0,acceptedConceptTags:0,withConceptTags:0,
    withContentKeywords:0,conceptDecisions:0,summaryAliasOccurrences:0,titleAliasOccurrences:0,heldConceptCandidates:0,
    rejectedSummaryOccurrences:0,removedOldTags:0,addedTags:0,contentVocabularyDecisions:0 };
  const byConcept = {}, byProgram = {}, sourceQuality = {}, reasons = {}, removed=[], added=[];
  try {
    for(const item of items) {
      const result=auditResource(item),context=summaryContext(item),keywords=contentKeywords(item);
      const old=options.previousTagger?.(item)?.supported || [];
      const quality=assessSourceText(item.title,item.summary);
      sourceQuality[quality.category]=(sourceQuality[quality.category]||0)+1;
      stats.usableSummary+=Number(Boolean(context));stats.heldSource+=Number(!context);
      stats.acceptedConceptTags+=result.supported.length;stats.withConceptTags+=Number(Boolean(result.supported.length));
      stats.withContentKeywords+=Number(Boolean(keywords.length));stats.conceptDecisions+=result.review.decisions.length;
      const program=byProgram[item.program] ||= {total:0,withConceptTags:0,heldSource:0};
      program.total++;program.withConceptTags+=Number(Boolean(result.supported.length));program.heldSource+=Number(!context);
      for(const d of result.review.decisions) {
        const concept=byConcept[d.conceptId] ||= {label:d.label,accepted:0,held:0};concept[d.status==='ACCEPTED'?'accepted':'held']++;
        stats.summaryAliasOccurrences+=d.summaryMentions;stats.titleAliasOccurrences+=d.titleMentions.length;
        stats.heldConceptCandidates+=Number(d.status==='HELD');stats.rejectedSummaryOccurrences+=d.rejected.length;
        if(d.status==='HELD')reasons[d.reason]=(reasons[d.reason]||0)+1;
        for(const r of d.rejected)reasons[r.reason]=(reasons[r.reason]||0)+1;
      }
      const removedTags=old.filter(t=>!result.supported.some(n=>n.conceptId===t.conceptId));
      const addedTags=result.supported.filter(t=>!old.some(n=>n.conceptId===t.conceptId));
      stats.removedOldTags+=removedTags.length;stats.addedTags+=addedTags.length;
      for(const t of removedTags)removed.push({id:item.id,title:item.title,summary:item.summary,concept:t.label,
        oldEvidence:t.evidence,decision:result.review.decisions.find(d=>d.conceptId===t.conceptId)});
      for(const t of addedTags)added.push({id:item.id,title:item.title,concept:t.label,evidence:t.evidence});
      const sourceVocabulary=additionalTerms.flatMap(label=>{
        const checked=evaluateSummaryEvidence(item,[label],context);
        const titleMention=aliasRegex(label).test(item.title);
        if(!checked.candidateCount&&!titleMention)return [];
        stats.contentVocabularyDecisions++;
        return [{label,status:checked.evidence?'ACCEPTED':'HELD',reason:checked.reason,
          evidence:checked.evidence,rejected:checked.rejected,titleMention,summaryMentions:checked.candidateCount}];
      });
      const record={id:item.id,program:item.program,title:item.title,sourceUrl:item.sourceUrl,summary:item.summary,
        sourceQuality:quality.category,sourceStatus:result.review.sourceStatus,
        meaningReview:result.review.meaningReview,accepted:result.supported,decisions:result.review.decisions,
        sourceVocabulary,contentKeywords:keywords,removedConcepts:removedTags.map(t=>t.conceptId),addedConcepts:addedTags.map(t=>t.conceptId)};
      await rowsFile.write(JSON.stringify(record)+'\n');
    }
  } finally { await rowsFile.close(); }
  const checksum=crypto.createHash('sha256').update(await fs.readFile(rowsPath)).digest('hex');
  const report={generatedAt:new Date().toISOString(),ruleVersion,stats,conceptDefinitions:concepts.length,
    conceptResourceComparisons:items.length*concepts.length,byConcept,byProgram,sourceQuality,reasons,
    rows:{path:rowsPath,count:items.length,sha256:checksum},removed,added,paidApiCalls:0,
    scope:'전체 자료/판본의 모든 개념 정의·내용 어휘를 문맥 규칙에 대조. 모든 자료의 판정/근거/보류 기록. 모델이나 사람의 전수 의미 검수·영상·교육과정 적합성 검증은 별도이며 완료로 표시하지 않는다.'};
  await fs.writeFile(options.reportPath||'docs/r07-17-full-context-audit.json',JSON.stringify(report,null,2)+'\n');
  return report;
}
if(require.main===module)fullContextAudit().then(r=>console.log(r.stats)).catch(e=>{console.error(e);process.exitCode=1});
module.exports={fullContextAudit};
