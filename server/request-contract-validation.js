const fs=require('node:fs'),path=require('node:path');
const {concepts}=require('./semantic-layer');
const {dateBounds}=require("./request-date-condition");
const {extractGeographicScope}=require('./search-geographic-scope');
const { localContextClauses, audienceSourceSpan } = require('./request-context-roles');
const schema=JSON.parse(fs.readFileSync(path.join(__dirname,'data/request-interpretation.schema.json'),'utf8'));
const inputSchema=JSON.parse(fs.readFileSync(path.join(__dirname,'data/request-input-envelope.schema.json'),'utf8'));
const compact=value=>String(value).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
// 제공된 두 Schema의 모든 사용 키워드를 동등하게 검사한다. 범용 JSON Schema 라이브러리는 아니다.
function typeErrors(value,rule,root,location='$',depth=0){
 if(depth>32)return [location+': depth limit'];
 if(rule.$ref)return typeErrors(value,root.$defs[rule.$ref.split('/').at(-1)],root,location,depth+1);
 if(rule.anyOf)return rule.anyOf.some(r=>!typeErrors(value,r,root,location,depth+1).length)?[]:[location+': anyOf'];
 const errors=[];const fail=message=>errors.push(location+': '+message);
 if('const'in rule&&value!==rule.const)fail('const');if(rule.enum&&!rule.enum.includes(value))fail('enum');
 const type=rule.type,valid=!type||(type==='null'?value===null:type==='array'?Array.isArray(value):type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):type==='integer'?Number.isInteger(value):typeof value===type);
 if(!valid)return [...errors,location+': type'];
 if(typeof value==='number'&&rule.minimum!==undefined&&value<rule.minimum)fail('minimum');
 if(typeof value==='string'){if(rule.minLength!==undefined&&[...value].length<rule.minLength)fail('minLength');if(rule.pattern&&!new RegExp(rule.pattern,'u').test(value))fail('pattern');}
 if(type==='array'){if(value.length<(rule.minItems||0))fail('minItems');if(value.length>256)return [location+': items limit'];value.forEach((v,i)=>errors.push(...typeErrors(v,rule.items,root,location+'['+i+']',depth+1)));}
 if(type==='object'){for(const key of rule.required||[])if(!Object.hasOwn(value,key))fail('missing '+key);for(const [key,v]of Object.entries(value)){if(!Object.hasOwn(rule.properties,key)){if(rule.additionalProperties===false)fail('extra '+key);}else errors.push(...typeErrors(v,rule.properties[key],root,location+'.'+key,depth+1));}}
 return errors;
}
function validateEnvelope(envelope){const errors=typeErrors(envelope,inputSchema,inputSchema);if(!errors.length&&envelope.query.length>200)errors.push('query over 200 UTF-16 units');return errors;}
function contractErrors(result,query){
 const errors=typeErrors(result,schema,schema);if(errors.length)return errors;
 if(query.length>200)errors.push('query over 200 UTF-16 units');if(result.originalQuery!==query)errors.push('original query changed');
 const clauses=new Map(result.clauses.map(c=>[c.id,c]));if(clauses.size!==result.clauses.length)errors.push('duplicate clause id');
 const coverage=new Set(),boundaries=new Set([0]);let position=0;for(const ch of query){position+=ch.length;boundaries.add(position);}
 const span=s=>{if(s.end<=s.start||!boundaries.has(s.start)||!boundaries.has(s.end)||query.slice(s.start,s.end)!==s.quote)errors.push('source span mismatch');else for(let i=s.start;i<s.end;i++)coverage.add(i);};
 for(const c of result.clauses)for(const s of c.sourceSpans)span(s);for(const u of result.unresolved)span(u.sourceSpan);for(const s of result.grammarSpans)span(s);
 const refs=new Set(),orSpans=[],orNodes=[];
 const walk=node=>{if(node.op==='ref'){refs.add(node.clauseId);const c=clauses.get(node.clauseId);if(!c)errors.push('unknown clause reference');else if(!['required','excluded'].includes(c.mode))errors.push('preference/context used as blocking condition');}else{node.sourceSpans.forEach(span);if(node.op==='any'){if(!node.sourceSpans.some(s=>/또는|아니면|혹은|이나|\bOR\b/iu.test(s.quote)))errors.push('OR needs original connector');orSpans.push(...node.sourceSpans);orNodes.push(node);}node.children.forEach(walk);}};
 if(result.expression)walk(result.expression);
 for(const c of result.clauses)if(['required','excluded'].includes(c.mode)&&!refs.has(c.id))errors.push('blocking clause lost from expression');
 for(const e of result.expansions){if(!clauses.has(e.clauseId)||clauses.get(e.clauseId).mode==='excluded')errors.push('invalid expansion target');if(e.text.length>200)errors.push('expansion over search input limit');}
 if(result.status==='READY'&&result.unresolved.length)errors.push('unresolved request cannot be READY');
 for(let i=0;i<query.length;i++)if(!/\s/u.test(query[i])&&!coverage.has(i))errors.push('unaccounted query text');
 if([...query.matchAll(/또는|아니면|혹은|\bOR\b/giu)].some(m=>!orSpans.some(s=>s.start<=m.index&&s.end>=m.index+m[0].length)))errors.push('original OR lost');
 const optional=new Set();
 const originalOr=[...query.matchAll(/또는|아니면|혹은|\bOR\b/giu)];
 const blocking=result.clauses.filter(c=>['required','excluded'].includes(c.mode));
 const leaves=node=>node.op==='ref'?[node.clauseId]:node.children.flatMap(leaves);
 for(const connector of originalOr){
  const left=blocking.flatMap(c=>c.sourceSpans.map(s=>({c,s}))).filter(x=>x.s.end<=connector.index).sort((a,b)=>b.s.end-a.s.end)[0];
  const right=blocking.flatMap(c=>c.sourceSpans.map(s=>({c,s}))).filter(x=>x.s.start>=connector.index+connector[0].length).sort((a,b)=>a.s.start-b.s.start)[0];
  const node=orNodes.find(n=>n.sourceSpans.some(s=>s.start<=connector.index&&s.end>=connector.index+connector[0].length));
  if(!left||!right||!node||!leaves(node).includes(left.c.id)||!leaves(node).includes(right.c.id))errors.push('OR operands do not match original clauses');
  if(left)optional.add(left.c.id);if(right)optional.add(right.c.id);
 }
 const forced=(node,id)=>!node?false:node.op==='ref'?node.clauseId===id:node.op==='all'?node.children.some(n=>forced(n,id)):node.children.every(n=>forced(n,id));
 for(const c of blocking)if(!optional.has(c.id)&&!forced(result.expression,c.id))errors.push('adjacent mandatory clause weakened in logic');
 return [...new Set(errors)];
}
function meaningErrors(result,query){
 const errors=[],scope=extractGeographicScope(query);
 for(const required of scope.required){const labels=required==='DOMESTIC'?['국내','한국','대한민국','우리나라']:['해외','외국'];if(!result.clauses.some(c=>c.kind==='geography'&&c.mode==='required'&&labels.includes(c.label)))errors.push('mandatory geography lost or downgraded');}
 const strip=value=>compact(value).replace(/(?:제외하고|제외해줘|제외한|제외|빼고|말고|만)$/u,'');
 for(const c of result.clauses){
  const quotes=c.sourceSpans.map(s=>s.quote),body=compact(quotes.join(' '));
  if(c.mode==='context'&&!['audience','purpose'].includes(c.kind))errors.push('content hidden as classroom context');
  if(c.mode==='preferred'&&!quotes.some(q=>/이면\s*좋|면\s*좋|같은|유사한|선호|좋겠|더\s*좋|우선|가능하면|보다|도\s*괜찮/u.test(q)))errors.push('mandatory content downgraded to preference');
  if(c.kind==='date' && /이후|이전/.test(body) && ![...body.matchAll(/이후|이전/g)].every(m=>c.label.includes(m[0])))errors.push('date direction changed');
  if(c.kind==='duration'){const source=body.match(/(\d+)분/),target=c.label.match(/(\d+)분/);if(source&&(!target||source[1]!==target[1]))errors.push('duration value changed');const operators={이내:'LE',이하:'LE',미만:'LT',이상:'GE',초과:'GT'};const left=Object.keys(operators).find(op=>body.includes(op)),right=Object.keys(operators).find(op=>c.label.includes(op));if(left&&operators[left]!==operators[right])errors.push('duration operator changed');}
  if(c.kind==='date' && dateBounds(c.label) && ![...c.label.matchAll(/\d+/g)].every(m=>body.includes(m[0])))errors.push('date value added or changed');
  if(c.kind==='entity'&&!quotes.some(q=>(compact(q)===compact(c.label)||strip(q)===compact(c.label))))errors.push('entity label changed');
  if(c.kind==='geography'&&!['국내','한국','대한민국','우리나라','해외','외국'].includes(c.label)&&!quotes.some(q=>(compact(q)===compact(c.label)||strip(q)===compact(c.label))))errors.push('unrequested geography');
  if(['topic','program','form','curriculum'].includes(c.kind)){
   if(c.kind==='topic'&&concepts.some(k=>compact(k.label)===compact(c.label)&&k.specificAliases.some(a=>strip(body)===compact(a))))errors.push('specific topic replaced by broader concept');
   const direct=c.kind==='topic'?(body===compact(c.label)||strip(body)===compact(c.label)):strip(body).includes(compact(c.label));
   const alias=c.kind==='topic'&&concepts.some(k=>compact(k.label)===compact(c.label)&&k.aliases.some(a=>body.includes(compact(a))));
   if(!direct&&!alias)errors.push('unsupported meaning replacement: '+c.id);
  }
  const localContext = localContextClauses(query);
  const coveredContext = kind => c.sourceSpans.every(s => localContext.some(role => role.kind === kind && role.sourceSpans.some(r => r.start <= s.start && r.end >= s.end)));
  const teachingPurpose=coveredContext('purpose') || quotes.every(q=>/^(?:(?:수업|학습|교육|교실|단원)\s*)?(?:자료|활용|도입|정리|마무리)(?:용|에|으로)?$/u.test(q)||/^(교육|가르칠|가르치는)$/u.test(q)&&!/(교육\s*(제도|불평등|격차|정책|과정|문제))/u.test(query));
  if(c.kind==='purpose'&&!teachingPurpose)errors.push('content hidden as purpose');
  if(c.kind==='purpose'&&c.mode!=='context')errors.push('purpose cannot become a blocking condition');
  if(c.kind==='audience'&&c.mode!=='context')errors.push('grade is classroom context');
  if(c.kind==='audience'&&!coveredContext('audience')&&!quotes.every(audienceSourceSpan))errors.push('content hidden as audience');
  if(quotes.some(q=>/제외|빼고|말고/.test(q))&&c.mode!=='excluded'&&c.kind!=='geography')errors.push('excluded requirement changed');
  if(c.mode==='required'&&quotes.some(q=>/이면\s*좋|같은|유사한|선호/.test(q)))errors.push('preference promoted to required');
 }
 // 문법 구절에 숨긴 낯선 이름·주제를 받아들이지 않는다. 모르는 구절은 보류로 반환해야 한다.
 const grammar=/^(?:해당하는|설명해주는|설명하는|보여주는|알려주는|다루는|다룬|비교하는|관찰하는|찾아줘|찾아주세요|추천해줘|자료|영상|수업자료|수업|볼|하는|이|가|을|를|은|는|의|에|에서|으로|로|과|와|및|그리고|또는|아니면|혹은)$/u;
 for(const s of result.grammarSpans){const tokens=s.quote.match(/[\p{L}\p{N}]+/gu)||[];if(tokens.some(t=>!grammar.test(t)))errors.push('unrecognized content hidden in grammar');}
 return [...new Set(errors)];
}
function validateInterpretation(result,envelope){const inputErrors=validateEnvelope(envelope);if(inputErrors.length)return {accepted:false,errors:inputErrors,meaningCoverage:"NOT_CHECKED"};const errors=contractErrors(result,envelope.query);if(errors.length)return {accepted:false,errors:[...new Set(errors)],meaningCoverage:'NOT_CHECKED'};const meaning=meaningErrors(result,envelope.query);return {accepted:!meaning.length,errors:meaning,meaningCoverage:'EXPLICIT_GUARDS_ONLY',note:'원문·명시 조건의 제한된 실행 검사이며 범용 의미 정확성을 보장하지 않습니다.'};}
module.exports={validateEnvelope,contractErrors,validateInterpretation,typeErrors};
