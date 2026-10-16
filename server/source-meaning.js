const {rules} = require('./source-meaning-rules');
const {literalSource, overlapsFigurative} = require('./source-literal');
const {guideSentences} = require('./broadcast-guide-text');
const {assessSourceText} = require('./source-text-quality');
const {aliasRegex} = require('./semantic-pattern');
const { expressionPattern } = require('./search-term-matching');
const {searchableSupplements} = require('./supplement-search');
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
const byQuery = new Map(rules.flatMap(rule => rule.queries.map(query => [normalize(query), rule])));
const queryRule=value=>{const key=normalize(value);return byQuery.get(key)||(key.endsWith('들')?byQuery.get(key.slice(0,-1)):undefined);};
const knownNouns = new Set(rules.flatMap(rule=>[...rule.queries,...rule.aliases]).map(normalize));
const prepared = new WeakMap();
const supplementViews = new WeakMap();
const negative = /^(?:이|가|은|는|을|를)?\s*(?:(?:과정|활동|반응|작용)(?:이|가|은|는)?\s*)?(?:아닌|아니라|아니다|없이|없(?:는|다|어)|않(?:는|다))/u;

function sourceView(item) {
  if (!prepared.has(item)) {
    const quality = assessSourceText(item.title, item.summary);
    if (['none','repeated','production'].includes(quality.category)) {
      prepared.set(item, null);
    } else {
      // 표기·HTML만 같은 길이로 가린다. 원문 인용 위치는 바뀌지 않는다.
      const text = literalSource(item).summary.replace(/<[^>]*>/gu, value => ' '.repeat(value.length))
        .replace(/^\s*(?:\[(?:자막|HD|수어)\]|자막)/u, value => ' '.repeat(value.length));
      const sentences = guideSentences(text).map(s => ({start:s.start,end:s.end,text:text.slice(s.start,s.end)}));
      prepared.set(item, {text, sentences, matches:new Map()});
    }
  }
  return prepared.get(item);
}
function quote(item, start, end) {
  if (overlapsFigurative(item,{field:'summary',start,end})) return null;
  return {field:'summary',start,end,quote:item.summary.slice(start,end)};
}
function compose(item, windows, groups) {
  for (const window of windows) for (const patterns of groups || []) {
    const matches = patterns.map(pattern => pattern.exec(window.text));
    if (matches.some(match => !match)) continue;
    const start = Math.min(...matches.map(match => match.index));
    const end = Math.max(...matches.map(match => match.index + match[0].length));
    if (end-start > 450 || /(?:아닌|아니다|않는다|없다)/u.test(window.text.slice(start,end+8))) continue;
    const evidence = matches.map(match => quote(item,window.start+match.index,window.start+match.index+match[0].length));
    if (evidence.every(Boolean)) return evidence;
  }
  return null;
}
function meaningEvidence(item, requested, includeSupplements = true) {
  const rule = queryRule(requested);
  if (!rule) return null;
  // 발췌의 오프셋은 소개문이 아닌 해당 공식 보조 원문에 대응한다.
  const fromSupplement = () => {
    if (!includeSupplements) return null;
    if (!supplementViews.has(item)) supplementViews.set(item, searchableSupplements(item).map(supplement => ({
      supplement, view: {...item, summary:supplement.text, sourceSupplements:[]}
    })));
    for (const {supplement,view} of supplementViews.get(item)) {
      const found=meaningEvidence(view,requested,false);
      if(found)return {...found,evidence:found.evidence.map(e=>({...e,field:'sourceSupplement',supplementId:supplement.id,sourceUrl:supplement.sourceUrl}))};
    }
    return null;
  };
  const view = sourceView(item);
  if (!view) return fromSupplement();
  if (!view.matches.has(rule.id)) {
    let found = null;
    for (const alias of rule.aliases) {
      // 검색어와 원문 의미 규칙이 같은 조사·하다/되다 활용 경계를 사용한다.
      for (const match of expressionPattern(alias).matches(view.text)) {
        const after=view.text.slice(match.index+match[0].length,match.index+match[0].length+20);
        if (negative.test(after) || rule.rejectAfter?.test(after)) continue;
        if (rule.aliasContext&&!rule.aliasContext.test(view.text.slice(Math.max(0,match.index-100),match.index+match[0].length+100))) continue;
        const evidence=quote(item,match.index,match.index+match[0].length);
        if (evidence) {found={kind:'PARAPHRASE',evidence:[evidence]};break;}
      }
      if (found) break;
    }
    if (!found) {
      const evidence=compose(item,view.sentences,rule.groups) ||
        compose(item,[{start:0,text:view.text.slice(0,1000)}],rule.introductionGroups);
      if(evidence)found={kind:'CONTEXT_COMPOSITION',evidence};
    }
    view.matches.set(rule.id,found);
  }
  const found=view.matches.get(rule.id);
  return found ? {requested,meaning:rule.id,status:'RELATED_SOURCE_CUE',...found,
    note:'공식 소개의 동의 표현·대상·설명 관계로 발견한 후보 단서입니다. 영상 장면·요구 충족은 미확인입니다.'} : fromSupplement();
}
function conceptMeaningEvidence(item,concept) {
  for (const label of [concept.label,...(concept.requestedAliases || [])]) {
    const evidence=meaningEvidence(item,label);
    if(evidence)return {...evidence,requested:concept.label};
  }
  return null;
}
function literalMeaningAllowed(item,term) {
  const rule=queryRule(term);
  if(!rule?.rejectAfter)return true;
  const text=literalSource(item);
  const matches=['title','summary'].flatMap(field=>[...text[field].matchAll(aliasRegex(term))]
    .map(match=>text[field].slice(match.index+match[0].length,match.index+match[0].length+20)));
  return !matches.length || matches.some(after=>!rule.rejectAfter.test(after));
}
function separateMeaningWords(value) {
  const vocabulary=[...byQuery.keys()].sort((a,b)=>b.length-a.length),expansions=[];
  const split=(token,depth=0)=>{
    if(byQuery.has(token))return [token];
    if(depth>=3)return null;
    for(const word of vocabulary)if(token.startsWith(word)){
      const rest=split(token.slice(word.length),depth+1);
      if(rest)return [word,...rest];
    }
    return null;
  };
  const text=value.replace(/[가-힣]+/gu,token=>{
    if(knownNouns.has(token))return token;
    for(const ending of ['', '에서','으로','을','를','은','는','의','이','가','과','와','들']){
      if(ending&&!token.endsWith(ending))continue;
      const parts=split(ending?token.slice(0,-ending.length):token);
      if(parts?.length>1){const term=parts.join(' ')+ending;expansions.push({quote:token,term,label:'보유 의미 단위의 띄어쓰기 대조'});return term;}
    }
    return token;
  });
  return {text,expansions};
}
module.exports={meaningEvidence,conceptMeaningEvidence,literalMeaningAllowed,separateMeaningWords,isMeaningNoun:value=>knownNouns.has(normalize(value)),queryLiteralAliases:value=>queryRule(value)?.aliases || []};
