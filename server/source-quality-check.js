const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { assessSourceText, sourceQualityStats } = require('./source-text-quality');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { discoverTeacherContents } = require('./teacher-discovery');
async function run() {
 // 이 검사는 방송 카탈로그를 읽지만 쓰지 않는다. 방송/자동 자산 DB는 다른
 // 명시적 수집·재검사 프로세스가 갱신할 수 있으므로 동시 실행 중 해시 불변을
 // 이 계약의 책임으로 두지 않는다.
 const protectedNames=['curi-store.json','semantic-layer.sqlite'];
 const before=Object.fromEntries(protectedNames.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync('server/data/'+file)).digest('hex')]));
 const cases=[];const check=(name,fn)=>{fn();cases.push({name,passed:true});};
 const samples=[['none',''],['repeated','나의 방송. 나의 방송.'],['production','기존 프로그램 <다문화 사랑>을 재구성하여 제작'],['short','나무가 자랍니다.'],['detailed','지방의회에서는 공청회나 토론회, 주민참여조례, 청소년 의회교실 등 시민 참여를 보장하는 다양한 창구를 통해 시민의 목소리에 귀 기울이고 있다. 시민이 지역의 의사결정에 참여하는 사례를 소개하고 지역의 문제를 함께 논의하는 여러 창구를 살펴본다.']];
 for(const [category,text] of samples)check(category,()=>assert.equal(assessSourceText('나의 방송',text).category,category));
 check('시청 기관·소재 제작 설명을 편성 안내로 오인하지 않음',()=>{for(const text of ['시청은 주민의 의견을 듣고 지역의 문제를 해결하는 공청회를 연다.','이 프로그램에서는 도자기를 제작하는 과정을 살펴보고 흙과 불의 관계를 설명한다.'])assert.equal(assessSourceText('제목',text).detailedMappingAllowed,true);});
 check('최소 조건과 깊이 구분',()=>{assert.equal(assessSourceText('제목','나무가 자랍니다.').detailedMappingAllowed,false);assert.equal(assessSourceText('제목','지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.').detailedMappingAllowed,true);});
 check('편성 설명 후 실제 내용 보존',()=>assert.equal(assessSourceText('제목','방송 시간은 매주 월요일입니다. '+samples[4][1]).category,'detailed'));
 const base={id:'A',title:'같은 회차',program:'합성',kind:'episode',sourceUrl:'https://www.ebs.co.kr/test',navigation:{status:'PUBLISHED',kind:'EPISODE'}};
 const catalog={resources:[{...base,summary:'',broadcastDate:'2026-01-01'},{...base,id:'B',summary:samples[4][1],broadcastDate:'2010-01-01'}],concepts:[],stats:{}};
 const find=(input)=>discoverTeacherContents(input,catalog,{verifiedAssets:[]});
 const relevance=await find({});check('같은 제목은 내용 있는 판본 우선·원문 보존',()=>{assert.equal(relevance.results[0].id,'B');assert.equal(relevance.results[0].alternatives[0].summary,'');});
 const dates=await find({sort:'newest'});check('날짜 정렬은 유지',()=>assert.equal(dates.results[0].id,'A'));
 for(const [category] of samples){const r=await find({description:category});check(`필터/배지 판정 일치 ${category}`,()=>assert.ok(r.results.every(i=>i.sourceQuality.category===category)));}
 const c=await loadDiscoveryCatalog(), baseline=JSON.parse(fs.readFileSync('docs/r07-02-quality-baseline.json'));
 for(const [file,hash] of Object.entries(before))check(`원본 보존 ${file}`,()=>assert.equal(crypto.createHash('sha256').update(fs.readFileSync('server/data/'+file)).digest('hex'),hash));
 const report={checkedAt:new Date().toISOString(),cases,baseCatalog:sourceQualityStats(c.resources),allVariants:sourceQualityStats([...c.resources,...c.searchVariants]),paidApiCalls:0};fs.writeFileSync(process.env.CURI_REPORT_PATH||'docs/r07-02-quality-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:cases.length,baseCatalog:report.baseCatalog,allVariants:report.allVariants}));
}
run().catch(e=>{console.error(e);process.exitCode=1});
