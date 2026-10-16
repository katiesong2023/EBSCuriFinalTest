// 단어의 존재와 요청 대상/관계의 내용 근거를 구분한다. 원문·인용 위치는 바꾸지 않는다.
const { literalSource, literalText, matchingLiteralExpressions: matches } = require('./source-literal');
const { sourceSentences } = require('./source-explanation');
const { searchableSupplements } = require('./supplement-search');
const { softRelationTerm } = require('./natural-request');
const { maskEditorial } = require('./source-editorial');
const { negativeOnlyTopics } = require('./source-polarity');
const prepared = new WeakMap();
function contentSources(item) {
  if (prepared.has(item)) return prepared.get(item);
  const source = literalSource(item);
  const fields = [{ field: 'title', text: source.title }, { field: 'summary', text: source.summary },
    ...searchableSupplements(item).map(s => ({ field: 'sourceSupplement', text: literalText(maskEditorial(s.text, item.title)), supplementId: s.id, sourceUrl: s.sourceUrl }))];
  prepared.set(item, fields); return fields;
}
function contextRequest(original) {
  const habitat = [...original.matchAll(/([가-힣]+?)(?:에|에서)\s*(?:사는|서식하는|살아가는)\s+([가-힣]+)/gu)]
    .map(m => ({ place: m[1], entity: m[2].replace(/(?:의|을|를|은|는|이|가)$/u, ''), quote: m[0] })).filter(binding => !/^(?:모습|내용|자료|영상|방법|이야기)$/u.test(binding.entity));
  const issues = [...original.matchAll(/([가-힣]{2,}?)(?:의)?\s*문제(?=$|[^\p{L}\p{N}]|를|의|는|가|이)/gu)].map(m => ({topic:m[1],quote:m[0]}));
  const focus = /(?<![\p{L}\p{N}])([가-힣]+?)(?:은|는|이|가)\s*(?:왜|어떻게|어디|무엇|무슨)/u.exec(original)?.[1] || /(?:왜|어떻게)\s+([가-힣]+?)(?:은|는|이|가)\s/u.exec(original)?.[1] ||
    /(?<![\p{L}\p{N}])([가-힣]+?)(?:은|는|이|가)\s*(?:만들어진|만들어지는|생기는|형성되는)/u.exec(original)?.[1];
  const dayNight = /낮(?:과|이)?\s*밤(?:이|의|은|는)?\s*(?:생기|바뀌|까닭|원인|자전|변화)/u.test(original);
  const formation = focus && !dayNight && /만들어지|만들어진|만들어질|형성되|형성될|생기|생길/u.test(original);
  const purpose = focus && /필요|쓰이나|쓰이는|쓰일|역할|기능/u.test(original);
  const dimension = /비교|차이/u.test(original) ? /크기|무게|질량|속력|온도|길이|높이|세기|넓이/u.exec(original)?.[0] : null;
  // '시간이 다른 이유'는 차이 요구이고 '다른 지역으로'는 목적지를 수식한다.
  const comparisonSubject = /(?<![\p{L}\p{N}])([가-힣]+?)(?:이|가|은|는)\s*(?:서로\s*)?(?:어떻게\s*)?(?:다른\s*(?:이유|까닭|점)|다른지|다를|다르(?:다|냐|니|게|며|고))/u.exec(original)?.[1];
  const production = focus && /어떻게[\s\S]*만들|제작\s*과정|만드[\s\S]*방법/u.test(original);
  return { original, habitat, issues, focus, formation, production, purpose, dimension, comparisonSubject,
    obtaining: focus && /어떻게[\s\S]*(?:얻|추출|채취)/u.test(original),
    biotic: /생물(?:의|들(?:의)?)?\s*관계|먹이\s*(?:사슬|관계|그물)/u.test(original),
    roleConflict: /역할\s*갈등/u.test(original),
    seasonChange: /계절(?:의)?\s*변화/u.test(original),
    dayNight,
    moonPhase: /달(?:의)?\s*(?:모양|위상)/u.test(original),
    localPlace: /(?:우리|지역|지방|살고\s*있는)\s*고장|고장(?:의)?\s*(?:모습|환경|문화|자연|생활)/u.test(original),
    socialization: /사회화/u.test(original) && /과정|기관|학교|개인|아이|학생/u.test(original) };
}
const mechanical = /기계|장치|신호등|지하철|엔진|냉장고|자동차|차량|전화기|컴퓨터|노트북|스마트폰|버스|로봇|전원|엘리베이터|시계/u;
function localSense(text) {
  return [...text.matchAll(/고장/gu)].some(m => {
    const before = text.slice(Math.max(0, m.index - 22), m.index), after = text.slice(m.index + 2, m.index + 18);
    return !mechanical.test(before) && !/^\s*(?:난(?=\s|$)|나(?:자|서|면|는|고|지|게|거나|도|기|요|는데)|났|나\s|낸(?=\s|$)|낼(?=\s|$)|내(?:는|고|서)|수리|을\s*일으)/u.test(after);
  });
}
function sourceContext(item, request, branches = [], meaningMatches = []) {
  const plan = request.sourceContext || contextRequest(request.naturalLanguage?.original || request.positiveQuery || '');
  const fields = contentSources(item), title = fields[0].text || '';
  const units = fields.flatMap(source => sourceSentences(source.text, source.field).map(s => ({ ...s, text: s.quote, supplementId: source.supplementId })));
  // 같은 주제를 이어 설명하는 인접 두 문장까지 본다. 장소/대상 등의 명시 관계는 아래에서 별도로 제한한다.
  const windows = units.flatMap((unit, index) => {
    const next = units[index + 1], source = fields.find(s => s.field === unit.field && s.supplementId === unit.supplementId);
    return [unit, ...(next && next.field === unit.field && next.supplementId === unit.supplementId && next.end - unit.start <= 450 ? [{ ...unit, end: next.end, text: source.text.slice(unit.start, next.end) }] : [])];
  });
  const reject = reason => ({ matched: false, reason, evidence: [] });
  if (plan.localPlace && !fields.some(s => localSense(s.text))) return reject('DIFFERENT_WORD_SENSE');
  if (plan.socialization && !units.some(s => /사회화/u.test(s.text) && /학교|학생|개인|가족|부모|또래|친구|정체성|사회적\s*역할/u.test(title + ' ' + s.text))) return reject('DIFFERENT_CONCEPT_CONTEXT');
  if (plan.dayNight && !units.some(s => /낮/u.test(s.text) && /밤/u.test(s.text) && /자전|회전|태양|햇빛|비추|빛을\s*받/u.test(title + ' ' + s.text))) return reject('MISSING_REQUESTED_RELATION');
  if (plan.moonPhase && !units.some(s => /달|위상/u.test(s.text) && /태양|지구|공전|반사|햇빛|위상/u.test(s.text))) return reject('NON_ASTRONOMICAL_MOON_SHAPE');
  if (plan.obtaining && !units.some(s => matches(plan.focus, title + ' ' + s.text).length && /증발|결정|염전|채취|추출|분리|생산|수확|광산|광석/u.test(s.text))) return reject('MISSING_EXTRACTION_PROCESS');
  if (plan.biotic && !units.some(s => /생물|동물|식물|곤충|철새|조류|어류|포유류|서식|번식/u.test(s.text) && /먹이|먹고|먹히|공생|기생|천적|상호\s*관계/u.test(s.text))) return reject('NON_BIOLOGICAL_RELATION');
  if (plan.roleConflict && !units.some(s => /역할|책임|의무/u.test(s.text) && /갈등|충돌|양립/u.test(s.text))) return reject('MISSING_ROLE_CONFLICT');
  if (plan.seasonChange && !units.some(s => /계절|여름|겨울|봄|가을/u.test(s.text) && /태양|공전|자전축|지구|기온/u.test(s.text))) return reject('NON_PHYSICAL_SEASON_CONTEXT');
  if (plan.formation) {
    const focusPattern = plan.focus.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const result = new RegExp(`${focusPattern}(?:은|는|이|가|도)[^.!?。]{0,65}(?:생기|생긴|생깁|생겨|생겼|만들어지|만들어진|형성|생성)|${focusPattern}(?:의)?\\s*(?:형성|생성|창제|발명|탄생)|(?:풍화|퇴적|분해|쌓여|쌓이|변해|바뀌)[^.!?。]{0,65}${focusPattern}(?:이|가)?\\s*(?:되|된|된다|생)`, 'u');
    if (!units.some(s => result.test(s.text))) return reject('MISSING_FORMATION_OF_SUBJECT');
  }
  if (plan.production && !units.some(s => matches(plan.focus, title + ' ' + s.text).length &&
    /제작|만들|빚|가마|소성|구워|굽|생산|주조|가공|조립/u.test(s.text))) return reject('MISSING_PRODUCTION_OF_SUBJECT');
  if (plan.purpose && !units.some(s => matches(plan.focus, s.text).length && /필요|역할|기능|목적|보장|보호|제한|규정|지키|쓰이|사용하/u.test(s.text))) return reject('MISSING_FUNCTION_OF_SUBJECT');
  if (plan.dimension && !units.some(s => matches(plan.dimension, s.text).length && /비교|차이|보다|가장|크고|작고|높고|낮고|다르|다른/u.test(s.text))) return reject('MISSING_QUANTITATIVE_COMPARISON');
  if (plan.comparisonSubject) {
    const subject = plan.comparisonSubject.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const bound = new RegExp(`${subject}[^.!?。]{0,45}(?:차이|다르|다른|달라|보다|같지)|(?:차이|다르|다른|달라|보다|같지)[^.!?。]{0,45}${subject}`,'u');
    if (!units.some(s=>matches(plan.comparisonSubject,s.text).length&&bound.test(s.text))) return reject('MISSING_COMPARISON_OF_SUBJECT');
  }
  for (const issue of plan.issues || []) {
    if (!units.some(s => matches(issue.topic, title + ' ' + s.text).length && /문제|해결|대책|정책|대안|대응|혼잡|부족|침수|오염/u.test(s.text))) return reject('UNBOUND_TOPIC_AND_ISSUE');
  }
  for (const binding of plan.habitat) {
    if (!units.some(s => matches(binding.place, s.text).length && matches(binding.entity, title + ' ' + s.text).length && /서식|사는|살아|살고|둥지|굴|보금자리|생활/u.test(s.text))) return reject('UNBOUND_PLACE_AND_ENTITY');
  }
  const candidates = branches.length ? branches : [{ semanticConcepts: request.concepts || [], terms: request.terms || [], selected: [] }];
  let branchReason = 'DISCONNECTED_OR_EDITORIAL_MENTION';
  for (const branch of candidates) {
    const groups = [
      ...(branch.semanticConcepts || []).map(c => ({ aliases: c.requestedAliases?.length ? c.requestedAliases : c.aliases || [c.label], requested: c.label })),
      ...(branch.terms || []).filter(t => !softRelationTerm(t)).map(t => ({ aliases: request.contentPlan?.historicalPlace?.places.find(p => p.name === t)?.aliases || [t], requested: t })),
      ...(branch.selected || []).filter(c => !c.directResourceIds?.includes(item.id)).map(c => ({ aliases: c.evidenceTerms || c.aliases || [c.label], requested: c.label }))
    ];
    const unique = [...new Map(groups.map(g => [g.aliases.slice().sort().join('|'), g])).values()];
    const localQualifiers = (plan.localQualifiers || []).filter(q=>unique.some(g=>g.aliases.some(a=>matches(a,q.quote).length)));
    if (localQualifiers.some(q=>!windows.some(s=>q.focusGroups.every(aliases=>aliases.some(a=>matches(a,title+' '+s.text).length)) &&
      /지역|지방|고장|마을|향토|로컬|지리적|특산|도시|농촌|어촌|산골|시골/u.test(title+' '+s.text)))) {
      branchReason='MISSING_LOCAL_QUALIFIER'; continue;
    }
    if (negativeOnlyTopics(fields, unique).length) { branchReason = 'NEGATED_TOPIC_ONLY'; continue; }
    const hit = (group, text, source, start = 0, end = source.text.length) => group.aliases.some(alias => matches(alias, text).length) || meaningMatches.some(m => m.requested === group.requested && m.evidence.some(e => e.field === source.field && e.supplementId === source.supplementId && e.start >= start && e.end <= end && source.text.slice(e.start, e.end).trim()));
    // 편집 개념 묶음의 주변 표현을 사용자가 명시한 좁은 개념으로 승격하지 않는다.
    const original = plan.original || request.naturalLanguage?.original || request.positiveQuery || '';
    const requested = id => (branch.semanticConcepts || []).some(c => c.id === id);
    if (requested('rights') && /인권/u.test(original) &&
      !units.some(s => /인권|기본권|인간의\s*권리|아동\s*권리|어린이\s*권리/u.test(s.text))) continue;
    if (requested('space') && /태양계/u.test(original) && /행성/u.test(original) && !/외계/u.test(original)) {
      const solar = units.filter(s => /태양계/u.test(title + ' ' + s.text) &&
        ['수성', '금성', '지구', '화성', '목성', '토성', '천왕성', '해왕성', '명왕성'].some(name => matches(name, s.text).length));
      if (!solar.length || /특징/u.test(original) && !solar.some(s => /특징|크기|질량|대기|표면|온도|구성|고리/u.test(s.text))) continue;
    }
    if (requested('body') && /우리\s*몸|인체|사람(?:의)?\s*몸/u.test(original) &&
      !units.some(s => /우리\s*몸|인체|사람|인간/u.test(title + ' ' + s.text))) continue;
    const topicUnit = s => unique.some(g => g.aliases.some(alias => matches(alias, title + ' ' + s.text).length));
    // '바뀐 모습'은 주제 단어만 등장하는 자료와 구분한다. 특정 주제별 답안을 만들지 않는다.
    if (candidates.length === 1 && /바뀌|바뀐|달라지|달라진|달라졌|변화하|변화한|변천/u.test(original) &&
      !windows.some(s => topicUnit(s) && /과거|예전|옛|변화|바뀌|바뀐|달라|변천|사라|쇠퇴|재생|탈바꿈|새로운|거듭/u.test(s.text))) { branchReason = 'MISSING_CHANGE_OF_SUBJECT'; continue; }
    // 명시 OR의 다른 분기에 관계 조건을 잘못 적용하지 않는다.
    if (candidates.length === 1 && /원리/u.test(original) && !units.some(s => topicUnit(s) &&
      /원리|원인|때문|에\s*의해|때문에|작용|기전|에\s*따라/u.test(s.text))) continue;
    if (candidates.length === 1 && /보존하는|보전하는|지키는/u.test(original) && !units.some(s => topicUnit(s) &&
      /보존|보전|보호|지키|복원|보수/u.test(s.text))) continue;
    if (unique.length === 1 && !(branch.semanticConcepts || []).length && unique[0].aliases.some(alias => matches(alias, literalSource(item).program).length)) return { matched: true, reason: 'PROGRAM_NAME_CUE', evidence: [] };
    if (unique.some(g => !fields.some(source => hit(g, source.text, source)))) continue;
    // 서로 다른 화제의 단어를 모으지 않고 두 내용군 이상의 국소적 연결을 확인한다.
    if (unique.length > 1 && !windows.some(s => {
      const source = fields.find(f => f.field === s.field && f.supplementId === s.supplementId);
      return unique.every(g => g.aliases.some(alias => alias.length >= 2 && matches(alias, title).length) || hit(g, title + ' ' + s.text, source, s.start, s.end));
    })) continue;
    return { matched: true, reason: 'SOURCE_CONTENT_CONTEXT', evidence: [] };
  }
  return reject(branchReason);
}
module.exports = { sourceContext, contextRequest, contentSources, maskEditorial };
