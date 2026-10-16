const { matchingLiteralExpressions: matchingExpressions, literalSource } = require("./source-literal");
const { metadataGuide, repairGuide } = require('./description-guide');
const { assessSourceText } = require('./source-text-quality');
const { cleanGuideText, guideSentences, guideIssues } = require('./broadcast-guide-text');
// 표시용 가공과 관계 인용 모두 원문 오프셋을 보존한다. HTML은 실행하지 않는다.
function sourceSentences(value, field = 'summary') {
 const raw=String(value||'');
 const indexed=raw.replace(/<[^>]*>/g,tag=>'\n'+' '.repeat(tag.length-1));
 return [...indexed.matchAll(/[^.!?。\n]+[.!?。]?/gu)].map(match=>{
  const start=match.index+match[0].length-match[0].trimStart().length;
  const end=match.index+match[0].trimEnd().length;
  return {field,start,end,quote:raw.slice(start,end)};
 }).filter(s=>s.quote.trim());
}
function contentGuide(item, keywords=[]) {
 const quality=assessSourceText(cleanGuideText(item.title),cleanGuideText(item.summary));
 if(quality.category!=='detailed') {
  const {searchableSupplements}=require('./supplement-search');
  const supplement=searchableSupplements(item).filter(s=>assessSourceText(item.title,s.text).category==='detailed')
   .sort((a,b)=>b.text.length-a.text.length)[0];
  if(supplement) {
   const guide=contentGuide({...item,summary:supplement.text,sourceSupplements:[]},keywords);
   return {...guide,label:'방송 내용 안내 · 공식 보조 설명',method:'OFFICIAL_SUPPLEMENT_EXTRACT',
    sourceNote:`${supplement.label}에서 해당 회차를 확인해 보충했습니다. 기존 소개문과 구분한 설명입니다.`,
    evidence:guide.evidence.map(e=>({...e,field:'sourceSupplement',supplementId:supplement.id,sourceUrl:supplement.sourceUrl}))};
  }
 }
 const issues=guideIssues(item.summary);
 const sentences=guideSentences(item.summary).filter(s=>s.text.length>=6 && !guideIssues(s.text).length &&
  !/^(?:자세한|더 많은)\s*(?:정보|내용)|^(?:본 방송|재방송|방송 시간|방영 일정|시청 바랍니다|많은 관심|많은 사랑)/.test(s.text));
 if(quality.category==='repeated')return metadataGuide(item,{sourceIssues:issues,...(item.navigation?.status==='MISMATCH'?{sourceNote:'공식 상세 페이지의 회차 정보가 보유 제목과 일치하지 않아 제목·프로그램 정보로 작성했습니다. 상세 내용은 확인되지 않았습니다.'}:{})});
 if(quality.category==='production')return metadataGuide(item,{sourceIssues:issues,sourceNote:'공개 소개가 편성·제작 안내 중심이어서 제목·프로그램 정보로 작성했습니다. 세부 내용·장면은 확인되지 않았습니다.'});
 if(!quality.detailedMappingAllowed && quality.category!=='short')return {label:'방송 내용 안내 · 원문 부족',text:quality.message,evidence:[],method:'SOURCE_LIMITATION'};
 const ranked=sentences.map((s,index)=>({...s,index,score:Math.min(keywords.filter(k=>s.text.includes(k)).length*2,4)+
  (/소개|살펴|알아|설명|관찰|비교|과정|기록|현장|도전|취재|다룬|함께|찾아|만난/.test(s.text)?3:0)+
  (/원리|구조|제작|생산|가공|조업|조리|재배|사냥|실험|보존|방혈|정치망|가두리|작업|역사/.test(s.text)?5:0)-
  (/^(벌써|어느덧|안녕하세요)|^시간이 빨라도/.test(s.text)?8:0)-(/[?？]$/.test(s.text)?2:0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
 // 짧은 소개는 최대3문장까지 보존하고, 긴 소개도 문장 중간에서 자르지 않는다.
 const conclusion=sentences.at(-1);
 const includeConclusion=sentences.length>3 && /결국|가능성|한계|의미|문제.*제기|되묻|모색|돌아보/.test(conclusion.text);
 const selected=ranked.filter(s=>s.score>=0 && (!includeConclusion||s.start!==conclusion.start)).slice(0,includeConclusion?2:3);
 if(includeConclusion)selected.push(conclusion);
 const evidence=selected.sort((a,b)=>a.start-b.start).map(({index,score,text,...s})=>s);
 const text=evidence.map(s=>cleanGuideText(s.quote)).join(' ');
 const reviewNote=issues.length?'소개문에 문장 잘림 또는 문자 오류가 의심됩니다. 빠진 내용은 출처에서 확인해 주세요.':
  !text?'소개문에서 온전한 내용 문장을 확보하지 못했습니다. 출처 확인이 필요합니다.':'';
 const guide = {label:quality.detailedMappingAllowed?'방송 내용 안내 · 공개 소개문에서 구성':'방송 내용 안내 · 짧은 공개 소개문',text:text||reviewNote,evidence,method:'SOURCE_SENTENCE_SELECTION',issues,reviewNote,
  note:'서비스가 공개 소개문에서 내용 문장을 골라 구성했습니다. 소개문의 시점·주장과 실제 영상 확인은 구분합니다.'};
 return guide.reviewNote ? item.navigation?.status==='MISMATCH' ? metadataGuide(item,{sourceIssues:issues,sourceNote:'공식 상세 페이지의 회차 정보가 보유 제목과 일치하지 않아 제목·프로그램 정보로 작성했습니다. 상세 내용은 확인되지 않았습니다.'}) : repairGuide(item,guide) : guide;
}
function explainRequest(item, request={}) {
 const relevant=(item.semanticTags||[]).filter(t=>request.concepts?.some(c=>c.id===t.conceptId));
 const words=[...new Set([...relevant.map(t=>t.evidence.quote),...(request.alternativeGroups||[]).flatMap(g=>g.flatMap(x=>x.terms||[])),...(request.terms||[]).flatMap(term=>matchingExpressions(term,`${literalSource(item).title} ${literalSource(item).summary}`))])];
 const sentences=sourceSentences(item.summary);
 const meaningMatches=item.meaningMatches||[];
 const meaningEvidence=meaningMatches.flatMap(match=>match.evidence).filter(e=>e.field!=='sourceSupplement');
 const directEvidence=item.relevanceEvidence ? [...item.relevanceEvidence.topicEvidence] : sentences.filter(s=>words.some(w=>matchingExpressions(w,s.quote).length > 0)).slice(0,3);
 const topicEvidence=[...new Map([...meaningEvidence,...directEvidence].map(e=>[`${e.field}:${e.start}:${e.end}`,e])).values()].slice(0,3);
 const semanticQuote=item.semanticRetrieval?.evidence;
 const semanticEvidence=semanticQuote?.field==='summary' && item.summary.slice(semanticQuote.start,semanticQuote.end)===semanticQuote.quote ? [semanticQuote] : [];
 if(!topicEvidence.length && semanticEvidence.length)topicEvidence.push(...semanticEvidence);
 const { searchableSupplements } = require('./supplement-search');
 const directSupplementEvidence=searchableSupplements(item).flatMap(supplement=>sourceSentences(supplement.text,'sourceSupplement')
  .filter(sentence=>[...words,...(request.terms||[])].some(word=>matchingExpressions(word,sentence.quote).length>0))
  .sort((a,b)=>{const score=sentence=>(/관찰|비교|원리|만들|붙|밀어|끌|녹|증발|해결|과정/.test(sentence.quote)?3:0)+(/안\s*붙|붙지|같은|다른|때문/.test(sentence.quote)?2:0)-(/[?？]$/.test(sentence.quote)?2:0);return score(b)-score(a)||a.start-b.start;})
  .slice(0,2).sort((a,b)=>a.start-b.start).map(sentence=>({...sentence,supplementId:supplement.id,sourceUrl:supplement.sourceUrl}))).slice(0,3);
 const supplementEvidence=[...new Map([...meaningMatches.flatMap(match=>match.evidence).filter(e=>e.field==='sourceSupplement'),...directSupplementEvidence]
  .map(e=>[`${e.supplementId}:${e.start}:${e.end}`,e])).values()].slice(0,3);
 const titleWords=words.filter(w=>matchingExpressions(w,literalSource(item).title).length > 0);
 const details=(request.detailRequests||[]).map(detail=>({label:detail.label,
  evidence:sentences.filter(s=>detail.terms.some(t=>s.quote.includes(t))).slice(0,2),status:'MENTION_ONLY'}));
 details.push(...(item.relevanceEvidence?.details || []));
 if(item.requestRelation?.status && item.requestRelation.status!=="NOT_EVALUATED")details.push({label:item.requestRelation.label,status:item.requestRelation.status,evidence:item.requestRelation.evidence});
 if(item.contentRelation?.matched)details.push({label:'요청한 내용 관계의 원문 단서',status:'PREDICATE_TEXT_CUE',evidence:item.contentRelation.evidence});
 if(item.historicalContext?.matched)details.push({label:'요청한 장소의 과거 풍경·생활',status:item.historicalContext.status,evidence:item.historicalContext.evidence});
 const unconfirmed=[...(item.contentRelation?.sceneContexts||[]).map(s=>`요청 상황 ‘${s.label}’: 실제 장면 미확인`),...(item.excludedConditions||[]).filter(c=>c.status==='UNKNOWN').map(c=>`제외 요청 ‘${c.label}’: 원문으로 부재를 확인할 수 없어 영상 확인 필요`),...(item.requestRelation?.unconfirmed || []),...(semanticEvidence.length ? ["로컬 문장 유사도와 주제 단서로 발견한 비교 후보: 요청 관계의 충족은 미확인"] : []),...(request.relationNeeds||[]).map(s=>`${s}: 관계 충족은 별도 확인`),
  ...Object.entries(request.constraints||{}).filter(([k,v])=>v&&['durationMinutes','sceneExclusions','subtitles','naturalFootage','freeAccess','grade','audience'].includes(k)).map(([k,v])=>`${({durationMinutes:'요청 재생시간',sceneExclusions:'제외 장면',subtitles:'자막',naturalFootage:'실제 촬영',freeAccess:'무료 접근',grade:'학년 적합성',audience:'시청 대상'})[k]}: 미확인`),
  ...details.map(d=>`${d.label}: ${d.evidence.length?'관련 표현은 있으나 방법·관계·장면 충족은 미확인':'대응하는 소개문 문장을 찾지 못함'}`)];
 return {topicEvidence,supplementEvidence,details,unconfirmed,titleWords,meaningMatches,
  text:item.historicalContext?.matched ? '요청한 장소와 과거 풍경·생활의 연결 단서를 원문에서 확인한 후보입니다. 실제 옛 영상·기록 화면 포함 여부는 별도 확인해 주세요.' : meaningMatches.length ? `검색어 ‘${meaningMatches.map(match=>match.requested).join(' · ')}’와 연결되는 동의 표현·대상·설명 단서를 공식 소개에서 대조한 의미 확장 후보입니다. 아래 인용에서 관계와 실제 내용을 확인하세요.` : semanticEvidence.length && !words.length ? '소개문의 문장 유사도와 주제 단서로 발견한 비교 후보입니다. 아래 원문을 읽고 요청 관계를 확인하세요.' : topicEvidence.length?`요청한 ‘${words.filter(w=>topicEvidence.some(s=>matchingExpressions(w,s.quote).length > 0)).slice(0,3).join(' · ')}’의 내용 문장을 소개문에서 찾았습니다. 관계·방법의 충족 여부는 아래 근거를 비교해 주세요.`:
    supplementEvidence.length?'요청 주제의 표현을 같은 회차의 공식 보조 원문에서 확인했습니다. 소개문과 구분한 아래 인용을 읽고 관계·장면을 확인하세요.':
    titleWords.length?`요청한 ‘${titleWords.slice(0,3).join(' · ')}’을 제목에서 확인했습니다. 이를 설명하는 소개문 근거는 부족합니다.`:item.reason||'검색 조건에 맞는 보유 자료입니다.'};
}
function sourceChecks(item) {
 return {sourceUrl:item.sourceUrl,textSourceUrl:item.evidenceUrl||item.sourceUrl,
  identity:item.navigation?.status==='MATCHED'?'회차 ID·제목 대조 일치':'개별 회차 대조 미확인',
  identityCheckedAt:item.navigation?.checkedAt||null,description:item.descriptionMatchStatus==='MATCHED'?'공식 상세 소개문 대조 일치':'현재 상세 소개문 대조 미확인',
  descriptionCheckedAt:item.descriptionMatchStatus==='MATCHED'?item.descriptionCheckedAt:null,
  collectedAt:item.checkedAt||null,durationSeconds:item.durationSeconds||null,durationSourceUrl:item.durationSourceUrl||null,durationCheckedAt:item.durationCheckedAt||null,
  playback:'미확인',scenes:'미확인',grade:'미확인'};
}
module.exports={sourceSentences,contentGuide,explainRequest,sourceChecks};
