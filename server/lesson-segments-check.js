// 내 수업 화면의 실제 메시지 처리 함수를 모의 DOM·개인 저장소에서 검사한다.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const core = require('../public/segment-core');
const url = 'https://jisike.ebs.co.kr/jisike/vodReplayView?courseId=COURSE&stepId=STEP&lectId=123';
const resource = {id:'BCAST-test',title:'회차',sourceUrl:url,navigation:{url},variant:'EPISODE'};
const originalShelf=JSON.stringify([resource]),originalFolders=JSON.stringify({folders:[]});
const data=new Map([['curi.discovery.shelf.v1',originalShelf],['curi.teacher.folders.v1',originalFolders]]);
data.set('curi.teacher.extension-save.v1',JSON.stringify({notice:'내 수업 페이지에 구간이 저장되었습니다.'}));
const elements=new Map(),events=new Map(),replies=[];
const element = selector => {
  if(!elements.has(selector)) {
    const node={value:selector==='#segment-target'?'/BCAST-test':'',textContent:'',disabled:false,open:false,addEventListener(){},reset(){},showModal(){this.open=true;},close(){this.open=false;},focus(){}};
    Object.defineProperty(node,'innerHTML',{get(){return this.html||'';},set(value){this.html=value;}});
    elements.set(selector,node);
  }
  return elements.get(selector);
};
const window={addEventListener(type,fn){events.set(type,fn);},dispatchEvent(){},postMessage(value){replies.push(value);}};
const context={CuriExtensionLibrary:{list:async()=>({folders:[],libraryRevision:"fixture"})},CuriSegmentCore:core,window,document:{querySelector:element,addEventListener(){}},localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},Event:class{},location:{origin:'http://localhost:3000',search:''},URL,URLSearchParams,AbortSignal,setTimeout,clearTimeout,crypto,Date,confirm:()=>false,
 fetch:async()=>({ok:true,json:async()=>({resources:[resource]})})};
vm.createContext(context);vm.runInContext(fs.readFileSync('public/segment-store.js','utf8'),context);vm.runInContext(fs.readFileSync('public/lesson-segments.js','utf8'),context);
const cases=[];
async function request(action,value,id='request') {
  await events.get('message')({source:window,origin:context.location.origin,data:{channel:'CURI_SEGMENTS_EXTENSION',action,value,id}});
  return replies.at(-1);
}
async function main() {
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(element('#save-status').textContent,'');assert.equal(element('#lesson-segment-status').textContent,'');cases.push('이전 저장 안내를 페이지 진입 때 다시 표시하지 않음');
  const list=await request('LIST');assert.equal(list.value.targets[0].resourceId,resource.id);assert.equal(element('#segment-dialog').open,false);cases.push('내 수업 페이지에서 기존 자료 조회·편집 창은 닫힘 유지');
  const record={id:'segment-1',resourceId:resource.id,folderId:'',sourceUrl:url,variant:'EPISODE',start:0,end:5,duration:100,name:'구간',note:'메모',capture:'PLAYER'};
  const result=await request('IMPORT',{record,revision:0});assert.equal(result.value.saved,true);assert.equal(context.CuriSegments.read().records.length,1);assert.equal(element('#lesson-segment-status').textContent,'');assert.equal(element('#save-status').textContent,'');assert.match(element('#lesson-segment-items').innerHTML,/구간/);cases.push('저장 안내 없이 저장 성공·구간 목록 반영');
  await events.get('storage')({key:'curi.teacher.extension-save.v1',newValue:data.get('curi.teacher.extension-save.v1')});assert.equal(element('#save-status').textContent,'');cases.push('다른 탭의 저장 안내도 다시 표시하지 않음');
  const retry=await request('IMPORT',{record,revision:0});assert.equal(retry.value.saved,true);assert.equal(context.CuriSegments.read().records.length,1);cases.push('응답 누락 재시도의 중복 방지');
  const before=JSON.stringify(context.CuriSegments.read());const stale=await request('IMPORT',{record:{...record,name:'오래된 수정'},revision:0});assert.match(stale.error,/다른 창/);assert.equal(JSON.stringify(context.CuriSegments.read()),before);cases.push('오래된 편집의 충돌 보호');
  const wrong=await request('IMPORT',{record:{...record,id:'wrong',sourceUrl:url.replace('123','124')},revision:1});assert.match(wrong.error,/회차/);assert.equal(context.CuriSegments.read().records.length,1);cases.push('다른 회차의 저장 거절');
  assert.equal(data.get('curi.discovery.shelf.v1'),originalShelf);assert.equal(data.get('curi.teacher.folders.v1'),originalFolders);cases.push('기존 자료·수업 폴더 보존');
  assert.equal(fs.existsSync('public/segment-bookmarks.html'),false);assert.equal(fs.existsSync('public/segment-bookmarks.js'),false);cases.push('독립 북마크 화면 제거');
  fs.writeFileSync('docs/r12-07-lesson-integration-check.json',JSON.stringify({passed:cases.length,cases,fixtureOnly:true,paidApiCalls:0},null,2)+'\n');console.log(cases.length,'lesson segment integration checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
