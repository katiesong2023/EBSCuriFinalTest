const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {loadDiscoveryCatalog}=require('./discovery-catalog');const {teacherCatalog}=require('./teacher-approvals');
const {readDataStore}=require('./data-store');const {getSemanticIndex,concepts}=require('./semantic-layer');
const {discoverContents}=require('./discovery-search');
const protectedNames=['curi-store.json','broadcast-catalog.sqlite','automatic-assets.sqlite'];
const hashes=()=>Object.fromEntries(protectedNames.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync('server/data/'+n)).digest('hex')]));
async function main(){const before=hashes(),catalog=await loadDiscoveryCatalog(),store=await readDataStore(),full=await teacherCatalog(catalog,store,[]);
const resources=new Map(full.resources.map(i=>[i.id,i])),audit=require('../docs/r07-17-full-context-audit.json');
const rows=fs.readFileSync(audit.rows.path,'utf8').trimEnd().split('\n').map(JSON.parse);assert.equal(rows.length,resources.size);assert.equal(new Set(rows.map(x=>x.id)).size,resources.size);
let keywordQuotes=0,decisionCases=0;for(const row of rows){const item=resources.get(row.id);assert.ok(item);for(const tag of [...row.accepted,...row.contentKeywords]){assert.equal(tag.evidence.field,'summary');assert.equal(item.summary.slice(tag.evidence.start,tag.evidence.end),tag.evidence.quote);keywordQuotes++;}for(const d of row.decisions){if(d.status==='HELD')assert.ok(!row.accepted.some(t=>t.conceptId===d.conceptId));decisionCases++;}}
const filename=process.env.CURI_SEMANTIC_DB||'server/data/semantic-layer.sqlite',db=new DatabaseSync(filename,{readOnly:true});try{
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('SELECT count(*) n FROM resources').get().n,resources.size);assert.equal(db.prepare('SELECT count(*) n FROM context_reviews').get().n,resources.size);assert.equal(db.prepare("SELECT count(*) n FROM tags WHERE status='SOURCE_MENTION'").get().n,audit.stats.acceptedConceptTags);
assert.equal(db.prepare('SELECT count(*) n FROM source_keywords').get().n,rows.reduce((n,row)=>n+row.contentKeywords.length,0));
for(const word of db.prepare('SELECT * FROM source_keywords').all()){const item=resources.get(word.resource_id);assert.equal(word.field,'summary');assert.equal(item.summary.slice(word.start,word.end),word.quote);}
for(const tag of db.prepare("SELECT * FROM tags WHERE status='SOURCE_MENTION'").all()){const item=resources.get(tag.resource_id);assert.equal(tag.field,'summary');assert.equal(item.summary.slice(tag.start,tag.end),tag.quote);}
}finally{db.close();}
const index=getSemanticIndex(full),queries=[];for(const concept of concepts){const result=await discoverContents({q:concept.label},full,{includeCandidates:true});for(const item of result.candidates){assert.ok(item.semanticTags.some(t=>t.conceptId===concept.id),concept.label+' '+item.title);for(const t of item.semanticTags)assert.equal(t.evidence.field,'summary');}queries.push({label:concept.label,total:result.total,validatedResults:result.candidates.length,firstIds:result.results.slice(0,3).map(i=>i.id)});console.log(concept.label,result.total);}
const milk=await discoverContents({q:'우유'},full,{includeCandidates:true});assert.ok(milk.total>0);for(const item of milk.candidates)assert.ok(item.contentKeywords.some(word=>word.label==='우유'));queries.push({label:'우유(문맥 어휘)',total:milk.total,validatedResults:milk.candidates.length});
const titleSearch=await discoverContents({q:'빅오션'},full);assert.ok(titleSearch.results.some(i=>i.title.includes('심장으로 듣는 아이돌')));assert.ok(titleSearch.results.every(i=>!i.semanticTags.some(t=>t.conceptId==='heart')));
assert.deepEqual(hashes(),before);fs.writeFileSync('docs/r07-17-full-index-check.json',JSON.stringify({generatedAt:new Date().toISOString(),resources:resources.size,registeredDefinitions:concepts.length,decisionCases,keywordQuotes,queries,sourceMentions:audit.stats.acceptedConceptTags,protectedHashes:before,paidApiCalls:0,scope:'전체 행/인용/보류/SQLite 대조와 모든 등록 개념의 실제 검색 실행. 의미 정답률·영상 적합성 검증과 별도.'},null,2)+'\n');console.log('전체 색인 확인 완료');}
main().catch(e=>{console.error(e);process.exitCode=1});
