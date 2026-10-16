const { searchDiagnostics } = require('./search-diagnostics');
const { isContentPredicate } = require('./request-predicates');
const { predicateEvidence } = require('./request-predicate-evidence');
const { sourceContext, contextRequest } = require('./source-context');
const { historicalPlaceEvidence } = require('./historical-place');
const { literalSource, literalText } = require('./source-literal');
const { isTeacherResource } = require('./teacher-resource-store');
const { specificQueryTerms, matchesSpecificTerm } = require('./request-concepts');
const { meaningEvidence, conceptMeaningEvidence, literalMeaningAllowed } = require('./source-meaning');
const { contentRelationEvidence } = require('./request-content-plan');
const { clauseEvidence } = require('./request-clauses');
const { supplementText } = require('./supplement-search');
const { loadDiscoveryCatalog } = require("./discovery-catalog");
const { getSemanticIndex } = require("./semantic-layer");
const { previewContent } = require("./content-preview");
const { sourceChecks, sourceSentences } = require("./source-explanation");
const { requestRelevance } = require("./request-relevance");
const { assessSourceText } = require("./source-text-quality");
const { genreEvidence } = require("./discovery-genre");
const { matchingExpressions } = require("./discovery-query-language");
const { parseDiscoveryIntent } = require("./discovery-intent");
const { sourceVocabulary } = require('./request-nouns');
const { geographicScopeEvidence, matchesPlaceTerm } = require("./search-geographic-scope");
const { requestRelationEvidence } = require("./request-relation-evidence");
const { semanticCandidates, indexRevision } = require("./broadcast-semantic-index");
const { additionalTerms } = require("./content-keywords");
const { concepts: registeredConcepts } = require("./semantic-layer");
const semanticVocabulary = new Set([...additionalTerms, ...registeredConcepts.flatMap(concept => concept.aliases)].map(value => value.toLowerCase()));
const { softRelationTerm, topicAlternatives } = require("./natural-request");
const { contextSensitiveTerms } = require('./keyword-context');

class DiscoveryInputError extends Error {}
const kindLabels = { episode: "일반방송 회차", clip: "클립", lesson: "짧은 강의", collection: "프로그램·회차 탐색 목록" };
const normalize = (text) => String(text || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const resultCache = new WeakMap();
const sensitiveTerms = new Set(contextSensitiveTerms.map(term=>normalize(term).replaceAll(' ','')));

function interpretQuery(query, concepts, programNames = [], sourceWords, interpretContext = true) {
  const understanding = parseDiscoveryIntent(query, { sourceWords, interpretContext, programNames, exclusionAliases: concepts.flatMap((concept) => [...concept.aliases, ...concept.places.flatMap((place) => place.aliases || [place.name])]) });
  // 조건·부정을 제거한 동일 문장으로 모든 경로를 만든다. 구형 검색어로 돌아가지 않는다.
  const branches = understanding.positiveQuery.split(/\s+(?:또는|아니면|혹은)\s+/u).map((text) => {
    const selected = concepts.filter((concept) => concept.aliases.some((alias) => matchingExpressions(alias,text).length > 0));
    let remaining = text;
    for (const concept of selected) for (const alias of [...concept.aliases].sort((a, b) => b.length - a.length)) remaining = remaining.replaceAll(normalize(alias), " ");
    const parsed = parseDiscoveryIntent(remaining, { sourceWords, interpretContext });
    // 지리 탐색 어휘와 등록 개념이 겹쳐도 소개문 문맥 조건을 우회하지 않는다.
    const overlapping = parseDiscoveryIntent(text, { sourceWords, interpretContext }).concepts.filter(concept=>selected.some(geo=>
      geo.id===concept.id || normalize(geo.label)===normalize(concept.label)));
    const semanticConcepts = [...new Map([...parsed.concepts,...overlapping].map(concept=>[concept.id,concept])).values()];
    const specificTerms = semanticConcepts.flatMap(concept => specificQueryTerms(concept,text));
    return { selected, semanticConcepts, alternativeGroups: understanding.alternativeGroups,
      // 장소 수식 구절 전체를 원문 필수 문자열로 중복 추가하지 않는다.
      // 구성 명사는 위 파서와 sourceContext의 국소 연결 검사에서 확인한다.
      terms: [...new Set([...parsed.terms, ...specificTerms])].filter((term) => !(selected.length && ["지형", "국내", "우리나라"].includes(term))) };
  });
  const uniqueById = (items) => [...new Map(items.map((item) => [item.id, item])).values()];
  const selected = uniqueById(branches.flatMap((branch) => branch.selected));
  const semanticConcepts = uniqueById(branches.flatMap((branch) => [...branch.semanticConcepts, ...branch.alternativeGroups.flatMap((group) => group.flatMap((item) => item.concepts))]));
  const terms = [...new Set(branches.flatMap((branch) => branch.terms))];
  understanding.sourceContext = contextRequest(understanding.naturalLanguage?.original || query);
  understanding.sourceContext.localQualifiers = (understanding.contentPlan?.qualifierPhrases || []).flatMap(quote=>{
    const focus = parseDiscoveryIntent(quote.replace(/^지역\s+/u,''),{sourceWords,interpretContext:false});
    const focusGroups = [...focus.terms.map(term=>[term]),...focus.concepts.map(c=>c.requestedAliases?.length?c.requestedAliases:c.aliases)];
    return focusGroups.length?[{quote,focusGroups}]:[];
  });
  understanding.connector = branches.length > 1 ? "OR" : "AND";
  understanding.groups = branches.map((branch) => ({ operator: "AND", conceptIds: branch.semanticConcepts.map((concept) => concept.id), geographyIds: branch.selected.map((concept) => concept.id), terms: branch.terms, alternatives: branch.alternativeGroups }));
  const excludedConcepts = uniqueById(understanding.excluded.flatMap((term) => parseDiscoveryIntent(term).concepts.filter(c=>c.aliases.some(a=>normalize(a)===normalize(term)))));
  const excludedGeography = concepts.filter((concept) => concept.aliases.some((alias) => understanding.excluded.some((term) => normalize(term).replaceAll(" ", "") === normalize(alias).replaceAll(" ", ""))));
  return { selected, semanticConcepts, terms, understanding, branches, excludedConcepts, excludedGeography };
}

async function discoverContents(input = {}, catalog, { includeCandidates = false, useSemantic = true, interpretContext = true, diagnostics = false } = {}) {
  const q = String(input.q || "").trim();
  if (q.length > 200) throw new DiscoveryInputError("검색어는 200자 이내로 입력하세요.");
  const kind = input.kind || "all";
  const access = input.access || "all";
  if (!["all", "direct"].includes(access)) throw new DiscoveryInputError("바로가기 조건이 올바르지 않습니다.");
  if (!["all", ...Object.keys(kindLabels)].includes(kind)) throw new DiscoveryInputError("자료 유형이 올바르지 않습니다.");
  if (input.page && !/^[1-9]\d{0,5}$/.test(String(input.page))) throw new DiscoveryInputError("페이지가 올바르지 않습니다.");
  const place = String(input.place || "");
  const program = String(input.program || "");
  catalog ||= await loadDiscoveryCatalog();
  const programs = [...new Set(catalog.resources.filter((item) => (item.kind !== "collection" || isTeacherResource(item))).map((item) => item.program))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"));
  if (program && !programs.includes(program)) throw new DiscoveryInputError("현재 목록에 없는 프로그램입니다.");
  const { selected, terms, understanding, semanticConcepts, branches, excludedConcepts, excludedGeography } = interpretQuery(q, catalog.concepts, programs, sourceVocabulary(catalog.resources), interpretContext);
  const semanticIndex = getSemanticIndex(catalog);
  const hasGenreRequest = understanding.preferences.genres.length || understanding.constraints.requiredGenres?.length || understanding.constraints.excludedGenres?.length;
  const allPlaces = selected.flatMap((concept) => concept.places);
  if (place && !allPlaces.some((item) => item.name === place)) throw new DiscoveryInputError("현재 개념에 없는 장소입니다. 장소 조건을 초기화하세요.");
  if (!resultCache.has(catalog)) resultCache.set(catalog, new Map());
  const cache = resultCache.get(catalog), cacheKey = JSON.stringify([q, kind, access, place, program, interpretContext, useSemantic && understanding.positiveQuery ? indexRevision() : "keyword"]);
  const cached = diagnostics ? undefined : cache.get(cacheKey);
  const trace = searchDiagnostics(diagnostics, q);
  const language = understanding.naturalLanguage;
  const semantic = useSemantic && understanding.positiveQuery && !cached ? await semanticCandidates(catalog, understanding.positiveQuery) :
    { matches: new Map(), status: cached?.semanticStatus || "NOT_REQUESTED", elapsedMs: 0 };
  const scores = [];
  if (!cached) for (const resource of catalog.resources) {
    trace.mark("catalog", resource);
    const literal = literalSource(resource);
    const historicalContext = historicalPlaceEvidence(resource, understanding.contentPlan?.historicalPlace);
    if (historicalContext.requested && !historicalContext.matched) { trace.mark("rejected", resource, "HISTORICAL_PLACE"); continue; }
    if (program && resource.program !== program) { trace.mark("rejected", resource, "PROGRAM_FILTER"); continue; }
    const geographicEvidence = geographicScopeEvidence(literal, understanding.constraints.geographicScope);
    if (!geographicEvidence.matches) { trace.mark("rejected", resource, "GEOGRAPHY"); continue; }
    if (understanding.constraints.excludedPrograms?.includes(resource.program)) { trace.mark("rejected", resource, "EXCLUDED_PROGRAM"); continue; }
    const genreCues = hasGenreRequest ? genreEvidence(resource) : [];
    const genreMatches = genreCues.map(cue => cue.label);
    const requiredGenres = understanding.constraints.requiredGenres || [];
    const matchesForm = label => genreMatches.includes(label);
    if (requiredGenres.length && !(understanding.constraints.genreOperator === "OR" ? requiredGenres.some(matchesForm) : requiredGenres.every(matchesForm))) { trace.mark("rejected", resource, "REQUIRED_GENRE"); continue; }
    if (understanding.constraints.excludedGenres?.some(label => genreMatches.includes(label))) { trace.mark("rejected", resource, "EXCLUDED_GENRE"); continue; }
    const preferredGenre = understanding.preferences.genres.some(label => genreMatches.includes(label));
    if (understanding.requiredPrograms.length && !understanding.requiredPrograms.includes(resource.program)) { trace.mark("rejected", resource, "REQUIRED_PROGRAM"); continue; }
    if (understanding.constraints.excludedKinds?.includes(resource.kind)) { trace.mark("rejected", resource, "EXCLUDED_KIND"); continue; }
    if (access === "direct" && !(resource.navigation?.status === "MATCHED" && ["CLIP", "EPISODE"].includes(resource.navigation.kind))) { trace.mark("rejected", resource, "ACCESS"); continue; }
    const text = normalize(`${literal.title} ${literal.program} ${literal.summary} ${literalText(supplementText(resource))}`);
    const tags = semanticIndex.get(resource.id);
    const sourceKeywordMatches = term => (tags.contentKeywords || []).some(word=>
      normalize(word.label).replaceAll(' ','')===normalize(term).replaceAll(' ','') ||
      normalize(word.evidence.quote).replaceAll(' ','')===normalize(term).replaceAll(' ','') ||
      matchingExpressions(term,word.label).length>0);
    const matchedTags = tags.supported.filter((tag) => semanticConcepts.some((concept) => concept.id === tag.conceptId));
    if (understanding.excluded.some((term) => matchingExpressions(term,text).length > 0)) { trace.mark("rejected", resource, "EXCLUDED_LITERAL"); continue; }
    if (understanding.excluded.some((term) => meaningEvidence(resource,term))) { trace.mark("rejected", resource, "EXCLUDED_MEANING"); continue; }
    if (tags.supported.some((tag) => excludedConcepts.some((concept) => concept.id === tag.conceptId))) { trace.mark("rejected", resource, "EXCLUDED_CONCEPT"); continue; }
    if (excludedGeography.some((concept) => concept.directResourceIds.includes(resource.id) || concept.places.some((place) => place.resourceIds.includes(resource.id)) || (concept.evidenceTerms || concept.aliases).some((term) => matchingExpressions(term,text).length > 0))) { trace.mark("rejected", resource, "EXCLUDED_GEOGRAPHY"); continue; }
    const relations = selected.flatMap((concept) => concept.places.filter((item) => item.resourceIds.includes(resource.id))
      .map((item) => ({ concept: concept.label, place: item.name, role: item.role, note: item.note, sourceUrl: concept.sourceUrl })));
    if (resource.id.startsWith("BCAST-") && resource.summary) {
      for (const concept of selected) for (const place of concept.places) {
        const topic = (place.evidenceTerms || []).find((term) => matchingExpressions(term,text).length > 0);
        if (topic && (place.aliases || [place.name]).some((name) => matchingExpressions(name,text).length > 0)) {
          const excerpt = `${resource.title}. ${resource.summary}`;
          const at = excerpt.indexOf(topic);
          relations.push({ concept: concept.label, place: place.name, role: place.role,
            note: `공식 제목·소개문에서 장소와 지형 표현을 함께 확인: “${excerpt.slice(Math.max(0, at - 40), at + 100)}”. 비교 후보이며 실제 장면은 별도 확인합니다.`,
            sourceUrl: concept.sourceUrl, evidenceUrl: resource.evidenceUrl });
        }
      }
    }
    trace.mark("eligibleBeforeContent", resource);
    const direct = selected.some((concept) => concept.directResourceIds.includes(resource.id));
    const topicMatched = selected.some((concept) => (concept.evidenceTerms || concept.aliases).some((term) => matchingExpressions(term,text).length > 0));
    const contentRelation = contentRelationEvidence(resource, understanding.contentPlan);
    const semanticMatch = semantic.matches.get(resource.id);
    const semanticUsable = semanticMatch?.similarity >= 0.84 && semanticMatch.evidence.field === "summary";
    const branchMeaning = new Map();
    const groundedPredicates = new Map();
    const branchMatches = (branch) => {
      if (branch.selected.some(concept => concept.aliases.some(alias=>matchingExpressions(alias, `${resource.title} ${resource.summary}`).length) && !concept.aliases.some(alias=>matchingExpressions(alias, `${literal.title} ${literal.summary}`).length))) return false;
      const expanded=[];
      const termMeaning=term=>{const found=meaningEvidence(resource,term);if(found)expanded.push(found);return Boolean(found);};
      const conceptMatches=concept=>{
        if(tags.supported.some(tag=>tag.conceptId===concept.id))return true;
        const found=conceptMeaningEvidence(resource,concept);if(found)expanded.push(found);return Boolean(found);
      };
      const alternativeMatches=option=>{
        const start=expanded.length;
        const matched=option.concepts.every(conceptMatches)&&option.terms.every(term=>matchingExpressions(term,text).length>0||termMeaning(term));
        if(!matched)expanded.splice(start);
        return matched;
      };
      const conditions = [
        ...branch.semanticConcepts.map(conceptMatches),
        ...branch.alternativeGroups.map((group) => group.some(alternativeMatches)),
        ...branch.selected.map((concept) => tags.supported.some(tag=>tag.conceptId===concept.id || normalize(tag.label)===normalize(concept.label)) || relations.some((relation) => relation.concept === concept.label) || concept.directResourceIds.includes(resource.id) || (concept.evidenceTerms || concept.aliases).some((term) => matchingExpressions(term,text).length > 0)),
        ...branch.terms.filter(term => !language?.active || language.explicitConjunction || !softRelationTerm(term)).map((term) =>
          (sensitiveTerms.has(normalize(term).replaceAll(' ','')) ? sourceKeywordMatches(term) :
          matchesSpecificTerm(term,text)&&literalMeaningAllowed(resource,term) || matchesPlaceTerm(term, literal) || relations.some(item=>matchingExpressions(term,item.place).length > 0)) || termMeaning(term) || historicalContext.places.includes(term))
      ];
      if (diagnostics) {
        const labels = [...branch.semanticConcepts.map(c=>'concept:'+c.label), ...branch.alternativeGroups.map((_,i)=>'alternative:'+i), ...branch.selected.map(c=>'geography:'+c.label),
          ...branch.terms.filter(term => !language?.active || language.explicitConjunction || !softRelationTerm(term)).map(t=>'term:'+t)];
        trace.branch(resource, conditions.map((matched,i)=>({label:labels[i],matched:Boolean(matched)})));
      }
      const topicTerms = branch.terms.filter(term => !softRelationTerm(term));
      const predicateTerms = branch.terms.filter(isContentPredicate);
      const predicateGrounding = new Map();
      const predicateBranch = predicateTerms.length > 0 && !language?.explicitConjunction &&
        !branch.alternativeGroups.length && !branch.selected.length &&
        (branch.semanticConcepts.length > 0 || topicTerms.some(term=>!isContentPredicate(term))) &&
        branch.semanticConcepts.every(conceptMatches) && topicTerms.filter(term=>!isContentPredicate(term)).every(term =>
          (sensitiveTerms.has(normalize(term).replaceAll(' ','')) ? sourceKeywordMatches(term) :
            matchesSpecificTerm(term,text) && literalMeaningAllowed(resource,term) || matchesPlaceTerm(term,literal)) || termMeaning(term)) &&
        predicateTerms.every(term => {
          const found = predicateEvidence(resource,term,branch,understanding.naturalLanguage?.original || q);
          if (found) predicateGrounding.set(term,found);
          return Boolean(found);
        });
      const semanticBranch = language?.active && !language.explicitConjunction && semanticUsable &&
        !branch.selected.length && !branch.alternativeGroups.length &&
        (topicTerms.length > 0 || branch.semanticConcepts.length > 0) &&
        topicTerms.every(term => {
          const literalMatch = matchesSpecificTerm(term,text);
          if (sensitiveTerms.has(normalize(term).replaceAll(" ", ""))) return sourceKeywordMatches(term);
          if (!semanticVocabulary.has(term)) return literalMatch || matchesPlaceTerm(term, literal);
          // 최연소·자전거만 있는 자료를 의미 점수로 다시 유입시키지 않는다.
          return literalMatch || (!text.includes(term) && (topicAlternatives[term] || []).some(alias => matchingExpressions(alias, literal.summary).length > 0));
        }) && branch.semanticConcepts.every(concept => tags.supported.some(tag => tag.conceptId === concept.id) ||
          !concept.aliases.some(alias => text.includes(normalize(alias))) && (topicAlternatives[concept.label] || []).some(alias => matchingExpressions(alias, literal.summary).length > 0));
      const matched=predicateBranch || semanticBranch || (conditions.length > 0 || understanding.requiredPrograms.length > 0 || understanding.preferences.programs.includes(resource.program) || (preferredGenre && !understanding.preferences.programs.length) || understanding.constraints.requiredGenres?.length || (!understanding.positiveQuery && (understanding.constraints.excludedPrograms?.length || understanding.constraints.excludedGenres?.length))) && conditions.every(Boolean);
      if(matched)branchMeaning.set(branch,expanded);
      if (predicateBranch) for (const [term,found] of predicateGrounding) groundedPredicates.set(term,found);
      if (predicateBranch && !conditions.every(Boolean)) trace.mark('sourcePredicateAccepted', resource);
      return matched;
    };
    // 관계 어휘는 원문 재정렬에 사용하고 명시 AND·미지의 내용어는 필수로 유지한다.
    const matchedBranches = branches.filter(branch => {
      if (understanding.contentPlan?.relations.length && !contentRelation.matched) return false;
      return branchMatches(branch) || (contentRelation.matched && !branch.terms.length && !branch.semanticConcepts.length && !branch.selected.length && !branch.alternativeGroups.length);
    });
    if (q && !matchedBranches.length) { trace.mark("rejected", resource, "LEXICAL_OR_RELATION"); continue; }
    trace.mark("contentMatched", resource);
    const meaningMatches=[...new Map(matchedBranches.flatMap(branch=>branchMeaning.get(branch)||[]).map(match=>[match.requested,match])).values()];
    // 동작 표현의 정확 문자열을 후보 수집 뒤에서 다시 필수 명사로 강제하지 않는다.
    // 자기 회차의 동작 근거가 있는 후보만 사용하고 명사/고유명·명시 AND·원문 관계 검사는 보존한다.
    const semanticPredicates = [...groundedPredicates.keys()];
    const contextBranches = semanticPredicates.length ? matchedBranches.map(branch=>({...branch,terms:branch.terms.filter(t=>!semanticPredicates.includes(t))})) : matchedBranches;
    const contentContext = sourceContext(resource, { ...understanding, concepts: semanticConcepts, terms }, contextBranches, [...meaningMatches, ...tags.supported.map(t => ({ requested:t.label, evidence:[t.evidence] }))]);
    if (!contentContext.matched) { trace.mark("rejected", resource, contentContext.reason); continue; }
    trace.mark("contextMatched", resource);
    if (place && !relations.some((item) => item.place === place)) { trace.mark("rejected", resource, "PLACE_FILTER"); continue; }
    const matchedTerms = terms.filter((term) => matchingExpressions(term, text).length > 0 || relations.some((item) => matchingExpressions(term,item.place).length > 0));
    const sourceMatchedTerms = [...new Set(matchedTerms.flatMap((term) => matchingExpressions(term, normalize(`${literal.title} ${literal.summary}`))))];
    const verifiedKeywordTerms = matchedTerms.filter(sourceKeywordMatches);
    const requestedDetails = understanding.detailRequests.map((detail) => ({ label: detail.label,
      matchedExpressions: detail.terms.filter((term) => matchingExpressions(term, `${literal.title} ${literal.summary}`).length > 0), status: "RELATION_NOT_VERIFIED" }));
    const preferredProgram = understanding.preferences.programs.includes(resource.program);
    // 관련성은 요청한 주제·원문 표현·명시적 선호로 판단한다. 유형·링크·소개문 보유 자체에는 가점이 없다.
    const score = (relations.length ? 30 : 0) + (direct ? 5 : 0) +
      terms.filter((term) => matchingExpressions(term, normalize(literal.title)).length > 0).length * 10 + matchedTags.length * 15 +
      terms.filter((term) => matchingExpressions(term, normalize(literal.summary)).length > 0).length * 6 +
      verifiedKeywordTerms.length * 8 + requestedDetails.filter((detail) => detail.matchedExpressions.length).length * 18 + (preferredProgram ? 25 : 0) + (preferredGenre ? 25 : 0);
    const requestRelation = requestRelationEvidence(resource, understanding, selected);
    const excludedConditions = (understanding.constraints.exclusionClauses || []).map(clause=>clauseEvidence(clause,resource));
    if (excludedConditions.some(c=>c.status==="EXCLUDED_TEXT_FOUND")) { trace.mark("rejected", resource, "EXCLUDED_CLAUSE"); continue; }
    const sourcePredicateEvidence = [...groundedPredicates.values()];
    const relevanceEvidence = requestRelevance({ ...resource, contentRelation, requestRelation, sourcePredicateEvidence }, { ...understanding, concepts: semanticConcepts, terms }, sourceSentences(resource.summary), catalog);
    if (relevanceEvidence.focus.status === 'DUPLICATE_DESCRIPTION_CONFLICT') { trace.mark("rejected", resource, "DUPLICATE_DESCRIPTION"); continue; }
    trace.mark("ranked", resource);
    scores.push({ ...resource, contentContext, historicalContext, meaningMatches, sourcePredicateEvidence, figurativeExpressions: literal.figurativeExpressions, relevanceEvidence, contentRelation, excludedConditions, geographicEvidence, requestRelation, semanticRetrieval: semanticUsable ? { ...semanticMatch, status: "SIMILARITY_ONLY", relationStatus: "UNCONFIRMED", predicateDetails: semanticPredicates.map(term=>({...groundedPredicates.get(term),status:'UNCONFIRMED'})) } : null, contentKeywords:tags.contentKeywords, verifiedKeywordTerms,
      genreEvidence: genreCues, semanticTags: tags.supported, inferredTags: tags.candidates,
      matchedConceptGroups: matchedBranches.map((branch) => [...branch.semanticConcepts, ...branch.selected,
        ...branch.alternativeGroups.flatMap((group) => group.filter((item) => item.concepts.every((concept) => tags.supported.some((tag) => tag.conceptId === concept.id)) && item.terms.every((term) => matchingExpressions(term,text).length > 0)).flatMap((item) => item.concepts))].filter(concept => tags.supported.some(tag => tag.conceptId === concept.id) || branch.selected.includes(concept)).map((concept) => concept.id)),
      requestedDetails, preferredProgram,
      kindLabel: (resource.sourceSystem === "EBS_NEWS" ? "뉴스 클립" : kindLabels[resource.kind]) + (resource.variant === "COMPILATION_OR_REPEAT" ? " · 합본/재방송 표시" : ""), relations,
      reason: relations.length ? `${relations[0].concept} → ${relations[0].place} · ${relations[0].role}` :
        direct ? "개념을 제목에서 직접 확인할 수 있는 자료" : matchedTags.length ? `${matchedTags.map((tag) => tag.label).join(" · ")} 관련 표현을 원문에서 확인 · 수업 적합성 미판정` : sourceMatchedTerms.length ? `원본 제목·소개에서 ${sourceMatchedTerms.join(" · ")} 확인` : matchedTerms.length ? (matchedTerms.some(term=>matchingExpressions(term,literalText(supplementText(resource))).length) ? `공식 보조 설명에서 ${matchedTerms.filter(term=>matchingExpressions(term,literalText(supplementText(resource))).length).join(" · ")} 확인` : `프로그램명에서 ${matchedTerms.filter(term=>matchingExpressions(term,literal.program).length).join(" · ")} 확인`) : topicMatched ? "공식 제목·소개문에서 개념 관련 표현 확인 · 실제 장면 별도" : "보유 목록에서 탐색",
      score: score + historicalContext.rank * 100 + relevanceEvidence.score + relevanceEvidence.focus.score + Math.min(24,meaningMatches.length*8) + (contentRelation.matched ? 40 : 0) + requestRelation.rank * 200 + (semanticUsable ? (semanticMatch.similarity - 0.8) * 80 : 0) });
  }
  const facets = cached?.facets || Object.fromEntries(Object.keys(kindLabels).map((key) => [key, scores.filter((item) => item.kind === key).length]));
  // 기본 화면에는 개별 회차·클립·강의만, 묶음은 별도 선택했을 때만 표시한다.
  const filtered = cached?.filtered || scores.filter((item) => kind === "all" ? (item.kind !== "collection" || isTeacherResource(item)) : item.kind === kind)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id));
  if (!diagnostics && !cached && semantic.status !== "LOCAL_FAILED") { cache.set(cacheKey, { facets, filtered, scores, semanticStatus: semantic.status }); if (cache.size > 8) cache.delete(cache.keys().next().value); }
  const total = filtered.length;
  const pageSize = 9;
  const pages = Math.ceil(total / pageSize);
  const page = Math.min(Number(input.page || 1), Math.max(1, pages));
  const results = filtered.slice((page - 1) * pageSize, page * pageSize).map(({ score, ...item }) => item);
  return {
    ...(diagnostics ? { diagnostics: { ...trace.report, semanticCandidates: semantic.matches.size, semanticAboveThreshold: [...semantic.matches.values()].filter(m=>m.similarity>=0.84).length } } : {}),
    version: catalog.version, query: q, kind, access, place, program, programs, page, pages, pageSize, total, facets,
    concepts: selected, terms, understanding, stats: catalog.stats, results,
    ...(includeCandidates ? { candidates: filtered, facetCandidates: cached?.scores || scores } : {}),
    retrieval: { keyword: true, semantic: semantic.status, elapsedMs: semantic.elapsedMs, externalApiCalls: 0 },
    mode: "LOCAL_SOURCE_DISCOVERY", paidApiCalls: 0,
    note: "출처 기반 탐색 자료입니다. 교육과정 연계·학년 적합성·영상 장면은 승인되지 않았습니다.",
    emptyMessage: "이 조건에 맞는 자료가 없습니다. 긴 문장은 주제 핵심어 1~2개로 줄여보세요. 프로그램·자료 유형·장소·개별 페이지 확인 조건도 확인하세요."
  };
}

async function getDiscoveryResources(input = {}) {
  const ids = String(input.ids || "").split(",");
  if (ids.length > 100 || ids.some((id) => !/^[A-Za-z0-9_-]{1,100}$/.test(id))) {
    throw new DiscoveryInputError("자료 ID는 1~100개까지 조회할 수 있습니다.");
  }
  const requested = new Set(ids);
  const { teacherCatalog } = require("./teacher-approvals");
  const catalog = await teacherCatalog(await loadDiscoveryCatalog());
  return { resources: catalog.resources.filter((item) => requested.has(item.id)).map((item) => ({
    id: item.id, title: item.title, navigation: item.navigation, limitation: item.limitation,
    summary: item.summary, descriptionPatch: item.descriptionPatch, evidenceUrl: item.evidenceUrl, contentPreview: previewContent(item), sourceQuality: assessSourceText(item.title, item.summary), sourceChecks: sourceChecks(item),
    searchExplanation: null, curriculumComparison: null, recommendationExplanation: "현재 원문으로 갱신했습니다. 요청별 근거는 자료 찾기에서 다시 비교하세요.",
    durationSeconds: item.durationSeconds || null, durationMinutes: item.durationMinutes || null,
    sourceUrl: item.sourceUrl, sourceSystem: item.sourceSystem, variant: item.variant,
    curriculumStatus: item.curriculumStatus, approvedLinks: item.approvedLinks, automaticLinks: item.automaticLinks,
    evidenceRefresh: item.evidenceRefresh, broadcastDate: item.broadcastDate || null
  })) };
}

module.exports = { discoverContents, getDiscoveryResources, interpretQuery, DiscoveryInputError };
