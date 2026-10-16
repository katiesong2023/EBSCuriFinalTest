const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hwpParagraphs } = require('./hwp-source-text');
const { readDataStore } = require('./data-store');
const { standardCourse } = require('../public/grade-context');

const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'data/curriculum-guidance.json');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = value => value.normalize('NFKC').replace(/\s+/g, '').replace(/[–−]/g, '-');
const clean = value => value.replace(/\s+/g, ' ').trim().replace(/\s*•\s*$/, '');
const codePattern = /\[([469](?:사(?:\((?:지리|일사|역사)\))?|과)\d{2}[-–]\d{2})\]/g;

function documentText(lines) {
  let text = '';
  const locations = [];
  for (const line of lines) {
    const start = text.length;
    text += line.text + '\n';
    locations.push({ start, end: text.length, page: line.page, paragraph: line.paragraph });
  }
  return { text, locations };
}

function citation(doc, start, end) {
  const locations = doc.locations.filter(line => line.end > start && line.start < end);
  const pages = [...new Set(locations.map(line => line.page).filter(Boolean))];
  const paragraphs = locations.map(line => line.paragraph).filter(Boolean);
  let text = clean(doc.text.slice(start, end)), spacingChecks = [];
  if (pages.length) {
    const parts = pages.map(page => {
      const pageLines = locations.filter(line => line.page === page);
      const raw = doc.text.slice(Math.max(start, pageLines[0].start), Math.min(end, pageLines.at(-1).end));
      const visual = doc.pages.find(item => item.page === page).visualText;
      const positions = [];
      for (let index = 0; index < visual.length; index++) if (!/\s/.test(visual[index])) positions.push(index);
      const compact = positions.map(index => visual[index]).join(''), target = raw.replace(/\s/g, '');
      const match = compact.indexOf(target);
      if (match < 0) throw new Error(`PDF 해설 추출 엔진 글자 불일치: ${doc.sourceId} ${page}쪽`);
      const excerpt = visual.slice(positions[match], positions[match + target.length - 1] + 1);
      const boundaries = new Set();
      let count = 0;
      for (const char of raw) {
        if (char === ' ' || char === '\t') boundaries.add(count);
        else if (!/\s/.test(char)) count++;
      }
      let recovered = ''; count = 0;
      for (const char of excerpt) {
        if (char === '\r' || char === '\n') { if (boundaries.has(count)) recovered += ' '; }
        else { recovered += char; if (!/\s/.test(char)) count++; }
      }
      spacingChecks.push(page);
      return clean(recovered);
    });
    text = parts.join(' ');
  }
  return { sourceId: doc.sourceId, sourceDocument: doc.sourceDocument,
    sourceLocalPath: doc.sourceLocalPath, documentSha256: doc.documentSha256,
    location: pages.length ? `PDF ${pages.join('·')}쪽` : `추출 문단 ${paragraphs[0]}~${paragraphs.at(-1)}`,
    text, rawText: doc.text.slice(start, end), spacingChecks,
    extractStart: start, extractEnd: end, offsetUnit: 'UTF16_CODE_UNIT',
    extraction: doc.extraction, evidencePurpose: 'CURRICULUM_GUIDANCE_ONLY' };
}

function unitGuidance(doc, standards) {
  const units = [...doc.text.matchAll(/^\s*\(\s*\d+\s*\)[^\n]+/gm)];
  const result = [], declared = [];
  for (let i = 0; i < units.length; i++) {
    const start = units[i].index, end = units[i + 1]?.index ?? doc.text.length;
    const block = doc.text.slice(start, end);
    const explanation = /\(\s*가\s*\)\s*성취기준\s*해설/.exec(block);
    const considerations = /\(\s*나\s*\)\s*성취기준\s*적용\s*시\s*고려\s*사항/.exec(block);
    if (!explanation || !considerations) continue;
    const norm = normalize(block.slice(0, explanation.index));
    const selected = standards.filter(standard => norm.includes(normalize(`[${standard.metadata.achievementStandardId}]${standard.metadata.achievementStandard}`)));
    if (!selected.length) continue;
    declared.push(...selected.map(standard => standard.metadata.achievementStandardId));
    const expStart = start + explanation.index + explanation[0].length;
    const expEnd = start + considerations.index;
    const expText = doc.text.slice(expStart, expEnd);
    const explanations = [...expText.matchAll(codePattern)];
    let applyEnd = end;
    const after = doc.text.slice(start + considerations.index + considerations[0].length, end);
    const boundary = /^\s*(?:[23]\.\s*교수|\[(?:초등학교|중학교)|<일반사회|<역사)/m.exec(after);
    if (boundary) applyEnd = start + considerations.index + considerations[0].length + boundary.index;
    const application = citation(doc, start + considerations.index + considerations[0].length, applyEnd);
    const unitId = `${doc.sourceId}:${normalize(selected[0].metadata.achievementStandardId).replace(/-\d+$/, '')}`;
    result.push({ unitId, title: clean(units[i][0]), standardIds: selected.map(standard => standard.metadata.achievementStandardId), application,
      explanations: selected.map(standard => {
        const id = standard.metadata.achievementStandardId;
        const found = explanations.findIndex(match => normalize(match[1]) === normalize(id));
        return { standardId: id, standardText: standard.metadata.achievementStandard,
          explanation: found < 0 ? null : citation(doc, expStart + explanations[found].index,
            expStart + (explanations[found + 1]?.index ?? expText.length)) };
      }) });
  }
  return { units: result, declared };
}

async function build(pdfInput) {
  const standards = (await readDataStore()).curriculumStandards;
  const pdfs = JSON.parse(fs.readFileSync(pdfInput, 'utf8'));
  const docs = pdfs.map((doc, index) => {
    const actual = fs.readFileSync(path.join(root, doc.sourceLocalPath));
    if (sha(actual) !== doc.documentSha256) throw new Error('PDF 추출 판본 불일치');
    const lines = doc.pages.flatMap(page => page.text.split(/\r?\n/).map(text => ({ page: page.page, text: text.trim() }))
      .filter(line => line.text && !/^\d+$/.test(line.text) && !/^공통\s*교육과정$/.test(line.text) && !/^사회과\s*교육과정$/.test(line.text) && !/^과학과\s*교육과정$/.test(line.text)));
    return { ...doc, ...documentText(lines), sourceId: index === 0 ? 'SOCIAL_PDF' : 'SCIENCE_PDF',
      sourceDocument: `교육부 고시 제2022-33호 ${doc.sourceLocalPath.replace('.pdf', '')}`,
      extraction: 'pypdf layout 페이지 순서·PDFium 공백 + pypdf 줄 경계 대조', middle: false };
  });
  const hwpName = fs.readdirSync(root).find(name => name.normalize('NFC') === '[별책3] 중학교 교육과정.hwp');
  if (!hwpName) throw new Error('추가 중학교 한글 파일 없음');
  const hwp = fs.readFileSync(path.join(root, hwpName));
  const middleDoc = { ...documentText(hwpParagraphs(hwp)), sourceId: 'MIDDLE_HWP',
    sourceLocalPath: hwpName.normalize('NFC'), documentSha256: sha(hwp), middle: true,
    sourceDocument: '교육부 고시 제2022-33호 [별책3] 중학교 교육과정',
    extraction: 'HWP 5 문단 텍스트 · 쪽 배치와 별개' };
  docs.push(middleDoc);
  const records = docs.flatMap(doc => unitGuidance(doc, standards.filter(standard =>
    doc.middle ? standardCourse(standard) === 'middle1' : standardCourse(standard) !== 'middle1' &&
      standard.metadata.subject === (doc.sourceId === 'SOCIAL_PDF' ? '사회' : '과학'))).units);
  const ids = records.flatMap(unit => unit.standardIds);
  const missing = standards.filter(standard => !ids.includes(standard.metadata.achievementStandardId)).map(standard => standard.metadata.achievementStandardId);
  if (missing.length || new Set(ids).size !== ids.length) throw new Error(`해설 단원 대응 누락/중복: ${missing.join(',')} (${ids.length})`);
  const placementPhrases = [
    '바. 교과와 창의적 체험활동의 내용 배열은 반드시 따라야 할 학습 순서를 의미하는 것은 아니며,',
    '1) 학교는 교과(군)와 창의적 체험활동의 수업 시수를 학년별, 학기별로 자율적으로 편성할 수 있다.',
    '가) 학교는 학생이 3년간 이수해야 할 교과목을 학년별, 학기별로 편성하여 학생과 학부모에게 안내한다.'
  ];
  const placement = placementPhrases.map(phrase => {
    const start = middleDoc.text.indexOf(phrase);
    if (start < 0) throw new Error(`편성 원문 누락: ${phrase}`);
    const end = middleDoc.text.indexOf('\n', start);
    return citation(middleDoc, start, end);
  });
  return { version: 'R07-10-20261011-v1', checkedAt: '2026-10-11',
    documents: docs.map(({ sourceId, sourceDocument, sourceLocalPath, documentSha256, extraction }) => ({ sourceId, sourceDocument, sourceLocalPath, documentSha256, extraction })),
    placement, units: records, standards: ids.length,
    note: '공식 해설·적용 고려 사항은 교사 비교 안내이며 방송의 근거 인용·자동 판정·사람 승인·학년 적합성으로 사용하지 않습니다.' };
}

if (require.main === module) {
  const input = process.argv[process.argv.indexOf('--pdf-pages') + 1];
  if (!process.argv.includes('--pdf-pages') || !input) throw new Error('--pdf-pages 추출 JSON 경로 필요');
  build(input).then(payload => {
    if (process.argv.includes('--check')) {
      if (JSON.stringify(payload) !== JSON.stringify(JSON.parse(fs.readFileSync(output, 'utf8')))) throw new Error('해설 재현 결과 불일치');
    } else fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n');
    console.log(JSON.stringify({ standards: payload.standards, units: payload.units.length,
      explanations: payload.units.flatMap(unit => unit.explanations).filter(item => item.explanation).length,
      placement: payload.placement.length, check: process.argv.includes('--check') }));
  }).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { build, normalize };
