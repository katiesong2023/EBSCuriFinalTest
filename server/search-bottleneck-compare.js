// 고정370의 상위3개를 같은 원문 라벨로 비교한다. 미평가 후보는 통과로 세지 않는다.
const fs = require('node:fs');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const read = p => JSON.parse(p.endsWith('.gz')?zlib.gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const [beforePath,afterPath,labelPath,outputPath] = process.argv.slice(2);
if (![beforePath,afterPath,labelPath,outputPath].every(Boolean)) throw Error('전후 보고서·라벨·새 출력 경로를 지정하세요.');
if (fs.existsSync(outputPath)) throw Error('비교 결과를 덮어쓰지 않습니다.');
const before=read(beforePath),after=read(afterPath),labelData=read(labelPath);
assert.deepEqual(before.inputs,after.inputs);
assert.equal(before.catalogFingerprint,after.catalogFingerprint);
assert.deepEqual(before.before,after.before);
assert.deepEqual(before.changedStores,[]);assert.deepEqual(after.changedStores,[]);
assert.equal(before.rows.length,370);assert.equal(after.rows.length,370);
const stable = value => Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const fingerprint = item=>crypto.createHash('sha256').update(JSON.stringify(stable([item.title,item.summary,item.sourceSupplements||[]]))).digest('hex');
let quoteChecks=0;
const judge = row => {
  assert.ok(!row.error);
  return {...row,judged:row.top5.slice(0,3).map((item,index)=>{
    const key=row.set+'/'+row.id+'/'+item.id,label=labelData.labels[key];
    assert.ok(label, '라벨 필요: '+key+' '+item.title);
    assert.equal(fingerprint(item),label.fingerprint,'원문 판본 변경: '+key);
    assert.equal(row.query,label.query);assert.ok([0,1,2].includes(label.score));
    const quotes=[...(item.meaningMatches||[]).flatMap(m=>m.evidence||[]),...(item.sourcePredicateEvidence||[]).flatMap(p=>p.evidence||[]),
      ...(item.searchExplanation?.topicEvidence||[]),...(item.searchExplanation?.supplementEvidence||[])];
    for (const q of quotes) {
      const text=q.field==='sourceSupplement'?(item.sourceSupplements||[]).find(s=>s.id===q.supplementId)?.text:item[q.field];
      assert.equal(typeof text,'string',key+' 인용 원문');assert.equal(text.slice(q.start,q.end),q.quote,key+' 인용 위치');quoteChecks++;
    }
    return {rank:index+1,id:item.id,title:item.title,sourceUrl:item.sourceUrl,score:label.score,reason:label.reason,fingerprint:label.fingerprint};
  })};
};
const b=before.rows.map(judge),a=after.rows.map(judge);
function failure(row) {
  if (row.total>0) return 'NONEMPTY';
  const s=row.diagnostics.stages,t=row.diagnostics.teacher;
  if (!s.eligibleBeforeContent) return 'SCOPE';
  if (!s.contentMatched) return 'CONTENT_AND_OR_RELATION';
  if (!s.contextMatched) return 'SOURCE_CONTEXT';
  if (!s.ranked) return 'RANK_OR_EXCLUSION';
  if (!t.afterConceptEvidence) return 'TEACHER_EVIDENCE';
  return 'TEACHER_FILTER';
}
const metrics=[];
for (const [stage,rows] of [['before',b],['after',a]]) for (const set of ['new200','previous170','all']) {
  const list=rows.filter(r=>set==='all'||r.set===set),c=list.flatMap(r=>r.judged),full=c.filter(x=>x.score===2).length;
  const stages={};for (const row of list) stages[failure(row)]=(stages[failure(row)]||0)+1;
  metrics.push({stage,set,queries:list.length,nonempty:list.filter(r=>r.total>0).length,empty:list.filter(r=>!r.total).length,
    queriesWithRelevantTop3:list.filter(r=>r.judged.some(x=>x.score===2)).length,top1Relevant:list.filter(r=>r.judged[0]?.score===2).length,
    relevant:full,partial:c.filter(x=>x.score===1).length,irrelevant:c.filter(x=>x.score===0).length,returnedTop3:c.length,
    relevanceAmongReturned:c.length?Number((full/c.length*100).toFixed(1)):null,stages});
}
const rows=a.map((row,index)=>{
  const old=b[index];assert.equal(row.id,old.id);assert.equal(row.query,old.query);assert.equal(row.set,old.set);
  const prior=old.judged.filter(c=>c.score===2);
  const missingTop3=prior.filter(c=>!row.judged.some(n=>n.id===c.id&&n.fingerprint===c.fingerprint));
  const missingAll=prior.filter(c=>!row.diagnostics.teacher.groupedIds.includes(c.id));
  const beforeKeys=new Set(old.judged.map(c=>c.id));
  return {set:row.set,id:row.id,query:row.query,before:{total:old.total,terms:old.terms,failure:failure(old),candidates:old.judged},
    after:{total:row.total,terms:row.terms,failure:failure(row),candidates:row.judged},
    missingPriorRelevantTop3:missingTop3,missingPriorRelevantAll:missingAll,
    newIrrelevant:row.judged.filter(c=>c.score===0&&!beforeKeys.has(c.id)),sourcePredicateCandidates:row.diagnostics.stages.sourcePredicateAccepted||0};
});
let pooledRelevant=0,missingBefore=0,missingAfter=0;
for (const row of rows) {
  const positives=new Map([...row.before.candidates,...row.after.candidates].filter(c=>c.score===2).map(c=>[c.id+':'+c.fingerprint,c]));
  pooledRelevant+=positives.size;
  for (const [key] of positives) {
    if (!row.before.candidates.some(c=>c.id+':'+c.fingerprint===key)) missingBefore++;
    if (!row.after.candidates.some(c=>c.id+':'+c.fingerprint===key)) missingAfter++;
  }
}
const codeDifferences=[...new Set([...Object.keys(before.runtimeCode),...Object.keys(after.runtimeCode)])].filter(p=>before.runtimeCode[p]!==after.runtimeCode[p]);
const report={generatedAt:new Date().toISOString(),before:beforePath,after:afterPath,labels:labelPath,inputs:before.inputs,catalogFingerprint:before.catalogFingerprint,
  storesUnchanged:true,codeDifferences,quoteChecks,paidApiCalls:0,
  scope:'기존370 원문의 전후 상위3개 전수에 대한 에이전트 잠정 텍스트 평가. 교사/영상 정답률 아님. 전체 카탈로그 정답이 없으므로 전체 재현율을 계산하지 않음.',
  metrics,pooledTop3:{knownRelevantPairs:pooledRelevant,missingBeforeTop3:missingBefore,missingAfterTop3:missingAfter,note:'전후 상위3개 합집합에서 확인된 관련 자료의 노출 누락. 미발견 정답을 포함하는 전체 누락률이 아님.'},
  priorRelevantMissingTop3:rows.flatMap(r=>r.missingPriorRelevantTop3).length,priorRelevantMissingAll:rows.flatMap(r=>r.missingPriorRelevantAll).length,
  newIrrelevantPairs:rows.flatMap(r=>r.newIrrelevant).length,rows};
fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({metrics:metrics.filter(m=>m.set==='all'),pooledTop3:report.pooledTop3,priorRelevantMissingAll:report.priorRelevantMissingAll,newIrrelevantPairs:report.newIrrelevantPairs,quoteChecks},null,2));
