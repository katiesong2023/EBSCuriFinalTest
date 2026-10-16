// 소개문과 분리하여 회차·판본·해시를 대조한 공식 보조 원문만 검색에 사용한다.
const {validSupplement}=require('./source-supplements');
function supplementSearchStatus(record,identity){
 if(!validSupplement(record,identity))return {eligible:false,reason:'INVALID_STORED_IDENTITY'};
 const clean=value=>String(value||'').normalize('NFKC').replace(/^(?:(?:자막|수어|재방송|EBS)\s*)+/u,'').replace(/\((?:자막|수어(?:방송)?|재방송|HD|UHD)\)\s*$/u,'').replace(/[\s\p{P}\p{S}]/gu,'');
 const title=clean(identity.title),program=clean(identity.program);
 const generic=!title||/^(?:null|undefined|제목없음|미정|기타|특집|재방송|다시보기|프로그램|회차|방송)$/iu.test(title)||title===program||title.startsWith(program)&&/^\d+(?:회|부)?$/u.test(title.slice(program.length));
 if(!generic)return {eligible:true,reason:'DISTINCT_EPISODE_TITLE'};
 // 프로그램명만 반복한 제목에는 게시 전후 며칠이라는 근접성만으로 다른 회차를 연결하지 않는다.
 try{const url=new URL(identity.sourceUrl);if(record.sourceUrl===identity.sourceUrl&&['lectId','lectid','clipId','vodId'].some(k=>url.searchParams.has(k)))return {eligible:true,reason:'EXACT_EPISODE_PAGE'};}catch{}
 const date=String(identity.broadcastDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/u);
 if(date){
  const markers=[...record.text.matchAll(/방송일시|방송\s*일자|방송\s*시간|\*\s*방송/gu)];
  const expected=new RegExp(`${Number(date[1])}년\\s*${Number(date[2])}월\\s*${Number(date[3])}일`,'u');
  if(markers.some(m=>expected.test(record.text.slice(m.index,m.index+160))))return {eligible:true,reason:'EXACT_ANNOUNCED_BROADCAST_DATE'};
 }
 return {eligible:false,reason:'PROGRAM_TITLE_ONLY_EPISODE_UNCONFIRMED'};
}
function searchableSupplements(item){
 const identity={resourceId:item.id,title:item.title,program:item.program,broadcastDate:item.broadcastDate,variant:item.variant,sourceUrl:item.sourceUrl};
 return (item.sourceSupplements||[]).filter(record=>supplementSearchStatus(record,identity).eligible);
}
const supplementText=item=>searchableSupplements(item).map(record=>record.text).join('\n');
module.exports={searchableSupplements,supplementText,supplementSearchStatus};
