const { parseGradeRequest, courseForGrade } = require("../public/grade-context");
const subjects = ["사회", "과학", "국어", "수학", "영어", "도덕", "음악", "미술", "체육", "실과"];

class SearchError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

function parseSearchInput(input) {
  const query = typeof input.query === "string" ? input.query.trim().normalize("NFKC") : "";
  if (!query || query.length > 300) throw new SearchError("수업 질의를 1~300자로 입력하세요.");
  const grade = input.grade ?? "all";
  const subject = input.subject ?? "all";
  const sort = input.sort ?? "relevance";
  const pageText = String(input.page ?? "1");
  if (grade !== "all" && !courseForGrade(grade) || !["all", "사회", "과학"].includes(subject)) {
    throw new SearchError("학년군·교과 조건을 다시 선택하세요.");
  }
  if (!["relevance", "newest", "oldest"].includes(sort)) throw new SearchError("정렬 조건을 확인하세요.");
  if (!/^[1-9]\d{0,5}$/.test(pageText)) throw new SearchError("페이지는 1 이상의 정수로 지정하세요.");

  const gradeContext = parseGradeRequest(query, grade);
  const inferredSubjects = subjects.filter((item) => new RegExp(`${item}(?!적|성|자|화|주의)`).test(query));
  const warnings = [...gradeContext.warnings];
  let needsClarification = gradeContext.needsClarification;

  function resolve(label, explicit, inferred, unsupported = false) {
    if (explicit !== "all") {
      if (unsupported || inferred.length > 1 || (inferred.length === 1 && inferred[0] !== explicit)) {
        warnings.push(`${label}: 질의의 ${unsupported ? "지원 범위 밖 조건" : inferred.join("·")}과 선택 조건이 다릅니다. 선택한 ${explicit}을 우선 적용합니다.`);
      }
      return { value: explicit, source: "explicit" };
    }
    if (unsupported || inferred.length > 1) {
      needsClarification = true;
      warnings.push(`${label}: ${unsupported ? "초등학교 밖의 조건이 있습니다" : inferred.join("·") + "이 함께 언급되었습니다"}. 질의를 수정하거나 원하는 필터를 선택하세요.`);
      return { value: "all", source: "unresolved" };
    }
    return { value: inferred[0] ?? "all", source: inferred.length ? "query" : "all" };
  }

  const applied = {
    grade: gradeContext,
    subject: resolve("교과", subject, inferredSubjects)
  };
  return { query, sort, requestedPage: Number(pageText), applied, warnings, needsClarification };
}

module.exports = { SearchError, parseSearchInput };
