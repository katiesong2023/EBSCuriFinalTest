const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { readDataStore } = require('./data-store');
const { hwpParagraphs } = require('./hwp-source-text');
const { guidanceFor, placementFor } = require('./curriculum-guidance');
const { requirementPlan } = require('./curriculum-requirements');
const { assessRelation } = require('./automatic-relation-rules');
const { standardCourse } = require('../public/grade-context');
const payload = require('./data/curriculum-guidance.json');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  const store = await readDataStore(), cases = [];
  const check = (name, fn) => { fn(); cases.push({ name, passed: true }); };
  const standards = store.curriculumStandards;
  check('214개 기준·73단원 대응·본문 판본 일치·개별 해설 없음 구분', () => {
    const ids = payload.units.flatMap(unit => unit.standardIds);
    assert.equal(ids.length, 214); assert.equal(new Set(ids).size, 214);
    assert.equal(payload.units.length, 73);
    for (const standard of standards) {
      const guidance = guidanceFor(standard);
      assert.equal(guidance.standardId, standard.metadata.achievementStandardId);
      assert.equal(guidance.applicationScope, 'UNIT'); assert.ok(guidance.application.text);
      assert.equal(guidance.application.evidencePurpose, 'CURRICULUM_GUIDANCE_ONLY');
      assert.equal(guidanceFor({ ...standard, metadata: { ...standard.metadata, achievementStandard: '다른 판본의 기준' } }), null);
      assert.equal(guidanceFor({ ...standard, curriculumVersion: '2015 개정' }), null);
    }
    assert.equal(payload.units.flatMap(unit => unit.explanations).filter(entry => entry.explanation).length, 171);
  });
  check('공식 파일 SHA와 HWP 발췌 위치·내용 대조', () => {
    for (const doc of payload.documents) {
      const filename = fs.readdirSync(path.resolve(__dirname, '..')).find(name => name.normalize('NFC') === doc.sourceLocalPath);
      assert.ok(filename); assert.equal(sha(fs.readFileSync(path.resolve(__dirname, '..', filename))), doc.documentSha256);
    }
    const doc = payload.documents.find(entry => entry.sourceId === 'MIDDLE_HWP');
    const filename = fs.readdirSync(path.resolve(__dirname, '..')).find(name => name.normalize('NFC') === doc.sourceLocalPath);
    const text = hwpParagraphs(fs.readFileSync(path.resolve(__dirname, '..', filename))).map(p => p.text + '\n').join('');
    const quotes = [...payload.placement, ...payload.units.filter(unit => unit.application.sourceId === 'MIDDLE_HWP').flatMap(unit =>
      [unit.application, ...unit.explanations.map(entry => entry.explanation).filter(Boolean)])];
    for (const quote of quotes) assert.equal(text.slice(quote.extractStart, quote.extractEnd), quote.rawText);
    for (const unit of payload.units.filter(unit => unit.application.sourceId !== 'MIDDLE_HWP')) {
      for (const quote of [unit.application, ...unit.explanations.map(entry => entry.explanation).filter(Boolean)]) assert.ok(quote.spacingChecks.length);
    }
  });
  check('중1 참고63개만 편성 안내·학년군/중1 구분·공식 자율 편성 근거', () => {
    assert.equal(standards.filter(standard => placementFor(standard)).length, 63);
    for (const standard of standards) {
      const placement = placementFor(standard);
      if (standardCourse(standard) !== 'middle1') assert.equal(placement, null);
      else {
        assert.equal(placement.schoolPlacementConfirmed, false); assert.equal(placement.officialGradeBand, '중학교 1~3학년군');
        assert.match(placement.citations.map(quote => quote.text).join('\n'), /내용 배열은 반드시 따라야 할 학습 순서를 의미하는 것은 아니며/);
        assert.match(placement.citations.map(quote => quote.text).join('\n'), /학년별, 학기별로 자율적으로 편성/);
      }
    }
  });
  check('해설 연결로 제한된 자동 관계 규칙·판정·미지원 상태를 바꾸지 않음', () => {
    const supported = standards.filter(standard => requirementPlan(standard).ruleSupported);
    assert.equal(supported.length, 4);
    const standard = standards.find(entry => entry.metadata.achievementStandardId === '9과05-02');
    assert.match(guidanceFor(standard).explanation.text, /질량과 무게를 구별/);
    assert.equal(requirementPlan(standard).ruleSupported, false);
    assert.equal(assessRelation({ synopsis: '중력은 지구가 물체를 끌어당기는 힘이다.' }, standard).status, 'UNSUPPORTED');
    const primary = guidanceFor(standards.find(entry => entry.metadata.achievementStandardId === '6과12-02'));
    assert.match(primary.explanation.text, /자전축이 기울어진 채 하루에 한 바퀴/);
  });
  check('해설 없는 기준·HTML 이스케이프·내보내기의 공식 설명/영상 근거 구분', () => {
    const sandbox = { CuriTeacher: { escape: value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])) } };
    vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/teacher-guidance.js'), 'utf8'), sandbox);
    const noExplanation = standards.map(guidanceFor).find(guidance => !guidance.explanation);
    assert.match(sandbox.CuriTeacher.guidanceMarkup(noExplanation), /별도로 제시된 해설이 없습니다/);
    const attacked = { ...noExplanation, unitTitle: '<script>alert(1)</script>' };
    assert.doesNotMatch(sandbox.CuriTeacher.guidanceMarkup(attacked), /<script>/);
    assert.match(sandbox.CuriTeacher.guidanceMarkdown(noExplanation, String).join('\n'), /영상 인용·자동 비교·승인과 별도/);
  });
  fs.writeFileSync(process.env.CURI_REPORT_PATH || path.join(__dirname, '../docs/r07-10-guidance-check.json'), JSON.stringify({ date: new Date().toISOString(), cases,
    standards: 214, units: 73, explanations: 171, noSeparateExplanation: 43, scope: '원문 구조/텍스트 대조·표시 계약. 영상의 학년 적합성·교사 효용 평가 아님.' }, null, 2) + '\n');
  console.log(`교육과정 해설 계약 ${cases.length}개 통과`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
