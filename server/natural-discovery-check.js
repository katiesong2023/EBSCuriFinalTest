const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {loadDiscoveryCatalog}=require('./discovery-catalog');
const {discoverTeacherContents}=require('./teacher-discovery');
const {discoverContents}=require('./discovery-search');
const {indexFile,sourceKey}=require('./broadcast-semantic-index');
const {parseDiscoveryIntent}=require('./discovery-intent');
async function main(){
 const inputs=JSON.parse(await fs.readFile('docs/r07-19-evaluation-inputs.json','utf8'));
 const cases=[],check=async(name,fn)=>{await fn();cases.push(name);};
 await check('120요청·6구간20개·개발80/최종40 분리',async()=>{
  assert.equal(inputs.rows.length,120);assert.equal(inputs.rows.filter(r=>r.split==='final').length,40);
  for(const grade of ['초3~4','초5~6','중1 참고'])for(const subject of ['사회','과학'])assert.equal(inputs.rows.filter(r=>r.grade===grade&&r.subject===subject).length,20);
 });
 await check('알려주/설명해주 분리·조건 관계 보존',async()=>{
  const r=parseDiscoveryIntent('연소에 필요한 조건을 설명해주는 영상');assert.deepEqual(r.terms,['연소']);assert.ok(r.naturalLanguage.relations.some(x=>x.label==='필요 조건'));
 });
 await check('미지 고유명·명시 AND·제외 보존',async()=>{
  const r=parseDiscoveryIntent('연소와 블루드래곤가상물질을 모두 설명해주는 영상 산소 제외');assert.ok(r.terms.includes('블루드래곤가상물질'));assert.ok(r.naturalLanguage.explicitConjunction);assert.ok(r.excluded.includes('산소'));assert.ok(!r.terms.includes('모두'));assert.ok(parseDiscoveryIntent('설명해주는바위 영상').terms.includes('설명해주는바위'));assert.ok(parseDiscoveryIntent('까닭새를 알려주는 영상').terms.includes('까닭새'));
 });
 await check('기존 문화 공존 표현 확장 보존',async()=>assert.ok(parseDiscoveryIntent('서로 다른 문화의 사람들이 함께 살아가는 사례').concepts.some(c=>c.label==='다문화')));
 const catalog=await loadDiscoveryCatalog(),all=[...catalog.resources,...catalog.searchVariants],byId=new Map(all.map(x=>[x.id,x]));
 let passages;
 await check('전체 의미 색인의 회차 지문·원문 위치·벡터 전수 검사',async()=>{
  const db=new DatabaseSync(indexFile,{readOnly:true});try{
   const rows=db.prepare('SELECT * FROM passages').all();passages=rows.length;
   for(const row of rows){const item=byId.get(row.resource_id);assert.ok(item);assert.equal(sourceKey(item),row.source_key);assert.equal(item[row.field].slice(row.start,row.end),row.quote);assert.equal(row.vector.byteLength,384*4);const vector=new Float32Array(row.vector.buffer.slice(row.vector.byteOffset,row.vector.byteOffset+row.vector.byteLength));assert.ok([...vector].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...vector)-1)<0.01);}
   assert.equal(new Set(rows.map(r=>r.resource_id)).size,byId.size);
  }finally{db.close();}
 });
 for(const q of ['연소에 필요한 조건을 설명해주는 영상','물질이 타려면 무엇이 필요한지 알려주는 영상','낮과 밤이 생기는 까닭을 알려주는 영상','이주민과 주민이 서로 이해하며 살아가는 모습을 보여주는 자료'])await check('실제 요청 후보·원문 인용: '+q,async()=>{
  const r=await discoverTeacherContents({q},catalog);assert.ok(r.total>0);assert.equal(r.retrieval.semantic,'LOCAL_E5');
  for(const item of r.results){for(const quote of item.searchExplanation.topicEvidence)assert.equal(item.summary.slice(quote.start,quote.end),quote.quote);assert.ok(item.searchExplanation.unconfirmed.length);}
 });
 await check('자전/연소 부분 문자열 유입 방지',async()=>{
  for(const q of ['연소','자전']){const r=await discoverTeacherContents({q},catalog);assert.ok(r.results.every(x=>q==='연소'?!/최연소/.test(x.title)||/연소/.test(x.summary):!/자전거/.test(x.title)));}
 });
 await check('민감 일반어24개의 기존 문맥 조건을 의미 경로에서도 보존',async()=>{
  for(const term of require('./keyword-context').contextSensitiveTerms){
   const [keyword,hybrid]=await Promise.all([discoverContents({q:term+'을 설명해주는 영상'},catalog,{includeCandidates:true,useSemantic:false}),discoverContents({q:term+'을 설명해주는 영상'},catalog,{includeCandidates:true})]);
   assert.deepEqual(hybrid.candidates.map(x=>x.id).sort(),keyword.candidates.map(x=>x.id).sort());
  }
 });
 await check('미지 내용어의 정당한 빈 결과·자동 조건 완화 없음',async()=>assert.equal((await discoverTeacherContents({q:'연소와 블루드래곤가상물질을 모두 설명해주는 영상'},catalog)).total,0));
 await check('제외·프로그램·형태 조건',async()=>{
  const q='지구 자전을 설명해주는 다큐프라임 영상';const r=await discoverTeacherContents({q},catalog);assert.ok(r.results.every(x=>x.program==='다큐프라임'));
  const forms=await discoverTeacherContents({q:'생태계를 설명해주는 다큐멘터리'},catalog);assert.ok(forms.results.every(x=>x.genreEvidence.some(y=>y.label==='다큐멘터리')));
  const excluded=await discoverTeacherContents({q:'연소를 설명해주는 영상 다큐프라임 제외'},catalog);assert.ok(excluded.results.every(x=>x.program!=='다큐프라임'));
 });
 await check('기준 결합·유형·페이지·방송일 정렬',async()=>{
  const r=await discoverTeacherContents({q:'지구 자전을 설명해주는 영상',standard:'6과12-02',sort:'newest',kind:'episode',page:'1'},catalog);assert.equal(r.searchMode,'COMBINED');assert.ok(r.results.every(x=>x.selectedStandard.standardId==='6과12-02'&&x.kind==='episode'));
 });
 await check('색인 미연결 fixture의 로컬 fallback',async()=>{
  const fixture={version:'natural-test',resources:[{id:'fixture',title:'연소',summary:'연소를 관찰하고 원리를 설명하는 실험 자료입니다.',kind:'episode',program:'합성',sourceUrl:'https://www.ebs.co.kr/fixture'}],concepts:[],stats:{}};
  const r=await discoverContents({q:'연소를 설명해주는 영상'},fixture);assert.equal(r.retrieval.semantic,'INDEX_UNAVAILABLE');assert.equal(r.total,1);
 });
 await check('원본4저장소 SHA 보존',async()=>{for(const [file,expected]of Object.entries(inputs.sourceHashes))assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),expected);});
 await fs.writeFile('docs/r07-19-natural-discovery-check.json',JSON.stringify({generatedAt:new Date().toISOString(),cases,passages,paidApiCalls:0},null,2)+'\n');console.log(cases.length,'contracts passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
