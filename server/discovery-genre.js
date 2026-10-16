// 방송 형태는 요청별 검색 근거다. 원문·공식 태그·교육과정 승인으로 저장하지 않는다.
const genres = [
  { label: '다큐멘터리', aliases: '다큐멘터리|다큐', primary: true,
    summary: '(?:다큐멘터리|다큐)(?:이다|입니다|다(?=[.!?。]|$)|로\\s*(?:제작|구성|담)|\\s*(?:형식|프로그램))' },
  { label: '애니메이션', aliases: '애니메이션|애니|만화', primary: true,
    summary: '(?:애니메이션|만화)(?:이다|입니다|다(?=[.!?。]|$)|으로\\s*(?:제작|구성|그린)|를\\s*통해|\\s*(?:형식|프로그램))' },
  { label: '드라마', aliases: '드라마|극화', primary: true,
    summary: '(?:드라마|극화)(?:이다|입니다|다(?=[.!?。]|$)|로\\s*(?:제작|구성|재현)|\\s*(?:형식|프로그램))' },
  { label: '강연·강의', aliases: '강연|강의|특강', primary: true,
    summary: '(?:강연|강의|특강)(?:이다|입니다|다(?=[.!?。]|$)|를\\s*(?:진행|들려)|\\s*(?:형식|프로그램))' },
  { label: '대담·인터뷰', aliases: '대담|인터뷰|토론', primary: false,
    summary: '(?:대담|인터뷰|토론)(?:를|을|로)?\\s*(?:통해|진행|나누|나눈|한다|했다|형식|방식)' },
  { label: '실험·시연', aliases: '실험|시연|시범', primary: false,
    summary: '(?:실험|시연|시범)(?:을|를|으로|로)?\\s*(?:통해|보여|진행|해\\s*보|한다|했다|형식|방식)' },
  { label: '뉴스·보도', aliases: '뉴스|보도', primary: true,
    summary: '(?:뉴스|보도)(?:이다|입니다|다(?=[.!?。]|$)|\\s*(?:형식|방송|프로그램))' }
];
const formNames = genres.map(genre => `(?:${genre.aliases})`).join('|');
const formOr = new RegExp(`(?:${formNames})(?:만)?\\s+(?:또는|아니면|혹은)\\s+(?:${formNames})`, 'u');
function extractGenreRequest(text, { programPreference = false } = {}) {
  const preferred = [], required = [], excluded = [];
  const operator = formOr.test(text) ? 'OR' : 'AND';
  for (const genre of genres) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${genre.aliases})(?=$|[^\\p{L}\\p{N}]|만|로|으로|를|을|가|이|는|은|의|에서|말고|빼고|제외)\\s*((?:은|는|을|를)?\\s*(?:제외하고|제외한|제외|빼고|말고)|(?:으로|로)?만|중에서|에서|같은|같이|위주(?:로)?|선호|으로|로|를|을|가|이|는|은|의)?(?![\\p{L}\\p{N}])`, 'gu');
    text = text.replace(pattern, (quote, marker = '', offset) => {
      // 형태를 주제로 삼은 ‘인터뷰의 기술’, ‘실험 장비’ 등은 내용어로 보존한다.
      if (/^(?:역사|기술|제작|분석|비평|장비|설계|결과|산업|제도|회사)(?:\s|$)/u.test(text.slice(offset + quote.length).trimStart())) return quote;
      if (/제외|빼고|말고/.test(marker)) excluded.push(genre.label);
      else if (/만|중에서|에서/.test(marker)) required.push(genre.label);
      else if (/같은|같이|위주|선호/.test(marker) || programPreference) preferred.push(genre.label);
      else required.push(genre.label);
      return ' ';
    });
  }
  return { text, preferred: [...new Set(preferred)], required: [...new Set(required)], excluded: [...new Set(excluded)], operator };
}
const patterns = genres.map(genre => ({ ...genre,
  program: new RegExp(`(?:${genre.aliases})`, 'u'),
  title: new RegExp(`(?:${genre.aliases})(?=$|[\\s:：,\\-–\\]】])`, 'u'),
  declaration: new RegExp(genre.summary, 'u'),
  negation: new RegExp(`(?:${genre.aliases})(?:이|가|은|는|을|를)?\\s*(?:아니|아닌|없이|없는|없다|진행하지\\s*않|하지\\s*않)`, 'u')
}));
function genreEvidence(resource) {
  const literal = require("./source-literal").literalSource(resource);
  const evidence = [];
  const sourceBody = `${literal.title || ''}\n${literal.summary || ''}`;
  for (const genre of patterns) {
    if (genre.negation.test(sourceBody)) continue;
    if (resource.kind === 'lesson' && genre.primary && genre.label !== '강연·강의') continue;
    for (const field of ['program', 'title', 'summary']) {
      const text = String(literal[field] || '');
      const match = (field === 'program' ? genre.program : field === 'title' ? genre.title : genre.declaration).exec(text);
      if (!match) continue;
      const tail = text.slice(match.index + match[0].length).trimStart();
      if (/^(?:의\s*)?(?:역사|기술|제작|분석|비평|장비|설계|산업)(?:\s|$)/u.test(tail) || /^(?:하지|하진|진행하지)\s*않/u.test(tail)) continue;
      evidence.push({ label: genre.label, field, quote: match[0], start: match.index, end: match.index + match[0].length, status: 'FORMAT_DESCRIPTION' }); break;
    }
    if (genre.label === '강연·강의' && resource.kind === 'lesson' && !evidence.some(item => item.label === genre.label)) {
      evidence.push({ label: genre.label, field: 'kind', quote: 'lesson', status: 'RESOURCE_TYPE' });
    }
  }
  const classification = resource.programClassification;
  const primary = evidence.filter(item => genres.find(genre => genre.label === item.label)?.primary);
  for (const label of classification?.forms || []) {
    const genre = patterns.find(item => item.label === label);
    if (!genre || evidence.some(item => item.label === label) || genre.negation.test(sourceBody)) continue;
    if (primary.length && !primary.some(item => item.label === label)) continue;
    const declaration=classification.formatEvidence?.find(record=>record.form===label);
    if(declaration){evidence.push({label,field:'programFormatEvidence',quote:declaration.quote,sourceText:declaration.quote,
      sourceUrl:declaration.sourceUrl,checkedAt:declaration.checkedAt,sourceRecordHash:declaration.contentHash,status:'OFFICIAL_PROGRAM_DECLARATION'});continue;}
    evidence.push({ label, field: 'programCategory', quote: classification.category, sourceText: classification.category,
      sourceUrl: classification.sourceUrl, sourcePage: classification.sourcePage, checkedAt: classification.checkedAt,
      sourceRecordHash: classification.sourceRecordHash, status: 'OFFICIAL_PROGRAM_CATEGORY' });
  }
  return evidence;
}
module.exports = { extractGenreRequest, genreEvidence };
