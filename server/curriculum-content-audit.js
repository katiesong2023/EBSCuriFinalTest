const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {readDataStore}=require('./data-store'),{discoverRelatedStandards}=require('./curriculum-related');
(async()=>{
 const store=await readDataStore(),before=JSON.parse(await fs.readFile('docs/r12-33-related-before.json')),
 previous=JSON.parse(await fs.readFile('docs/r12-33-related-after.json')),rows=[];
 const standards=new Map(store.curriculumStandards.map(x=>[x.metadata.achievementStandardId,x.metadata.achievementStandard]));
 let quotes=0;
 for(const row of before.rows){
  const input={title:row.title,summary:row.summary,searchQuery:row.query};
  const data=await discoverRelatedStandards(input,store);
  for(const c of data.related)for(const e of c.evidence){assert.equal(input[e.field].slice(e.start,e.end),e.quote);quotes++;}
  rows.push({id:row.id,title:row.title,searchQuery:row.query,summaryLength:row.summary.length,previous:previous.rows.find(x=>x.id===row.id).related.map(x=>x.id),related:data.related.map(c=>({...c,standardText:standards.get(c.id)})),contentLength:data.contentLength});
 }
 for(const row of rows.filter(x=>x.searchQuery==='독립운동'))assert.ok(row.related.some(c=>c.id==='6사06-01'));
 for(const row of rows.filter(x=>x.searchQuery==='다문화')){assert.ok(row.related.some(c=>c.id==='4사03-02'));assert.ok(!row.related.some(c=>c.id==='9사(지리)02-02'));}
 const kidney=rows.find(x=>x.title==='내 몸속의 돌, 결석');assert.ok(!kidney.related.some(c=>c.id.includes('사')));
 const summary={checkedAt:new Date().toISOString(),samples:rows.length,totalCandidates:rows.reduce((n,r)=>n+r.related.length,0),evidenceQuotesChecked:quotes,restoredIndependentResources:2,emptyResources:rows.filter(x=>!x.related.length).map(x=>({id:x.id,title:x.title})),paidApiCalls:0,rows};
 await fs.writeFile('docs/r12-34-content-audit.json',JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({samples:summary.samples,totalCandidates:summary.totalCandidates,evidenceQuotesChecked:quotes,emptyResources:summary.emptyResources,restoredIndependentResources:2}));
})().catch(e=>{console.error(e);process.exitCode=1});
