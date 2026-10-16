// 소개문의 명시적 문맥만 확인한다. 문장 의미 전체를 이해하는 모델 판정은 아니다.
const { literalSource } = require('./source-literal');
const { aliasRegex } = require('./semantic-pattern');
const { guideSentences, cleanGuideText } = require('./broadcast-guide-text');
const { assessSourceText } = require('./source-text-quality');
const domainHints = {
  심장: /혈액|혈관|심박|박동|인체|우리\s*몸|장기|심장병|심장\s*질환|심근|순환계|수술/,
  빛: /반사|굴절|렌즈|광학|파장|광원|프리즘|스펙트럼|태양빛|빛의\s*(성질|속도)|조명|흡수|방출|양자점|오로라|천문|망원경/,
  구름: /날씨|기상|수증기|응결|대기|무게|물방울|강수|비가|구름의\s*(종류|생성)/,
  화석: /지층|지질|공룡|퇴적|고생물|발굴|화석의\s*(생성|종류)|암석/,
  자석: /자기장|전자석|자성|철가루|극|자석의\s*(성질|힘)|자석.{0,20}(?:붙|끌|밀)|(?:클립|철|쇠).{0,20}(?:붙|끌)/,
  전쟁: /군대|군인|전투|침공|전쟁의\s*(역사|피해)|세계대전|한국전쟁|6[·.]25|휴전|전쟁을\s*(겪|일으|치르|끝)/,
  세포: /생물|인체|현미경|세포막|세포벽|분열|면역|항체|조직|유전자/,
  수분: /꽃가루|암술|수술|벌|수분\s*(작용|과정)/,
  기후: /날씨|강수|기온|기후\s*(변화|위기|대)|온난화|계절/,
  지구: /행성|태양|자전|공전|지질|기후|환경|온난화|우주|대기|지각/,
  힘: /중력|마찰|부력|물체|지레|빗면|저울|수평|밀|당기|힘의\s*(크기|방향)/,
  별: /천체|밤하늘|별자리|태양|우주|관측|천문/,
  달: /천체|태양|우주|위상|보름|상현|하현|초승|달의\s*(모양|표면)/,
  발굴: /유물|유적|고고학|지층|화석|공룡|유산|매장|출토|복원|왕궁|경복궁|발굴\s*(조사|현장)/,
  시장: /경제|물가|판매|구매|소비|생산|전통시장|상인|상품|시장\s*(원리|규모)/,
  전기: /에너지|회로|발전|전력|배터리|전류|전압|전기료|전기차|태양광|전자|전원|가스|전기를\s*(쓰|생|만들)/,
  김정호: /지도|지리|대동여지도|측량/,
  전봉준: /동학|농민|혁명|봉기/,
  폐: /호흡|산소|기관|인체|허파|폐암|흡연|날숨|핏줄|숨|폐의\s*(구조|기능)/,
  몸속: /인체|인간|사람|우리\s*몸|심장|장기|혈관|면역/,
  우주: /천체|행성|태양|달|별|은하|발사체|로켓|망원경|탐사|위성|블랙홀|중력|수소|빅뱅|천문|인류|지구|우주의\s*(시작|탄생)|우주\s*(공간|과학|다큐|쓰레기|타임캡슐)/,
  소화: /소화기관|소화\s*(기관|과정|작용|기능)|위장|위염|음식물|위액|인체|효소|장기능/
};
const normalize = value => String(value || '').normalize('NFKC').replace(/<[^>]*>|[\s\p{P}\p{S}]/gu, '');
const patterns = new Map();
function keywordPattern(alias) {
  if (!patterns.has(alias)) patterns.set(alias, aliasRegex(alias, { declarations: true }));
  return patterns.get(alias);
}
function summaryContext(item) {
  const text = String(item.summary || '');
  if (!cleanGuideText(text) || normalize(cleanGuideText(text)) === normalize(cleanGuideText(item.title))) return null;
  if (assessSourceText(cleanGuideText(item.title),cleanGuideText(text)).category==='production') return null;
  const readable = literalSource(item).summary.replace(/<[^>]*>/g, tag => ' '.repeat(tag.length))
    .replace(/^\s*자막(?!을|은|이|의|과|와|으로|에|제작|번역|기술|정보)\s*/u, token => ' '.repeat(token.length));
  return { text, readable, sentences:guideSentences(text) };
}
function rejectionReason(alias, sentence, before, after, matches, item, readable, start) {
  if (/^(?:로이|롭게|로운|롭다|스럽게|스러운)/u.test(after)) return 'DERIVED_EXPRESSION';
  if (alias === '언어' && /(?:엔터테인먼트|예술|몸짓|영상|음악)의?\s*언어|언어로\s*풀어/u.test(sentence) && !/문법|낱말|발음|자음|모음|언어\s*학습/u.test(sentence)) return 'FIGURATIVE_EXPRESSION';
  if (!['유관순','김정호','전봉준'].includes(alias) && /^\s*(?:씨|님|군|양|선생|교수|박사)(?=$|[\s,.]|은|는|이|가)/.test(after)) return 'PERSON_NAME_OR_HONORIFIC';
  // 해로운 사회 문제와 대안을 대비하는 표현은 그 문제를 다루지 않는다는 뜻이 아니다.
  if (/^(?:차별|불평등|폭력|전쟁|혐오|배제)$/u.test(alias) && /^\s*(?:이|가)?\s*아닌\s*(?:공존|평등|존중|평화|포용|화합)/u.test(after)) return null;
  if (/^\s*(?:을|를|이|가|은|는)?\s*(?:아니|아닌|않|없는|없다|다루지|방불|비유|상징|뜻하는|이라는\s*제목|라는\s*제목|처럼|같은)/.test(after)) return 'NEGATED_OR_FIGURATIVE';
  if (/^\s*(?:이|라|이라|라고|이라고)?\s*(?:불리|비유|별명|상징)/.test(after)) return 'FIGURATIVE_EXPRESSION';
  if (alias==='바다' && /(?:눈물|지식|정보|인파|꿈|추억)(?:의)?\s*$/.test(before)) return 'FIGURATIVE_EXPRESSION';
  if (alias==='씨앗' && /(?:희망|평화|성공|행복|변화)(?:의)?\s*$/.test(before)) return 'FIGURATIVE_EXPRESSION';
  if (alias==='물질' && /해녀|잠수|소라|전복|물질\s*삼부작/.test(sentence) && !/고체|액체|기체|입자|분자|상태\s*변화/.test(sentence)) return 'AMBIGUOUS_ACTIVITY';
  if (alias==='우주' && /생활습관|요정|암흑\s*보석|마왕|용사\s*스토리/.test(readable) && !/과학|천문|우주\s*(탐사|현상|정보|원리)/.test(readable)) return 'FICTIONAL_SETTING';
  if (domainHints[alias] && !domainHints[alias].test(sentence) && !domainHints[alias].test(readable)) return 'MISSING_DOMAIN_CONTEXT';
  if (alias==='우유' && /바다의\s*$/.test(before)) return 'FIGURATIVE_EXPRESSION';
  if (readable.length>400 && matches.length===1 && start<readable.length*.2 &&
      !keywordPattern(alias).test(String(item.title||'')) && /학자|어릴\s*때|일화|우연히|태어나|전이|사례로/.test(sentence) &&
      !/(알아본|살펴본|다룬|소개|탐구|분석|원리|과정|문제|관찰|취재)/.test(sentence)) return 'INCIDENTAL_MENTION';
  return null;
}
function evaluateSummaryEvidence(item, aliases, prepared=summaryContext(item)) {
  if(!prepared)return {evidence:null,rejected:[],candidateCount:0,reason:'NO_USABLE_SUMMARY'};
  const {text,readable,sentences}=prepared,rejected=[];let candidateCount=0,acceptedEvidence=null;
  for(const alias of aliases){
    const pattern=keywordPattern(alias);pattern.lastIndex=0;
    const matches=[...readable.matchAll(pattern)];candidateCount+=matches.length;
    for (const rawMatch of (literalSource(item).figurativeExpressions.some(span=>span.field==='summary') ? [...String(text).matchAll(keywordPattern(alias))] : [])) {
      const start=rawMatch.index,end=start+rawMatch[0].length;
      if (literalSource(item).figurativeExpressions.some(span=>span.field==='summary'&&span.start<end&&span.end>start)) {
        candidateCount++;rejected.push({alias,reason:'FIGURATIVE_SOURCE_RANGE',field:'summary',start,end,quote:text.slice(start,end)});
      }
    }
    for(const match of matches){
      const start=match.index,end=start+match[0].length;
      const sentenceSpan=sentences.find(s=>s.start<=start && s.end>=end);
      const left=sentenceSpan?.start ?? Math.max(0,start-100),right=sentenceSpan?.end ?? Math.min(readable.length,end+100);
      const sentence=cleanGuideText(readable.slice(left,right));
      const originalSentence=sentenceSpan?.text || cleanGuideText(text.slice(left,right));
      const before=readable.slice(Math.max(left,start-35),start),after=readable.slice(end,Math.min(right,end+45));
      pattern.lastIndex=0;
      const reason=rejectionReason(alias,sentence,before,after,matches,item,readable,start);
      const evidence={field:'summary',start,end,quote:text.slice(start,end),context:originalSentence,sourceUrl:item.evidenceUrl||item.sourceUrl};
      if(reason){rejected.push({alias,reason,...evidence});continue;}
      acceptedEvidence ||= evidence;
    }
  }
  return {evidence:acceptedEvidence,rejected,candidateCount,
    reason:acceptedEvidence?'SUMMARY_CONTEXT_ACCEPTED':rejected.length?'CONTEXT_HELD':'NO_SUMMARY_MENTION'};
}
function summaryEvidence(item,aliases,prepared=summaryContext(item)) {
  return evaluateSummaryEvidence(item,aliases,prepared).evidence;
}
module.exports={summaryEvidence,summaryContext,evaluateSummaryEvidence,contextSensitiveTerms:[...Object.keys(domainHints),'우유']};
