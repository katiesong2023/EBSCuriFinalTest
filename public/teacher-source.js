(() => {
 'use strict';
 const {escape,sourceLink}=CuriTeacher;
 function highlightSource(text,evidence=[]) {
  const raw=String(text||'');const ranges=evidence.filter(q=>['summary','synopsis'].includes(q.field)&&Number.isInteger(q.start)&&Number.isInteger(q.end)&&q.start>=0&&q.end>q.start&&raw.slice(q.start,q.end)===q.quote).sort((a,b)=>a.start-b.start);
  const merged=[];for(const q of ranges){const last=merged.at(-1);if(last&&q.start<=last.end)last.end=Math.max(last.end,q.end);else merged.push({start:q.start,end:q.end});}
  const safe=value=>escape(value).replace(/&lt;br\s*\/?&gt;/gi,'<br>');
  let end=0,result='';for(const q of merged){result+=safe(raw.slice(end,q.start))+`<mark>${safe(raw.slice(q.start,q.end))}</mark>`;end=q.end;}return result+safe(raw.slice(end));
 }
 function sourceMarkup(item) {
  const explanation=item.searchExplanation||{},guide=item.contentPreview||{};
  const evidence=[...(item.contentKeywords||[]).map(keyword=>keyword.evidence).filter(Boolean),...(guide.evidence||[]),...(explanation.topicEvidence||[]),...validMeaningMatches(item).flatMap(match=>match.evidence),...(explanation.details||[]).flatMap(d=>d.evidence||[]),...(item.automaticLinks||[]).flatMap(l=>l.quotes||[]),...(item.approvedLinks||[]).flatMap(l=>l.quotes||[])];
  return `<p class="recommendation-explanation"><b>검색 관련 이유</b><br>${escape(explanation.text||item.recommendationExplanation||item.reason)}</p>
   ${item.requestRequirements ? `<p><b>요청별 대조</b> · ${item.requestRequirements.confirmation === 'SOURCE_REQUIREMENTS_MATCH' ? '원문/메타데이터 조건 일치 · 영상 미확인' : '확인 전 탐색 후보 · 모든 필수 조건 충족은 미확인'}</p><ul>${item.requestRequirements.items.map(requirement => `<li>${escape(requirement.label)} · ${escape(({required:'필수',excluded:'제외',preferred:'선호',context:'수업 문맥'})[requirement.mode] || requirement.mode)} · ${escape(({MATCH:'원문 조건 일치',MISMATCH:'불일치',UNKNOWN:'미확인'})[requirement.status] || requirement.status)}</li>`).join('')}</ul>` : ''}
   ${(explanation.topicEvidence||[]).map(q=>`<blockquote>${escape(q.quote)}</blockquote><small>소개문 위치 ${q.start}–${q.end}</small>`).join('')}
   ${(explanation.supplementEvidence||[]).map(q=>`<blockquote>${escape(q.quote)}</blockquote><small>공식 보조 원문 위치 ${q.start}–${q.end} · 소개문과 별도</small>`).join('')}
   ${(explanation.details||[]).map(d=>`<p><b>${escape(d.label)}</b> · 관련 표현 대조</p>${d.evidence.map(q=>`<blockquote>${escape(q.quote)}</blockquote>`).join('')}`).join('')}
   ${(explanation.unconfirmed||[]).length?`<p><b>아직 확인되지 않은 요청</b></p><ul>${explanation.unconfirmed.map(s=>`<li>${escape(s)}</li>`).join('')}</ul>`:''}
   <details class="source-description"><summary>${item.descriptionPatch?.sourceKind==='OFFICIAL_DESCRIPTION_EXCERPT'?'공식 소개 발췌 · 근거 강조':'공개 소개문 전체 · 근거 강조'}</summary><p>출처에서 확보한 소개문입니다. 방송 내용 안내는 이 원문에서 별도로 구성했습니다.</p><p class="full-description">${highlightSource(item.summary,evidence)||'확보한 소개문 없음'}</p><p><a href="${escape(sourceLink(item.evidenceUrl||item.sourceUrl))}" target="_blank" rel="noopener noreferrer">${/list/i.test(new URL(item.evidenceUrl||item.sourceUrl).pathname) ? "소개문 출처 · 회차 목록" : "소개문 출처"} ↗</a></p></details>${supplementMarkup(item)}`;
 }
 function validMeaningMatches(item) {
  return (item.searchExplanation?.meaningMatches||item.meaningMatches||[]).filter(match=>match.evidence?.length&&match.evidence.every(q=>
   {const text=q.field==='sourceSupplement'?(item.sourceSupplements||[]).find(s=>s.id===q.supplementId&&s.identity?.resourceId===item.id)?.text:item[q.field];return ['title','summary','sourceSupplement'].includes(q.field)&&typeof text==='string'&&text.slice(q.start,q.end)===q.quote;}));
 }
 function selectionMarkup(item) {
  const review=item.candidateReview,requirements=item.requestRequirements?.items||[];
  const goalComparisons=item.curriculumComparison?.requirementComparisons||[];
  const quotes=review?.quotes||(goalComparisons.some(r=>r.quotes.length)?goalComparisons.flatMap(r=>r.quotes):null)||[...(item.searchExplanation?.topicEvidence||[]),...(item.searchExplanation?.supplementEvidence||[])];
  const verified=quotes.filter(q=>{const source=q.field==='sourceSupplement'?(item.sourceSupplements||[]).find(s=>s.id===q.supplementId&&s.identity?.resourceId===item.id)?.text:['title','summary'].includes(q.field)?item[q.field]:undefined;return typeof source==='string'&&source.slice(q.start,q.end)===q.quote;});
  const unique=[...new Map(verified.map(q=>[q.field+':'+(q.supplementId||'')+':'+q.start+':'+q.end,q])).values()].slice(0,2);
  const missing=requirements.filter(r=>['required','excluded'].includes(r.mode)&&r.status==='UNKNOWN').map(r=>r.label);
  const remaining=item.lessonGoalContext&&goalComparisons.length?goalComparisons.filter(r=>r.status!=='SUPPORTED').map(r=>r.requirement):missing.length?missing:(item.searchExplanation?.unconfirmed||[]);
  return `<section class="selection-reason" aria-label="자료 선택 이유"><p><b>${item.lessonGoalContext?'이 수업에 쓸 이유':'요청과의 연결'}</b></p>${review?.selectionReason ? `<p>${escape(review.selectionReason)}</p>` : ""}
   ${item.lessonGoalContext?`<p>${escape(item.curriculumScope==='EXPANSION'?'선택 기준 연계 미확인':goalComparisons.filter(r=>r.status==='SUPPORTED').map(r=>r.requirement).join(' / ')||'관련 개념 후보 · 선택 요구 설명은 미확인')}</p><p>추가 확인: 실제 장면·설명 수준·학생 수행</p><p><b>교사가 준비할 활동</b> ${escape(item.curriculumComparison?.activityNote||'목표와 원문을 대조하고, 학생이 수행할 활동을 별도로 준비하세요.')}</p>`:''}
   ${review?`<p>전달된 원문 비교 · ${escape(({SUITABLE:'요청 근거 확인',PARTIAL:'부분 관련',SOURCE_INSUFFICIENT:'원문 부족'})[review.judgment]||'확인 필요')} · 영상 적합성 미확인</p>`:''}
   ${validMeaningMatches(item).length?`<p><b>다른 표현으로 찾은 관련 후보</b></p><ul aria-label="검색어와 원문 표현">${validMeaningMatches(item).map(match=>`<li>${escape(match.requested)} · 원문 ‘${match.evidence.map(q=>escape(q.quote)).join(' · ')}’</li>`).join('')}</ul>`:''}
   ${unique.length ? `<blockquote>${escape(unique[0].quote)}</blockquote>${unique.length > 1 ? `<details><summary>추가 근거 보기</summary>${unique.slice(1).map(q=>`<blockquote>${escape(q.quote)}</blockquote>`).join("")}</details>` : ""}` : `<p>요청 내용의 근거는 소개문에서 추가 확인해 주세요.</p>`}
   ${remaining.length?`<p><b>남은 확인</b> ${remaining.slice(0,3).map(escape).join(' · ')}</p>`:''}
   <p class="video-unconfirmed">영상·장면 적합성은 별도 확인이 필요합니다.</p></section>`;
 }
 function supplementMarkup(item) {
  return (item.sourceSupplements||[]).filter(s=>s.identity?.resourceId===item.id&&sourceLink(s.sourceUrl)).map(s=>`<details class="source-supplement"><summary>${escape(s.label)} · 소개문과 별도</summary><p>${escape(s.title)}</p><blockquote>${escape(s.text)}</blockquote><p>원문 위치: ${escape(s.location)} · 확인: ${escape(s.checkedAt)}</p><p>${escape(s.scope)}</p><a href="${escape(sourceLink(s.sourceUrl))}" target="_blank" rel="noopener noreferrer">공식 보조 원문 ↗</a></details>`).join('');
 }
 function checksMarkup(item) {
  const c=item.sourceChecks||{};
  const rows=[['출처 회차',item.id],['회차 식별',c.identity||'미확인'],['회차 확인 시점',c.identityCheckedAt||'미확인'],['소개문 대조',c.description||'미확인'],['소개문 확인 시점',c.descriptionCheckedAt||'미확인'],['자료 기록일',c.collectedAt||item.checkedAt||'미확인'],['페이지 표기 재생시간',c.durationSeconds?`${Math.floor(c.durationSeconds/60)}분 ${Math.round(c.durationSeconds%60)}초`:'미확인'],['시간 확인 시점',c.durationCheckedAt||'미확인'],['실제 재생·장면·학년 적합성','각각 미확인']];
  return `<dl class="source-checks">${rows.map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl>${c.durationSourceUrl?`<a href="${escape(sourceLink(c.durationSourceUrl))}" target="_blank" rel="noopener noreferrer">재생시간 표기 출처 ↗</a>`:''}<p>방송일은 EBS 공개 목록 표기이며 최초 방송일과 다를 수 있습니다. 페이지 표기 시간은 재생 확인 결과가 아닙니다.</p>`;
 }
 Object.assign(CuriTeacher,{highlightSource,sourceMarkup,selectionMarkup,checksMarkup,supplementMarkup});
})();
