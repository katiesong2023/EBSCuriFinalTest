// 기존 200/170 원문을 실제 교사 검색으로 재실행한다. 입력의 기대 주제/유형은 주입하지 않는다.
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const fsSync = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
// 다른 작업의 디스크 변경이 실행 중인 평가 엔진에 섞이지 않도록 이 프로세스의 JS를 고정한다.
const snapshot = new Map(fsSync.readdirSync(__dirname).filter(n=>n.endsWith('.js')).map(n=>{const p=path.join(__dirname,n);return [p,fsSync.readFileSync(p,'utf8')];}));
const originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = (module, filename) => snapshot.has(filename) ? module._compile(snapshot.get(filename),filename) : originalLoader(module,filename);
const { discoverTeacherContents } = require('./teacher-discovery');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
async function main() {
  const stage = process.argv[2] || 'final';
  if(!/^[a-z][a-z0-9-]{0,30}$/.test(stage)) throw Error('실행 이름을 확인하세요.');
  const output = `docs/r12-39-existing370-${stage}.json`;
  try { await fs.access(output); throw Error('고정 결과를 덮어쓸 수 없습니다.'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  const inputPaths = ['docs/r12-search-test-200-input.json','docs/r12-03-common-stable170.json'];
  const inputs = await Promise.all(inputPaths.map(async p => {const b=await fs.readFile(p);return {path:p,sha256:sha(b),data:JSON.parse(b)};}));
  const rows = [...inputs[0].data.rows.map(r=>({...r,set:'new200'})),...inputs[1].data.rows.map(r=>({...r.request,set:'previous170'}))];
  const paths = ['server/data/broadcast-catalog.sqlite','server/data/semantic-layer.sqlite','server/data/automatic-assets.sqlite','server/data/broadcast-semantic-search.sqlite','server/data/curi-store.json',...(await fs.readdir('server')).filter(n=>n.endsWith('.js')).map(n=>'server/'+n)];
  const hashes = async () => Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await fs.readFile(p))])));
  const before = await hashes(), startedAt = new Date().toISOString(), catalog = await loadDiscoveryCatalog(), results = [];
  let peakHeapBytes = 0;
  for (const request of rows) {
    const started = performance.now();
    try {
      const api = await discoverTeacherContents({q:request.query,workspace:'teacher'},catalog);
      results.push({set:request.set,id:request.id,query:request.query,total:api.total,terms:api.terms,retrieval:api.retrieval,latencyMs:Math.round(performance.now()-started),projection:api.understanding.requestProjection,emptyReason:api.emptyReason,
        top5:api.results.slice(0,5).map(r=>({id:r.id,title:r.title,program:r.program,summary:r.summary,sourceUrl:r.sourceUrl,searchExplanation:r.searchExplanation}))});
    } catch(e) {results.push({set:request.set,id:request.id,query:request.query,error:e.message});}
    peakHeapBytes=Math.max(peakHeapBytes,process.memoryUsage().heapUsed);
    if(results.length%20===0) {
      const memory=process.memoryUsage();
      await fs.writeFile('/private/tmp/r12-39-'+stage+'-checkpoint.json',JSON.stringify({completed:results.length,heapUsed:memory.heapUsed,rows:results}));
      console.log(results.length+'/370','heapMB',Math.round(memory.heapUsed/1024/1024));
    }
  }
  const reproduction = [];
  for(const q of ['자본주의','자본주의 초등학생 교육용 자료','초등학생 교육용 자료']) {const r=await discoverTeacherContents({q},catalog);reproduction.push({query:q,total:r.total,terms:r.terms,emptyReason:r.emptyReason,topIds:r.results.map(x=>x.id),projection:r.understanding.requestProjection});}
  const after = await hashes();
  const counts = Object.fromEntries(['new200','previous170'].map(set=>{const r=results.filter(x=>x.set===set);return [set,{inputs:r.length,nonempty:r.filter(x=>x.total>0).length,empty:r.filter(x=>x.total===0).length,errors:r.filter(x=>x.error).length}];}));
  const report = {startedAt,finishedAt:new Date().toISOString(),inputHashes:inputs.map(({path,sha256})=>({path,sha256})),sourceCatalogCount:catalog.resources.length,counts,reproduction,peakHeapMB:Math.round(peakHeapBytes/1024/1024),
    runtimeSourceHashes:Object.fromEntries([...snapshot].map(([p,source])=>[path.relative(process.cwd(),p),sha(source)])),before,after,changedFiles:paths.filter(p=>before[p]!==after[p]),paidApiCalls:0,scope:'기존370 원문 검색 실행',rows:results};
  report.scope='기존370 원문으로 실제 교사 검색 내부 함수 실행. 건수는 정답률이 아니며 영상·학년 적합성은 미검증. 새 성공 표본 추가 없이 원래 입력 고정. 과거 실행과 엔진/원천 판본이 달라 직접 개선율을 계산하지 않음.';
  report.reproductionInvariant = reproduction[0].total > 0 && reproduction[0].total === reproduction[1].total && JSON.stringify(reproduction[0].topIds) === JSON.stringify(reproduction[1].topIds) && reproduction[2].emptyReason === 'TOPIC_REQUIRED';
  await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  if(!report.reproductionInvariant || results.some(row=>row.error)) process.exitCode=1;
  console.log(JSON.stringify({counts,reproduction,changedFiles:report.changedFiles}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
