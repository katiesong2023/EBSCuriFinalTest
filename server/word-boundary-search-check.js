const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {matchingExpressions}=require('./discovery-query-language');
const {discoverContents}=require('./discovery-search');
const {loadDiscoveryCatalog}=require('./discovery-catalog');
const {teacherCatalog}=require('./teacher-approvals');
const {concepts}=require('./semantic-layer');
const {additionalTerms}=require('./content-keywords');
const {explainRequest}=require('./source-explanation');
const files=['curi-store.json','broadcast-catalog.sqlite','semantic-layer.sqlite','automatic-assets.sqlite'];
const hashes=()=>Object.fromEntries(files.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync('server/data/'+n)).digest('hex')]));
async function main(){
 const before=hashes(),cases=[];
 const check=(name,run)=>{run();cases.push({name,passed:true});};
 const positive=[['연소','연소를 관찰합니다'],['연소','연소하면서가 아닌 연소하는 물질'],['연소','불완전연소의 생성물'],['연소','연소반응을 관찰한다'],['산소','산소농도'],['기술','기술이다'],['김제','김제평야의 풍경'],['선거','투표를 한다'],['AI','AI systems'],['cell','cells'],['기후 변화','기후변화에 관하여'],['C++','C++ 언어']];
 const negative=[['연소','최연소 선수'],['연소','연소자 보호'],['연소','연소득 증가'],['자전','자전거 안전'],['산화','등산화와 이산화탄소'],['인도','인도네시아 여행'],['소비','채소비빔밥'],['AI','Thailand said'],['cell','cellphone'],['굴','동굴'],['별','차별'],['전기','자전기록']];
 for(const [term,text] of positive)check('유지: '+term+' / '+text,()=>assert.ok(matchingExpressions(term,text).length));
 for(const [term,text] of negative)check('차단: '+term+' / '+text,()=>assert.equal(matchingExpressions(term,text).length,0));
 const resource=(id,title,summary)=>({id,title,summary,program:'검증 프로그램',kind:'episode',sourceUrl:'https://www.ebs.co.kr/'+id,navigation:{status:'PUBLISHED',kind:'EPISODE',url:'https://www.ebs.co.kr/'+id}});
 const fixture={concepts:[],resources:[resource('FALSE','최연소 실험 참가자','어린 참가자의 도전을 소개합니다.'),resource('TRUE','연소 실험','연소를 관찰하는 실험입니다.'),resource('BOTH','최연소 실험 참가자','불완전연소의 생성물을 관찰하는 실험입니다.') ]};
 const found=await discoverContents({q:'연소'},fixture,{includeCandidates:true});
 check('실제 소개문에 연소가 있는 최연소 제목은 유지',()=>assert.deepEqual(found.candidates.map(i=>i.id).sort(),['BOTH','TRUE']));
 const excluded=await discoverContents({q:'실험 연소 제외'},fixture,{includeCandidates:true});
 check('제외 조건도 부분 문자열 대신 동일 판정',()=>assert.deepEqual(excluded.candidates.map(i=>i.id),['FALSE']));
 const both=found.candidates.find(i=>i.id==='BOTH'),explanation=explainRequest(both,{terms:['연소'],concepts:[],detailRequests:[],constraints:{}});
 check('검색 근거는 최연소 제목을 인용하지 않음',()=>{assert.ok(!explanation.text.includes('제목'));assert.ok(explanation.text.includes('불완전연소'));});
 const full=await teacherCatalog(await loadDiscoveryCatalog());
 const terms=[...new Set(['연소','AI','cell',...additionalTerms,...concepts.flatMap(c=>[c.label,...c.aliases])])];
 const byTerm=[],held=[];let comparisons=0;
 for(const term of terms){let substringRows=0,acceptedRows=0;for(const item of full.resources){comparisons++;const text=`${item.title} ${item.summary}`.normalize('NFKC').toLowerCase();if(!text.includes(term.toLowerCase()))continue;substringRows++;if(matchingExpressions(term,text).length){acceptedRows++;continue;}held.push({term,id:item.id,title:item.title,sourceUrl:item.sourceUrl,occurrences:[...new Set(text.match(new RegExp(`[\\p{L}\\p{N}]*${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[\\p{L}\\p{N}]*`,'gu'))||[])].slice(0,8)});}byTerm.push({term,substringRows,acceptedRows,blockedRows:substringRows-acceptedRows});}
 const liveQueries=[];
 for(const term of ['연소','자전','산화','인도','소비','기술','영양','김제']){const response=await discoverContents({q:term},full,{includeCandidates:true});liveQueries.push({term,total:response.total,results:response.candidates.map(i=>({id:i.id,title:i.title}))});if(term==='연소')for(const item of response.candidates)assert.ok(matchingExpressions(term,`${item.title} ${item.summary}`).length);}
 assert.deepEqual(hashes(),before);
 fs.writeFileSync('docs/r07-18-word-boundary-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),resources:full.resources.length,terms:terms.length,comparisons,substringRows:byTerm.reduce((n,r)=>n+r.substringRows,0),blockedRows:held.length,byTerm,held,liveQueries,cases,passed:cases.length,protectedHashes:before,paidApiCalls:0,scope:'전체 자료 × 기존 교육 어휘의 문자 경계 감사. blocked는 의미 오류 확정이 아닌 부분 일치 보류. 모델 의미 판정은 포함하지 않음.'},null,2)+'\n');
 console.log(JSON.stringify({resources:full.resources.length,terms:terms.length,comparisons,blockedRows:held.length,passed:cases.length,liveQueries:liveQueries.map(({term,total})=>({term,total}))}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
