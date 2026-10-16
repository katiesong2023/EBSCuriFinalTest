// 수업 문맥·선호·확인 불가 조건을 내용 검색어와 구분한다. 알 수 없는 내용어는 보존한다.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const { extractGenreRequest } = require("./discovery-genre");
const { extractGeographicScope } = require("./search-geographic-scope");
const { splitRequestClauses } = require('./request-clauses');
const { prepareContentRequest } = require('./request-content-plan');
const { naturalRequest } = require("./natural-request");
const { removeTopicRequest } = require("./topic-request");
function extractRequestContext(text, programNames, vocabulary) {
  const preferences = { programs: [], genres: [] }, requiredPrograms = [], constraints = {}, warnings = [], classroomContext = [];
  const detailRequests = [];
  const original = text;
  const clauses = splitRequestClauses(text, [...vocabulary, ...programNames.flatMap(n=>[n.toLowerCase(),n.replace(/^EBS\s+/iu,"").toLowerCase(),n.split(",")[0].toLowerCase()]), "다큐", "다큐멘터리", "강연", "강의", "드라마", "애니메이션", "인터뷰", "토론", "실험"], programNames.flatMap(n=>[n.toLowerCase(),n.replace(/^EBS\s+/iu,"").toLowerCase(),n.split(",")[0].toLowerCase()]));
  text = clauses.text;
  const contentPlan = prepareContentRequest(text);
  text = contentPlan.text;
  classroomContext.push(...contentPlan.classroom);
  classroomContext.push(...clauses.classroom);
  preferences.content = clauses.preferences;
  constraints.exclusionClauses = clauses.exclusions;
  const exclusions = clauses.exclusions.map(c=>c.label);
  if (clauses.exclusions.length) warnings.push("제외 요청의 전체 범위를 보존했습니다. 원문에 해당 표현이 없더라도 실제 장면·내용의 부재는 미확인입니다.");
  const scope = extractGeographicScope(text);
  text = scope.text;
  if(scope.required.length) { constraints.geographicScope = {required:scope.required,quotes:scope.quotes}; warnings.push("요청한 지역 범위는 제목·소개문의 장소 단서로 제한합니다. 장소 미확인 또는 국내·해외 혼합 자료는 단독 국내 조건에서 보류합니다."); }
  text = removeTopicRequest(text);
  // 일반 분야+형태 표현은 같은 이름의 프로그램이 있어도 장르 요청으로 읽는다.
  // 따옴표 또는 ‘프로그램’으로 이름을 지정한 경우에는 기존 프로그램 조건을 유지한다.
  const genericDocumentary = /^(?:자연|과학|역사|환경|생태|야생|동물|여행)\s*(?:다큐멘터리|다큐)$/u;
  const explicitProgram = alias => {
    const name = escapeRegex(alias).replace(/\s+/g, '\\s*');
    return new RegExp(`["'“‘「]\\s*${name}\\s*["'”’」]|(?:프로그램명?|방송명)\\s*[은는이가:]?\\s*${name}|${name}\\s*(?:이라는|라는)?\\s*프로그램`, 'iu').test(original);
  };
  const programAliases = programNames.flatMap((program) => {
    const short = program.split(",")[0];
    return [...new Set([program, short, short.replace(/^EBS\s+/iu, "")])]
      .filter(alias => alias && (!genericDocumentary.test(alias.replace(/^EBS\s+/iu, '')) || explicitProgram(alias)))
      .map(alias => ({ program, alias: alias.normalize("NFKC").toLowerCase() }));
  }).sort((a, b) => b.alias.length - a.alias.length);
  for (const { program, alias } of programAliases) {
    const name = escapeRegex(alias).replace(/\s+/g, "\\s*");
    const excluded = new RegExp(`(?<![\\p{L}\\p{N}])${name}(?:은|는|을|를)?\\s*(?:제외하고|제외한|제외|빼고|말고)`, "gu");
    text = text.replace(excluded, () => { constraints.excludedPrograms ||= []; constraints.excludedPrograms.push(program); return " "; });
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${name}(?=$|[^\\p{L}\\p{N}]|같은|같이|유사한|에서|의|은|는|을|를|만)\\s*(같은|같이|유사한|에서|의|은|는|을|를|만)?(?![\\p{L}\\p{N}])`, "gu");
    text = text.replace(pattern, (_, marker) => {
      (["같은", "같이", "유사한"].includes(marker) ? preferences.programs : requiredPrograms).push(program); return " ";
    });
  }
  text = text.replace(/(?<![\p{L}\p{N}])자연\s*(?=다큐(?:멘터리)?(?:\s|$|만|를|로|는|의))/gu, '자연환경 ');
  const genreRequest = extractGenreRequest(text, { programPreference: preferences.programs.length > 0 });
  text = genreRequest.text;
  preferences.genres = [...genreRequest.preferred, ...clauses.preferences.flatMap(c=>extractGenreRequest(c.label.replace(/[\p{L}\p{N}]+보다\s*/gu, " ")).required)];
  preferences.genres = [...new Set(preferences.genres)];
  constraints.requiredGenres = genreRequest.required;
  constraints.excludedGenres = genreRequest.excluded;
  constraints.genreOperator = genreRequest.operator;
  if (genreRequest.preferred.length || genreRequest.required.length || genreRequest.excluded.length) {
    warnings.push("방송 형태는 공식 프로그램 분류와 회차 설명 기준입니다. 실제 영상 형식과 다를 수 있으며 확인 근거가 없는 자료는 형태 한정에서 제외됩니다.");
  }
  if (/강연도\s*괜찮|강연.*허용/.test(original)) {
    constraints.lectureAllowed = true;
    text = text.replace(/(?:석학\s*)?강연도\s*괜찮(?:아요|습니다)?/g, " ");
  }
  if (/강의\s*(?:말고|제외|빼고)/.test(original)) {
    constraints.excludedKinds = ["lesson"];
    warnings.push("강의 유형·표현을 제외합니다. 모든 방송의 형식 분류가 확인된 것은 아닙니다.");
  }
  text = text.replace(/(?:너무\s*)?(폭력적(?:인)?|잔인한|수술)\s*(?:장면|영상)(?:은|는|을|를)?\s*(?:빼고요|빼고|제외하고|제외|없이)/g, (_, condition) => {
    constraints.sceneExclusions ||= []; constraints.sceneExclusions.push(condition);
    warnings.push("폭력·수술 등 장면 제외 조건은 영상 확인 전에는 보장할 수 없습니다."); return " ";
  });
  text = text.replace(/실제\s*자연\s*(?:풍경|촬영)|자연\s*촬영|현장\s*촬영/g, () => {
    constraints.naturalFootage = true; warnings.push("실제 자연 촬영 여부는 미확인입니다. 주제 언급만으로 촬영 방식을 판단하지 않습니다."); return " ";
  });
  if (/실험\s*말고/.test(original)) warnings.push("실험이라는 표현을 제외해도 영상이 실험 형식이 아니라는 보장은 없습니다.");
  text = text.replace(/진로\s*단원\s*마무리(?:로)?|수업\s*도입(?:에)?|단원인데|활동\s*전에\s*틀어\s*주려고요/g, (value) => { classroomContext.push(value); return " "; });
  const details = [
    [/(?:문화).*(?:함께|공존)/, "서로 다른 문화의 공존 사례", ["다문화", "이주", "공존", "함께"]],
    [/대표.*(?:뽑|선출)|선거.*역할/, "투표로 대표를 선출하는 방법", ["투표", "선출", "대표"]],
    [/시민.*(?:참여|의사결정)/, "시민이 의사결정에 참여하는 창구", ["공청회", "토론회", "주민참여조례", "의회교실", "선거", "투표"]],
    [/탐사.*방법|탐사하는/, "탐사 방법", ["탐사", "탐사선", "우주선"]],
    [/기관.*역할/, "기관의 역할", ["기관", "심장", "소화", "호흡", "혈액"]],
    [/움직이는지|움직임/, "기관의 움직임", ["움직", "박동", "펌프", "수축", "소화"]],
    [/실제\s*사람\s*이야기/, "인물의 실제 사례", ["사람", "인물", "이야기", "삶"]],
    [/발굴.*과정|발굴\s*현장/, "발굴 과정·현장", ["발굴"]],
    [/만들어지는지/, "형성 과정", ["형성", "퇴적", "만들어"]],
    [/어떻게\s*사는지|당시\s*생활/, "사람들의 생활", ["생활", "살아", "사는", "삶"]],
    [/무슨\s*일.*하는지/, "직업의 실제 업무", ["직업", "일", "연구", "개발"]]
  ];
  for (const [pattern, label, terms] of details) if (pattern.test(original)) detailRequests.push({ label, terms });
  if (detailRequests.length) warnings.push(`요청한 ${detailRequests.map((item) => item.label).join(" · ")}은 주제 후보와 별도로 원문·영상 확인이 필요합니다.`);
  text = text.replace(/실제\s*사람\s*이야기(?:로)?|(?:극한\s*)?기후에서\s*사람들(?:이)?\s*어떻게\s*사는지|무슨\s*일(?:을)?\s*하는지|유물\s*보고\s*당시\s*생활(?:을)?\s*추론하는/g, " ");
  text = text.replace(/보여\s*(?:주(?:는|고|려고)|줄)|생각해\s*볼|잘라\s*쓸\s*수|봐도\s*괜찮은\s*장면(?:으로요|으로)?|의학\s*프로그램(?:에서)?|같은\s*거요/g, " ");
  // 붙여 쓴 선택 연결은 국소 OR로 보존한다: (고조선 OR 삼국시대) AND 유물 AND 발굴.
  const aliases = [...new Set(vocabulary)].sort((a, b) => b.length - a.length);
  const nounPattern = aliases.map((alias) => escapeRegex(alias).replace(/ /g, "\\s*")).join("|");
  const alternatives = [];
  // 명시적으로 하나를 허용하는 요청만 미등록 선택지까지 OR로 보존한다.
  text = text.replace(/([\p{L}\p{N}]+?)(?:이나|나)\s*([\p{L}\p{N}]+(?:\s+(?!(?:중|둘|한|하나)(?:\s|$))[\p{L}\p{N}]+)?)(?=,?\s*(?:중|둘|한\s*곳|하나))/gu, (_,a,b)=>{ alternatives.push([a,b]); return " "; });
  if (nounPattern) {
    text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(${nounPattern})(?:이나|나)\\s*(${nounPattern})(?=$|[^\\p{L}\\p{N}]|처럼|의|을|를|은|는|이|가)`, "gu"), (_, a, b) => { alternatives.push([a, b]); return " "; });
    text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(${nounPattern})(?:이랑|랑)(?=$|[^\\p{L}\\p{N}])`, "gu"), "$1 그리고 ");
  }
  const language = naturalRequest(text, original);
  text = language.text;
  for (const relation of language.relations) detailRequests.push({ label: relation.label, terms: relation.quotes });
  preferences.programs = [...new Set(preferences.programs)];
  return { text, language, contentPlan, exclusions, preferences, requiredPrograms: [...new Set(requiredPrograms)], constraints, warnings, classroomContext, detailRequests, alternatives };
}
module.exports = { extractRequestContext };
