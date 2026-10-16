(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./grade-context") : root.GradeContext);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CuriSearchState = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (grades) {
  "use strict";
  const defaults = { grade: "all", q: "", kind: "all", access: "all", place: "", program: "", page: "1", curriculum: "all", topic: "",
    sort: "relevance", conceptGroup: "", concept: "", subject: "all", description: "all", year: "", from: "", to: "",
    standardMode:"candidates",lessonGoal:"",usePurpose:"",goalRequirements:"",standard: "", state: "", standardSubject: "", standardGrade: "all", standardQuery: "", standardView: "related", legacyScope: "", invalidConditions: "" };
  const pickerKeys = new Set(["standardSubject", "standardGrade", "standardQuery", "standardView", "legacyScope", "invalidConditions"]);
  function read(params) {
    const state = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, params.get(key) ?? value]));
    if (state.state === "RELATION_MISSING") state.state = "CONCEPT_ONLY";
    if ([...params.keys()].some((key) => params.getAll(key).length > 1)) state.invalidConditions = "1";
    return state;
  }
  function apiParams(state) {
    return new URLSearchParams({ ...Object.fromEntries(Object.keys(defaults).filter((key) => !pickerKeys.has(key)).map((key) => [key, state[key]])), workspace: "teacher" });
  }
  function legacyParams(params) {
    const migrated = new URLSearchParams(params);
    const grade = params.get("grade") || "all";
    migrated.set("standardGrade", grade === "all" ? "all" : grades.courseForGrade(grade) || grade);
    migrated.set("standardSubject", params.get("subject") || "");
    migrated.set("grade", "all"); migrated.set("subject", "all");
    migrated.set("state", params.get("state") === "RELATION_MISSING" ? "CONCEPT_ONLY" : params.get("state") || "");
    migrated.set("legacyScope", "1");
    if ([...params.keys()].some((key) => params.getAll(key).length > 1)) migrated.append("legacyScope", "1");
    return migrated;
  }
  function selectionError(state, standards) {
    if (!["", "사회", "과학"].includes(state.standardSubject)) return "기준 목록의 교과 조건을 확인하세요.";
    if (state.standardGrade !== "all" && !grades.courseForGrade(state.standardGrade)) return "기준 목록의 학교급·과정 조건을 확인하세요.";
    if (!state.standard) return "";
    const selected = standards.find((item) => item.id === state.standard);
    if (!selected) return "현재 공식 목록에 없는 성취기준입니다. 기준을 다시 선택하거나 해제하세요.";
    if (state.legacyScope === "1" && ((state.standardSubject && selected.subject !== state.standardSubject) ||
        state.standardGrade !== "all" && selected.courseId !== grades.courseForGrade(state.standardGrade))) {
      return "이전 주소의 기준과 교과·과정 조건이 다릅니다. 기준 목록 조건을 수정하거나 기준을 해제하세요.";
    }
    return "";
  }
  return { defaults, read, apiParams, legacyParams, selectionError };
}));
