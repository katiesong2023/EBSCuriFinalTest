const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../public/segment-core');
function page({url,title='EBS 프로그램',video=false,iframe=false,declaration='',anchors=[]}) {
 const document={title,scripts:declaration?[{src:'',textContent:declaration}]:[],querySelector:s=>s.includes('og:title')?{content:title}:null,querySelectorAll:s=>s==='video'?(video?[{duration:100}]:[]):s==='iframe[src]'?(iframe?[{src:'https://www.youtube.com/embed/public-id'}]:[]):s==='a[href]'?anchors.map(href=>({href})):[]};
 const context={document,location:{href:url},CuriSegmentCore:core,URL,chrome:{runtime:{onMessage:{addListener(){}}}}};vm.createContext(context);vm.runInContext(fs.readFileSync('extensions/curi-segments/source-reader.js','utf8'),context);return context.CuriSourceReader.metadata();
}
const cases=[];
const program=page({url:'https://home.ebs.co.kr/hana/main?token=secret'});assert.equal(program.kind,'collection');assert.equal(program.duration,null);assert.equal(program.sourceUrl.includes('token'),false);cases.push('특정 프로그램 제한 없는 EBS 공개 프로그램 정보·재생 전 메타데이터');
const tv=page({url:'https://www.ebs.co.kr/tv/show?prodId=123&lectId=456',title:'TV 회차',video:true});assert.equal(tv.kind,'episode');assert.equal(tv.duration,100);cases.push('일반 EBS TV 회차·HTML5 메타데이터');
const embedded=page({url:'https://home.ebs.co.kr/program/episode/456',iframe:true});assert.equal(embedded.kind,'episode');assert.equal(embedded.duration,null);cases.push('임베디드 영상은 자동 접근 불가 시에도 회차 링크·직접 시간 저장 지원');
const declared=page({url:'https://www.ebs.co.kr/tv/show?prodId=123&lectId=456',video:true,declaration:'var vodCommonIDs={courseId:"C",stepId:"S",lectId:"456"};'});assert.equal(declared.identity,'C:S:456');cases.push('일반 TV 주소에서 공개 플레이어 회차 ID 보완');
const selected=page({url:'https://home.ebs.co.kr/program/main',video:true,declaration:'var vodCommonIDs={courseId:"C",stepId:"S",lectId:"456"};',anchors:['https://home.ebs.co.kr/program/vodReplayView?courseId=C&stepId=S&lectId=456']});assert.equal(selected.identity,'C:S:456');cases.push('프로그램 페이지에서 실제 재생 중 회차의 공개 링크 연결');
for(const url of ['https://sso.ebs.co.kr/login','https://www.ebs.co.kr/mypage/main','https://www.ebs.co.kr/member/login','https://ebs.co.kr.evil.test/tv/show'])assert.throws(()=>page({url}));cases.push('로그인·개인정보 페이지·유사 도메인 수집 차단');
fs.writeFileSync('docs/r12-08-source-check.json',JSON.stringify({passed:cases.length,cases,fixtureOnly:true},null,2)+'\n');console.log(cases.length,'extension source checks passed');
