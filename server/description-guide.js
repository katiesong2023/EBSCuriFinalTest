const { cleanGuideText, guideSentences } = require('./broadcast-guide-text');

// 작성 안내는 표시용이다. 공식 소개문·검색/태그·승인 근거로 저장하지 않는다.
function metadataSentence(item) {
  const title=cleanGuideText(item.title),program=cleanGuideText(item.program);
  const kind=item.kind==='clip'?'클립':item.kind==='episode'?'회차':'자료';
  return program?`‘${program}’에서 제공하는 ‘${title}’ ${kind}입니다.`:`‘${title}’라는 제목의 ${kind}입니다.`;
}
function metadataGuide(item, { sourceIssues=[], sourceNote='' }={}) {
  return {label:'제목·프로그램 정보로 작성한 간략 안내',text:metadataSentence(item),evidence:[],
    metadataEvidence:item.title?[{field:'title',start:0,end:item.title.length,quote:item.title}]:[],
    method:'TITLE_METADATA_GUIDE',issues:[],sourceIssues,reviewNote:'',sourceNote:sourceNote||'확보한 공식 소개가 제목과 같아 보유 제목·프로그램 정보로 작성했습니다. 세부 내용·장면은 확인되지 않았습니다.'};
}
function repairGuide(item,guide) {
  if(guide.evidence.length)return {...guide,label:'공식 소개문의 확인 가능한 내용으로 보충한 안내',
    text:`${metadataSentence(item)} ${guide.text}`,method:'SOURCE_SENTENCE_RECOMPOSED',sourceIssues:guide.issues,
    issues:[],reviewNote:'',sourceNote:'공식 원문의 온전한 내용 문장으로 보충했습니다. 생략·손상된 부분의 내용은 추정하지 않았습니다.'};
  const fragments=guideSentences(item.summary).filter(s=>!s.text.includes('�'));
  const first=fragments[0];
  const text=first?.text.replace(/(?:\.{2,}|…+)\s*$/u,'').trim();
  if(text && text.length<=600)return {
    label:'짧은 공식 소개와 제목 정보로 작성한 안내',
    text:`${metadataSentence(item)} 공개 소개에는 ‘${text}’라는 단서가 제시되어 있습니다.`,
    evidence:[],metadataEvidence:[{field:'summary',start:first.start,end:first.end,quote:first.quote}],
    method:'SOURCE_FRAGMENT_GUIDE',issues:[],sourceIssues:guide.issues,reviewNote:'',
    sourceNote:'짧거나 끝부분이 생략된 공식 소개를 인용한 안내입니다. 확인되지 않은 이야기·결말·장면은 추가하지 않았습니다.'
  };
  return metadataGuide(item,{sourceIssues:guide.issues,sourceNote:'공개 소개의 확인 가능한 내용이 부족하여 보유 제목·프로그램 정보로 작성했습니다. 상세 내용은 출처에서 확인해야 합니다.'});
}
module.exports={metadataGuide,repairGuide};
