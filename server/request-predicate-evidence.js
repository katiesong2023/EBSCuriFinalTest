// 동작 표현을 정규화하려면 자기 회차의 동작 근거가 필요하다. E5 점수로 대신하지 않는다.
// 기존 근거 의미 규칙을 요청과 자료 양쪽에 대조한다. 주제별 새 답안은 만들지 않는다.
const { rules } = require('./source-meaning-rules');
const { meaningEvidence } = require('./source-meaning');
const { contentSources } = require('./source-context');
const { sourceSentences } = require('./source-explanation');
const { matchingLiteralExpressions: matches } = require('./source-literal');
const { isContentPredicate } = require('./request-predicates');
const { softRelationTerm } = require('./natural-request');
const plans = new Map();
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function inflectedStems(stem) {
  const last = stem.charCodeAt(stem.length - 1), offset = last - 0xAC00;
  if (offset < 0 || offset >= 11172) return [stem];
  const syllable = last - offset % 28, before = stem.slice(0,-1);
  return [...new Set([stem, ...[0,4,8].map(jong=>before+String.fromCharCode(syllable+jong))])];
}
function predicatePlan(original, term) {
  const key = original + '\n' + term;
  if (!plans.has(key)) {
    const stem = term.replace(/(?:는지|는|던|고|며|면|기)$/u,'');
    const pattern = stem.length < 2 ? null : new RegExp(`(?<![\\p{L}\\p{N}])(?:${inflectedStems(stem).map(escape).join('|')})(?:는|던|고|며|면|다|니|게|지|기|다가|자|는지|기도|면서|겠다|지만|었다|았다|여|어|아)?(?![\\p{L}\\p{N}])`,'u');
    const shared = rules.filter(rule=>(rule.aliases || []).some(alias=>alias.length>=2&&term.includes(alias)) ||
      (rule.groups || []).some(group=>group.every(p=>p.test(original)) &&
      group.some(p=> { const m=p.exec(original); return m && (m[0].includes(term) || term.includes(m[0])); })));
    if (plans.size >= 64) plans.delete(plans.keys().next().value);
    plans.set(key,{pattern,shared});
  }
  return plans.get(key);
}
function predicateEvidence(item, term, branch, original) {
  const { pattern, shared } = predicatePlan(original,term);
  const fields = contentSources(item);
  for (const rule of shared) {
    const found = meaningEvidence(item,rule.queries[0]);
    if (found && found.evidence.every(e=>fields.some(s=>s.field===e.field&&s.supplementId===e.supplementId&&
      s.text.slice(e.start,e.end).replace(/\s/gu,'')===e.quote.replace(/\s/gu,'')))) return {term,method:'SHARED_MEANING_RULE',ruleId:rule.id,evidence:found.evidence,status:'SOURCE_PREDICATE_CUE'};
  }
  if (!pattern) return null;
  const anchors = [...branch.terms.filter(t=>!isContentPredicate(t)&&!softRelationTerm(t)),
    ...branch.semanticConcepts.flatMap(c=>c.requestedAliases?.length?c.requestedAliases:c.aliases)];
  for (const source of fields) {
    if (source.field === 'title') continue;
    const sentences = sourceSentences(source.text,source.field);
    for (let i=0;i<sentences.length;i++) {
      const s=sentences[i], next=sentences[i+1], end=next&&next.end-s.start<=450?next.end:s.end;
      const text=source.text.slice(s.start,end);
      if (!pattern.test(text) || !anchors.some(t=>matches(t,item.title+' '+text).length)) continue;
      const raw=source.field==='sourceSupplement'?(item.sourceSupplements || []).find(s=>s.id===source.supplementId)?.text:item[source.field];
      if (typeof raw!=='string') continue;
      return {term,method:'BOUND_PREDICATE_STEM',status:'SOURCE_PREDICATE_CUE',evidence:[{field:source.field,start:s.start,end,
        quote:raw.slice(s.start,end),...(source.supplementId?{supplementId:source.supplementId}: {})}]};
    }
  }
  return null;
}
module.exports = { predicateEvidence };
