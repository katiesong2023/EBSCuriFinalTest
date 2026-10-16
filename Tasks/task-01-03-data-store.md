# Task 01-03 - 콘텐츠와 공식 교육과정 저장 기반

> 현재 정본: [PLANS](../docs/PLANS.md) · 대응: **R00~R03 기반 / 완료 이력·기반 보존**. 기존 승인·증분·화면·출처 자산을 재사용하며 새 탐색의 완료로 확대 해석하지 않는다. 과거 구현·사람 확인 기록은 보존한다.

## 설명

출처·버전·N:M 연계와 검수 상태를 보존할 저장 기반을 만든다.

## 작업 크기와 추천 모델

- 구분: P0 필수
- 배치: Week 1
- 예상 집중 작업: 약 1.5시간. 개인 입문자 계획용 추정이며 설치·보류·재작업 시간은 별도이다.
- 개발 보조 모델: **GPT-5.6 Sol** (`gpt-5.6-sol`)
- 추천 추론 수준: **medium**
- 선택 이유: ID·관계·버전 설계가 잘못되면 저장과 평가를 다시 해야 하므로 초기 검토 비용을 쓴다.
- 상향 조건: 처음부터 xhigh·max로 시작하지 않는다. 해결하지 못한 원인이 명확하고 더 깊은 분석이 필요한 부분에만 high로 올린다.
- 모델 배치는 과업 성격에 따른 추천이며 이 서비스에서 측정한 모델 성능 결과가 아니다. [공식 모델 역할·추론 수준 안내](https://learn.chatgpt.com/docs/models)
- 개발 모델과 서비스 API 모델·비용의 차이는 [task 사용 안내](./00_README.md)를 참고한다.

## 관련 기준

[기획 01](../EBS_Curi_FINAL_PACKAGE_v1.4/docs/01_Curi_%E1%84%8E%E1%85%AC%E1%84%8C%E1%85%A9%E1%86%BC_%E1%84%80%E1%85%A2%E1%84%87%E1%85%A1%E1%86%AF%E1%84%80%E1%85%B5%E1%84%92%E1%85%AC%E1%86%A8%E1%84%89%E1%85%A5_v1.4.md), [기획 05](../EBS_Curi_FINAL_PACKAGE_v1.4/docs/05_ID_Schema_CuriBase_DataQuality_v1.4.md)

## 구현 항목

- [x] 콘텐츠·공식 성취기준·연계 관계의 책임을 나누고 CURI ID·원본 ID·출처·교육과정 버전을 보존한다.
- [x] DEV 콘텐츠와 사람 QA된 사회 기준을 적재하고 재적재 시 중복이 생기지 않게 한다.
- [x] 신규·변경 판별에 필요한 원본 수정 시각·최초/최근 확인 시각·콘텐츠 지문과 활성 상태를 저장할 수 있게 한다.
- [x] AI 생성·검토 필요·사람 승인·사람 수정·제외와 SOURCE/Silver/AI/사람 검증의 출처를 구분한다.
- [x] 공식근거·기능검증 이력과 검수 전 초안을 서비스의 검증 자산·검색 결과와 구분한다.

## 산출물 (2026-09-17)

- `server/data-store.js`: 콘텐츠·공식 성취기준·`CONTENT_CURRICULUM_MAP`의 책임과 안정 키, 출처·버전·지문·활성 상태·검수 상태·검증 자산 경계를 정의한다. 적재할 때 `source_system + source_content_id` 또는 교육과정 원본 ID를 안정 키로 사용한다.
- `server/seed-data-store.js`, `npm run data:seed`: `p0_working_set_144.csv`의 콘텐츠 144건과 `p0_social_curriculum_qa_27.csv`의 사람 QA 사회 성취기준 27건을 `server/data/curi-store.json`에 적재한다. 재실행 시 같은 행은 `unchanged`로 처리하고 중복을 만들지 않는다.
- `server/data/curi-store.json`: CURI ID·원본 ID·출처 URL·교육과정 버전·원본 수정 시각 자리·최초/최근 확인 시각·SHA-256 지문·활성 상태를 보관한다. 원본 수정 시각이 제공되지 않은 현재 입력은 `null`로 유지한다.
- `server/server.js`: `GET /api/data-store/summary`와 `GET /api/data-store/model`로 초기 적재 수량과 저장 경계만 읽기 전용으로 확인한다.

초기 적재 콘텐츠는 `SOURCE`·`REVIEW_REQUIRED`·`DRAFT_INPUT`이고, 사회 성취기준은 Task 00-05의 사용자 승인 지시에 따른 `HUMAN_VERIFIED`·`HUMAN_APPROVED`·`OFFICIAL_EVIDENCE`다. 둘 다 콘텐츠-성취기준 연계 승인이나 검색 공개를 뜻하지 않는다. 따라서 `contentCurriculumMaps`, `verifiedAssets`, `searchProjection`은 0건으로 시작한다.

## 범위 밖

- 전체 604건 적재
- 로그인·결제
- 검색 인덱스

## 사전 전제

- [Task 01-01](./task-01-01-local-start.md)의 필요한 산출물과 결과 확인 완료
- [Task 00-04](./task-00-04-working-set.md)의 필요한 산출물과 결과 확인 완료
- [Task 00-05](./task-00-05-curriculum-qa.md)의 필요한 산출물과 결과 확인 완료

## 입문자 시작 요청

```text
Tasks/task-01-03-data-store.md를 진행해주세요.
AGENTS.md와 현재 진행 상태를 확인하고 이 task의 구현 항목만 처리해주세요.
필요한 파일과 선행 산출물을 좁혀 읽고, 사람이 입력하거나 판단할 정보가 있으면 요청해주세요.
구현 후 실제 산출물 기준으로 task를 갱신하고 제가 따라 할 수 있는 결과 확인 절차를 작성해주세요.
```

## 수동 작업

추가로 입력하거나 외부 계정을 연결할 작업은 없다. 원본 CSV의 내용을 바꾸지 않고 초기 적재 결과만 `server/data/curi-store.json`에 저장한다.

## 완료 조건

### 에이전트 확인

- [x] 위 구현 항목의 산출물이 준비되고 사전 확정 기준을 충족한다.
- [x] `npm run data:seed`를 두 번 실행해 첫 실행의 콘텐츠 144건·사회 성취기준 27건 적재와 두 번째 실행의 중복 없음(`unchanged`)을 확인했다. ID·안정 키 고유성, 지문·시각·활성 상태, 출처·검수·자산 경계 필드도 정적으로 점검했다.
- [x] `node --check server/data-store.js`, `node --check server/seed-data-store.js`, `node --check server/server.js`, `git diff --check`를 통과했다. Node.js 서버·저장소·정적 화면의 책임을 분리했고 JavaScript 규칙을 확인했다.
- [x] 실제 수행 결과에 맞춰 이 task의 산출물·수동 작업·결과 확인을 갱신했다.
- [x] 사람 수행·검토가 필요한 결과를 AI가 수행한 것으로 기록하지 않았다. Task 00-05에서 이미 기록된 사용자 승인 지시 외에 새 사람 승인이나 연계 판단을 만들지 않았다.

### 결과 확인 (구현 후 구체화)

- [x] 프로젝트 최상위 폴더에서 `npm run data:seed`를 실행했을 때 콘텐츠 `144`, 사회 성취기준 `27`, 연계·검증 자산·검색 결과 `0`건이 출력되는지 확인한다.
- [x] 같은 명령을 한 번 더 실행했을 때 콘텐츠와 사회 성취기준이 각각 `unchanged`로 표시되고, 총 건수가 늘어나지 않는지 확인한다.
- [x] `npm start`를 실행한 뒤 브라우저에서 `http://127.0.0.1:3000/api/data-store/summary`를 열어 콘텐츠 `144`, `curriculumStandards` `27`, `contentCurriculumMaps`·`verifiedAssets`·`searchProjection`이 모두 `0`인지 확인한다.
- [x] 브라우저에서 `http://127.0.0.1:3000/api/data-store/model`을 열어 출처 구분(`SOURCE`, `SILVER_EXISTING_LINKAGE`, `AI_GENERATED_BY_CURIMAP`, `HUMAN_VERIFIED`), 검수 상태, 사람 승인 연계만 검색 가능하다는 규칙이 표시되는지 확인한다.
- [x] 확인 후 서버를 실행한 터미널에서 `Ctrl+C`를 눌러 종료하고, 위 네 항목의 결과를 알려준다.
