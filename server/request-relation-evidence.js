const { literalText } = require('./source-literal');
const { sourceSentences } = require('./source-explanation');
// 원문에 관계 설명 단서가 있는지 보수적으로 구분한다. 승인·실제 영상 확인으로 승격하지 않는다.
function requestRelationEvidence(item, request, selected=[]) {
  const original=request.naturalLanguage?.original || request.positiveQuery;
  const landform=/지형/.test(original) && (selected.some(c=>c.id==='volcano') || (request.concepts || []).some(c=>c.id==='volcano'));
  if(!landform)return {rank:0,status:'NOT_EVALUATED',evidence:[],unconfirmed:[]};
  const sentences=sourceSentences(item.summary);
  const direct=sentences.filter(s=>/화산\s*지형|화산섬|분화구|용암\s*대지|용암\s*동굴/.test(literalText(s.quote)));
  const formation=/형성|만들어진|만든|만들어/.test(original);
  const features=/특징/.test(original);
  const relation=sentences.filter(s=>{
    if(formation)return /(?:화산\s*활동|분출(?:한|된)?\s*용암|용암)(?:이|의|으로|에\s*의해)[^.!?,，;]{0,65}(?:만들|형성|굳|쌓)[^.!?,，;]{0,45}(?:지형|동굴|대지|분화구|바위|현무암)|(?:지형|동굴|대지|현무암)[^.!?,，;]{0,45}(?:화산\s*활동|용암)[^.!?,，;]{0,30}(?:만들|형성|굳)/u.test(literalText(s.quote));
    if(features)return /(?:화산\s*지형|화산섬|분화구|용암\s*(?:동굴|대지))[^.!?,，;]{0,60}(?:특징|구조|모양|층|현무암|구성)|(?:현무암|층|구조)[^.!?,，;]{0,60}화산\s*지형/u.test(literalText(s.quote));
    return direct.some(d=>d.start===s.start);
  });
  const status=relation.length && (formation||features)?'RELATION_TEXT_CUE':direct.length?'DIRECT_TOPIC_MENTION':'ADJACENT_TOPIC_ONLY';
  return {rank:status==='RELATION_TEXT_CUE'?3:status==='DIRECT_TOPIC_MENTION'?2:1,status,
    label:status==='RELATION_TEXT_CUE'?'요청 관계의 원문 설명 단서':status==='DIRECT_TOPIC_MENTION'?'화산 지형 직접 언급 · 관계 설명 미확인':'화산 소재의 주변 내용 · 지형 설명 미확인',
    evidence:(relation.length?relation:direct).slice(0,3),
    unconfirmed:status==='RELATION_TEXT_CUE'?['원문 설명 단서이며 영상의 설명 깊이·수업 적합성은 별도 확인']:['요청한 지형의 특징·형성 설명은 이 원문에서 확인하지 못했습니다.']};
}
module.exports={requestRelationEvidence};
