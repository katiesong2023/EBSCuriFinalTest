(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GradeContext = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const courseOptions = [
    { value: "elementary34", label: "초등 3~4학년군", schoolLevel: "초등학교", grades: [3, 4] },
    { value: "elementary56", label: "초등 5~6학년군", schoolLevel: "초등학교", grades: [5, 6] },
    { value: "middle1", label: "중학교 1학년", schoolLevel: "중학교", grades: [1] }
  ];
  const clean = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, "").replace(/[∼〜～–—-]/g, "~");
  function courseForGrade(value) {
    if (courseOptions.some((course) => course.value === value)) return value;
    const text = clean(value);
    if (/^(?:초등학교|초등|초)?(?:3~4학년군?|[34]학년|[34])$/.test(text)) return "elementary34";
    if (/^(?:초등학교|초등|초)?(?:5~6학년군?|[56]학년|[56])$/.test(text)) return "elementary56";
    if (/^(?:중학교|중학생|중학|중등|중)1(?:학년)?$/.test(text)) return "middle1";
    return null;
  }
  function standardCourse(standard) {
    const metadata = standard?.metadata || standard || {};
    const level = metadata.schoolLevel || "";
    const band = metadata.gradeBand || metadata.officialGradeBand || metadata.grade || "";
    const id = metadata.achievementStandardId || metadata.standardId || "";
    const codeCourse = /^4[사과]/.test(id) ? "elementary34" : /^6[사과]/.test(id) ? "elementary56" : /^9[사과]/.test(id) ? "middle1" : null;
    if (id && metadata.subject && ((/^[469]사/.test(id) && metadata.subject !== "사회") || (/^[469]과/.test(id) && metadata.subject !== "과학"))) return null;
    if (metadata.courseId) {
      if (!courseOptions.some((course) => course.value === metadata.courseId)) return null;
      if (codeCourse && codeCourse !== metadata.courseId) return null;
      if (metadata.courseId === "middle1" && level && level !== "중학교") return null;
      if (metadata.courseId.startsWith("elementary") && level && !["초등", "초등학교"].includes(level)) return null;
      if (band && metadata.courseId !== "middle1" && courseForGrade(band) !== metadata.courseId) return null;
      if (band && metadata.courseId === "middle1" && !/^(?:중학교|중학|중등|중)?(?:1~3학년군?|1학년)$/.test(clean(band))) return null;
      return metadata.courseId;
    }
    if (level === "중학교" || /^9/.test(id)) return null;
    const inferred = courseForGrade(band);
    return codeCourse && inferred !== codeCourse ? null : inferred;
  }
  function gradeLabel(value) {
    if (value && typeof value === "object") {
      const course = standardCourse(value);
      return courseOptions.find((entry) => entry.value === course)?.label || value.metadata?.gradeBand || value.gradeBand || "학년 미확인";
    }
    return courseOptions.find((entry) => entry.value === value)?.label || value || "학년 미지정";
  }
  function matchesStandard(standard, grade) {
    if (!grade || grade === "all") return true;
    if (typeof grade === "object" && !Array.isArray(grade)) {
      if (grade.needsClarification) return false;
      return !grade.courses?.length || grade.courses.includes(standardCourse(standard));
    }
    const requested = Array.isArray(grade) ? grade : [grade];
    return requested.some((entry) => courseForGrade(entry) && standardCourse(standard) === courseForGrade(entry));
  }
  // 화면용 이름만 구성한다. 공식 코드와 저장된 선택값은 변경하지 않는다.
  function standardLabel(value) {
    const standard = typeof value === "object" && value ? value : { standardId: value };
    const metadata = standard.metadata || standard;
    const code = String(standard.standardId || standard.achievementStandardId || standard.id || metadata.achievementStandardId || metadata.standardId || "").trim();
    if (!code || /^\[[^\]]+\]/.test(code)) return code;
    const subject = standard.subject || metadata.subject || (/^[469]과/.test(code) ? "과학" : /^[469]사/.test(code) ? "사회" : "");
    return subject ? `[${subject}]${code}` : code;
  }
  function isOfficialCode(value) {
    return /^(?:[46][사과]|9과|9사\((?:지리|일사)\))\d{2}-\d{2}$/.test(value || "");
  }
  function school(prefix, grade) {
    if (/^초/.test(prefix)) return "초등학교";
    if (/^중/.test(prefix)) return "중학교";
    if (/^고/.test(prefix)) return "고등학교";
    return grade >= 3 && grade <= 6 ? "초등학교" : null;
  }
  function gradeMentions(query) {
    const text = String(query || "").normalize("NFKC");
    const prefix = "초등학교|초등|초|중학교|중학생|중학|중등|중|고등학교|고등|고교|고";
    const pattern = new RegExp(`(?<!\\d)(${prefix})?\\s*(\\d{1,2})\\s*(학년)?\\s*(?:([~∼〜～–—,·/\\-]|부터|와|과|및)\\s*(${prefix})?\\s*(\\d{1,2})\\s*(학년)?(?:군)?)?`, "gu");
    const spans = [], grades = [];
    let ambiguous = false;
    for (const match of text.matchAll(pattern)) {
      if (!match[1] && !match[3] && !match[7]) continue;
      // 시대 숫자의 끝이나 단어 안의 고/중을 학교급으로 읽지 않는다.
      if (match.index > 0 && /[\p{L}\p{N}]/u.test(text[match.index - 1])) continue;
      if (/^년대/u.test(text.slice(match.index + match[0].length))) continue;
      const first = Number(match[2]), last = Number(match[6] || first);
      const firstSchool = school(match[1] || "", first), lastSchool = school(match[5] || match[1] || "", last);
      const isRange = match[4] && /^(?:[~∼〜～–—-]|부터)$/.test(match[4]);
      if (isRange) {
        if (firstSchool !== lastSchool) ambiguous = true;
        const numbers = Array.from({ length: Math.abs(last - first) + 1 }, (_, index) => Math.min(first, last) + index);
        for (const grade of numbers) grades.push({ schoolLevel: firstSchool, grade });
      } else {
        grades.push({ schoolLevel: firstSchool, grade: first });
        if (match[6]) grades.push({ schoolLevel: lastSchool, grade: last });
      }
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
    for (const [word, numbers] of [["중학년", [3, 4]], ["고학년", [5, 6]], ["저학년", [1, 2]]]) {
      for (const match of text.matchAll(new RegExp(word, "g"))) {
        grades.push(...numbers.map((grade) => ({ schoolLevel: "초등학교", grade })));
        spans.push({ start: match.index, end: match.index + word.length });
      }
    }
    if (/(?:유치원|고등학교|고등학생|고교)/.test(text)) ambiguous = true;
    return { text, spans: spans.sort((a, b) => a.start - b.start), grades: [...new Map(grades.map((entry) => [`${entry.schoolLevel}:${entry.grade}`, entry])).values()], ambiguous };
  }
  function stripGradeTerms(query) {
    const { text, spans } = gradeMentions(query);
    const combined = [];
    for (const span of spans) {
      const previous = combined.at(-1);
      if (previous && /^\s*(?:또는|혹은|아니면|와|과|및|[·,/])?\s*$/.test(text.slice(previous.end, span.start))) previous.end = span.end;
      else combined.push({ ...span });
    }
    let result = text;
    for (const span of combined.reverse()) result = `${result.slice(0, span.start)} ${result.slice(span.end)}`;
    return result.replace(/\s+/g, " ").trim();
  }
  function parseGradeRequest(query, explicit = "all") {
    const mentions = gradeMentions(query);
    const inferred = [...new Set(mentions.grades.map((entry) => courseOptions.find((course) => course.schoolLevel === entry.schoolLevel && course.grades.includes(entry.grade))?.value).filter(Boolean))];
    const unsupported = mentions.ambiguous || mentions.grades.some((entry) => !courseOptions.some((course) => course.schoolLevel === entry.schoolLevel && course.grades.includes(entry.grade)));
    const warnings = [];
    if (explicit && explicit !== "all") {
      const course = courseForGrade(explicit);
      if (!course) return { value: explicit, courses: [], grades: [], warnings: ["지원 학년은 초등 3~6학년·중학교 1학년입니다. 학교급과 학년을 다시 선택하세요."], needsClarification: true, source: "unresolved" };
      if (unsupported || inferred.some((entry) => entry !== course)) warnings.push("문장의 학년과 선택 조건이 다릅니다. 선택한 학년을 우선 적용합니다.");
      const selection = gradeMentions(gradeLabel(explicit));
      const single = selection.grades.length === 1 ? selection.grades[0] : null;
      const value = single ? `${single.schoolLevel === "초등학교" ? "초등" : single.schoolLevel} ${single.grade}학년` : gradeLabel(course);
      return { value, courses: [course], grades: selection.grades, warnings, needsClarification: false, source: "explicit" };
    }
    if (unsupported) warnings.push("학교급이 모호하거나 지원하지 않는 학년이 있습니다. 초등 3~6학년 또는 중학교 1학년을 선택하세요.");
    if (mentions.grades.length) warnings.push("학년은 수업 문맥입니다. 교육과정 연계와 영상의 실제 학년 적합성은 별도로 확인합니다.");
    const single = mentions.grades.length === 1 ? mentions.grades[0] : null;
    const value = single && !unsupported ? `${single.schoolLevel === "초등학교" ? "초등" : single.schoolLevel} ${single.grade}학년` : inferred.length === 1 && !unsupported ? gradeLabel(inferred[0]) : "all";
    return { value, courses: inferred, grades: mentions.grades, warnings, needsClarification: unsupported, source: unsupported ? "unresolved" : inferred.length ? "query" : "all" };
  }
  return { courseOptions, courseForGrade, standardCourse, matchesStandard, gradeLabel, standardLabel, isOfficialCode, parseGradeRequest, stripGradeTerms };
}));
