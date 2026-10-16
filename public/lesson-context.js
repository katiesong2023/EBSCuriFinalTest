(() => {
  "use strict";
  const { escape } = CuriTeacher;
  const text = (value, max = 2000) => typeof value === "string" ? value.slice(0, max) : "";
  const id = () => globalThis.crypto?.randomUUID?.() || `choice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const assessments = ["difficulty", "prerequisites", "scenes"];
  const assessmentLabels = { difficulty: "영상 난이도", prerequisites: "선수개념", scenes: "장면·사용 구간" };
  let standards = [];
  const standardContext = (item) => item.teachingContext || {};
  const contextKey = (context) => [context.standardId || "", context.subject || "", [...(context.courses || [])].sort().join(","), context.needsClarification === true ? "CLARIFY" : "", context.standardId ? context.targetGrade || (context.source !== "curriculum" ? context.grade : "") || "" : "", context.standardId && context.targetNeedsClarification ? "TARGET_CLARIFY" : ""].join("|");
  function normalizeChoice(value = {}) {
    const courses = [...new Set((Array.isArray(value.courses) ? value.courses : value.courseId ? [value.courseId] : []).map((course) => text(course, 80)).filter(Boolean))].slice(0, 6);
    const result = { id: text(value.id, 100) || id(), standardId: text(value.standardId, 80), standardText: text(value.standardText, 2000),
      subject: text(value.subject, 30), courses, needsClarification: value.needsClarification === true, courseId: courses.length === 1 ? courses[0] : "", courseLabel: text(value.courseLabel, 100), officialGradeBand: text(value.officialGradeBand, 100), targetGrade: text(value.targetGrade, 100), targetNeedsClarification: value.targetNeedsClarification === true,
      curriculumVersion:text(value.curriculumVersion,100),selectedAt: text(value.selectedAt, 60), lessonGoal: text(value.lessonGoal), usePurpose:text(value.usePurpose,40),goalRequirements:Array.isArray(value.goalRequirements)?value.goalRequirements.slice(0,20):[],usePart: text(value.usePart), additionalContent: text(value.additionalContent),
      decision: ["USE", "EXCLUDE", "HOLD"].includes(value.decision) ? value.decision : "UNRECORDED", decisionReason: text(value.decisionReason),
      decisionAt: text(value.decisionAt, 60), updatedAt: text(value.updatedAt, 60), snapshot: value.snapshot && typeof value.snapshot === "object" ? {
        standardId: text(value.snapshot.standardId, 80), standardText: text(value.snapshot.standardText), label: text(value.snapshot.label, 1000), checkedAt: text(value.snapshot.checkedAt, 60), capturedAt: text(value.snapshot.capturedAt, 60),
        courseLabel: text(value.snapshot.courseLabel, 100), subject: text(value.snapshot.subject, 30) } : null, assessments: {} };
    for (const key of assessments) {
      const record = value.assessments?.[key] || {};
      result.assessments[key] = { status: record.status === "PERSONAL_REVIEW" ? "PERSONAL_REVIEW" : "UNCONFIRMED", note: text(record.note), basis: text(record.basis), checkedAt: text(record.checkedAt, 60) };
    }
    return result;
  }
  function newChoice(item, recordSnapshot = false) {
    const context = standardContext(item), standard = item.selectedStandard || (item.lessonGoalContext?{standardId:item.lessonGoalContext.standardId,standardText:item.lessonGoalContext.standardText}:{});
    const now = recordSnapshot ? new Date().toISOString() : "";
    const legacyKey = `${item.id || "unknown"}|${contextKey(context)}`;
    const legacyHash = [...legacyKey].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(16);
    const goal=item.lessonGoalContext||{};
    return normalizeChoice({ curriculumVersion:goal.curriculumVersion||"",lessonGoal:goal.lessonGoal||goal.requirements?.map(r=>r.text).join(" / ")||"",usePurpose:goal.usePurpose||"",goalRequirements:goal.requirements||[],usePart:goal.purposeLabel||"",additionalContent:item.curriculumComparison?.unconfirmedParts||"",id: recordSnapshot ? id() : `legacy-${legacyHash}`, standardId: context.standardId || standard.standardId || "", standardText: context.standardText || context.standard || standard.standardText || "",
      subject: context.subject || standard.subject || "", courses: context.courses || (standard.courseId ? [standard.courseId] : []), needsClarification: context.needsClarification === true, courseLabel: standard.courseLabel || context.courseLabel || (context.courses?.length === 1 ? window.GradeContext?.gradeLabel(context.courses[0]) : "") || context.grade || "",
      targetGrade: context.targetGrade || (context.source !== "curriculum" ? context.grade : "") || "", targetNeedsClarification: context.targetNeedsClarification === true,
      officialGradeBand: context.officialGradeBand || standard.gradeBand || "", selectedAt: now,
      snapshot: recordSnapshot ? { standardId: context.standardId || standard.standardId || "", standardText: context.standardText || context.standard || "", label: CuriTeacher.confirmation(item),
        checkedAt: item.evidenceCheckedAt || "", capturedAt: now, courseLabel: standard.courseLabel || context.courseLabel || (context.courses?.length === 1 ? window.GradeContext?.gradeLabel(context.courses[0]) : "") || context.grade || "", subject: context.subject || "" } : null });
  }
  function choicesFor(item) {
    return Array.isArray(item.selectionContexts) && item.selectionContexts.length
      ? item.selectionContexts.slice(0, 20).map(normalizeChoice) : [newChoice(item)];
  }
  function choiceContext(choice) {
    return { standardId: choice.standardId, standard: choice.standardText, subject: choice.subject, courses: [...(choice.courses || (choice.courseId ? [choice.courseId] : []))], needsClarification: choice.needsClarification === true, grade: choice.targetGrade || choice.courseLabel, targetGrade: choice.targetGrade || "", targetNeedsClarification: choice.targetNeedsClarification, suitability: "UNCONFIRMED" };
  }
  const choiceKey = (choice) => contextKey(choiceContext(choice));
  function hasShelfSelection(item, shelf) {
    const saved = shelf.find((entry) => entry.id === item.id);
    if (!saved) return false;
    return !standardContext(item).standardId || choicesFor(saved).some((choice) => choiceKey(choice) === contextKey(standardContext(item)));
  }
  function toggleShelfSelection(shelf, item) {
    const existing = shelf.find((entry) => entry.id === item.id);
    const standardId = standardContext(item).standardId || item.lessonGoalContext?.standardId;
    if (existing && !standardId) return shelf.filter((entry) => entry.id !== item.id);
    const choice = newChoice(item, true);
    if (!existing) return [...shelf, { ...item, alternatives: undefined, savedAt: new Date().toISOString(), selectionContexts: [choice] }];
    const existingChoices = choicesFor(existing);
    const matching = existingChoices.some((entry) => choiceKey(entry) === choiceKey(choice));
    const nextChoices = matching ? existingChoices.filter((entry) => choiceKey(entry) !== choiceKey(choice)) : [...existingChoices, choice];
    if (nextChoices.length > 20) throw new Error("한 자료에는 선택 이유를 20개까지 보존할 수 있습니다.");
    return nextChoices.length ? shelf.map((entry) => entry.id === item.id ? { ...existing, ...item, alternatives: undefined,
      savedAt: existing.savedAt, selectionContexts: nextChoices } : entry) : shelf.filter((entry) => entry.id !== item.id);
  }
  function mergeSelectionContexts(existing, incoming) {
    const current = choicesFor(existing), known = new Set(current.map((choice) => choice.id));
    const merged = [...current, ...choicesFor(incoming).filter((choice) => !known.has(choice.id))];
    if (merged.length > 20) throw new Error("한 자료에는 선택 이유를 20개까지 보존할 수 있습니다.");
    return merged;
  }
  function standardOptions(choice) {
    const list = [...standards];
    if (choice.standardId && !list.some((standard) => standard.id === choice.standardId)) list.unshift({ id: choice.standardId,
      text: `${choice.standardText} · 저장 당시 기준${standards.length ? " / 현재 목록에서 미확인" : ""}`, courseLabel: choice.courseLabel });
    return '<option value="">성취기준 미지정</option>' + list.map((standard) => `<option value="${escape(standard.id)}" ${standard.id === choice.standardId ? "selected" : ""}>${escape(`${GradeContext.standardLabel(standard)} · ${standard.courseLabel || ""} · ${standard.text}`)}</option>`).join("");
  }
  function currentChoiceStatus(item, choice) {
    return CuriTeacher.confirmation(CuriTeacher.withTeachingContext({ ...item, teachingContext: choiceContext(choice) }, choiceContext(choice)));
  }
  function choiceMarkup(item, choice, folder, index) {
    const targetCourse = window.GradeContext?.courseForGrade(folder?.targetGrade);
    const different = targetCourse && choice.courses.length && !choice.courses.includes(targetCourse);
    const field = (name, label, value) => `<label>${label}<textarea data-choice-field="${name}" maxlength="2000" rows="2">${escape(value)}</textarea></label>`;
    return `<details class="selection-context" data-choice="${escape(choice.id)}"><summary>선택 이유 ${index + 1}${choice.standardId ? ` · ${escape(GradeContext.standardLabel(choice))}` : " · 기준 미지정"}</summary><p>개인의 수업 준비 기록입니다. 공용 교육과정 승인과 별도로 보존합니다.</p>${field("lessonGoal", "이번 수업 목표", choice.lessonGoal)}${field("usePart", "활용할 부분 · 원문이 제공하는 내용", choice.usePart)}${field("additionalContent", "추가로 다룰 내용 · 교사가 연결할 활동", choice.additionalContent)}<details class="choice-history"><summary>성취기준·선택 당시 기록</summary><label>활용할 성취기준<select data-choice-field="standardId">${standardOptions(choice)}</select></label><p class="choice-standard">${escape(choice.standardText || "공식 기준 미지정")}</p><p class="choice-grade">학년군 연계: ${escape(choice.officialGradeBand || choice.courseLabel || "미기록")}${choice.courses.includes("middle1") ? " · EBS 뉴런 중1 편성 참고 · 학교별 배치 미확인" : ""}${choice.needsClarification ? " · 대상 학년의 추가 확인 필요" : ""}</p><p class="choice-target">선택 당시 수업 대상: ${escape(choice.targetGrade === "all" ? "미지정" : choice.targetGrade || "미기록")}${choice.targetNeedsClarification ? " · 추가 확인 필요" : ""} · 공식 학년군·실제 영상 난이도와 별개</p><p class="context-difference" ${different ? "" : "hidden"}>선택한 기준의 과정(${escape(choice.courseLabel)})과 폴더 수업 대상(${escape(folder?.targetGrade)})이 다릅니다. 선택 이유는 보존되며 활용 문맥을 직접 판단합니다.</p><p class="choice-snapshot">선택 당시: ${escape(choice.selectedAt || "시점 미기록")}<br>${escape(choice.snapshot ? `${GradeContext.standardLabel(choice.snapshot) || "기준 미지정"} · ${choice.snapshot.label}` : "당시 연계 상태 미기록")}${choice.snapshot ? `<br>당시 공식 기준 원문: ${escape(choice.snapshot.standardText || "미기록")}<br>표시 캡처: ${escape(choice.snapshot.capturedAt || "미기록")} · 관계 재확인: ${escape(choice.snapshot.checkedAt || "미기록")}` : ""}</p><p class="choice-current" data-choice-current>${escape(currentChoiceStatus(item, choice))}<br>현재 재확인: ${escape(item.evidenceCheckedAt || "현재 재확인 시점 미기록")}</p></details><fieldset class="personal-assessments"><legend>콘텐츠에 대한 개인 확인</legend>${assessments.map((key) => { const record = choice.assessments[key]; return `<details><summary>${assessmentLabels[key]} · ${record.status === "PERSONAL_REVIEW" ? "개인 확인 기록 있음" : "미확인"}</summary><label>확인 여부<select data-assessment="${key}" data-assessment-field="status"><option value="UNCONFIRMED" ${record.status === "UNCONFIRMED" ? "selected" : ""}>미확인</option><option value="PERSONAL_REVIEW" ${record.status === "PERSONAL_REVIEW" ? "selected" : ""}>교사 개인 확인</option></select></label><label>판단·내용<textarea data-assessment="${key}" data-assessment-field="note" maxlength="2000" rows="2">${escape(record.note)}</textarea></label><label>확인 근거 · 장면/시간 등<textarea data-assessment="${key}" data-assessment-field="basis" maxlength="2000" rows="2">${escape(record.basis)}</textarea></label><p data-assessment-time="${key}">확인 시점: ${escape(record.checkedAt || "미기록")}</p></details>`; }).join("")}</fieldset><details><summary>사용·제외 이유 남기기 · 선택 사항</summary><label>이 수업의 개인 판단<select data-choice-field="decision"><option value="UNRECORDED" ${choice.decision === "UNRECORDED" ? "selected" : ""}>미기록</option><option value="USE" ${choice.decision === "USE" ? "selected" : ""}>사용</option><option value="EXCLUDE" ${choice.decision === "EXCLUDE" ? "selected" : ""}>이 수업에서 제외</option><option value="HOLD" ${choice.decision === "HOLD" ? "selected" : ""}>보류</option></select></label>${field("decisionReason", "판단 이유", choice.decisionReason)}<p>이 기록은 이 브라우저에만 저장됩니다. 공용 승인·검색 순위를 바꾸거나 서버에 전송하지 않습니다.</p></details></details>`;
  }
  function selectionContextsMarkup(item, folder) {
    return `<section class="selection-contexts"><h4>수업 선택 이유</h4>${choicesFor(item).map((choice, index) => choiceMarkup(item, choice, folder, index)).join("")}<button type="button" data-add-choice="${escape(item.id)}">이 자료의 선택 이유 추가</button></section>`;
  }
  function updateChoice(choice, input) {
    const now = new Date().toISOString();
    if (input.dataset.assessment) {
      const record = choice.assessments[input.dataset.assessment];
      if (!record || !["status", "note", "basis"].includes(input.dataset.assessmentField)) return;
      record[input.dataset.assessmentField] = input.dataset.assessmentField === "status" ? (input.value === "PERSONAL_REVIEW" ? "PERSONAL_REVIEW" : "UNCONFIRMED") : text(input.value);
      record.checkedAt = record.status === "PERSONAL_REVIEW" ? now : "";
    } else if (input.dataset.choiceField === "standardId") {
      choice.goalRequirements=[];choice.curriculumVersion=standards.find(item=>item.id===input.value)?.curriculumVersion||"";
      const standard = standards.find((entry) => entry.id === input.value);
      if (input.value && !standard) return;
      Object.assign(choice, { standardId: standard?.id || "", standardText: standard?.text || "", subject: standard?.subject || "", courseId: standard?.courseId || "", courses: standard?.courseId ? [standard.courseId] : [], needsClarification: false,
        courseLabel: standard?.courseLabel || "", officialGradeBand: standard?.gradeBand || "" });
    } else if (["lessonGoal", "usePart", "additionalContent", "decisionReason", "decision"].includes(input.dataset.choiceField)) {
      choice[input.dataset.choiceField] = input.dataset.choiceField === "decision" ? (["USE", "EXCLUDE", "HOLD"].includes(input.value) ? input.value : "UNRECORDED") : text(input.value);
      if (["decision", "decisionReason"].includes(input.dataset.choiceField)) choice.decisionAt = now;
    }
    choice.updatedAt = now;
  }
  function selectionContextsMarkdown(item, md, folder) {
    const lines = [];
    for (const [index, choice] of choicesFor(item).entries()) {
      lines.push(`### 수업 선택 이유 ${index + 1}`, `- 활용 기준: ${md(GradeContext.standardLabel(choice) || "미지정")} · ${md(choice.standardText)}`, `- 학년군 연계: ${md(choice.officialGradeBand || choice.courseLabel || "미기록")}`,
        `- 선택 당시 수업 대상: ${md(choice.targetGrade === "all" ? "미지정" : choice.targetGrade || "미기록")} · 공식 학년군·실제 난이도와 별개`,
        `- 선택 당시: ${md(choice.selectedAt || "시점 미기록")} · ${md(choice.snapshot ? `${GradeContext.standardLabel(choice.snapshot) || "기준 미지정"} · ${choice.snapshot.label}` : "당시 연계 상태 미기록")}`,
        `- 선택 당시 공식 기준 원문: ${md(choice.snapshot?.standardText || "미기록")}`, `- 선택 당시 표시 캡처: ${md(choice.snapshot?.capturedAt || "미기록")} · 당시 관계 재확인: ${md(choice.snapshot?.checkedAt || "미기록")}`, `- 현재 연계: ${md(currentChoiceStatus(item, choice))}`, `- 현재 재확인 시점: ${md(item.evidenceCheckedAt || "미기록")}`, `- 이번 수업 목표: ${md(choice.lessonGoal || "미작성")}`,
        `- 활용할 부분: ${md(choice.usePart || "미작성")}`, `- 추가로 다룰 내용·교사 활동: ${md(choice.additionalContent || "미작성")}`);
      if (choice.needsClarification) lines.push("- 대상 학년은 추가 확인이 필요합니다. 현재 연계 확인을 특정 과정으로 확정하지 않습니다.");
      if (folder?.targetGrade && choice.courses.length && !choice.courses.includes(window.GradeContext?.courseForGrade(folder.targetGrade))) lines.push(`- 대상 문맥 차이: 선택 과정 ${md(choice.courseLabel)} / 현재 폴더 ${md(folder.targetGrade)} · 원래 선택 보존`);
      for (const key of assessments) { const record = choice.assessments[key]; lines.push(`- ${assessmentLabels[key]}: ${record.status === "PERSONAL_REVIEW" ? "개인 확인" : "미확인"} · ${md(record.note)} · 근거 ${md(record.basis || "미기록")} · 확인 ${md(record.checkedAt || "미기록")}`); }
      lines.push(`- 이 수업의 개인 판단: ${{ USE: "사용", EXCLUDE: "제외", HOLD: "보류", UNRECORDED: "미기록" }[choice.decision]} · ${md(choice.decisionReason)} · ${md(choice.decisionAt || "시점 미기록")}`, "- 위 개인 기록은 공용 교육과정 승인과 별도입니다.", "");
    }
    return lines;
  }
  Object.assign(CuriTeacher, { choicesFor, newChoice, choiceContext, hasShelfSelection, toggleShelfSelection, mergeSelectionContexts,
    selectionContextsMarkup, selectionContextsMarkdown, updateChoice, currentChoiceStatus,
    setSelectionStandards: (items) => { standards = items; }, standardOptions });
})();
