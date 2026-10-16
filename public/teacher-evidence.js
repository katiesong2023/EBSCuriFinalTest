(() => {
  "use strict";
  const { escape, sourceLink } = CuriTeacher;
  const courseLabel = (link) => link.courseId ? (window.GradeContext?.gradeLabel(link.courseId) || link.grade) : link.grade;
  const placementNote = (link) => link.courseId === "middle1" ? `공식 학년군: ${link.officialGradeBand || link.grade || "중학교 1~3학년군"} · EBS 뉴런 중1 참고` : "";
  const selectedStandard = (item) => item.teachingContext?.standardId || item.curriculumComparison?.standardId || "";
  const unavailable = (item) => ["PENDING", "FAILED", "UNAVAILABLE"].includes(item.evidenceRefresh);
  const texts = (value) => Array.isArray(value) ? value : value ? [value] : [];
  function scopedEvidence(item) {
    const standardId = selectedStandard(item);
    if (unavailable(item)) return { standardId, approved: [], automatic: [], otherApproved: [], otherAutomatic: [] };
    const scoped = CuriTeacher.withTeachingContext(item, { ...item.teachingContext, ...(standardId ? { standardId } : {}) });
    return { standardId, approved: scoped.approvedLinks, automatic: scoped.automaticLinks,
      otherApproved: scoped.otherStandardLinks.approvedLinks, otherAutomatic: scoped.otherStandardLinks.automaticLinks };
  }
  function confirmation(item) {
    const { standardId, approved, automatic } = scopedEvidence(item);
    const prefix = standardId ? `선택 기준 ${GradeContext.standardLabel(standardId)}: ` : "";
    if (item.evidenceRefresh === "PENDING") return prefix + "교육과정 연계 상태 재확인 중";
    if (item.evidenceRefresh === "FAILED") return prefix + "교육과정 연계 상태 확인 실패 · 다시 열어 확인하세요";
    if (item.evidenceRefresh === "UNAVAILABLE") return prefix + "현재 자료 확인 불가 · 저장 당시 정보";
    if (standardId) {
      if (approved.length) return prefix + (approved.every((link) => link.coverage === "PARTIAL") ? "부분 연계 · 사람 확인" : "사람 검수 완료 · 확인 범위 보기");
      if (automatic.length) return prefix + "부분 연계 후보 · 자동 근거 검사 통과";
      const comparison = item.curriculumComparison;
      if (comparison?.standardId === standardId) return prefix + ((comparison.state || comparison.semanticState) === "PARTIAL_SUPPORTED" ? "부분 연계 후보 · 현재 원문 자동 비교" : comparison.label || "교육과정 연계 미확인");
      return prefix + "교육과정 연계 미확인";
    }
    const labels = [];
    if (approved.length) labels.push(`사람 검수 완료 ${approved.length}건`);
    if (automatic.length) labels.push(`자동 근거 검사 통과 · 부분 연계 후보 ${automatic.length}건`);
    return labels.join(" / ") || "주제 관련 자료 · 교육과정 연계 미확인";
  }
  function quoteMarkup(quote) {
    const url = sourceLink(quote.sourceUrl);
    const supplement = quote.field === "supplement";
    const fieldLabel = supplement ? `${quote.sourceLabel || "공식 보조 원문"} 발췌` : quote.field === "title" ? "제목" : "소개문";
    return `${supplement ? `<p class="quote-source-kind">${escape(quote.sourceLabel || "공식 보조 원문")} · 후보 발견 근거 · 자동 요구 판정과 별도</p>` : ""}<blockquote>${escape(quote.quote)}</blockquote><details class="quote-provenance"><summary>인용 출처·원문 위치</summary><p>${escape(fieldLabel)} 위치 ${escape(quote.start)}–${escape(quote.end)}${quote.offsetUnit ? " · 문자 위치" : ""}${supplement ? `<br>문서 ${escape(quote.documentTitle)} · ${escape(quote.location)}<br>공개 문서 추출문 위치 ${escape(quote.originalStart)}–${escape(quote.originalEnd)}` : ""}${quote.sourceContentId || quote.resourceId ? `<br>회차 ${escape(quote.sourceContentId || quote.resourceId)}` : ""}${quote.variant ? ` · 판본 ${escape(quote.variant)}` : ""}${quote.sourceVersion ? `<br>원문 버전 ${escape(quote.sourceVersion)}` : ""}${quote.contentHash ? `<br>내용 지문 <code>${escape(quote.contentHash)}</code>` : ""}${quote.checkedAt ? `<br>확인 시점 ${escape(quote.checkedAt)}` : ""}${url ? `<br><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${supplement ? "공식 보조 문서 원문" : "해당 회차 공식 출처"}</a>` : ""}</p></details>`;
  }
  function linkMarkup(link, human) {
    return `<div class="relation-record"><p><b>${escape(GradeContext.standardLabel(link))}</b> · ${escape(link.subject)} · ${escape(courseLabel(link))}</p><p>${escape(link.standard)}</p>${placementNote(link) ? `<p>${escape(placementNote(link))}</p>` : ""}<p>${human ? "검수 근거: " : ""}${escape(human ? link.reason : link.note)}</p>${human && link.coverage ? `<p>사람 확인 범위: ${link.coverage === "PARTIAL" ? "부분 연계" : "전체 성취기준 관계"}</p>` : ""}<p><b>연결되는 부분</b><br>${texts(link.connectedParts).map(escape).join("<br>") || "별도 기록 없음"}</p><p><b>확인되지 않은 부분</b><br>${texts(link.unconfirmedParts).map(escape).join("<br>") || "별도 기록 없음"}</p>${(link.quotes || []).map(quoteMarkup).join("")}${!human ? `<p>공식 근거: ${escape(link.officialSource?.document)} · ${escape(link.officialSource?.page)}쪽<br>자동 검사: ${escape(link.checkedAt)} · ${escape(link.ruleVersion)}</p>` : ""}</div>`;
  }
  function comparisonMarkup(item, standardId) {
    const comparison = item.curriculumComparison;
    if (unavailable(item) || !comparison || comparison.standardId !== standardId) return "";
    return `<section class="curriculum-comparison"><h4>선택 기준의 요구와 원문 비교</h4><p>${escape(item.selectedStandard?.standardText || item.teachingContext?.standard || "")}</p>${CuriTeacher.guidanceMarkup(comparison.guidance)}<dl class="comparison-dimensions"><div><dt>자동 비교 범위</dt><dd>${escape(comparison.ruleSupport?.label)}</dd></div><div><dt>원문 충실도</dt><dd>${escape(comparison.sourceQuality?.label)}</dd></div><div><dt>선택 기준의 비교 상태</dt><dd>${escape(comparison.label)}</dd></div></dl><p>${escape(comparison.note)}</p>${(comparison.requirementComparisons || []).map(requirement => `<article class="requirement-comparison"><h4>${escape(requirement.requirement)}</h4><p><b>${escape(requirement.label)}</b></p><p><b>콘텐츠가 제공하는 내용</b><br>${escape(requirement.content)}</p><p><b>정확한 인용</b></p>${(requirement.quotes || []).map(quoteMarkup).join("") || "<p>이 요구를 뒷받침하는 공개 소개문 인용 미확인</p>"}<p><b>남은 요구</b><br>${escape(requirement.remaining)}</p><p>${escape(requirement.reason)}</p></article>`).join("")}<p class="activity-boundary">${escape(comparison.activityNote)}</p><details class="discovery-evidence"><summary>후보 발견 표현 · 요구 근거와 별도</summary>${(comparison.discoveryEvidence || []).map(quoteMarkup).join("") || "<p>후보 발견 인용 없음</p>"}</details><p>공개 소개문 대조이며 실제 영상 장면·학생 수행·전체 기준 충족은 별도 확인합니다.</p></section>`;
  }
  function evidenceMarkup(item, { hideStatus = false } = {}) {
    const { standardId, approved, automatic, otherApproved, otherAutomatic } = scopedEvidence(item);
    const status = confirmation(item);
    return (hideStatus ? '' : `<p class="approval-status">${escape(status)}</p>`) +
      (item.teachingContext ? `<p class="teaching-context">수업 대상: ${escape(item.teachingContext.targetGrade === "all" ? "미지정" : item.teachingContext.targetGrade || item.teachingContext.grade || "미지정")} · ${item.selectionContexts?.length ? "난이도·선수개념·장면은 아래 개인 선택 이유에서 별도 확인" : "난이도·선수개념·장면·사용 구간 미확인"}</p>` : "") +
      (standardId ? comparisonMarkup(item, standardId) : "") +
      (approved.length ? `<details><summary>${standardId ? "선택 기준의 " : ""}사람이 검수한 관계 보기</summary>${approved.map((link) => linkMarkup(link, true)).join("")}</details>` : "") +
      (automatic.length ? `<details class="automatic-evidence"><summary>${standardId ? "선택 기준의 " : ""}자동 연계 후보와 근거 보기</summary>${automatic.map((link) => linkMarkup(link, false)).join("")}</details>` : "") +
      (standardId && otherApproved.length + otherAutomatic.length ? `<details class="other-standard-evidence"><summary>다른 기준의 확인 기록 ${otherApproved.length + otherAutomatic.length}건</summary><p>아래 기록은 선택 기준 ${escape(GradeContext.standardLabel(standardId))}의 확인이나 승인에 포함되지 않습니다.</p>${otherApproved.map((link) => `<p>사람 확인 기록</p>${linkMarkup(link, true)}`).join("")}${otherAutomatic.map((link) => `<p>자동 후보 기록</p>${linkMarkup(link, false)}`).join("")}</details>` : "");
  }
  function linkMarkdown(link, human, md, other = false) {
    const prefix = other ? "다른 기준 · " : "";
    const lines = [`- ${prefix}${human ? "사람 검수 관계" : "자동 부분 연계 후보"}: ${md(courseLabel(link))} · ${md(GradeContext.standardLabel(link))} · ${md(link.standard)}`,
      `- ${human ? "검수 근거" : "확인 수준"}: ${md(human ? link.reason : link.note)}`];
    if (placementNote(link)) lines.push(`- 편성 근거: ${md(placementNote(link))}`);
    if (human && link.coverage) lines.push(`- 사람 확인 범위: ${link.coverage === "PARTIAL" ? "부분 연계" : "전체 성취기준 관계"}`);
    lines.push(`- 연결되는 부분: ${texts(link.connectedParts).map(md).join(" / ")}`, `- 확인되지 않은 부분: ${texts(link.unconfirmedParts).map(md).join(" / ")}`,
      ...(link.quotes || []).map((quote) => `- ${quote.field === "supplement" ? "공식 보조 원문" : quote.field === "title" ? "제목" : "소개문"} 인용 (${quote.start}–${quote.end}): ${md(quote.quote)}`));
    if (!human) lines.push(`- 공식 근거: ${md(link.officialSource?.document)} · ${md(link.officialSource?.page)}쪽`, `- 자동 검사: ${md(link.checkedAt)} · ${md(link.ruleVersion)}`);
    return lines;
  }
  function evidenceMarkdown(item, md) {
    const { standardId, approved, automatic, otherApproved, otherAutomatic } = scopedEvidence(item);
    const lines = [`- 수업 대상: ${md(item.teachingContext?.targetGrade === "all" ? "미지정" : item.teachingContext?.targetGrade || item.teachingContext?.grade || "미지정")}`, item.selectionContexts?.length ? "- 영상의 난이도·선수개념·장면·사용 구간: 아래 개인 선택 이유에 별도 기록" : "- 영상의 난이도·선수개념·장면·사용 구간: 미확인", `- 교육과정 연계: ${md(confirmation(item))}`];
    if (standardId) lines.push(`- 후보 탐색에서 선택한 기준: ${md(GradeContext.standardLabel(standardId))} (관계 승인과 별도)`);
    if (unavailable(item)) return lines;
    const comparison = item.curriculumComparison;
    if (standardId && comparison?.standardId === standardId) {
      lines.push(...CuriTeacher.guidanceMarkdown(comparison.guidance, md));
      lines.push(`- 선택 기준의 공개 원문 비교: ${md(comparison.label)}`, `- 자동 비교 범위: ${md(comparison.ruleSupport?.label)}`, `- 확인 범위: ${md(comparison.note)}`);
      for (const requirement of comparison.requirementComparisons || []) lines.push(`- 요구: ${md(requirement.requirement)} · ${md(requirement.label)}`, `- 콘텐츠가 제공하는 내용: ${md(requirement.content)}`,
        ...(requirement.quotes || []).map(quote => `- 공개 소개문 인용 (${quote.start}–${quote.end}): ${md(quote.quote)}`), `- 남은 요구: ${md(requirement.remaining)}`);
      lines.push(`- 학생 수행·영상 확인: ${md(comparison.activityNote)}`);
    }
    for (const link of approved) lines.push(...linkMarkdown(link, true, md));
    for (const link of automatic) lines.push(...linkMarkdown(link, false, md));
    if (standardId && otherApproved.length + otherAutomatic.length) {
      lines.push("- 다른 기준의 확인 기록 (선택 기준의 확인·승인에 포함되지 않음):");
      for (const link of otherApproved) lines.push(...linkMarkdown(link, true, md, true));
      for (const link of otherAutomatic) lines.push(...linkMarkdown(link, false, md, true));
    }
    return lines;
  }
  Object.assign(CuriTeacher, { confirmation, evidenceMarkup, evidenceMarkdown, quoteMarkup });
})();
