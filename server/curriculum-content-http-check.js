const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {createAdminBrowserFixture}=require('./admin-browser-fixture');
(async()=>{
 const fixture=await createAdminBrowserFixture(),cases=[];
 try{
  const endpoint=fixture.base+'/api/curi/curriculum/related';
  const post=(body,suffix='')=>fetch(endpoint+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const summary='제작 배경을 소개합니다. '.repeat(80)+'이주 배경 학생들이 서로의 문화를 존중한다.';
  let response=await post({title:'함께 배우는 교실',summary,searchQuery:'다문화'});assert.equal(response.status,200);
  const data=await response.json();assert.ok(data.related.some(x=>x.id==='4사03-02'));assert.ok(data.related.every(x=>x.id!=='9사(지리)02-02'));
  const evidence=data.related.find(x=>x.id==='4사03-02').evidence;assert.ok(evidence.some(e=>e.start>200));for(const e of evidence)assert.equal(({title:'함께 배우는 교실',summary})[e.field].slice(e.start,e.end),e.quote);
  cases.push('소개문 전체 POST·200자 뒤 의미·원문 위치');
  response=await fetch(endpoint+'?q='+encodeURIComponent('독립운동'));assert.equal(response.status,200);assert.ok((await response.json()).related.some(x=>x.id==='6사06-01'));
  cases.push('기존 GET·동의 표현 연결 호환');
  for(const body of [null,[],{summary:7},{title:'x'.repeat(2001)},{summary:'x'.repeat(200001)},{title:'다문화',q:'다문화'},{title:'다문화',unknown:1}])assert.equal((await post(body)).status,400);
  cases.push('잘못된 본문·길이·혼합 조건 400');
  response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(response.status,400);
  assert.equal((await post({title:'다문화'},'?q=다문화')).status,400);
  for(const params of ['q=a&q=b','searchQuery=a&searchQuery=b','q='+'x'.repeat(201)])assert.equal((await fetch(endpoint+'?'+params)).status,400);
  cases.push('JSON 오류·주소/본문 혼합·중복 조건 차단');
  assert.equal(data.paidApiCalls,0);
  await fs.writeFile('docs/r12-34-content-http-check.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:cases.length,cases,paidApiCalls:0},null,2)+'\n');
  console.log(cases.length,'전체 내용 HTTP 검증 통과');
 }finally{await fixture.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
