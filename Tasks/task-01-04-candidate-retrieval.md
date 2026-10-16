# Task 01-04 - 공식 성취기준 후보 찾기

> 현재 정본: [PLANS](../docs/PLANS.md) · 대응: **R00~R03 기반 / 완료 이력·기반 보존**. 기존 승인·증분·화면·출처 자산을 재사용하며 새 탐색의 완료로 확대 해석하지 않는다. 과거 구현·사람 확인 기록은 보존한다.

## 설명

콘텐츠 설명과 관련 있는 공식 성취기준을 제한된 후보 목록으로 반환한다.

## 작업 크기와 추천 모델

- 구분: P0 필수
- 배치: Week 1
- 예상 집중 작업: 약 1.5시간. 개인 입문자 계획용 추정이며 설치·보류·재작업 시간은 별도이다.
- 개발 보조 모델: **GPT-5.6 Terra** (`gpt-5.6-terra`)
- 추천 추론 수준: **medium**
- 선택 이유: 범위가 작은 검색 기능과 제약 적용이 중심이므로 Terra가 비용과 구현 안정성을 균형 있게 제공한다.
- 상향 조건: 원인을 좁혀도 해결되지 않는 제약·상태·데이터 무결성 문제는 해당 부분만 Sol / medium으로 검토한다.
- 모델 배치는 과업 성격에 따른 추천이며 이 서비스에서 측정한 모델 성능 결과가 아니다. [공식 모델 역할·추론 수준 안내](https://learn.chatgpt.com/docs/models)
- 개발 모델과 서비스 API 모델·비용의 차이는 [task 사용 안내](./00_README.md)를 참고한다.

## 관련 기준

[기획 01](../EBS_Curi_FINAL_PACKAGE_v1.4/docs/01_Curi_%E1%84%8E%E1%85%AC%E1%84%8C%E1%85%A9%E1%86%BC_%E1%84%80%E1%85%A2%E1%84%87%E1%85%A1%E1%86%AF%E1%84%80%E1%85%B5%E1%84%92%E1%85%AC%E1%86%A8%E1%84%89%E1%85%A5_v1.4.md), [기획 05](../EBS_Curi_FINAL_PACKAGE_v1.4/docs/05_ID_Schema_CuriBase_DataQuality_v1.4.md)

## 구현 항목

- [x] 사람 QA된 공식 목록에서만 콘텐츠별 후보를 찾고 코드·원문·출처를 반환한다.
- [x] 교과·학년군이 명시된 입력을 반영하되, 텍스트가 부족하거나 관련 기준이 없으면 보류할 수 있게 한다.
- [x] DEV 표본에서 후보 누락·중복을 확인하고 자유 생성 기준이 후보에 섞이지 않게 한다. 후보 반환은 의미 정확도 평가가 아니라 공식 목록 제약 검증으로 기록한다.

## 산출물 (2026-09-17)

- `server/candidate-retrieval.js`: 사람 QA·사람 승인·활성 상태인 사회 5~6학년군 공식 성취기준만 대상으로, 제목·소개문의 공통 개념어를 이용해 최대 5건을 반환한다. 콘텐츠 CURI ID 또는 제목·소개문과 교과·학년군을 받을 수 있으며, 중복 CURI ID는 한 번만 반환한다. 각 후보에는 성취기준 코드·원문·단원·교육과정 버전·공식 문서·PDF 쪽수와 일치 개념어를 포함한다.
- `server/server.js`: `GET /api/candidate-retrieval`로 위 검색을 읽기 전용으로 제공한다. 교과/학년군이 없거나 지원 범위를 벗어난 경우, 텍스트가 부족한 경우, 관련 공식 후보가 없는 경우에는 후보 배열을 비운 `HELD`와 사유를 반환한다.
- `server/candidate-retrieval-check.js`, `npm run data:candidates:check`: 중복 공식 기준 제거, 사람 승인 이외 기준 제외, 공식 출처 필드, 텍스트 부족·무관 입력 보류, 과학 입력 보류를 검사한다.

현재 적재된 사람 QA 공식 목록은 사회 5~6학년군 27건뿐이므로 과학 또는 다른 교과/학년군 입력은 후보를 추정하거나 자유 생성하지 않고 보류한다. 반환 결과는 다음 단계 CuriMap의 선택 후보일 뿐, 교육과정 의미 정확도·최종 연계·사람 승인 결과가 아니다.

## 범위 밖

- 최종 AI 선택
- 교육과정 의미 정확도 평가
- 과학 확장

## 사전 전제

- [Task 01-03](./task-01-03-data-store.md)의 필요한 산출물과 결과 확인 완료

## 입문자 시작 요청

```text
Tasks/task-01-04-candidate-retrieval.md를 진행해주세요.
AGENTS.md와 현재 진행 상태를 확인하고 이 task의 구현 항목만 처리해주세요.
필요한 파일과 선행 산출물을 좁혀 읽고, 사람이 입력하거나 판단할 정보가 있으면 요청해주세요.
구현 후 실제 산출물 기준으로 task를 갱신하고 제가 따라 할 수 있는 결과 확인 절차를 작성해주세요.
```

## 수동 작업 (구현 후 구체화)

추가 입력·외부 계정 연결·저장 작업은 없다. 결과 확인에 쓰는 예시 입력은 저장소를 변경하지 않는다.

## 완료 조건

### 에이전트 확인

- [x] 위 구현 항목의 산출물이 준비되고 사전 확정 기준을 충족한다.
- [x] `node --check server/candidate-retrieval.js`, `node --check server/candidate-retrieval-check.js`, `node --check server/server.js`, `npm run data:candidates:check`, `git diff --check`를 통과했다. 실제 저장소 입력으로 후보 2건의 공식 코드·출처 쪽수와 과학 입력의 후보 0건·보류 응답을 확인했다.
- [x] `docs/ARCHITECTURE.md`·`docs/STYLEGUIDE.md`의 파일 책임과 JavaScript 규칙을 확인했다. 후보 제한 로직은 전용 서버 모듈에, HTTP 경로는 기존 서버에 두었으며 새 화면을 만들지 않았다.
- [x] 실제 수행 결과에 맞춰 이 task의 산출물·수동 작업·결과 확인을 갱신했다.
- [x] 사람 수행·검토가 필요한 결과를 AI가 수행한 것으로 기록하지 않았다. 후보 반환을 교육과정 의미 정확도·최종 연계·사람 승인으로 기록하지 않았고, 기존 공식 목록 외 기준을 만들거나 저장하지 않았다.

### 결과 확인 (구현 후 구체화)

- [x] 프로젝트 최상위 폴더에서 `npm run data:candidates:check`를 실행해 `candidate-retrieval checks passed`가 표시되는지 확인한다.
- [x] `npm start`를 실행한 뒤 브라우저에서 아래 주소를 열어 `status`가 `CANDIDATES_FOUND`, `retrievalScope.officialStandardCount`가 `27`인지 확인한다. 3000번 포트가 사용 중이면 `PORT=3001 npm start`로 실행하고 주소의 포트도 `3001`로 바꾼다. `candidates`에는 중복 없는 성취기준 코드와 `officialSource.document`·`officialSource.pdfPage`가 표시되어야 한다.
  `http://127.0.0.1:3000/api/candidate-retrieval?title=우리나라%20산지와%20하천의%20위치&synopsis=우리나라%20산지와%20하천%20지형을%20지도에서%20살펴봅니다.&subject=사회&gradeBand=초등%205학년`
- [x] 위 주소에서 `subject=과학`으로만 바꿔 열었을 때 `status`가 `HELD`, `hold.code`가 `UNSUPPORTED_SUBJECT`, `candidates`가 빈 배열인지 확인한다. 이는 과학 기준을 임의로 만들지 않는 보호 동작이다.
- [x] 확인 후 서버를 실행한 터미널에서 `Ctrl+C`를 눌러 종료한다.
