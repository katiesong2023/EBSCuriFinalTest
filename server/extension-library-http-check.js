const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const net = require('node:net');
async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'curi-library-http-'));
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT:String(port), CURI_ALLOW_PAID_API:'false', CURI_TEACHER_RESOURCE_PATH:path.join(temp,'library.sqlite') }, stdio:'ignore' });
  const cases = [];
  try {
    let ready=false;
    for (let i=0;i<60;i++) { try { if ((await fetch(origin+'/lesson.html')).ok) { ready=true;break; } } catch {} await new Promise(resolve=>setTimeout(resolve,100)); }
    assert(ready);
    const route=origin+'/api/curibase/teacher-resources';
    const video={sourceUrl:'https://jisike.ebs.co.kr/jisike/vodReplayView?courseId=COURSE&stepId=STEP&lectId=887766',title:'확장등록검색표본',summary:'등록 이후 재사용 검색을 확인하는 표본입니다.',duration:50};
    const post=(value=video,from=origin)=>fetch(route,{method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify(value)});
    assert.equal((await post(video,'https://evil.test')).status,403);assert.equal((await fetch(route)).status,405);cases.push('다른 Origin 등록/조회 쓰기 경계 차단');
    assert.equal((await post({...video,sourceUrl:'http://localhost/private'})).status,400);cases.push('잘못된 영상 URL 저장 거절');
    const response=await post();assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.stored,true);cases.push('인증 승격 없이 같은 로컬 교사 페이지의 명시 등록 성공');
    const retry=await (await post()).json();assert.equal(retry.alreadyStored,true);assert.equal(retry.resource.id,saved.resource.id);cases.push('HTTP 재시도 동일 회차 ID 재사용');
    const resources=await (await fetch(origin+'/api/curi/discover/resources?ids='+saved.resource.id)).json();assert.equal(resources.resources[0].title,video.title);assert.equal(resources.resources[0].curriculumStatus,'NOT_ASSESSED');cases.push('현재 자료 재조회·교육과정 미승인 유지');
    const search=await (await fetch(origin+'/api/curi/discover?workspace=teacher&q='+encodeURIComponent(video.title))).json();assert(search.results?.some(r=>r.id===saved.resource.id));cases.push('실제 교사 검색 API에서 신규 영상 발견');
    const docu=await (await post({...video,title:'다큐등록검색표본',sourceUrl:'https://docuprime.ebs.co.kr/docuprime/vodReplayView?courseId=COURSE&stepId=STEP&lectId=887767'})).json();
    assert.equal(docu.resource.program,'다큐프라임');
    const docuSearch=await (await fetch(origin+'/api/curi/discover?workspace=teacher&q='+encodeURIComponent('다큐등록검색표본'))).json();assert(docuSearch.results.some(r=>r.id===docu.resource.id));cases.push('다큐프라임 등록·실제 교사 검색 반영');
    const program=await (await post({title:'확장프로그램검색표본',summary:'공개 프로그램 소개',sourceUrl:'https://home.ebs.co.kr/hana/main',duration:null,kind:'collection',program:'하나뿐인 지구'})).json();assert.equal(program.resource.kind,'collection');
    const programSearch=await (await fetch(origin+'/api/curi/discover?workspace=teacher&q='+encodeURIComponent('확장프로그램검색표본'))).json();assert(programSearch.results.some(r=>r.id===program.resource.id && r.kind==='collection'));cases.push('공개 프로그램 등록·프로그램 유형 유지·교사 전체 검색 반영');
    assert.equal((await fetch(origin+'/api/curibase/verified')).status,401);cases.push('기존 CuriBase 사람 승인 경로 인증 유지');
    fs.writeFileSync('docs/r12-08-library-http-check.json',JSON.stringify({passed:cases.length,cases,isolatedData:true,paidApiCalls:0},null,2)+'\n');console.log(cases.length,'extension library HTTP checks passed');
  } finally { child.kill('SIGTERM'); await new Promise(resolve=>child.once('exit',resolve)); fs.rmSync(temp,{recursive:true,force:true}); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
