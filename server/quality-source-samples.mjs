// R09 공개 원문 표본: HTTP 접근·메타 ID/제목·소개문을 각각 기록하며 재생하지 않는다.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.CURI_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const report = JSON.parse(await fs.readFile(`${root}docs/r4-quality-check.json`, 'utf8'));
const samples = report.rows.filter(row => row.sourceAuditSelected).flatMap(row => row.top.map(item => ({ scenarioId: row.id, subject: row.subject, query: row.query, ...item })));
// 에이전트가 제목·소개문을 읽고 남긴 목적표본 판단. 사람 검수·정답 라벨이 아니다.
const assessments = {
  'GEO-GIMJE': ['PARTIAL_SUPPORT', '김제평야·지평선은 확인되지만 동서 비교나 동고서저 원리 설명은 확인되지 않는다.'],
  'BCAST-0266ccbdac38db6404e4': ['PARTIAL_SUPPORT', '설악산 고도·울산바위와 음식 여행이 혼재한다. 평야 비교 설명은 확인되지 않는다.'],
  'BCAST-5b234f3204d1a1f0bafe': ['PARTIAL_SUPPORT', '설악산 고도·폭포와 마을 생활은 확인된다. 동서 지형 비교의 직접 설명은 확인되지 않는다.'],
  'BCAST-ce1721b43f7741c59028': ['TEXT_SUPPORT', '지방의회·공청회·주민참여조례를 통해 시민 참여와 민주주의를 명시한다.'],
  'PDLOG-048': ['TEXT_SUPPORT', '이주배경 학생들의 초등 교실 생활을 소개한다.'],
  'BCAST-006958cbcbf16462144b': ['PARTIAL_SUPPORT', '다문화 공존·권리·사회적 비용은 확인되지만 구체적 생활 장면은 확인되지 않는다.'],
  'BCAST-85d72913fc864cac86dd': ['INSUFFICIENT_DESCRIPTION', '다문화 프로그램 재구성이라는 제작 정보만 있어 생활 모습의 구체 근거가 부족하다.'],
  'BCAST-edc5b3f9fd8742c0b2f0': ['TOPIC_ONLY', '고인돌 동의어군의 청동기 표현으로 선택됐지만 소개문은 농경문청동기 유물이다.'],
  'BCAST-a9ae022bed5a04b977c3': ['PARTIAL_SUPPORT', '고인돌 왕국은 명시하지만 옛사람 생활을 알아보는 구체 설명은 부족하다.'],
  'BCAST-0e6786e007b16522e6bd': ['TOPIC_ONLY', '불가리아 청동기 유물·황금비율 이야기로 고인돌 생활 요청과 맞지 않는다.'],
  'BCAST-04d6a3cba5fe859f2e25': ['PARTIAL_SUPPORT', '갯벌 생태계 방문과 지역 생활을 소개하지만 생물 간 관계 설명은 확인되지 않는다.'],
  'BCAST-af19741ff313f1c6f411': ['PARTIAL_SUPPORT', '화산이 인간·생태계에 주는 이익을 다루며 생물 간 관계 설명과는 차이가 있다.'],
  'BCAST-c795af87c725960152da': ['TEXT_SUPPORT', '꿀벌·장수말벌의 침공과 여왕의 삶을 통해 두 생태계의 관계를 소개한다.'],
  'BCAST-e62e352286bfdf0e7886': ['PARTIAL_SUPPORT', '기후 변화 감시 위성을 설명한다. 요청한 환경 영향의 구체 사례 설명은 제한적이다.'],
  'BCAST-c3cfb74a8979103b6704': ['TEXT_SUPPORT', '온난화·해수면 상승과 투발루 터전 상실을 명시한다. 오래된 소개문 속 통계를 현재 사실로 재사용하면 안 된다.'],
  'BCAST-288c797421b1489304f6': ['TOPIC_ONLY', '인체 언급은 있으나 냉동 보존술이 주제이며 기관 역할 요청을 뒷받침하지 않는다.'],
  'BCAST-335677cf4cd62a24a4ae': ['PARTIAL_SUPPORT', '내부 장기의 비대칭은 설명하지만 각 기관의 기능을 직접 설명하는 근거는 부족하다.'],
  'BCAST-b3fcf41eba96e61930d8': ['TEXT_SUPPORT', '보유 소개문은 교감·부교감 작용과 심장·호흡을 설명한다. 현재 도착 회차가 달라 추천 전에 출처를 복구해야 한다.'],
  'BCAST-012ead6030a246fe0eeb': ['TOPIC_ONLY', '행성의 자전·공전과 하루 길이 설명이며 우주 탐사 방법의 근거는 없다.'],
  'BCAST-98b56fa27d0b607fa585': ['TOPIC_ONLY', '우주 쓰레기 관리 주제이며 탐사 방법의 근거는 없다.'],
  'BCAST-015286eab735ab6fb910': ['TOPIC_ONLY', '운석의 종류·가치를 다루며 우주 탐사 방법의 구체 근거는 부족하다.']
};
const annotateOnly = process.argv.includes('--annotate-only');
const approvalPath = `${root}server/data/curi-store.json`;
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const before = await digest(approvalPath);
const browser = annotateOnly ? null : await chromium.launch({ headless: true, ...(process.env.CURI_CHROMIUM_PATH ? { executablePath: process.env.CURI_CHROMIUM_PATH } : {}) });
const context = browser ? await browser.newContext() : null;
const parser = context ? await context.newPage() : null;
const rows = annotateOnly ? JSON.parse(await fs.readFile(`${root}docs/r4-source-samples.json`, 'utf8')).rows : [];
try {
  for (const sample of annotateOnly ? [] : samples) {
    const record = { scenarioId: sample.scenarioId, subject: sample.subject, query: sample.query, rank: sample.rank,
      id: sample.id, expectedTitle: sample.title, program: sample.program, url: sample.url, evidenceUrl: sample.evidenceUrl,
      playback: 'NOT_CHECKED', subtitles: 'NOT_CHECKED', sceneDuration: 'NOT_CHECKED', curriculum: 'NOT_ASSESSED',
      checkedAt: new Date().toISOString() };
    try {
      if (!new URL(sample.url).hostname.endsWith('.ebs.co.kr')) throw new Error('공식 EBS 개별 원문 URL만 대조');
      const response = await context.request.get(sample.url, { timeout: 15000 });
      record.httpStatus = response.status(); record.finalUrl = response.url();
      const html = await response.text(); await response.dispose();
      record.responseHash = crypto.createHash('sha256').update(html).digest('hex');
      const detail = await parser.evaluate(({ html, summary }) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const decode = value => { const area = doc.createElement('textarea'); area.innerHTML = value || ''; const first = area.value; area.innerHTML = first; return area.value; };
        const clean = value => { const node = doc.createElement('div'); node.innerHTML = decode(value); return node.textContent.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase(); };
        let video;
        for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
          try { const value = JSON.parse(script.textContent); if (value['@type'] === 'VideoObject') video = value; } catch {}
        }
        const title = decode(video?.name || doc.querySelector('meta[property="og:title"]')?.content || '');
        const description = decode(video?.description || doc.querySelector('.player_title_wrap > p')?.textContent || '').trim();
        return { title, description, url: doc.querySelector('meta[property="og:url"]')?.content || video?.embedUrl || '',
          durationMetadata: video?.duration || null,
          expectedSummaryInDescription: Boolean(summary && description) && clean(description).includes(clean(summary)),
          expectedSummaryInBody: Boolean(summary) && clean(doc.body?.textContent || '').includes(clean(summary)),
          normalizeTitle: clean(title) };
      }, { html, summary: sample.summary });
      record.detail = detail;
      const normalize = value => value.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
      record.titleExactMatch = detail.normalizeTitle === normalize(sample.title);
      if (detail.url) {
        const target = new URL(detail.url);
        const expected = new URL(sample.url);
        record.selectedIdentityMatch = ['courseId', 'lectId'].every(key => Boolean(expected.searchParams.get(key)) && target.searchParams.get(key) === expected.searchParams.get(key));
      } else record.selectedIdentityMatch = false;
      record.pageIdentityStatus = record.selectedIdentityMatch && record.titleExactMatch ? 'MATCHED' : 'UNCONFIRMED';
      record.summaryStatus = !sample.summary ? 'NO_DESCRIPTION' : detail.expectedSummaryInDescription ? 'MATCHED_DESCRIPTION' : detail.expectedSummaryInBody ? 'PRESENT_IN_BODY' : 'UNCONFIRMED';
    } catch (error) { record.error = error.message.split('\n')[0]; record.pageIdentityStatus = 'UNCONFIRMED'; record.summaryStatus = 'UNCONFIRMED'; }
    rows.push(record);
    console.log(JSON.stringify({ done: rows.length, total: samples.length, id: record.id, page: record.pageIdentityStatus, summary: record.summaryStatus }));
  }
  const after = await digest(approvalPath);
  if (before !== after) throw new Error('승인 저장소 동시 변경 발견');
  const normalize = value => String(value || '').replace(/<br\s*\/?\s*>/gi, ' ').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  for (const row of rows) {
    const sample = samples.find(item => item.id === row.id);
    const [status, reason] = assessments[row.id] || ['NOT_ASSESSED', '미평가'];
    row.textRelevance = { reviewer: 'AGENT_TEXT_REVIEW', status, reason, teacherApproval: false, scenesVerified: false };
    row.titleAfterEpisodePrefixMatch = row.selectedIdentityMatch && normalize(row.detail?.title.replace(/^\d+화\s*/, '')) === normalize(row.expectedTitle);
    row.descriptionAfterDisplayLabelMatch = row.selectedIdentityMatch && Boolean(row.detail?.description) && normalize(sample.summary.replace(/^자막/, '')) === normalize(row.detail.description);
    row.sourceReviewNote = row.id === 'PDLOG-048' ? '동일 회차 ID. 공식 제목의 48화와 저장 소개문의 자막 표시 차이로 엄격 대조에 실패했다.' :
      row.id === 'BCAST-85d72913fc864cac86dd' ? '저장 소개문에 화면 표시 자막이 혼입됐다. 제거 시 공식 설명과 일치한다. 자막 지원 검증과 별개.' :
      row.id === 'BCAST-b3fcf41eba96e61930d8' ? '요청 주소에서 다른 회차 뼈는 살아있다와 프로그램 홈 URL이 확인됨. 보유 내용과 도착 원문의 연결 미확인.' : '';
  }
  const reviewQueue = rows.filter(row => row.textRelevance.status === 'TEXT_SUPPORT' && (row.pageIdentityStatus === 'MATCHED' || row.titleAfterEpisodePrefixMatch))
    .map(row => ({ id: row.id, title: row.expectedTitle, url: row.url, scenarioId: row.scenarioId,
      status: 'PENDING_HUMAN_REVIEW', priorityReason: row.textRelevance.reason,
      checksNeeded: ['원문·실제 장면 확인', '학년·교육과정 연결 판단', '접근·재생·자막·사용 구간 확인'],
      approved: false }));
  const artifact = { generatedAt: new Date().toISOString(), inputSnapshotSha256: report.snapshotSha256, searchCodeHashes: report.codeHashes,
    method: '사회4·과학4 개발 가상질문의 상위 최대3개 공개 회차 원문 HTTP GET. 스크립트·영상 미실행. 제목과 VideoObject/og:url 회차 ID를 개별 대조. 소개문은 마크업·공백 정규화 후 따로 대조.',
    sampleQueries: 8, samples: rows.length, paidApiCalls: 0, approvalUnchanged: true, approvalSha256: after,
    aggregate: { httpOk: rows.filter(r => r.httpStatus === 200).length, titleExactMatches: rows.filter(r => r.titleExactMatch).length,
      selectedIdentityMatches: rows.filter(r => r.selectedIdentityMatch).length, pageIdentityMatches: rows.filter(r => r.pageIdentityStatus === 'MATCHED').length,
      descriptionMatches: rows.filter(r => r.summaryStatus === 'MATCHED_DESCRIPTION').length, bodyOnlyMatches: rows.filter(r => r.summaryStatus === 'PRESENT_IN_BODY').length,
      titlesWithDeclaredEpisodePrefixMatch: rows.filter(r => r.pageIdentityStatus === 'MATCHED' || r.titleAfterEpisodePrefixMatch).length,
      descriptionDisplayLabelMatches: rows.filter(r => r.summaryStatus === 'UNCONFIRMED' && r.descriptionAfterDisplayLabelMatch).length,
      textRelevanceCounts: Object.fromEntries([...new Set(rows.map(r => r.textRelevance.status))].map(status => [status, rows.filter(r => r.textRelevance.status === status).length])),
      playbackChecks: 0, subtitleChecks: 0, sceneDurationChecks: 0 }, rows, reviewQueue,
    reviewQueueNote: '이번 표본 안에서 텍스트 근거와 도착 식별이 있는 자료만 필요 검수 후보로 준비했다. 교사 승인·검수 시간·대량 검수 규모의 확정이 아니다. 다른 회차로 열린 인체 후보는 출처 복구 대기.',
    limits: ['목록 제목이 있는 것과 선택 회차 일치는 다르다.', '소개문 대조는 사실 최신성·영상 내용·학년 적합성·사람 승인과 별개.', '개발 질문의 목적표본으로 정답률 추정 불가.'] };
  await fs.writeFile(`${root}docs/r4-source-samples.json`, JSON.stringify(artifact, null, 2) + '\n');
  console.log(JSON.stringify(artifact.aggregate));
} finally { if (browser) await browser.close(); }
