# Task 01-05 - 실제 CuriMap 1건 연계 연결

> 현재 정본: [PLANS](../docs/PLANS.md) · 대응: **R00~R03 기반 / 완료 이력·기반 보존**. 기존 승인·증분·화면·출처 자산을 재사용하며 새 탐색의 완료로 확대 해석하지 않는다. 과거 구현·사람 확인 기록은 보존한다.

## 설명

한 DEV 콘텐츠의 입력부터 실제 AI 후보·근거 생성까지 동작하게 한다.

## 작업 크기와 추천 모델

- 구분: P0 필수
- 배치: Week 1
- 예상 집중 작업: 약 2시간. 개인 입문자 계획용 추정이며 설치·보류·재작업 시간은 별도이다.
- 개발 보조 모델: **GPT-5.6 Sol** (`gpt-5.6-sol`)
- 추천 추론 수준: **high**
- 선택 이유: Grounding·구조화 출력·제약을 동시에 연결하는 핵심 단계라 Sol로 재작업을 줄인다.
- 상향 조건: 처음부터 xhigh·max로 시작하지 않는다. 해결하지 못한 원인이 명확하고 더 깊은 분석이 필요한 부분에만 high로 올린다.
- 모델 배치는 과업 성격에 따른 추천이며 이 서비스에서 측정한 모델 성능 결과가 아니다. [공식 모델 역할·추론 수준 안내](https://learn.chatgpt.com/docs/models)
- 개발 모델과 서비스 API 모델·비용의 차이는 [task 사용 안내](./00_README.md)를 참고한다.

## 관련 기준

[기획 01](../EBS_Curi_FINAL_PACKAGE_v1.4/docs/01_Curi_%E1%84%8E%E1%85%AC%E1%84%8C%E1%85%A9%E1%86%BC_%E1%84%80%E1%85%A2%E1%84%87%E1%85%A1%E1%86%AF%E1%84%80%E1%85%B5%E1%84%92%E1%85%AC%E1%86%A8%E1%84%89%E1%85%A5_v1.4.md), [기획 05](../EBS_Curi_FINAL_PACKAGE_v1.4/docs/05_ID_Schema_CuriBase_DataQuality_v1.4.md)

## 구현 항목

- [ ] 공개 텍스트와 공식 후보를 입력으로 사용해 복수 성취기준·핵심개념·연계근거·수업 활용 초안을 만든다.
- [ ] 공식 후보 밖 코드를 거절하고 텍스트 부족·부적합을 보류한다. 입력 텍스트의 지시문은 서비스 제약을 바꾸지 못하게 한다.
- [ ] 결과는 검수 전 초안으로 표시하고 confidence는 검수 우선순위 참고값으로 설명한다.
- [ ] 호출 모델·설정·입출력 사용량·지연·실패를 기록하고 1건 결과가 화면에 나타나게 한다.

## API 사용 전 반영

- [x] `GET /api/curimap/contents`로 활성 상태인 사회 5~6학년군 EBS 클립 18건의 실제 저장 메타데이터를 CuriMap 화면에 제공한다.
- [x] `curimap.html`에서 콘텐츠 제목·교과·학년·출처 상태와 EBS 원문 페이지를 표시하고, `GET /api/candidate-retrieval`의 공식 성취기준 후보 또는 보류 결과를 표시한다.
- [x] 초기에는 18건 모두 제목 기반으로 표시하고, API 키·외부 AI 호출·AI 연계 초안·저장 동작을 수행하지 않았다.
- [x] `우리나라의 위치 알아보기` 1건의 EBS 공개 원문 페이지에서 제목·강좌·단원차시 텍스트와 원문 URL을 확인해 `MAPPING_READY_PUBLIC_TEXT` DEV 입력으로 보관하고, 기존 Seed의 단원차시를 원문의 `1단원 3/11`로 바로잡았다. 나머지 17건은 공개 소개문 미확보 상태로 유지한다.

## API 사용 후 구현

- [x] `server/keychain.js`는 macOS 키체인의 `EBS_CURI_OPENAI_API_KEY` / `curimap-local` 항목만 `/usr/bin/security`의 인자 배열로 읽는다. 키 값과 키체인 명령의 상세 오류는 브라우저·저장소·로그에 전달하지 않는다.
- [x] `POST /api/curimap/draft`는 공개 EBS 텍스트(20~1,200자), EBS HTTPS 원문 URL, 실제 콘텐츠와 사람 QA 공식 후보를 다시 확인한 뒤에만 Responses 요청을 만든다. 텍스트 부족·후보 없음은 외부 호출 없이 보류한다.
- [x] `server/curimap-mapping.js`는 `gpt-5.6-terra`, 구조화 JSON, `store: false`, 도구 없음과 고정된 서비스 제약을 사용한다. 입력 텍스트는 신뢰하지 않는 데이터로 구분하고, 응답의 성취기준 ID가 요청 후보 밖이면 초안을 저장하지 않고 거절한다.
- [x] 검수 전 초안에는 복수 공식 성취기준·핵심개념·연계근거·수업 활용·confidence 참고값을 표시하며, `AI_GENERATED_BY_CURIMAP`·`AI_GENERATED` 상태로만 로컬 `contentCurriculumMaps`에 기록하도록 준비했다. CuriBase 검증 자산·검색 결과에는 넣지 않는다.
- [x] 실행마다 `mappingRuns`에 모델·설정·입출력 토큰 사용량·지연·실패 여부를 기록하고, `GET /api/curimap/draft?contentCuriId=...`로 최근 결과를 다시 표시하도록 준비했다.
- [ ] 사용자 터미널의 키체인 승인 후 실제 API 호출 1건과 검수 전 초안 표시를 확인한다.

## 범위 밖

- 교육과정 의미 정확도 평가
- 자동 승인
- 검색 때 매핑 재실행

## 사전 전제

- [Task 01-02](./task-01-02-mapping-screen.md)의 필요한 산출물과 결과 확인 완료
- [Task 01-03A](./task-01-03a-incremental-ingestion.md)의 필요한 산출물과 결과 확인 완료
- [Task 01-04](./task-01-04-candidate-retrieval.md)의 필요한 산출물과 결과 확인 완료

## 입문자 시작 요청

```text
Tasks/task-01-05-mapping-one.md를 진행해주세요.
AGENTS.md와 현재 진행 상태를 확인하고 이 task의 구현 항목만 처리해주세요.
필요한 파일과 선행 산출물을 좁혀 읽고, 사람이 입력하거나 판단할 정보가 있으면 요청해주세요.
구현 후 실제 산출물 기준으로 task를 갱신하고 제가 따라 할 수 있는 결과 확인 절차를 작성해주세요.
```

## 수동 작업 (구현 후 구체화)

- [x] 사용자가 macOS 키체인 `login`에 서비스 이름 `EBS_CURI_OPENAI_API_KEY`, 계정 이름 `curimap-local`의 Project API Key 항목을 만들고, 비밀값을 출력하지 않는 조회에서 항목 존재를 확인했다.
- 실제 실행은 사용자의 macOS 터미널에서 한다. `npm start`를 실행한 뒤 키체인 접근 승인 창이 나오면 `한 번만 허용`을 선택한다. API 키·`-w` 명령 출력·키체인 암호는 공유하거나 기록하지 않는다.

## 완료 조건

### 에이전트 확인

- [ ] 위 구현 항목의 산출물이 준비되고 사전 확정 기준을 충족한다.
- [x] API 사용 전 범위의 로컬 콘텐츠·후보 연결이 준비되었고, 외부 AI 호출이 없음을 확인했다.
- [x] `node --check server/keychain.js`, `node --check server/curimap-mapping.js`, `node --check server/curimap-mapping-check.js`, `node --check server/server.js`, `node --check public/curimap.js`, `npm run data:candidates:check`, `npm run data:mapping:check`, `git diff --check`를 통과했다. 검증 스크립트는 실제 EBS DEV 텍스트의 공식 후보 3건과 후보 밖 코드 거절을 확인하며 외부 AI를 호출하지 않는다.
- [x] 코드 변경에 대한 HTML/CSS/JavaScript 규칙을 확인했다.
- [x] 실제 수행 결과에 맞춰 이 task의 산출물·수동 작업·결과 확인이 갱신되었다.
- [x] 사람 수행·검토가 필요한 결과를 AI가 수행한 것으로 기록하지 않았다.
- [x] 자동화 환경에서 한 번 요청했을 때 macOS 키체인 사용자 승인 창을 열 수 없어 `API_KEY_UNAVAILABLE`로 종료됐다. 실행 이력은 `apiCalled: false`, `mappingRuns: 1`, `contentCurriculumMaps: 0`, `verifiedAssets: 0`, `searchProjection: 0`으로 확인했으므로 OpenAI 호출·비용·AI 초안은 발생하지 않았다.

### 결과 확인 (구현 후 구체화)

- [x] `npm start` 후 `http://127.0.0.1:3000/curimap.html`을 열었을 때 콘텐츠 선택 목록이 표시되는지 확인했다.
- [x] `우리나라의 위치 알아보기 · 초등 5학년`을 선택하고 `공식 후보 확인`을 눌렀을 때 `6사01-01`, `6사09-02`와 각 공식 원문 근거가 표시되는지 확인했다.
- [x] `동고서저 지형, 산맥 · 초등 5학년`을 선택하고 `공식 후보 확인`을 눌렀을 때 후보가 없는 경우의 보류 안내가 표시되는지 확인했다.
- [x] API 사용 전 구현에서는 어떤 콘텐츠를 선택해도 AI 연계근거·수업 활용·confidence·저장 성공이 표시되지 않고, 공개 소개문 미확보 및 AI 초안 미생성 안내가 보이는지 확인했다. 현재 구현의 실제 AI 결과 확인은 아래 새 항목으로 대체한다.
- [x] 사용자의 macOS 터미널에서 `npm start` 후 `http://127.0.0.1:3000/curimap.html`을 열고, `우리나라의 위치 알아보기 · 초등 5학년`을 선택한다. 공개 텍스트와 EBS 원문 URL이 자동 입력되고 원문 링크가 열리는지 확인한다.
- [x] `공식 후보 확인`을 눌러 `6사01-01`, `6사01-02`, `6사09-02`만 표시되는지 확인한 뒤 `AI 연계 초안 생성`을 누른다. 키체인 승인 창에서는 `한 번만 허용`을 선택한다.
- [x] 성공 시 검수 전 AI 초안에 선택된 성취기준이 위 후보 안에만 있고, 핵심개념·연계근거·수업 활용·confidence 참고값과 `gpt-5.6-terra`의 설정·입출력 토큰·지연 시간이 표시되는지 확인한다.
- [x] 새로고침 후 최근 검수 전 초안이 다시 표시되며, 사람 승인·CuriBase 저장·검색 결과로 바뀌지 않는지 확인한다. 실패 시 오류 코드와 화면 문구만 기록하고 API 키·키체인 암호는 공유하지 않는다.
