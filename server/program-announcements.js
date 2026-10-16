// 공개 회차가 없는 프로그램은 공식 발표 자료로 표시하며 회차/재생으로 꾸미지 않는다.
const crypto = require('node:crypto');
function programAnnouncements(registry) {
  return (registry.programs || []).filter(p => p.publicationStatus === 'ANNOUNCED_NO_PUBLIC_EPISODES' && p.announcement?.text).flatMap(p => {
    let url; try { url = new URL(p.announcement.sourceUrl); } catch { return []; }
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !/(^|\.)ebs\.co\.kr$/.test(url.hostname)) return [];
    return [{ id: 'PROGRAM-' + crypto.createHash('sha256').update(url.href).digest('hex').slice(0,20), kind:'collection',
      title:p.name+' · 공개 회차 준비 중',program:p.name,summary:p.announcement.text,sourceSystem:'EBS_PROGRAM_ANNOUNCEMENT',
      sourceUrl:url.href,evidenceUrl:url.href,evidenceLevel:'SOURCE_DESCRIPTION',evidenceLabel:'EBS 공식 프로그램 발표 · 공개 회차 미확인',
      checkedAt:p.announcement.checkedAt,announcedPremiereDate:p.announcement.premiereDate,publicationStatus:p.publicationStatus,
      curriculumStatus:'NOT_ASSESSED',playbackStatus:'NOT_AVAILABLE',broadcastDate:null,
      navigation:{url:url.href,kind:'ANNOUNCEMENT',status:'PUBLISHED',label:'EBS 공식 프로그램 발표 보기',note:'방송 영상이 아닌 공식 프로그램 발표입니다.'},
      limitation:'공식 발표를 등록한 프로그램 정보입니다. 실제 공개 회차·재생·수업 적합성은 확인되지 않았습니다.' }];
  });
}
module.exports = { programAnnouncements };
