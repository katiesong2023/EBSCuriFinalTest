(() => {
  "use strict";
  const { escape, sourceLink, destination } = CuriTeacher;
  const thumbnailColors = ['coral', 'sun', 'lilac', 'mint'];
  function thumbnailAppearance(item) {
    // 같은 콘텐츠는 검색 순서·새로고침과 관계없이 같은 배경을 유지한다.
    let hash = 2166136261;
    for (const char of String(item.id || `${item.program}|${item.title}|${item.sourceUrl}`)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return thumbnailColors[hash % thumbnailColors.length];
  }
  document.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains('resource-thumbnail')) {
      event.target.hidden = true;
    }
  }, true);
  // 카드마다 전체 개인 자료 JSON을 다시 파싱하지 않는다. 저장 원문이 바뀌면 즉시 갱신한다.
  let foldersSnapshot, savedLocations = new Map();
  function resourceFolders(id) {
    let raw;
    try { raw = localStorage.getItem(CuriTeacher.foldersKey); } catch { return []; }
    if (raw === null || raw !== foldersSnapshot) {
      const library = CuriTeacher.readFolders(false);
      savedLocations = new Map();
      for (const folder of library.folders) for (const resourceId of new Set(folder.items.map(entry => entry.resource.id))) {
        if (!savedLocations.has(resourceId)) savedLocations.set(resourceId, []);
        savedLocations.get(resourceId).push(folder);
      }
      foldersSnapshot = raw;
    }
    return savedLocations.get(id) || [];
  }
  CuriTeacher.cardNavigation = item => {
    const navigation = destination(item);
    const listing = item.resourcePresentation?.unit === 'LISTING' || item.kind === 'collection' || ['LESSON_LIST', 'ANNOUNCEMENT'].includes(navigation.kind);
    const openLabel = listing ? (navigation.kind === 'SEARCH' ? 'EBS에서 제목 검색' : '목록 확인하기') : ['EPISODE','CLIP'].includes(navigation.kind) || navigation.label === '해당 회차 열기' ? '방송 보기' : navigation.label;
    return { navigation, listing, openLabel };
  };
  CuriTeacher.updateCardNavigation = (card, item) => {
    const { navigation, openLabel } = CuriTeacher.cardNavigation(item);
    const thumbnail = card.querySelector(':scope > .resource-thumbnail-link');
    if (thumbnail) { thumbnail.href = sourceLink(navigation.url); thumbnail.setAttribute('aria-label', `${item.title} ${openLabel}`); }
    const link = card.querySelector(':scope > .card-actions .episode-open');
    if (link && !link.hasAttribute('data-set-segment')) { link.href = sourceLink(navigation.url); link.textContent = `${openLabel} ↗`; }
  };
  CuriTeacher.card = (item, number, shelf, alternative = false, options = {}) => {
    const { navigation, listing, openLabel } = CuriTeacher.cardNavigation(item);
    const preview = item.contentPreview;
    const typeLabel = listing ? '프로그램·회차 목록' : item.kind === 'clip' ? '클립' : '';
    const colors = {episode:'coral',clip:'sun',lesson:'lilac',collection:'mint'};
    const thumbnail = thumbnailAppearance(item);
    const savedFolders = resourceFolders(item.id);
    const saveLabel = savedFolders.length ? '✓ 담김' : '내 수업으로 가져가기';
    const keywords = (item.contentKeywords || (item.coreTags || []).map(tag => ({ ...tag, label: tag.label }))).slice(0, 8);
    const keywordMarkup = words => words.map(word => `<li${word.conceptId ? ` data-concept-id="${escape(word.conceptId)}"` : ''} title="${escape(`${word.evidence?.field === 'summary' ? '소개문' : word.evidence?.field === 'sourceSupplement' ? '공식 보조 원문' : '제목'}: ${word.evidence?.context || word.evidence?.quote || word.label}`)}">${escape(word.label)}</li>`).join('');
    return `<article class="resource-card${alternative ? " alternative-card" : ""}${options.library ? " library-resource" : ""}" data-id="${escape(item.id)}"${options.library ? ` data-owner="${escape(options.ownerId)}" data-resource="${escape(item.id)}"` : ""}${options.groupKey ? ` data-all-resource="${escape(item.id)}" data-all-key="${escape(options.groupKey)}"` : ""} style="--type-color:var(--curi-${colors[item.kind] || 'mint'})">
      <a class="resource-thumbnail-link" style="--thumbnail-color:var(--curi-${thumbnail})" href="${escape(sourceLink(navigation.url))}" target="_blank" rel="noopener noreferrer" aria-label="${escape(item.title)} ${escape(openLabel)}">
        <span class="resource-thumbnail-fallback"><small>${escape(item.program)}</small><span class="resource-thumbnail-title">${escape(item.title)}</span></span>
        <img class="resource-thumbnail" src="/api/curi/discover/thumbnail?id=${encodeURIComponent(item.id)}" alt="${escape(item.program)} · ${escape(item.title)}" width="640" height="360" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        ${!listing && item.durationSeconds ? `<span class="media-duration">${Math.floor(item.durationSeconds/60)}:${String(Math.round(item.durationSeconds%60)).padStart(2,'0')}</span>` : ''}
      </a>
      ${typeLabel || (item.subjects || []).length ? `<div class="card-banner ${escape(item.kind)}">${typeLabel ? `<span class="type-tag">${escape(typeLabel)}</span>` : ''}${(item.subjects || []).slice(0,2).map(subject=>`<span class="subject-tag" data-subject="${escape(subject)}">${escape(subject)}</span>`).join('')}<span class="number">${number}</span></div>` : ''}
      <div class="card-body">${item.curriculumScope ? `<p class="filter-help" hidden><b>${item.curriculumScope==='RELATED'?'선택 기준 관련 후보':'주제 확장 자료 — 기준 연계 미확인'}</b></p>` : ''}${item.lessonGoalContext?`<p><b>이번 수업 목표</b> ${escape(item.lessonGoalContext.lessonGoal||item.lessonGoalContext.requirements.map(r=>r.text).join(' / '))}<br>활용 목적: ${escape(item.lessonGoalContext.purposeLabel||'미지정')} · 교사의 의도</p>`:''}${options.libraryActions ? `<div class="library-card-title"><h3>${escape(item.title)}</h3>${options.libraryActions}</div>` : `<h3>${escape(item.title)}</h3>`}${options.hideSavedLocation ? "" : `<p class="saved-meta">${savedFolders.length ? `● ${escape(savedFolders.map(f=>f.title).join(' · '))}에 담김` : ''}</p>`}<p class="program">${escape(item.program)}</p>
      ${!listing ? `<p class="broadcast-date">${escape(CuriTeacher.resourceDateLabel(item))} <b>${escape(CuriTeacher.resourceDateText(item).replace(/\.\s*/g,'.').replace(/\.$/,''))}</b></p>` : ''}
      ${keywords.length ? `<ul class="content-keywords" aria-label="소개문 근거 대표 키워드">${keywordMarkup(keywords)}</ul>` : ''}
      ${item.sourceQuality?.category === 'detailed' ? '' : `<span class="evidence-badge ${!item.sourceQuality?.detailedMappingAllowed ? "limited" : ""}">${escape(item.sourceQuality?.label || "원문 품질 미확인")}</span>`}
      ${preview ? `<details class="content-preview"><summary>${listing ? '자료 소개' : '방송 내용 안내'}</summary><p class="preview-text">${escape(preview.text)}</p>${preview.sourceNote ? `<p class="preview-label">${escape(preview.sourceNote)}</p>` : ''}${preview.reviewNote && preview.reviewNote !== preview.text ? `<p class="preview-review-note">${escape(preview.reviewNote)}</p>` : ''}</details>` : ""}
      ${options.libraryNotes || ""}
      ${options.library ? "" : `<div class="card-supporting-details" hidden>
      ${!CuriTeacher.selectionMarkup ? `<p class="relevance-reason">${escape(item.searchExplanation?.text || item.relevanceReason || item.reason)}</p>` : ''}
      ${CuriTeacher.selectionMarkup ? CuriTeacher.selectionMarkup(item) : ''}
      <details class="curriculum-details"><summary>${escape(CuriTeacher.confirmation(item))}</summary>${CuriTeacher.evidenceMarkup(item)}</details>
      <details class="semantic-details"><summary>검색 관련 이유와 원문 근거</summary>${CuriTeacher.sourceMarkup(item)}${(item.inferredTags || []).length ? `<p>추론 후보: ${escape(item.inferredTags.map(t=>t.label||t.conceptId).join(" · "))} · 원문 직접 언급과 다릅니다.</p>` : ""}</details>
      <details class="link-note"><summary>접근·재생 확인 범위</summary><p class="link-status">${escape(navigation.note)}</p></details>
      <details><summary>출처와 확인 범위</summary>${CuriTeacher.checksMarkup(item)}</details>
      </div>`}
      ${!options.library && item.alternatives?.length ? `<details class="alternatives"><summary>다른 판본 ${item.alternatives.length}개 비교</summary><p>프로그램·제목의 판본 표시를 기준으로 묶었습니다. 편집·재생시간은 서로 다를 수 있습니다.</p>${item.alternatives.map((other) => CuriTeacher.card(other, "↳", shelf, true)).join("")}</details>` : ""}
      </div>${options.library ? '' : `<div class="card-actions"><a class="episode-open" href="${escape(sourceLink(navigation.url))}" target="_blank" rel="noopener noreferrer">${escape(openLabel)} ↗</a>${item.lessonGoalContext ? `<button type="button" data-propose="${escape(item.id)}">연계 근거 제안하기</button>` : ''}<button type="button" data-folder-save="${escape(item.id)}" aria-label="${escape(item.title)} 내 수업으로 가져가기">${escape(saveLabel)}</button></div>`}${options.libraryDetails || ""}</article>`;
  };
})();
