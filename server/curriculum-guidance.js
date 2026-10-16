const payload = require('./data/curriculum-guidance.json');
const { standardCourse } = require('../public/grade-context');

const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, '').replace(/[–−]/g, '-');
const byStandard = new Map(payload.units.flatMap(unit => unit.explanations.map(entry => [entry.standardId, { unit, entry }])));

function guidanceFor(standard) {
  const metadata = standard.metadata, match = byStandard.get(metadata.achievementStandardId);
  // 같은 코드라도 다른 판본·본문에는 기존 해설을 연결하지 않는다.
  if (standard.curriculumVersion !== '2022 개정' || !match || normalize(match.entry.standardText) !== normalize(metadata.achievementStandard)) return null;
  const quote = value => value ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'rawText')) : null;
  return { standardId: metadata.achievementStandardId, version: payload.version, unitTitle: match.unit.title,
    explanation: quote(match.entry.explanation), application: quote(match.unit.application),
    applicationScope: 'UNIT', note: payload.note,
    reviewPrompt: '해설의 내용 범위와 아래 영상 원문 인용을 비교하세요. 설명되지 않은 개념·실험·관찰·토의·학생 수행은 추가 설명과 수업 활동으로 보완할 부분입니다.' };
}

function placementFor(standard) {
  if (standard.curriculumVersion !== '2022 개정' || standardCourse(standard) !== 'middle1') return null;
  return { label: '중1 참고 과정은 EBS 뉴런 구성 기준입니다. 수업 진도에 맞는 성취기준을 선택하세요.',
    officialGradeBand: '중학교 1~3학년군', schoolPlacementConfirmed: false,
    citations: payload.placement.map(({ rawText, ...quote }) => quote),
    note: '공식 내용 배열은 고정된 학습 순서가 아닙니다. 이 근거는 영상의 학년 적합성이나 교육과정 연계 승인과 별개입니다.' };
}

module.exports = { guidanceFor, placementFor };
