// 전체 대표·판본의 누락을 대조하고 근거 키워드 색인을 재생성한다. 원본/승인/개인 자료는 보존한다.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { getSemanticIndex } = require('./semantic-layer');
const { summaryContext } = require('./keyword-context');
const { cleanGuideText } = require('./broadcast-guide-text');
const { searchableSupplements } = require('./supplement-search');
const { buildSemanticStore } = require('./semantic-build');
const root = path.resolve(__dirname, '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceHash = item => sha(JSON.stringify([item.title, item.summary, item.sourceSupplements || []]));
const protectedPaths = ['broadcast-catalog.sqlite','curi-store.json','automatic-assets.sqlite','broadcast-semantic-search.sqlite'].map(name=>'server/data/'+name);
const codePaths = ['content-keywords.js','keyword-context.js','keyword-vocabulary.js','source-editorial.js','source-context.js','source-literal.js','semantic-pattern.js','semantic-build.js','semantic-layer.js'].map(name=>'server/'+name);
const hashes = async paths => Object.fromEntries(await Promise.all(paths.map(async name => [name,sha(await fs.readFile(path.join(root,name)))])));
function missingReason(item) {
  if (!cleanGuideText(item.summary)) return 'NO_DESCRIPTION';
  const normalize = s => cleanGuideText(s).normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'');
  if (normalize(item.summary) === normalize(item.title)) return 'TITLE_COPY';
  if (!summaryContext(item)) return 'PRODUCTION_OR_UNUSABLE_DESCRIPTION';
  return 'NO_RELIABLE_CONTENT_WORD';
}
async function main() {
  const startedAt = new Date().toISOString(), beforeHashes = await hashes([...protectedPaths,...codePaths]);
  const baseline = JSON.parse(await fs.readFile(path.join(root,'docs/r12-25-keyword-baseline.json'),'utf8'));
  const previous = new Map(baseline.rows.map(row=>[row.id,row]));
  const catalog = await loadDiscoveryCatalog();
  const items = [...new Map([...catalog.resources,...catalog.searchVariants].map(item=>[item.id,item])).values()];
  assert.equal(items.length,baseline.total);
  for(const item of items)assert.equal(sourceHash(item),previous.get(item.id)?.sourceHash,'원문 변경: '+item.id);
  console.log('원본',items.length,'자료 동일 확인');
  const index = getSemanticIndex(catalog), rows = [], missing = {}, programs = {}, lost = [];
  let beforeEmpty=0,afterEmpty=0,newlyFilled=0,newKeywordCount=0,totalKeywords=0,quoteChecks=0,fromSupplements=0;
  for(const item of items) {
    const keywords=index.get(item.id).contentKeywords, before=previous.get(item.id),wasEmpty=!before.labels.length;
    if(wasEmpty)beforeEmpty++;
    if(!keywords.length){afterEmpty++;const reason=missingReason(item);missing[reason]=(missing[reason]||0)+1;}
    if(wasEmpty&&keywords.length){newlyFilled++;newKeywordCount+=keywords.length;if(keywords.some(w=>w.evidence.field==='sourceSupplement'))fromSupplements++;}
    if(!wasEmpty&&!keywords.length)lost.push({id:item.id,title:item.title,before:before.labels});
    const stat=programs[item.program] ||= {total:0,beforeEmpty:0,afterEmpty:0,newlyFilled:0};
    stat.total++;if(wasEmpty)stat.beforeEmpty++;if(!keywords.length)stat.afterEmpty++;if(wasEmpty&&keywords.length)stat.newlyFilled++;
    for(const word of keywords){const e=word.evidence;assert.ok(['summary','sourceSupplement'].includes(e.field));const source=e.field==='summary'?item.summary:searchableSupplements(item).find(s=>s.id===e.supplementId&&s.contentHash===e.contentHash)?.text;assert.equal(typeof source,'string');assert.equal(source.slice(e.start,e.end),e.quote);assert.ok(e.quote.trim());quoteChecks++;}
    totalKeywords+=keywords.length;
    if(wasEmpty||!keywords.length)rows.push({id:item.id,title:item.title,program:item.program,sourceUrl:item.sourceUrl,beforeCount:before.labels.length,status:keywords.length?'EXTRACTED':'HELD',...(!keywords.length?{reason:missingReason(item)}:{}),keywords:keywords.map(w=>({...w,evidence:{...w.evidence,context:undefined}}))});
  }
  await fs.writeFile(path.join(root,'docs/r12-25-keyword-results.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  try { await fs.copyFile(path.join(root,'server/data/semantic-layer.sqlite'),'/private/tmp/curi-semantic-keywords-before.sqlite',require('node:fs').constants.COPYFILE_EXCL); } catch(error) { if(error.code!=='EEXIST')throw error; }
  const build=await buildSemanticStore(catalog,{reportFilename:path.join(root,'docs/r12-25-semantic-build.json')});
  const afterHashes=await hashes([...protectedPaths,...codePaths]);
  assert.deepEqual(afterHashes,beforeHashes,'추출 중 원본/보호 저장소·코드 변경');
  const report={startedAt,finishedAt:new Date().toISOString(),total:items.length,representatives:catalog.resources.length,variants:catalog.searchVariants.length,
    before:{withKeywords:items.length-beforeEmpty,empty:beforeEmpty},after:{withKeywords:items.length-afterEmpty,empty:afterEmpty},newlyFilled,newKeywordCount,totalKeywords,quoteChecks,fromSupplements,lost,missing,programs,
    sourceIdentityAndTextHashesMatched:items.length,protectedBefore:beforeHashes,protectedAfter:afterHashes,changedDuringRun:[],derivedSemanticBuild:build,
    rows:'docs/r12-25-keyword-results.jsonl',paidApiCalls:0,scope:'고정 입력 전체 대표/판본. 추출어는 원문 언급이며 의미/장면/학년/교육과정 승인 아님. 제목 복사/빈 본문에는 추정 태그를 넣지 않음.'};
  await fs.writeFile(path.join(root,'docs/r12-25-keyword-audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,programs:undefined,protectedBefore:undefined,protectedAfter:undefined,derivedSemanticBuild:undefined},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
