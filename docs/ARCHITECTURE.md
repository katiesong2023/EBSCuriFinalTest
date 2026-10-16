# Architecture

## 목적
이 문서는 AI 에이전트가 파일을 만들거나 이동할 때 폴더 책임, 파일 배치, 화면 파일 이름 규칙을 확인하는 기준 문서입니다.

## 구조 원칙

- 현재 기본 경로는 공식 자료 → 근거 있는 후보 → 자동 검사·별도 자산 저장 → 검색·예외 관리입니다. 실제 사람이 선택적으로 확인한 관계는 승인 자산으로 저장하며, Curi v1.4의 기존 초안·묶음 검토 이력은 보존합니다.
- 프론트엔드(정적 화면) 구조와 백엔드(서버) 책임을 분리합니다.
- 지금 필요한 범위에서만 구조를 확장합니다.

## 공통 폴더 책임

- `server/request-model-budget.js`는 승인된 텍스트 호출(후속 승인 총$2)의 전송 전 비용 예약·영속 이력·동시 실행 잠금을 담당한다. `request-model-client.js`는 이 비용 검사 없이는 유료 호출을 거절한다. `search-model-dollar-evaluate.js`는 고정370의 A 해석 호출/캐시/동일 원천 검색 비교를 담당하며 제품 유료 경로를 활성화하지 않는다. 키·프롬프트·응답 헤더는 비용 원장에 넣지 않는다.
- `server/request-quote-binding.js`는 저장된 모델 해석의 유일한 정확 인용을 원문 위치에 연결하고 기존 계약 검사를 다시 수행한다. `search-model-dollar-compare.js`는 같은370·원문 판본을 대조하고 새 후보에 원문 라벨이 없으면 미평가로 남긴다. 인용 연결률을 검색 관련성 지표로 사용하지 않는다.
- `server/semantic-review-candidates.js`는 전체 문자 그대로의 원문에 대한 단어·한글 이중자 색인과 기존 로컬 E5를 합쳐 최대16개를 수집한다. 선택된 원문 구절만 모델에 전달한다. 기존 실험과 새 교사 검색의 공통 후보 수집기로 사용한다. `semantic-review-model.js`는 질문과 후보의 의미 대조, `semantic-source-quotes.js`는 보이는 인용의 공백 차이만 정규화한 원문 좌표 연결을 담당한다. `semantic-source-evaluate.js`는 같은370의 호출·캐시·무료 재평가를, `semantic-source-compare.js`는 첫 결과 전체 평가와 미평가 후보 구분을 담당한다.
- `server/semantic-requirement-review.js`는 후보별 필수 조건과 인용의 행렬을 검증하며 하나라도 원문 미확인이면 제외한다. 조건 자체의 모델 오해·추가는 이 계약만으로 해결되지 않으므로 관련성 통과로 간주하지 않는다. `semantic-requirement-evaluate.js`·`semantic-requirement-compare.js`는 같은370의 후속 비교를 수행하고 기존 총$1 원장을 공유한다. `semantic-review-check.js`는 네트워크 없는 계약 회귀 검사다. 실험 모듈은 제품 검색의 자동 유료 호출을 켜지 않는다.
- `server/semantic-result-merge.js`는 실험의 조건 검증 결과만 기존 결과 뒤에 중복 없이 보충한다. 실패·빈 응답으로 기존 결과와 순서를 잃지 않으며 `semantic-requirement-compare.js`가 같은370의 보충 결과도 비교한다. 이 병합만으로 새로운 후보의 의미 적합성을 보증하지 않는다.

- `docs/`: 하네스 문서·작업 규칙·검증 보고서·ERD
- `docs/design/`: R12-09 제품 디자인 제안·공통 토큰·SVG·독립 정적 시안·관찰/확인 자료. 운영 `public/`·확장 코드와 분리하며 [가이드](design/CURI_STYLEGUIDE.md)를 따른다.
- `Tasks/`: 개별 task 문서
- `planning/`: 사용자 요청으로 갱신한 수정 설계와 섹션·작성 상태. 현재 구현과 후속 제안 구조를 구분한다. 현재 범위·실행 순서는 `docs/PLANS.md`가 정본이며 v1.4 원본은 역사적 기준본으로 보존한다.

## 현재 프로젝트 폴더 책임

- `public/grade-context.js`의 `standardLabel`은 교육과정 코드의 공통 화면 이름(`[과학]4과06-01`)을 구성한다. 선택기·자료/폴더·기록/내보내기·관리 화면에서 공유하며 공식 코드와 저장값은 그대로 유지한다.

- `public/teacher-cards.js`의 카드 렌더러는 검색과 내 수업 자료가 공유한다. `public/lesson-cards.css`는 내 수업 자료의 카드 그리드와 위치별 개인 기록 배치를 담당한다.

- `public/lesson-material-curriculum.js`는 카드에 직접 표시하는 영상 노트·연관 교육과정 토글·교육과정 가져오기 팝업·메모 박스를 담당한다. 팝업은 영상 가져오기 첫 페이지와 같은 `curriculum-selection.js`의 관련 후보/전체 기준/필터를 사용하며 확인 시 저장한다. 자료 선택은 resource.personalCurriculumStandards에, 메모는 기존 entry.note/미지정 personalLibraryNote에 저장한다. 기존 selectionContexts와 personalTargetGrade는 보존한다. 자료의 내용 박스는 토글 안에 표시하며 우측 상단 휴지통으로 삭제한다. 폴더 박스의 ×는 유지한다. `lesson-folders.js`는 자료 기준을 폴더 curriculumStandards에 중복 없이 자동 추가한다. 폴더 직접 삭제는 excludedCurriculumStandardIds에 보존해 자동 재추가를 막고 직접 재선택하면 제외를 해제한다.

- `public/lesson-folder.css`는 내 수업 자료의 선택 폴더의 본문 외곽선·상부 이름 탭·폴더 라벨 색 표현을 담당한다.

- `public/lesson-index.css`는 내 수업 자료의 고정 인덱스 배치·현재 보기 표시·모바일 상단 전환을 담당한다. 보기 전환은 기존 `lesson.js`와 개인 저장 계약을 공유한다.

- `public/lesson-clips.js`는 구간 클립 만들기의 확장 미연결 안내·ZIP 다운로드·실행 응답을 담당한다. `segment-ui.js`의 clipMarkup은 자료/폴더별 저장 구간을 버튼 아래 카드로 표시하고 저장 이벤트에 갱신한다. 확장 `curi-bridge.js`는 실제 클릭을 CREATE_CLIP으로 전달하며 background.js는 설정된 Curi 주소/공개 EBS URL을 확인하고 패널/새 탭을 연다. session의 clip:tabId에 회차/폴더 문맥을 보존하고 popup.js가 구간 모드/폴더를 선택한다. CLIP_READY는 같은 회차의 첫 로드 완료에만 전달한다. 기존 저장·재생 프로토콜은 유지한다.

- `extension-library.js`의 WORKSPACE 목록에는 각 폴더의 정규화된 sourceUrls와 selectedFolderId를 함께 전달한다. 확장 popup.js는 현재 회차와 일치하는 폴더를 자동 선택하고, 여러 곳에 담겼으면 클립 진입 폴더→해당 영상 초안 폴더→현재 Curi 폴더→첫 일치 폴더 순으로 선택한다. 미지정·새 영상의 기존 가져오기 흐름과 초안은 유지한다.

- 확장 `panel-v11.js`는 새 폴더 카드로 생성 폼을 펼치고 각 폴더의 휴지통으로 웹과 같은 확인 팝업을 연다. popup.js의 명시적 확인은 DELETE_FOLDER→background→curi-bridge→lesson-segments→CuriExtensionLibrary.deleteFolder로 전달한다. 웹의 기존 CuriTeacher.deleteFolder를 재사용해 해당 폴더/구간을 정리하며 원본 판본 토큰 대조·다른 폴더/미지정 보존·쓰기 실패 복구를 유지한다.

- 시간 지정은 확장 popup.js의 SET_START/SET_END→background의 회차 확인/읽기→player의 INSPECT로 전달한다. 최초 연결 실패는 허용된 EBS 탭에 scripting으로 읽기 모듈을 재연결한다. Curi 연결 지연과 EBS 읽기 초기 실패는 지정 버튼을 영구 비활성화하지 않으며 명시적 클릭으로 재확인한다. segment-core.boundary/validate는 시작 내림·끝 올림으로 정수 초를 기록한다. segment-store.read는 기존 기록도 같은 기준으로 반환하되 원본 저장 문자열은 읽기만으로 변경하지 않는다. 플레이어는 올림한 끝이 실제 길이보다 소수 초만큼 길더라도 실제 영상 끝에서 정지한다.

- R12-20 사용자 C안 적용 취소로 운영은 [v1.1](../Curi%20스타일%20가이드%20v1.1.md)·[컬러 v1.2](design/CURI_COLOR_GUIDE_V12.md)로 복원했다. `curi-v11.*`·확장 `panel-v11.*`가 화면/동작, `curi-colors.css`는 색, `curi-icons.css`·`brand/folder-shape.svg`는 아이콘을 담당한다. R12-19의 중앙 검색/카드/상세 필터/결과 스크롤은 유지한다. C안 파일은 이력으로 보존하되 운영 HTML/설치 패키지에서 로드하지 않는다.
- `EBS_Curi_FINAL_PACKAGE_v1.4/`: Curi 기획 기준본과 원본·후보 데이터 패키지
- `public/`: 브라우저가 제공받는 정적 화면 파일
- `public/curi-tokens.css`·`curi-ui.css`·`brand/`: R12-10 교사 웹 공통 디자인·벡터/PNG 원본. 기능별 스타일 뒤에 적용한다. 확장 패키징은 같은 토큰·브랜드를 `extensions/curi-segments/`에 복사하여 ZIP에 포함한다.
- `server/`: 로컬 실행과 이후 API 경로를 담당하는 Node.js 서버 파일
- `server/data/`: 로컬 Curi 저장소의 초기 적재 결과를 보관한다. 원본 CSV를 대체하지 않으며, 검증 자산과 검색용 결과는 이 폴더의 저장 상태로 구분한다.
- `server/data/quality-catalog-20260930.json.gz`는 R05·R09 전후 비교용 고정 공개 메타데이터 카탈로그다. 라이브 DB와 분리하고 gzip 해제 바이트의 SHA로 비교한다.
- `server/data/.model-cache/`: 검색 준비용 고정 버전의 공개 임베딩 모델을 보관하는 재생성 가능한 로컬 캐시. Git 추적에서 제외한다.

## Curi 0.2 출처 기반 탐색

- `server/source-links.js`는 탐색·검증 검색·검수 관리에서 공통으로 쓰는 이동 링크 계약이다. `server/data/source-link-audit.json`의 ID·제목·원래 주소가 일치한 대조 결과만 사용하며, 미확인은 제목 검색으로 안내한다. `source-link-audit.mjs`는 공개 EBS 페이지를 대조하는 명시적 실행 도구이고 일반 검색에서는 외부 접속하지 않는다.

- `/`는 `public/discover.html`을 제공한다. `discover.js`는 검색·필터·브라우저 자료 모음·메모 내보내기, `discover.css`는 화면 스타일을 담당한다.
- `server/discovery-catalog.js`는 원본 CSV·Working Set 변경분·`server/data/discovery-geography.json`·방송 SQLite를 읽기 전용으로 통합하고 파일 변경 시 캐시를 갱신한다. 원본 휴리스틱 태그를 내용 근거로 승격하지 않는다.
- `server/discovery-search.js`는 `/api/curi/discover`의 개념·장소 확장, 단어 검색, 유형·페이지 계약을 담당한다. 생성 API·임베딩 모델을 호출하지 않는다.
- `server/discovery-check.js`와 `discovery-browser-check.mjs`는 로컬·브라우저 검증을 수행한다. 보고서와 실제 화면은 `docs/local-*.json`, `docs/curi-local-*.png`에 기록한다.
- `server/data/classroom-scenarios.json`은 30개 가상 수업 요구이며 실제 콘텐츠·정답 라벨이 아니다. `classroom-scenarios-check.js`가 현재 탐색 엔진으로 측정하고 `docs/CLASSROOM_SCENARIOS.md`와 `classroom-simulation.json`을 생성한다.
- `/api/curi/discover/resources?ids=...`는 모음 내보내기 시 현재 자료의 링크·제목·확인 범위를 읽는 전용 경로다. 최대 100개 ID를 받으며 현재 원문·사람 승인·자동 후보를 다시 대조한다. 원본·승인 저장소는 변경하지 않고 자동 자산의 오래된 검색 투영만 무효화할 수 있다.
- `server/broadcast-store.js`는 `server/data/broadcast-catalog.sqlite`의 회차·수집 체크포인트·도착 대조·FTS 색인을 관리한다. 기존 승인 저장소는 이전하지 않았다. 공식 회차 ID로 원본을 누적하고 화면에서는 같은 프로그램·제목을 대표 항목으로 묶는다.
- `server/broadcast-collect.mjs`는 공개 EBS 목록을 수집하고 상세 메타데이터를 대조하는 명시적 실행 도구다. Playwright는 수집·브라우저 검증에만 필요하다. 일반 검색은 외부 접속 없이 메모리 카탈로그를 검색한다. FTS 색인을 실제 질의에 사용한다고 주장하지 않는다.
- `server/broadcast-check.js`는 임시 DB의 반복 적재·롤백·본문 보존과 실제 수집물·규모를 검증한다. [수집 실측](BROADCAST_CORPUS.md)과 `docs/broadcast-*.json`을 근거로 사용한다. `PUBLISHED`는 공식 목록 제공 회차 주소, `MATCHED`는 개별 ID·제목 대조 상태다. 재생과 교육과정 승인은 별도다.
- 기존 검증 자산 검색과 검수 Gate는 별도로 유지한다. 서버는 `CURI_ALLOW_PAID_API=true`가 아니면 유료 초안 생성을 저장·키 조회 이전에 차단한다.

## 대량 수집·사회/과학 시맨틱 탐색

- `broadcast-expand.mjs`는 공식 프로그램 인벤토리와 공개 회차를 명시적으로 수집한다. `broadcast-programs.json`은 프로그램/시즌 인벤토리이며 표시 회차 수와 실제 적재 수를 구분한다.
- `semantic-layer.js`는 제목·소개문의 개념 표현을 원문 구절·오프셋·출처·확인일·내용 지문과 연결한다. 상위 개념 추론 후보는 직접 근거 태그와 분리한다. `semantic-build.js`는 감사·재현용 `semantic-layer.sqlite`를 원자적으로 재생성한다. 런타임 검색은 같은 규칙의 메모리 태그를 사용한다.
- `discovery-request.js`는 수업 문맥·프로그램 선호·장면 조건을 추출하고, `discovery-intent.js`는 주제·제외·국소 선택·미지원 조건을 해석한다. `discovery-search.js`는 분기별 AND/OR, 출처 근거 필터와 순위를 적용한다. 카탈로그 객체별 최대 8개 질의의 정렬 결과를 재사용하며 파일 변경 시 새 카탈로그와 캐시를 구성한다.
- `semantic-context.js`는 `GET /api/curi/discover/context`에서 최대 6자료·직렬화 24,000자의 근거 묶음을 반환한다. 실제 관계·장면은 `RELATION_NOT_VERIFIED`로 남고 유료 모델을 호출하지 않는다.
- `semantic-check.js`, `query-regression-check.js`, `teacher-query-check.js`는 고정 자료 계약을, `subject-scenarios-check.js`는 사회·과학 각 12개 개발 요청을 검사한다. `quality-gates-check.js`는 고정 카탈로그의 저장 재현성을 검증한다. `quality-source-samples.mjs`의 원문 표본과 에이전트 텍스트 판단은 사람 승인과 별도다.
- `quality-workspace-check.js`는 `server/data/quality-workspace-queries.json`의 사회·과학 새 표현으로 추천 근거·프로그램 분포·판본·지연을 측정한다. `quality-workspace-browser-check.mjs`는 격리된 로컬 서버·브라우저에서 주제 선택부터 수업 폴더 저장·재열기까지 검사한다. R09 전후 보고는 `docs/r09-*`, 판단과 재현 절차는 [R09 결과](R09_QUALITY_RESULTS.md)에 보존하며 사람 평가는 별도로 남긴다.
- 구현된 테이블·논리 ID 참조·아직 구현하지 않은 구조는 [ERD](ERD.md), 실행 결과와 한계는 [작업 보고](REDESIGN_RESULTS.md)에 기록한다.

## 검증 자산 검색의 주제 근거

`natural-search.js`는 기존 승인·투영 유효성 및 벡터 임계값에 더해 `verified-topic-filter.js`의 주제 조건을 적용한다. 동일한 로컬 탐색 규칙을 승인 관계의 원문·검수 내용에만 적용하며 일반 방송을 승인 자산으로 승격하지 않는다. 이 경로는 기존 승인 자산 검색으로 보존하며, 교사용 주제 방향·수업 준비는 아래 별도 흐름에서 제공한다.

## 교사 작업공간 — R07·R07-01

- `/`의 교사 요청은 `/api/curi/discover?workspace=teacher`로 처리한다. `teacher-discovery.js`는 기본 검색의 모든 일치 자료에 원문 주제 경계·화면 필터·전체 정렬을 적용한 뒤 판본을 묶고 페이지를 나눈다. 대표 후보 응답/탭은 제거했다. 빈 검색도 전체 목록을 제공하며 기존 기본 검색 API와 `/index.html` 승인 검색은 별도로 유지한다.
- `teacher-curation.js`는 알려진 판본 표시 정규화와 사막 비유·우주 극 배경 등 제한된 오탐 경계, 이전 `topic` 주소 해석을 담당한다. 같은 제목의 다른 판본에도 각자의 원문/승인 근거를 유지한다. OR의 한 분기가 미충족이어도 다른 유효 분기를 보존한다. 대표 4건 선정·프로그램 다양성 가산은 제거했다.
- `teacher-approvals.js`는 `readDataStore`가 원문·검수 지문을 대조한 현재 승인만 연결한다. 새 관계별 사람 승인은 원본 ID·시스템·판본·현재 URL/소개문까지 대조한다. 자동 후보는 별도 자산 저장소에서 현재 근거를 다시 검사해 별도 배열로 연결한다. 같은 제목의 다른 회차에는 전파하지 않으며 제목 대표에서 빠진 유효 자동/사람 승인 회차는 자신의 원본 ID로 제공한다. 임베딩 호출은 없다. `topic-request.js`는 탐색·기존 승인 검색의 주제 선정 요청 문법을 공유한다.
- `server/content-preview.js`는 공개 제목·소개문의 핵심 키워드와 온전한 내용 문장2~3개를 골라 방송 내용 안내를 만든다. 제목 반복·오류 의심 소개는 `description-guide.js`가 확인 가능한 문장·짧은 원문 인용 또는 제목·프로그램 정보로 보충하고 작성 근거를 표시한다. 이 표시 안내를 공식 소개·검색·태그 근거로 저장하지 않는다. 검색 주제와의 연결 이유는 별도 필드로 제공하며 소개문 없음은 원문 부족 상태를 유지한다.
- `public/teacher-cards.js`는 단일 목록 카드의 제목·프로그램·방송일·내용 키워드·소개문 상태·방송 내용 안내와 ‘방송 확인하기’/‘내 수업으로 가져가기’를 표시한다. 요청 연결·주제/교육과정 연계·검색 근거·출처 확인 범위는 사용자 요청으로 숨긴다. `teacher-storage.js`는 두 교사 화면의 방송일 표시·자료 모음·검색·준비안 저장과 링크/방송일 갱신·내보내기, `lesson.html`·`lesson.js`는 여러 수업 폴더의 영상 담기·검색·바로 열기·메모를 담당한다. `lesson-folders.js`는 폴더 저장·읽기/쓰기 실패·다른 창 충돌 감지·이전 준비안 이관을 담당한다. `teacher-workspace.css`는 기존 `discover.css` 위에 적용한다.
- `server/ebs-thumbnail.js`는 검색과 분리된 공개 썸네일 읽기 API를 담당한다. 카탈로그 ID의 공식 EBS 페이지 메타데이터·회차를 대조한 뒤 공식 이미지로 이동한다. 외부 주소·잘못된 회차·공통 사이트 이미지는 제외하며 동시 요청·대기·메모리 캐시를 제한한다. `teacher-cards.js`·`teacher-workspace.css`는 카드 상단16:9·지연 로딩·오류 안내를 표시한다. 이미지 파일·DB·개인 저장자료는 쓰지 않는다.

- `discover.html`·`discover.js`는 하나의 결과 목록·총건수·페이지를 제공한다. `discovery-filters.js`는 주제 묶음/개념·유형·프로그램명 검색/선택·기간·교과/소개문/확인 상태·선택 조건 해제를 담당한다. URL에 현재 정렬/필터/페이지를 기록하며 직접 연 검색 링크·뒤로 가기에서는 주소 조건을 따른다. 사용자 요청으로 다른 검색어 제출 시 조건을 초기화하고, 새로고침·기본 주소 진입은 기본 목록으로 시작한다. 이전 검색 localStorage는 자동으로 읽거나 쓰지 않으며 내 수업 자료의 자료 더 찾기도 기본 주소로 연결한다. 이전 `view`·`browse`는 무시하고 `topic`은 호환한다. 자료 모음·수업 폴더 키는 변환하거나 삭제하지 않는다.
- `teacher-filters.js`는 60개 원문 개념의 8개 탐색 묶음과 필터 유효성·건수·정렬을 담당한다. 건수는 다른 조건을 유지하고 해당 필터만 바꿨을 때의 전체 판본 묶음 수다. 개념/교과는 중복될 수 있고 상위 묶음을 바꾸면 세부 개념은 해제한다. 연도·날짜 범위는 서로 대체하며 없는/유효하지 않은 날짜는 미확인으로 처리한다.
- `discovery-search.js`의 관련 점수는 제목/소개문의 요청 표현·시맨틱 직접 언급·보존 지형 근거·명시적 프로그램 선호로 계산한다. 유형·링크 확인·소개문 보유 자체에 가산하지 않는다. 관련성 동점과 같은 제목 판본은 공통 품질 판정을 우선한다. 방송일순은 유효 날짜부터 전체를 정렬하고 동점은 제목/ID로 고정한다. 날짜는 EBS 공개 목록 표기이며 최초 방송일로 보증하지 않는다.
- `discovery-catalog.js`는 기본 카탈로그에서 같은 제목으로 가려진 방송 회차를 읽기 전용 `searchVariants`로 보존한다. `teacher-approvals.js`가 이를 개별 ID로 확장하므로 기간/유형/승인 조건을 각 판본에 적용한 뒤 묶을 수 있다. 원본 DB·시맨틱 스냅샷은 변경하지 않으며 공개 링크의 출처 검증을 유지한다.
- `teacher-filters-check.js`는 정렬/날짜/판본/개수/미분류 계약16개, `teacher-filters-browser-check.js`는 격리 서버의 HTTP·화면10개와 기존 폴더12개를 확인한다. 기존 검색9·질의27·고정 새 표현8개 회귀와 자동 자산/근거 표시 검사를 함께 수행했다. 보고서·화면·재현 범위는 [R07-01](../Tasks/task-r07-01-search-filters.md)에 기록한다.
- 수업 폴더는 같은 브라우저·같은 origin의 localStorage에 저장하며 서버 승인 기록과 분리한다. 이전 단일 준비안 키는 읽기용 원본으로 보존한다. 저장 키·필드는 [ERD](ERD.md#4-교사-개인-수업-준비-r07-localstorage)를 따른다.
- `teacher-workspace-check.js`·`teacher-workspace-browser-check.mjs`와 `docs/r07-*.json/png`는 기능 검사·화면 기록이다. 실제 교사 효용·새 화면의 독립 품질 평가는 R09다. 관리자 목록·권한은 아래 R08에서 제공한다.

## 교사 결합 검색 — R07-07

- `teacher-discovery.js`의 기존 교사 API `/api/curi/discover?workspace=teacher`는 선택 `standard`와 관계 상태 `state`를 받는다. 기준이 없으면 기존 일반 검색 경로를 유지한다. `teacher-combined-search.js`는 전체 자연어 후보와 `curriculum-discovery.js`의 기준 후보를 회차 ID로 교차하고, 선택 기준 관계·전체 필터/건수·정렬·판본 묶음·9건 페이지를 제공한다. 검색 API는 승인이나 자동 자산을 생성하지 않는다.
- 기준 관련순은 제한된 관계 설명→원문 품질→질문 관련도→기준 개념 표현 순이다. `teacher-filters.js`의 공통 필터/집계 함수를 재사용하되 선택 기준의 확인 상태는 공식 교과의 해당 관계로 대조하고 일반 교과 태그 필터는 별도로 적용한다. 대상 학년과 기준 과정 차이는 안내하며 후보·공식 기준을 자동 변경하지 않는다.
- 응답 `standard`는 공식 원문/출처, 자료의 `curriculumComparison`은 선택 요구별 인용/남은 요구, `otherStandardLinks`는 다른 관계 이력이다. `searchMode`·`emptyReason`·`contextWarning`으로 검색 경우·빈 결과 사유·과정 차이를 구분한다. `standard/state`의 화면 선택·URL/localStorage 복원은 아래 R07-08에서 연결했다. R07-07 API 구현 당시에는 화면과 저장 키를 변경하지 않았다.
- `teacher-combined-search-check.js`는 fixture 계약과 실제 대표10입력의 전체 판본 후보를 대조한다. `teacher-combined-http-check.js`는 격리 서버의 공개 검색·400 오류·401 쓰기 차단을 확인한다. 보고서는 `docs/r07-07-*.json`이며 독립 평가·교사 효용·영상 적합성 검증과 별개다.

## 관리자 작업공간 — R08·R08-03·R08-04

- `admin.html`·`admin.js`·`admin.css`는 오류·변경 우선 목록과 필터·검색·선택을, `admin-detail.js`는 현재 원문과 관계별 자동 근거 비교를, `admin-ui.js`는 공통 표시·문맥 링크를 담당한다. `admin-login.html`·`admin-login.js`는 로그인이다. `admin-session.js`·`admin-nav.css`는 관리 목록 조건·선택 자료/관계 복귀와 로그아웃·세션 만료 처리를 공유한다.
- `admin-theme.css`는 관리자 로그인·목록/상세·교육과정·CuriMap·검토·가져오기 화면에 공통 디자인 토큰과 폴더 브랜드를 적용한다. 기존 화면 CSS 뒤에서 `.curi-admin` 범위에만 적용하며 인증·데이터 처리에는 관여하지 않는다.
- `server/admin-workspace.js`는 `/api/admin/workspace`에서 방송·검수·자동 실행을 합친다. `admin-automatic-state.js`는 전체 실행에서 자료·교과/학년별 최신 검사와 현재 변경을 읽고, `admin-work-items.js`는 우선순위·검색 범위 집계·필터·정렬·30건 페이지를 계산한다. 최근 100개 이력 조회 제한을 집계에 재사용하지 않는다. 교사 판본 묶음과 달리 방송 ID를 모두 유지하며 원본이 사라진 실패 이력도 확인할 수 있다.
- `admin-jobs.js`는 명시적으로 선택한 최대 30자료의 자동 검사/재검사 또는 저장 출처 점검을 순서대로 요청한다. 건별 결과·현재 건 이후 중단·미완료/실패 재개를 브라우저에 보존한다. 검색 실패는 검색 단계만 재시도하고, 응답 미확인 작업은 서버 중복 방지와 현재 원본 대조를 거친다. 자동 처리는 방송 원본 ID에서 바로 시작하며 가져오기·AI 초안·사람 승인을 요구하지 않는다.
- `admin-source-check.js`의 `POST /api/admin/source-check`는 서버 원본의 ID·버전·URL·활성/알려진 불일치를 점검한다. 외부 페이지 재수집·사람 확인을 수행하거나 통과 기록을 승인 자산에 쓰지 않는다.
- `ingestion.js`는 단일 입력·CSV/파일·스냅샷 변경마다 미리보기를 무효화한다. 입력/요청 버전으로 늦은 응답을 버리고 저장 직전 현재 입력과 미리보기를 비교한다. 저장 중에는 입력과 반복 저장을 막으며 실패해도 입력값은 유지한다. 공개 소개문과 관리자 검토 메모는 구분한다.
- `server/admin-auth.js`는 관리 화면·API 인증과 Origin/Host 검증을 맡는다. 공개 교사 API만 예외로 두고 나머지 `/api/`는 기본 보호한다. 인증과 승인 Gate는 별도다. 환경변수·만료·운영 HTTPS 정책은 [R08 권한 정책](../Tasks/task-r08-admin-workspace.md#권한-정책)을 따른다.
- `discovery-catalog.js`는 방송과 검수 저장소의 같은 ID를 한 자료로 처리하고 관리자가 변경한 원문과 비활성 상태를 보존한다. 관리자 개인 계정·태그 수동 승인용 저장소는 추가하지 않았다.
- `admin-workspace-check.mjs`는 기존 접근 통제·읽기 상태·CuriMap/검수 동선을 확인한다. `admin-exceptions-check.js`는 상태·집계·저장 재시도를, `admin-exceptions-browser-check.js`는 임시 복제 서버에서 관리자 동선과 가져오기 경쟁 상태를 확인한다. `admin-browser-fixture.js`·`ingestion-browser-cases.js`는 이 검사의 격리 서버·입력 경쟁 사례다. 보고서와 화면은 `docs/r08-03-*`에 기록한다.

## 자동 연계 근거 검사 — R08-01

- `server/candidate-retrieval.js`는 고정 성취기준 보충 없이 원문과 공식 기준의 용어가 겹치는 후보를 조회한다. `source-text-quality.js`는 후보 조회·자동 검사에서 제목 반복과 내용 부족·편성 안내를 공통 판정한다.
- `automatic-relation-rules.js`는 사회 `6사08-01`·과학 `6과12-02`의 제한된 관계 설명을 검사한다. `automatic-evidence.js`는 원문·공식 기준 스냅샷, 인용 위치·판본·버전과 연결/미확인 부분을 검사하며 구조 통과와 의미 판정을 분리한다.
- `automatic-evidence-service.js`는 기존 CURI 콘텐츠 또는 방송 원본 ID를 읽어 검사한다. 관리자 인증·Origin/Host 보호가 적용되는 `POST /api/curimap/evidence`와 `automatic-evidence-cli.js`가 같은 서비스를 사용한다. 요청에는 ID·조회 교과·학년만 허용하고 원문과 이전 검사 결과는 받지 않는다.
- `automatic-evidence-check.js`는 합성 관계 사례·변경/위조·기존 승인4 보존·실제 방송 ID·HTTP 경계를 검사한다. 결과는 [검사 기록](r08-01-evidence-check.json), 범위·API·사용자 확인은 [R08-01](../Tasks/task-r08-01-automatic-evidence.md)에 남긴다.
- 이 경로는 유료 모델·키 조회·저장소 쓰기를 수행하지 않는다. 기존 `mappingRuns`·사람 결정·승인 Gate·검색 투영을 변경하지 않으며, R08-02의 별도 쓰기 경로는 이 검사 함수를 재사용한다. 기존 읽기 전용 API 계약은 유지한다.

## 권장 파일 배치

- 화면 전용 스크립트와 스타일은 현재 구조를 보고 최소 변경으로 배치합니다.
- 새 화면이나 기능을 추가할 때 기존 파일에 임시로 끼워 넣지 않고, 처음부터 해당 책임에 맞는 전용 파일에 작성합니다.
- 같은 성격의 공용 로직이 실제로 2곳 이상에서 반복되면, 구현 전에 공통 모듈 분리 여부를 먼저 제안합니다.

## 자동 연계 자산과 교사 확인 수준 — R08-02

- `automatic-asset-store.js`는 `server/data/automatic-assets.sqlite` 스키마 v1·트랜잭션·백업을 담당한다. `sources`, `runs`, `relations`, `assets`, `search_projection`, `events`는 시맨틱 재빌드와 독립적인 영구 이력이다. 실제 FK와 상태는 [ERD](ERD.md#6-자동-연계-자산-r08-02-automatic-assetssqlite)를 따른다.
- `automatic-assets.js`는 서버 원본 조회 → 검사 → 저장 직전 버전 대조 → 원자 저장 → 검색 준비를 연결한다. 반복 실행은 현재 입력 지문이 같으면 재사용하고, 만료된 5분 실행 임대는 중단으로 남겨 재개한다. R08-03부터 검사 실패와 저장 실패를 구분하며 저장 실패의 검사 보고서를 남긴다. 같은 입력의 저장 재시도는 이 보고서를 재사용하고 현재 버전을 다시 대조한다. 기존 JSON `mappingRuns`에 자동 실행을 추가하지 않는다.
- `automatic-asset-validity.js`는 원문·공식 기준·규칙과 실제 사람 결정을 대조한다. 기존 묶음 검토와 R08-04 관계별 승인·수정·제외·보류는 자동 노출보다 우선한다. 다른 관계·다른 자료를 일괄 무효화하지 않으며 새 사람 기록을 만들지 않는다.
- `automatic-asset-search.js`는 공개 근거 투영과 반영 상태를 별도로 저장한다. 공개 조회마다 현재 원문·규칙·기준·사람 결정을 확인하고 오래된 투영을 제거한다. 검색 준비만 실패하면 저장 자산을 유지해 생성 없이 재시도한다. 원본은 한 응답 안에서 공유하고 다음 요청에서 다시 읽는다.
- `automatic-assets-http.js`의 `/api/admin/automatic-assets`(GET/HEAD/POST), `/api/admin/automatic-assets/search`(POST)는 기존 관리자 세션·Origin·쓰기 잠금을 따른다. `automatic-assets-cli.js`는 로컬 운영자의 명시적 실행·이력·검색 재시도·백업 도구다. 유료 API·예약 작업은 없다.
- 교사 검색의 `curriculum=automatic`은 현재 공개 가능한 부분 연계 후보를, `curriculum=approved`와 `/index.html`은 실제 사람 승인만 제공한다. `automaticLinks`와 `approvedLinks`를 분리하며 자료 전체를 자동 승인으로 표시하지 않는다.
- `public/teacher-evidence.js`는 카드·모음·폴더·Markdown에서 확인 수준, 성취기준, 인용, 연결/미확인 부분을 공유한다. 브라우저 저장 상태는 재조회 전 통과 표시를 숨기고, 폴더를 다시 열거나 화면에 복귀할 때·내보내기 전에 서버를 재조회한다. 폴더의 메모와 선택은 유지한다.
- `automatic-assets-check.js`는 임시 DB의 저장·무효화·재개·백업 계약을, `automatic-assets-http-check.js`는 격리 복제 서버·합성 소개문의 HTTP·선택적 Playwright 동선을 검사한다. [저장 검사](r08-02-assets-check.json), [HTTP/브라우저 검사](r08-02-http-browser-check.json), [실제 원본 실행](r08-02-real-runs.json)을 구분한다. 관리자 예외 화면은 R08-03에서 연결했고 관계별 실제 사람 결정은 R08-04다.

## 선택적 관계별 사람 확인 — R08-04

- `human-review-workspace.js`는 현재 공식 목록·자동 근거·기존 초안·사람 이력을 한 비교 응답으로 만든다. 자동 후보가 없어도 운영자가 공식 관계를 직접 선택할 수 있으며 유료 초안은 필수가 아니다. 공식 기준이 현재 목록에서 제거되면 이전 판단을 읽기 전용 이력으로 보존한다.
- `human-review-contract.js`는 원본 시스템/ID·판본·공식 기준으로 관계를 식별하고 현재 원문·공식 근거·인용 위치·사람 확인·기존 초안 참조 버전을 검증한다. 새 자동 실행이나 자동 규칙 변경은 사람 승인 무효화 사유가 아니다.
- `human-review.js`는 실제 확인·사유·필요한 필드 수정만 받아 서버 시각/단일 운영자 역할을 기록한다. 현재 버전을 저장 직전에 다시 비교하고 결정과 해당 승인 자산을 같은 `curi-store.json` 교체로 확정한다. 요청 ID 재사용은 원래 결과를 반환하며 다른 입력/오래된 화면/동시 쓰기는 거절한다. 검색 준비 실패는 저장 성공과 별개이며 재승인 없이 해당 자산만 재시도한다.
- `human-review-http.js`의 `GET/HEAD /api/admin/human-review`, `POST /api/admin/human-review`, `POST /api/admin/human-review/search`는 관리자 인증·Origin/Host·공유 쓰기 잠금에 참여한다. 개인별 실명 인증은 추가하지 않았다.
- `data-quality.js`·`search-index-contract.js`는 기존/새 승인과 검색 투영을 관계별로 대조한다. 특정 기준·결정 변경은 해당 자산만 이력으로 옮기며, 원문 변경은 그 원문을 공유하는 관계를 다시 판단한다. `search-index.js`의 `relationReviewId`는 검색 준비를 해당 승인 자산으로 제한한다. 기존 4개 자산과 묶음 검토 시각/행위자는 변환하지 않는다.
- `public/admin-human-review.js`는 같은 관리자 상세에서 원문·공식 요구 비교, 부분 수정, 승인/수정/제외/보류, 실제 확인, 사유·이력·검색 상태를 표시한다. 목록/관계 URL 문맥·다음 이동·Alt+S/Alt+N·미저장 이탈 경고를 제공하며 입력칸에서는 단축키를 실행하지 않는다. 응답 미확인 요청만 sessionStorage에 보존해 동일 요청으로 재확인한다.
- `review.html`·`review-route.js`는 기존 콘텐츠/원본 ID와 복귀 조건을 같은 관리자 작업공간으로 연결한다. 이전 `review.js`·`review-search-index.js`는 현재 페이지에서 로드하지 않는다. 기존 묶음 API는 과거 호환을 위해 남기되 관계별 새 결정이 있는 콘텐츠에는 별도 묶음 저장을 거절한다.
- `incremental-ingestion.js`는 방송 원본의 판본을 가져오기·내용 보강 후에도 보존한다. 원본에서 한 제외/보류 결정을 가져오기 후 다른 판본의 결정으로 오인하지 않게 한다. `teacher-evidence.js`는 새 사람 승인에도 부분/전체 범위·인용·미확인 내용을 표시한다.
- `human-review-check.js`는 임시 저장소의 18개 결정/버전/원자 저장 계약을, `human-review-browser-check.js`는 복제 서버의 9개 HTTP·화면 흐름을 확인한다. 브라우저 시험의 임베딩은 검색 실패 복구를 재현하는 고정 시험 대역이며 모델 품질 평가가 아니다. 보고서는 `docs/r08-04-*`, 데이터 계약은 [ERD](ERD.md)에 기록한다.

## 화면 파일 이름 원칙

- 화면 이름은 개발 단계 번호보다 화면의 역할을 기준으로 정합니다. 영문 소문자를 사용하고, 여러 단어는 하이픈으로 연결합니다.
- 정적 HTML 화면을 구현할 때 아래 이름을 우선 사용합니다. 실제 파일 생성과 위치는 해당 task에서 확정합니다.

| 파일 이름 | 화면 책임 |
| --- | --- |
| `discover.html` | 교사 자료 찾기(`/`): 단일 검색 목록·관련/방송일순·주제/유형/프로그램/기간 필터·원문 태그·자동/사람 근거·자료 모음 |
| `lesson.html` | 내 수업 폴더: 수업별 영상 모음·전체 검색·원문 열기·메모·브라우저 저장·이전 준비안 이관·내려받기 |
| `index.html` | 기존 승인 자산 검색(직접 접근): 수업 언어 질의, 최소 연관도 기준을 통과한 검증 결과의 관련도·방송일 정렬, 결과 수·페이지 이동, 성취기준·추천근거·EBS 원문 링크 표시 |
| `admin.html` | 오류·변경 우선 작업 목록, 원문/자동 관계 비교·검사/저장/재개, 선택적 관계별 사람 결정·통합 저장 |
| `admin-login.html` | 관리자 코드 로그인 |
| `curimap.html` | CuriMap 교육과정 연계: 콘텐츠 URL·Seed 입력, 연계 실행, 공식 성취기준 후보·연계근거 표시 |
| `review.html` | 기존 검수 주소 호환: 자료/관계·목록 조건을 유지해 관리자 관계별 사람 확인으로 이동 |

- 검색 결과 상세는 우선 `index.html` 안에서 표시합니다.
- CuriBase의 검증된 메타데이터를 조회하는 별도 화면이 필요한 task에서는 `curibase.html`을 사용합니다. 저장 기능만을 위해 별도 화면을 만들지는 않습니다.

## 변경 원칙

- 파일 생성, 저장, 이동 위치는 폴더 책임을 기준으로 결정합니다. 해당하는 폴더가 없으면 구현 전에 사용자에게 먼저 확인합니다.
- 새 폴더, 새 빌드 도구, 새 프레임워크, 대규모 리팩터링은 사용자에게 이유와 범위를 먼저 알리고 승인을 받은 뒤 진행합니다.
- 작업 중인 task 범위를 넘어서는 구조 정리는 별도 요청 없이는 하지 않습니다.
- 새 폴더를 생성하면 `## 현재 프로젝트 폴더 책임`에 해당 폴더와 역할을 추가합니다.

## 원문 품질·설명·교육과정 공백 — R07-02~04·R08-05

- `source-text-quality.js`는 다섯 품질 상태·최소 원문 조건·버전을 검색/카드/안내/후보/자동 검사에 공유한다. 짧은 설명의 최소 조건 통과와 구체적 설명, 실제 관계 충족은 별도다. 카탈로그 기본/개별 판본 분모를 구분해 집계한다.
- `source-explanation.js`는 원문 오프셋을 보존한 문장·내용 안내·요청별 대응/미확인·출처 확인 항목을 제공한다. `teacher-source.js`는 전체 공개 소개문과 근거 강조를 안전하게 렌더링한다. 공개 원문과 서비스 문장 선택을 구분한다.
- `source-enrichment.js`는 같은 공식 회차 ID/제목/주소/현재 해시를 대조한 상세 원문만 방송 SQLite에 원자 반영하고 전후 이력을 보존한다. 제목 끝 수어·더빙·자막 표기는 기존 목록의 동일 표기가 확인된 경우만 허용하며 그 대조 근거를 payload에 보존한다. `source-enrich.mjs`는 ID목록을 받아 명시적으로 공식 상세 GET·메타 파싱·대조·보고를 수행한다. 일반 검색은 외부 수집을 실행하지 않는다. 접근 제한은 호스트 단위로 중단한다.
- `discovery-query-language.js`는 교사의 표현 확장만 담당하며 원문 태그를 생성하지 않는다. 요청의 방법/장면/시간 조건은 후보 발견과 별도로 비교·미확인 표시한다. 알 수 없는 내용어·AND/OR·제외는 보존한다.
- `curriculum-requirements.js`는 현재 공식 기준의 대상/관계/조건/학습 행동과 탐색어를 제공한다. 미지원 관계는 공식 요구 원문을 유지하며 자동으로 분해를 확정하지 않는다. `curriculum-discovery.js`의 공개 읽기 API `/api/curi/curriculum`은 전체 원문 후보·판본별 근거·기준별 공백과 보강 우선을 계산한다. 규칙 지원은 공식 목록 전체보다 좁다.
- R08-07 당시 `curriculum.html`은 교사의 기준 선택→방송 후보→근거 비교/내 자료 담기를 제공했다. R07-08에서 해당 교사 주소를 통합 자료 찾기로 이동했다. `admin-curriculum.html`은 인증된 기준별 공백·원문 보강 우선 목록을 유지하며 `curriculum.js`·`curriculum.css`로 기존 관리자 상세와 연결한다. R09-01에서 초등3~4 73개·기존 초등5~6 78개·중1 EBS 참고63개, 총214개를 제공한다. 신규 기준의 관계 규칙은 미지원으로 남긴다.
- 전후 집계/원문 복구/검색/화면 검증은 `docs/r07-02-*`, `r07-03-*`, `r07-04-*`, `r08-05-*`로 구분한다. 고정 질의 결과는 개발용 후보 발견 평가이며 교사 효용·교육과정 의미 정답률이 아니다.
- `automatic-relation-rules.js`는 선거·자전·농경문 청동기·연소 생성물 피해의 제한된 관계만 검사한다. `automatic-evidence-service.js`는 관리자가 선택한 공식 기준 ID를 교과·학년과 다시 대조하고, `curriculum.js`는 관계별 실행 결과를 별도 자동 자산 저장·검색 준비와 연결한다. 자동 공개 후보는 사람 승인과 다른 확인 수준을 유지하며 원문·기준·규칙 변경 시 해당 투영만 무효화한다.

## 선택 기준 근거·원문·개인 수업 문맥 — R08-07~09·R07-05

R08-07~09·R07-05는 선택 기준의 근거와 개인 수업 판단을 구분한다. `curriculum-evidence.js`가 선택한 기준의 관계 이력·원문 상태·요구별 인용을 구성하고, `automatic-relation-language.js`가 네 제한 규칙의 부정 대상·조건·인용 문맥을 판별한다. 검색은 요구 관계 근거→소개문 품질→개념 일치 순으로 비교한다. `curriculum-source-queue.js`는 내용 보강 사유와 후보 없는 과학 주제를 제공한다.

`source-supplements.js`는 공식 보조 문서의 회차·방송일·판본·발췌 위치를 대조해 방송 payload와 별도 이력에 저장한다. 보조 발췌는 후보 발견과 출처 표시에 사용하며 소개문 품질·자동 요구 비교·승인으로 승격하지 않는다. `source-gap-metrics.js`는 고정된 관계 이력으로 보강 전후 집계를 기록한다. `independent-quality-*`는 고정 코드·입력·표본·판단 해시를 보존한 읽기 전용 비교 도구다.

`public/lesson-context.js`는 내 자료와 폴더의 복수 선택 이유·저장 당시 상태·개인 난이도/선수개념/장면 기록을 정규화하고 표시·내보내기를 공유한다. 개인 사용·제외 이유는 브라우저에만 저장하며 공용 검수 기록이나 검색 순위를 바꾸지 않는다.

## 학년·과정 확장 — R09-01

- `public/grade-context.js`는 브라우저와 서버가 공유하는 학교급·단일 학년·과정 해석과 공식 코드/학년군 대조를 담당한다. 초등3~4·5~6과 중1을 구분하며 일반 방송의 학년을 추정하지 않는다.
- `server/curriculum-expansion-source.py`와 `server/data/curriculum-expansion.json`은 공식 PDF의 추가136개와 EBS 뉴런 중1 참고 편성19개를 관리한다. `curriculum-expansion-import.js`는 문서/본문 지문·편성을 검사한 후 명시적 `--apply`로 병합한다. 기존78·사람 승인·검토 이력은 덮어쓰지 않는다.
- `curriculum-expansion-anchors.js`는 추가45단원의 구체 탐색어를 공식 문장과 대조한다. 기존 초등5~6 탐색어 및 네 자동 관계 규칙은 유지한다. 공통 단원 번호만으로 다른 과정 어휘를 재사용하지 않는다.
- 후보·초안·자동/사람 검토는 같은 지원 기준을 사용한다. 신규 `SOURCE_CHECKED`는 에이전트의 공식 출처 대조이고 `humanConfirmed:false`를 보존한다. 중1의 `placement`는 학교별 편성 확인이나 방송 관계 인용을 대신하지 않는다.
- 교사 검색은 현재 과정의 판본별 관계를 먼저 제한하고 주제 후보는 유지한다. 역방향 API의 `grade`와 관리자/CuriMap의 `gradeBand`는 원본 방송의 학년과 별개인 수업 문맥이다. `grade-evidence-summary.js`는 자동 SQLite를 읽기 전용으로 대조해 여섯 구간의 검사·보류·미지원·무효와 실제 사람 결정/현재 승인을 구분한다.
- 폴더 `targetGrade`와 자료 `teachingContext`는 선택 학년·교과·성취기준을 저장·재열기·내보내기에 유지한다. 이전 폴더는 학년 미지정으로 읽으며 난이도·선행 개념·장면·사용 구간은 미확인으로 표시한다.
- 출처는 [원문·뉴런 대조 기록](R09_01_CURRICULUM_SOURCES.md), 측정·검증은 [R09-01 결과](R09_01_GRADE_EXPANSION_RESULTS.md)와 `r09-01-*.json`에 기록한다. 이전 단계의 고정 보고서는 유지한다.

## 교사 통합 검색 화면 — R07-08

- `public/search-state.js`는 URL·기존 검색 저장값·API 인자의 경계를 공유한다. `standard/state`는 API 조건이고 `standardSubject/standardGrade/standardQuery/standardView/legacyScope/invalidConditions`는 브라우저 목록 탐색·주소 호환/오류 상태다.
- `public/curriculum-picker.js`·`curriculum-picker.css`는 기존 교육과정 읽기 API의 공식214개 목록을 사용한다. 선택 원문·출처를 별도로 표시하며 목록 교과/과정은 자료 교과 조건을 바꾸지 않는다.
- `discover.html`·`discover.js`는 질문·기준·기존 필터의 단일 검색을 연결하고 요청 번호·중단으로 늦은 응답을 차단한다. `discovery-filters.js`는 선택 기준/관계 상태의 표시·개별 해제를 포함한다. 질문만 바꾸거나 기준을 해제해도 다른 조건을 보존한다. 사용자 요청으로 검색창의 대상 학년 선택은 제거했으며 `discover.js`는 이전 주소·검색 저장값의 `grade`를 `all`로 읽는다. 실제 수업 대상은 내 수업 폴더에 유지한다.
- `/curriculum.html`·`curriculum-redirect.js`는 이전 교사 주소 조건을 `/`로 이관한다. 이전 교과/학년은 기준 목록 조건이며 충돌을 안내한다. 관리자 `/admin-curriculum.html`·`curriculum.js`는 관리·공백 확인 경로로 유지한다.
- `server/teacher-unified-page-check.js`는 임시 복제 서버와 격리 브라우저에서 공식 목록·선택·복원·오류·비동기·키보드/모바일을 검사한다. 기록·캡처는 `docs/r07-08-*`에 보존한다.

- R07-08 추가 수정의 `server/curriculum-related.js`는 공식 기준·기존 탐색 어휘로 질문의 관련 후보 최대8개·관련 이유를 계산하는 읽기 전용 모듈이다. `/api/curi/curriculum/related`는 방송 후보/승인·자동 비교 지원 여부와 독립이며 기존 자료 검색 순위를 변경하지 않는다. `curriculum-picker.js`는 관련/전체 보기·질문별 요청 중단/대조·실패 재시도를 제공한다. `discover.js`는 선택 기준을 무시하는 구버전 서버 응답을 오류로 표시한다.

## 통합 근거와 개인 수업 문맥 — R07-09

- `teacher-evidence.js`는 기존 선택 기준 응답의 요구·제공 내용·인용/남은 요구와 비교/원문/승인 범위를 공용 표시한다. 검색 이유는 `teacher-source.js`와 구분하며 공식 보조 문서는 후보 발견 근거다.
- `shelf-context.js`는 내 자료의 기존 `selectionContexts` 편집·추가·저장 재시도·현재 관계 부분 갱신을 담당한다. `discover.js`는 개인 문맥 토글·모음/폴더 연결과 내보내기 사본을 유지한다. `lesson-context.js`의 공식 과정과 선택 당시 대상 학년은 독립이며 개인 편집은 최초 snapshot을 보존한다.
- 교사 검색의 카탈로그 운영 집계는 제거했다. 결과/필터 건수와 자료별 근거는 유지하며 확보·규칙·공백·현재 승인 집계는 인증된 기존 관리자 교육과정 작업공간에서 제공한다. 관리자 쓰기 경로는 변경하지 않았다.
- `teacher-unified-context-check.js`는 임시 복제 서버·브라우저에서 근거 표시/인용·개인 입력·폴더 왕복·실패/비동기/내보내기·권한/모바일을 검사하며 `docs/r07-09-*`에 기록한다.


## 공식 편성·교육과정 해설 — R07-10

- `server/hwp-source-text.js`는 HWP5 문단의 읽기 전용 추출, `curriculum-guidance-pdf.py`는 PDF 쪽별 두 추출기 대조 입력, `curriculum-guidance-build.js`는 공식 코드/본문과 해설·단원별 고려 사항의 대응을 담당한다. 결과는 `server/data/curriculum-guidance.json`에 저장하며 원문 SHA·발췌 위치를 보존한다. 원본 PDF/HWP·공식 기준 저장소는 변경하지 않는다.
- `curriculum-guidance.js`는 현재 본문·판본이 일치하는 기준의 안내만 반환한다. 실행 중에는 문서 재추출 없이 JSON을 읽는다. 요구 계획/선택 비교 응답을 통해 전달하며 탐색어·자동 관계 규칙·승인을 바꾸지 않는다.
- `public/teacher-guidance.js`는 자료 찾기와 수업 폴더의 공식 해설·출처·단원 범위·교사 비교 질문·내보내기를 공유한다. 중1 참고 선택에는 총론의 공식 편성 근거를 제공한다. 교육과정 설명과 영상 인용/자동 판정은 별도다.
- R07-10에서 검색 예시를 초3~4·초5~6·중1 참고×사회/과학의 여섯 묶음으로 검토했다. R07-11에서 과정별 화면 목록은 제거하고 내부 대응 기록을 보존했다. 지리는 사회에 포함하며 실제 검색량은 관련성·주제 범위를 검토하는 보조 지표다. 검증과 대응 기록은 `docs/r07-10-*`에 보존한다.


## 검색 화면 간소화 — R07-11

`discover.html`은 검색창/18개 주제 예시 → 선택적 교육과정 → 결과/필터 순으로 구성한다. `discover.js`는 질문/선택 기준 변화에 따라 예시를 접고, 같은 문맥에서 사용자가 다시 연 상태를 유지한다. 문장 검색 도움말과 검색어 지우기를 검색창에 통합했다. 관리자 링크는 하단에 둔다.

`discovery-filters.js`는 기존 파라미터와 필터 ID를 유지하며 자료 유형/정렬을 기본 표시하고 다른 조건과 개념/장소 탐색을 상세 필터에 모은다. 활성 상세 조건은 복원 시 펼치고 현재 조건/개별 해제는 패널 밖에 표시한다. 편성/해설은 선택 기준의 기존 안내로 제공한다. 검증/캡처는 `docs/r07-11-*`에 기록한다.


## 자연어 프로그램·장르 요청 — R07-12

`discovery-request.js`는 현재 목록의 프로그램명/제한된 약칭을 내용어와 분리해 필수·선호·제외를 제공한다. `discovery-genre.js`는 장르 요청의 선호/한정/제외와 공개 텍스트 표현의 근거를 구성한다. 사용자 후속 요청으로 일반 다큐/다큐멘터리 입력은 기본 한정이며 명시적 유사/선호 문맥은 선호로 유지한다. 프로그램명의 ‘다큐’를 별도 장르 요청으로 중복 처리하지 않는다.

`discovery-search.js`는 프로그램/장르 조건을 후보 구성과 관련순에 반영하고 `teacher-discovery.js`는 장르 요청의 전체 목록 fallback을 막는다. `discover.js`는 기존 검색 해석 영역에서 반영 조건을 표시한다. 장르 표현 근거는 실제 영상의 형식 확인·공식 메타데이터 태그·자동 교육과정 승인과 별개이며 원본/DB에 저장하지 않는다. 기록은 `docs/r07-12-*`다.


## 방송 형태 검색 근거 — R07-13

`program-form-source.js`는 기존 공식 프로그램 목록과 자료의 프로그램명/course/step을 대조해 읽기 전용 분류 근거를 구성한다. `discovery-catalog.js`는 목록 파일도 캐시 서명에 포함하고 자료와 판본에 파생 `programClassification`을 연결한다. 다른 시즌·주제 분류를 형태로 상속하지 않는다.

`discovery-genre.js`는7형태 요청과 원문의 형식 선언/전달 방식·공식 분류를 비교한다. 단순 언급·부정·제작/비평 주제와 구분하고 기존 강의 자료 유형을 우선한다. 복수 필수 형태는 AND, 명시적 형태 OR는 OR로 처리한다. `discover.js`는 기존 요청 해석 문구만 조정하며 형태 선택 UI·카드 배지를 추가하지 않는다. 공식 목록/DB·교육과정 승인/자동 규칙은 변경하지 않는다. 출처와 검증은 R07-13 task 및 `docs/r07-13-*`에 기록한다.


## 카드의 원문 내용 키워드 — R07-14

`content-keywords.js`는 기존 `content-preview.js`의 선택적 추출 옵션을 활용하여 표시용 구체 어휘를 제공하고 원문 위치를 다시 대조한다. 기본 미리보기5키워드/문맥 안내는 유지한다. 원문 키워드와 등록 개념은 별도 kind로 반환하며 검색 개념·승인·추론 상위 개념으로 등록하지 않는다.

`teacher-discovery.js`는 contentKeywords와 전체 직접 coreTags를 제공한다. `teacher-cards.js`는 기본8개·추가 펼치기, `teacher-source.js`는 기존 공개 원문 강조를 제공한다. 반복 미분류 배지는 제거하고 원문 품질 안내를 유지한다. 기존 개념 필터의 분모는 등록 개념만 기준으로 유지하며 카드의 내용 키워드와 별도다. 검증/커버리지는 `docs/r07-14-*`에 기록한다.

## 소개문 문맥 태그 — R07-15

`content-keywords.js`는 임의의 제목 단어를 만들지 않고 기존 개념 별칭·공식 단원 탐색 어휘·선별 소재를 소개문에 대조한다. R07-14의 제목 우선 추출·등록 태그 단순 합치기를 대체한다. `keyword-context.js`는 비유/부정/인명·다의어의 분야 단서·긴 도입문의 단발성 주변 소재를 보수적으로 검사한다. 소개문 없음/제목 복사는 표시 태그를 보류한다. 기존 미리보기는 유지하고 `content-preview.js`의 specificTerms 어휘만 재사용한다.

대표 개념 어휘를 먼저 표시하며 근거는 모두 소개문의 위치/인용/문장이다. 카드 툴팁에 근거 문장을 연결하고 기본8개/펼침·공개 원문 강조·개인 저장을 유지한다. 기존 검색 색인의 coreTags·순위·필터와 표시 contentKeywords는 별도다. 유료 모델·영상 분석 없이 문장 규칙을 사용하므로 전체 맥락 이해나 성취기준 충족을 보증하지 않는다. 검증은 `contextual-keywords-check.js`·`contextual-keywords-browser-check.js`, 산출물은 `docs/r07-15-*`에 기록한다.

## 방송 내용 안내의 문장 보존 — R07-16

`broadcast-guide-text.js`는 표시 정리·원문 위치를 보존한 문장 경계·잘림/문자 오류 의심을 담당한다. contentGuide는 이를 사용해 주제/활동/사례/결론을 최대3문장으로 선택한다. 기존 sourceSentences의 검색/관계 인용 경로와 상세 연계 품질은 유지한다. teacher-cards.js/teacher-workspace.css에서 reviewNote를 표시하고 원문 전체/강조는 기존 경로를 사용한다. 공식4소개 복구는 기존 source-enrichment.js의 제목/ID/URL 대조와 이력 저장 경로를 사용한다. 감사/화면 검사는 broadcast-guides-check.js/broadcast-guides-browser-check.js, 산출물은 docs/r07-16-*다.

## 전체 문맥 감사·검색 색인 — R07-17

semantic-pattern.js의 경계를 keyword-context.js/semantic-layer.js에서 공유한다. 등록60개념과 내용 어휘는 같은 소개문 문맥 검사로 채택하며 제목만의 개념은 보류한다. getSemanticIndex는 대표/판본 전체를 포함하고 contentKeywords도 캐시한다. discovery-search는 등록 개념/지리 겹침 우회와 다의어 일반 검색을 제한하고 원문 어휘의 일치에 가점을 준다. teacher-discovery는 같은 어휘를 표시한다. 제목/프로그램 직접 탐색·공식 기준 승인 경로는 유지한다.

semantic-build는 규칙 SHA/원문 지문과 전체23,360자료의 태그·문맥 판단·어휘를 원자 재생성한다. 런타임은 같은 함수로 원본에서 메모리 색인을 생성하며 SQLite는 그 판정의 저장본이다. full-context-audit/full-context-index-check는 전수 자료/후보/인용/검색을 검사한다. context-audit-report는 제품과 별도인 독립 HTML 감사 산출물을 만들고 context-model-cost는 API 호출 없이 공개 단가·자료 분량으로 비용을 추정한다. 모델 의미 판정은 미실행이며 rule-screened 상태와 구분한다.

## 일반 검색어의 단어 경계 — R07-18

`search-term-matching.js`는 Unicode 경계, 한글 조사/활용, 영문 단어 및 명시 복합어를 담당한다. `discovery-query-language.js`의 matchingExpressions가 포함/제외·지리 보조 일치·관련순·원문 검색 이유에서 같은 규칙을 제공한다. 단순 includes로 일반 어휘가 다른 단어 내부에 걸리는 경로를 차단한다. 등록 개념의 소개문 문맥 판정/SQLite 저장본은 별도이며 이번 수정은 검색 런타임에 적용한다. `word-boundary-search-check.js`는 전체 자료/교육 어휘 경계를 감사하고 `word-boundary-browser-check.js`는 격리 서버에서 표시·제외·저장을 확인한다. 산출물은 `docs/r07-18-*`다.


## 교사 자연어 후보 검색 — R07-19

`natural-request.js`는 요청 동사·필요 조건/원인/변화/공존 구절과 제한된 표현 확장을 보존한다. 미지의 내용어와 명시 AND/OR·제외는 유지하며 관계 어휘는 필수 주제와 분리한다. `curriculum-related.js`는 남아 있는 확장의 원래 구절도 기준 탐색에 사용해 관계 표현 손실을 막는다.

`broadcast-semantic-build.js`는 전체 회차/판본의 제목과 최소 원문을 통과한 소개문 문장 묶음을 기존 고정 E5 로컬 모델로 준비한다. `server/data/broadcast-semantic-search.sqlite`는 재생성 가능한 별도 검색 색인이며 원본/승인/시맨틱 태그 DB를 변경하지 않는다. 내용·출처/모델/표현 버전 지문과 원문 위치를 저장한다. 원자 교체 전 `.building`은 재개용이며 Git에서 제외한다.

`broadcast-semantic-index.js`는 지문이 같은 현재 회차만 비교하며 문장 유사도 상위80개를 제공한다. `discovery-search.js`는 유사도0.84와 원문 주제 단서/제한된 다른 표현을 함께 검사한다. 유사도만으로 후보·관계·승인을 확정하지 않는다. 자연어 요청에서만 적용하고 짧은 검색/미지 고유명/형태/프로그램/제외 조건을 보존한다. 의미 색인 미준비·실패는 명시 조건을 유지한 키워드 경로로 돌아간다. 원문 부족 자료의 제목 검색은 기존 경로로 유지한다. 관계 충족은 계속 미확인이다.

`source-explanation.js`는 자기 회차의 실제 소개문 오프셋만 표시한다. `teacher-discovery.js`는 필터 탈락과 원문/발견 원인 미분류를 구분하며 주제 없는 자연어 요청을 전체 목록으로 자동 완화하지 않는다. `discover.js`는 첫 검색에만30초, 성공 후12초 제한을 사용한다. 원래12초보다 긴 초기 색인 준비가 브라우저에서 실패하던 사례를 실제 전체 카탈로그로 확인했다.

평가는 `natural-discovery-evaluate.js`, 계약은 `natural-discovery-check.js`, 실제 화면은 `natural-discovery-browser-check.js`가 담당한다. 평가 내부의 키워드 전용 비교 옵션은 외부 API 파라미터로 노출하지 않는다. `natural-discovery-review-report.js`는 제품과 별도인 오프라인 판정 페이지를 만들며 `natural-discovery-api-plan.js`는 공개 단가와 실측 원문 바이트의 비호출 비교안을 만든다. `docs/r07-19-*`의 개발80/최종40은 에이전트 작성 보조 입력이며 실제 교사/독립 사람 판정은 미확보다. API 어댑터와 모델 의미 심사는 미구현/미실행이다.


R07-19 사용자10질문 후속 수정에서 `search-geographic-scope.js`가 국내/해외 범위 추출과 제목·소개문 장소 단서/불명·혼합 보류를 담당한다. `request-relation-evidence.js`는 제한된 화산 지형 형성/특징 단서와 직접 지형 언급/주변 소재를 자기 원문 인용으로 구분한다. `discovery-search.js`는 긍정 내용 질의의 E5 실행·지역 필터·요청 관계 순위를 적용하고 `natural-request.js`는 원래 요청을 참조하여 앞 단계의 문법 제거로 실행 조건이 소실되지 않게 한다. 낮/밤의 자전 확장은 원인/변화 문맥에 제한한다. 기존 해석 영역에 지역 범위, 원문 영역에 관계 단서/남은 요구를 제공한다. 원본/승인/태그 DB와 의미 색인은 변경하지 않으며 별도 범용 관계 승인으로 확장하지 않는다. 후속 검증은 `natural-geography-search-check.js`/`natural-geography-browser-check.js`와 `docs/r07-19-geography-*`에 보존한다.


## R07-19 요청 계약의 런타임 연결

비호출 A·B 준비는 `request-model-preparation.js`(생성 Schema·지시문·응답 처리), `request-model-http.js`(읽기 전용 `/api/curi/discover/model-preparation`), `candidate-review.js`/`data/candidate-review.schema.json`(요청/원문 지문·인용·조건 검증)이 담당한다. `request-model-client.js`는 기본 차단 상태의 미래 실행 어댑터이며 공개 준비 경로에서 호출하지 않는다. `request-search-plan.js`는 검증된 B 후보 비교를 기존 결과 경로에 전달하고 `teacher-discovery.js`는 선택 공식 기준 밖 후보를 B 준비에서 제외한다. `semantic-layer.js`의 specificAliases와 검색의 명시 어휘 보존은 현무암 등 좁은 주제 대체를 제한한다. 카드의 선택 이유·검증 인용·남은 확인·원문 링크는 `teacher-source.js`와 기존 카드/CSS가 표시한다. 실제 모델 실행·금액 계측·의미 품질·브라우저 시각 확인은 준비 범위와 구분한다. [계약 차이](r07-19-model-contract-differences.md).

`request-envelope.js`는 교사 원문과 시스템 소유 선택 조건을 동결한 입력 봉투를 만든다. `server/data/request-input-envelope.schema.json`·`request-interpretation.schema.json`은 수신 Schema의 런타임 사본이다. `request-contract-validation.js`는 해당 Schema의 타입/키워드·UTF-16 구절·참조/논리·명시 의미 보존 규칙을 검증한다. 범용 의미 판정기는 아니다.

`request-search-plan.js`는 검증된 전달 응답의 주제/확장 후보 검색·AND/OR·필수/제외/선호/문맥·요구별3값 대조를 맡고 `request-date-condition.js`는 명시 날짜만 해석한다. `teacher-discovery.js`의 기존 선택 조건·공식 기준 교집합·정렬/페이지 경로를 유지한다. 불충분한 관계 원문은 탐색 후보와 조건 일치 결과로 구분한다. `teacher-source.js`는 기존 카드에 요구별 근거와 영상 미확인을 표시한다.

일반 GET은 입력 봉투만 추가하는 LOCAL_ONLY다. 공개 읽기 전용 `POST /api/curi/discover/interpretation`은 `{input,interpretation}`을 받아 서버가 봉투를 생성하고 검증/탐색한다. 전달된 응답을 사용하는 경로이며 모델 생성/외부 호출/저장 기능은 없다. 검증 실패·모호함/충돌·미지원은 실행 결과에 남기고 원문/기존 선택 조건의 로컬 검색으로 돌아간다. 관리자 경계는 기존대로 유지한다. `request-connection-check.js`·`request-connection-http-check.js`와 `docs/r07-19-request-connection-*`에서 검증한다.


## R07-20 공식 원문 공백 조사

`source-gap-audit.mjs`는 검토JSON에서 원문 부족 대상을 받아 SQLite 읽기 전용 조회와 공식 HTML 메타데이터 대조를 수행한다. 기존 `source-enrichment.js`의 URL/회차 대조와 `source-text-quality.js` 품질 분류를 재사용한다. 공개 메타데이터를 DOMParser로 파싱하고 영상·외부 스크립트·로그인은 실행하지 않는다. 결과는 `docs/r07-20-source-gap-audit.json`에 저장하며 제품·원본·시맨틱 색인은 변경하지 않는다. 원문 복구 가능/상세도 불충분/접근·식별 미확인은 서로 다른 후속 경로다.


## R07-21 원문 복구·공개 자막의 별도 검색 근거

`source-restoration-apply.js`는 기존 `applyOfficialDetail`을 재사용하며 조사 해시·대상/보호 저장소를 대조한다. `official-caption-audit.mjs`는 공식 HTML의 플레이어 회차/제목/프로그램·자막 참조를 읽고 공개 SMI만 수집한다. 영상/외부 스크립트는 실행하지 않는다. `sourceSupplements`에 기존 연결 경로로 발췌/시간 위치/공식 출처를 보존하고 조사JSON에 페이지·자막 지문/원문 구절을 남긴다. 발행일 미확인과 방송일을 구분한다.

`supplement-search.js`는 회차/판본/내용 해시가 일치하는 공식 보조 원문만 반환한다. `semantic-layer.js`는 기존 문맥 규칙으로 보조 텍스트의 주제 언급을 검사하며 field/sourceSupplement·supplementId·원문 위치로 구분한다. `discovery-search.js`가 해당 텍스트를 후보/제외 대조에 사용한다. `source-explanation.js`와 `teacher-source.js`는 원문 slice가 같은 인용만 기본 선택 영역/별도 상세에 표시한다. 소개문·승인 정본과 혼합하지 않고 영상/수업 적합성을 확정하지 않는다. 현재 B의 title/summary 계약은 별도이며 자동 확장하지 않는다.

`source-restoration-compare.js`·`source-restoration-check.js`·`source-restoration-browser-check.js`의 전후/해시/인용/실제화면 검증은 `docs/r07-21-*`에 보존한다. 방송 의미색인 빌드의 출력 보고서 경로를 CLI에서 지정할 수 있어 이전 빌드 보고서를 덮어쓰지 않는다. 보조 자막은 이번 E5 제목/소개문 색인에 합치지 않는다.


### R07-01 통합 주제 선택

`teacher-filters.js`의 topicChoices/topicUnclassified는 주제/교과 외 조건을 유지한 범위별 전체·세부 개념의 건수다. `discovery-filters.js`의 단일 topic-filter는 기존 conceptGroup/concept 상태에 연결하고 한 개 선택 칩을 제공한다. 새 주제 선택 시 이전 교과 제한/다른 주제 조건을 해제한다. 상세 교과 선택은 제거하고 curriculum-picker의 공식 기준 교과 선택은 유지한다. 기존 API/주소는 호환한다. 통합 주제 브라우저 검사는 `teacher-topic-filter-browser-check.js`다.

## R12-05 검색에서 수업 폴더 담기

`public/teacher-folder-picker.js`는 기존`lesson-folders.js`의 읽기/저장·충돌 검사를 사용해 검색에서 폴더 선택/생성·저장 실패/재시도를 처리한다. `addResourceToFolder`는 기존 폴더 화면과 같은 자료 추가/선택 이유 병합을 공유하며 메모/개인 판단을 대체하지 않는다. 기존 브라우저 저장 키와 이전 준비안 호환은 유지한다.


## R12 교육과정 목표·명시 연계 제안

lesson-goal.js의 수업 의도 상태와 teacher-combined-search.js의 관련/확장 범위를 기존 기준 후보/요구 비교에 연결한다. 기존 주소의 기본은 candidates 한정, 새 기준 선택은 priority, verified는 해당 기준 확인 기록에 한정한다. 공개 목표는 API 원문과 별도인 개인 문맥이며 필수 조건은 유지한다. 기존 lesson-context/lesson-folders 저장에 목표/목적/요구·폴더 역할 표를 연결한다.

link-proposals.js는 공개 prepare/명시 POST와 인증된 관리자 목록/상태 경로를 담당한다. 인용/회차/기준/원문 지문을 대조하고 별도 접수 SQLite에 PENDING으로 저장한다. 개인 저장만으로 전송하지 않는다. 관리자 화면은 기존 원문/관계 검토를 열고 기존 해당 관계 검토ID/유효성을 표시한다. 승인/자동 공개 정본은 바꾸지 않는다. link-proposal.js의 미리보기에서 제출 필드를 확인하고 admin-link-proposals.js에서 검토중/반려를 관리한다. curriculum-goal-check.js는 임시 서버에서 전체 동선을 검증한다.

## R12-03 공통 요청 범위·세부 개념

`request-clauses.js`는 장르/지역 해석 전 제외·선호·교실 활용 범위를 분리하고 자기회차 원문의 제외 문자 근거/미확인을 제공한다. `request-concepts.js`는 검색용 별칭과 요청 소재를 구분하며 좁은 표현/명시 동의어·신체 비유를 보수적으로 대조한다. 원문 태그/색인/승인 정본은 변경하지 않는다. 기존 discovery-request/intent/search·source-explanation에 연결하고 기존 해석 영역에 내용 선호/활용 문맥을 표시한다. 검증은 `request-clauses-check.js`,고정 개발170 재실행은 `request-development-evaluate.js`다. 최종평가파일은 실행기에서 읽지 않으며 산출물은 `docs/r12-03-*`에 보존한다.

## R12-07 수업용 구간 북마크

`extensions/curi-segments/`는 Chrome Manifest V3 확장 원본이다. popup은 영상 시간 지정과 명시 저장, background는 정확한 로컬 Curi 주소와 회차 전달, curi-bridge는 구간 화면 메시지 연결, player는 지식채널e 공개 회차/본편 소스 대조와 시점 이동/끝 정지를 담당한다. `server/package-segment-extension.js`는 `public/segment-core.js`를 설치본에 복사하고 `public/downloads/curi-segments-extension.zip`을 생성한다.

`public/segment-core.js`는 공통 회차·시간 계약, segment-store는 별도 개인 localStorage와 revision 충돌 검사, segment-ui는 기존 영상 카드의 구간 표시를 담당한다. `lesson-segments.js`는 `lesson.html`의 개인 구간 목록/편집 dialog·현재 회차 재확인·명시 저장 안내/재열기/확장 연결을 담당한다. 독립 `segment-bookmarks.html/js`는 제거했으며 CSS는 공통 구간 표시/편집 스타일로 재사용한다. 이전 페이지 주소는 서버에서 내 수업으로303 이동한다. 기존 자료/폴더 저장 키·승인 정본을 변경하지 않는다. `segment-bookmarks-check.js`는 합성 플레이어/모의 Chrome 연결, `lesson-segments-check.js`는 내 수업의 메시지 처리·저장 안내/목록·보존을 검사한다. 실제 확인은 [R12-07 구현 기록](R12_07_SEGMENT_BOOKMARKS.md)에 구분한다.

## R12-03 내용 관계·선택지 검색

`request-content-plan.js`는 요청 문법/교실 활동과 필수 내용·OR·붙음/부정 비교·생물 먹이 관계를 분리하고 자기 회차 소개/확인된 보조 원문의 술어 단서를 대조한다. 장소 예시와 미확인 장면을 보존한다. discovery-request/intent/search에서 내용 계획과 명사 수식 조건을 전달하며 teacher-discovery는 유효한 OR/관계를 전체 목록으로 완화하지 않는다. source-explanation은 정확한 원문 위치/회차·관계 단서/상황 미확인을 연결하고 public/discover.js는 관계·선택 주제/교실 활용 해석을 표시한다. 데이터/승인 정본과 개인 저장은 변경하지 않는다. `request-content-plan-check.js`8대조·개발170 실제 API·원인 분류/전후 판정은 `docs/r12-03-content-*`에 보존한다.

## R12-05 개인 가져가기·폴더 교육과정 연결

최신 교사 UI는 검색의 curriculum-picker를 사용하지 않는다. 이전 주소의 기준·목표/상태 조건을 discover.js에서 비적용하며 기존 서버 기준 검색 API는 보존한다. `curriculum-selection.js`는 공식 목록/관련 후보·다중 선택과 기준별 개인 선택 이유 추가를, `teacher-save-picker.js`는 명시적인 가져가기/취소/저장 실패 동선을 담당한다. teacher-folder-picker와lesson.js에서도 같은 선택기를 재사용한다. `curriculum-selection.css`는 모바일 가져가기/기준 목록의 스크롤을 구성한다. 기존 개인 키와selectionContexts는 유지하고 폴더 curriculumStandards는 별도 개인 기준 스냅샷이다. 폴더 연결이 자료 기준·승인/검색 순위를 바꾸지 않는다. 검증은 `curriculum-save-browser-check.js`8동선/`curriculum-save-failure-check.js`2실패, 결과는`docs/r12-05-curriculum-*`다.

### R12-05 가져가기 진입 통합

최신 자료 카드는 가져가기 버튼 하나를 제공한다. teacher-folder-picker.js가 폴더 라디오 선택/새 이름·공통 교육과정 선택·명시적 저장을 담당하며 저장 성공 전 폴더 복사본만 변경한다. discover.js의 별도 내 자료 저장 이벤트와teacher-save-picker 로드는 제거했다. 새 자료는 지정 폴더로 저장하며 기존 shelf 키/자료는 보존한다. 최신 재현은 teacher-bring-browser-check.js와docs/r12-05-bring-check.json이고 앞선 두 버튼 검사 기록은 당시 UI다.

## 확장 영상 등록 — R12-08

`extensions/curi-segments/background.js`는 현재 연결 프로토콜3으로 응답하는 내 수업 탭을 찾고, 이전 탭이 응답하지 않으면 같은 주소의 새 연결 탭을 연다. 기존 사용자 탭을 강제로 새로고침하지 않는다. `popup.html/js`는 기존/새 수업 폴더의 영상만 추가 또는 영상·구간 함께 저장을 제공한다. 지식채널e와 다큐프라임의 같은 HTML5 본편만 지원하며 회차 선언·접근 상태·광고 대조는 유지한다.

`public/extension-library.js`는 폴더 목록/지문·충돌 확인·영상 등록 API·개인 폴더/구간 저장을 담당한다. `lesson-segments.js`는 연결 메시지를 전달하고, `lesson.js`는 등록 후 같은 탭/다른 탭에서 목록을 갱신한다. 새 폴더/영상 저장은 기존 개인 저장 키를 그대로 사용하며 실패 시 기존 값을 되돌리고 부분 저장 여부를 안내한다.

`POST /api/curibase/teacher-resources`는 같은 loopback Origin/Host의 명시적 교사 등록만 허용한다. `server/teacher-resource-store.js`는 `server/data/teacher-resources.sqlite`에 공개 제목·소개문·정규화 회차 URL·길이를 회차별 한 건으로 저장한다. 보유 공식 회차는 기존 ID/정보를 재사용하고 신규 자료는 `TEACHER-` ID·교사 등록/원문 재대조 필요 상태를 가진다. `discovery-catalog.js`가 파일 변경을 감지해 신규 자료를 일반·교사 검색과 자료 조회에 합친다. 사람 승인 JSON·자동 자산·공식 방송 DB를 덮어쓰지 않는다. 영상 파일·서명 재생 URL·로그인 정보는 저장하지 않는다.

`extension-library-check.js`는 격리 DB/개인 저장소의 등록·검색·중복·폴더/구간·충돌·롤백을, `extension-library-http-check.js`는 격리 서버의 등록·실제 교사 검색·Origin/관리자 경계를 확인한다. 기존 구간 재생 검사는 `segment-bookmarks-check.js`에서 이어간다.

### R12-05 내 수업 자료 통합 보기

teacher-library.js는 기존folders/shelf를 읽는 가상 위치와ID·제목·판본별 화면 묶음/검색을 담당한다. lesson.js는 전체/폴더/미지정 표시와 위치별 기존 저장/개인 메모·전체 내보내기를 제공한다. discover의 모음 대화상자/편집 코드는 제거하고lesson.html을단일 개인 자료 진입으로 사용한다. 구간/확장 프로그램 기능은 보존한다. 동일 자료라도 위치별selectionContexts/메모/폴더 기준/구간을 합치지 않으며 원천 키의 강제 이관은 없다. 검증은teacher-library-browser-check.js와docs/r12-05-library-check.json다.

R12-08 후속0.3.2: 애니키즈 `anikids.ebs.co.kr/vodCommon/show`의 같은 본편 검증과 공개 제목/프로그램을 지원한다. 팝업의 ‘저장할 영상’ 선택 ID를 시간 읽기/등록에 전달해 별도 EBS 창에 의존하지 않는다. Curi의 `curi.teacher.extension-save.v1`과 확장 저장소의 `lastSave`는 성공 응답/확인 후 완료 안내·시각을 유지하며 팝업 재열기·페이지 새로고침에서 마지막 저장 결과를 보여준다. 실패를 성공으로 기록하지 않는다.

## R12-02 지정 프로그램·NEWS 수집

collect-requested-programs.js는공식프로그램검색/회차목록과최신NEWS100경로를수집한다. official-program-parser.js는실행하지않는DOM의목록/기사본문/영상존재/공식회차식별을읽고일일전체방송을제외한다. news-source.js는기사URL경로와페이지의course/step/lect ID를검증한다. broadcast-store는기존EBS identity를유지해NEWS_CLIP을저장/clip으로반환한다. program-announcements.js는공식발표를collection/재생불가상태로구성하며공개회차를만들지않는다. discovery-catalog는목록등록/방송/발표를검색에합친다. 보호저장소/기존행/유형/재적재 검증은requested-programs-check.js, 산출물은docs/r12-02-*다.

### R12-05 두 단계 가져오기 카드 — 2026-10-15

teacher-folder-picker.js가 동일 dialog 안에서 교육과정 페이지와 폴더 페이지를 전환한다. 교육과정 선택(onChange)·선택 안 함은 2페이지로 이동하며 최종 저장만 기존 폴더 복사본을 저장한다. 공통 선택기의 clear는 이번 미저장 선택만 비우며 기존 개인 기록을 제거하지 않는다. curriculum-selection.css가 카드·스크롤·하단 두 원과 단계별 버튼을 담당한다.

## 검색 문장 근거·후보 검토 원문 — R12-03 (2026-10-15)

- `server/request-relevance.js`는 이미 발견한 후보의 주제와 같은 문장에 있는 역할·변화·원인·조건 표현을 관련순에 반영하고 우선 인용을 제공한다. `discovery-search.js`·`source-explanation.js`가 공유하며 필수 조건을 완화하거나 의미 충족/영상 적합성을 확정하지 않는다. 원문 부족·제목 반복·편성 안내를 소개문 내용 근거로 승격하지 않는다.
- `candidate-review.js`의 기존 B검토 입력은 최대10후보 각각의 소개문을 최대6,000 UTF-16 코드 단위까지 전달하고 잘림 여부·현재 원문 지문을 유지한다. 인용은 실제 전달한 범위에서 검사한다. 유료 호출은 기존 실행 승인/차단 경로를 따르며 이번 변경 자체는 모델을 실행하지 않는다.
- `request-relevance-check.js`는 같은 문장의 설명 단서·OR·늦은 내용 인용·API 전송 범위/이모지 경계를 확인한다. 기존 개발170의 동일자료 전후 결과는 `docs/r12-03-completeness-frozen-before170.json`·`docs/r12-03-completeness-verified170.json`에 별도로 기록한다.


## 전체 원문의 은유 제외 — R12-03 (2026-10-15)

`server/source-literal.js`는 제목·소개문의 은유/비교 범위와 같은 길이의 검색용 뷰를 제공한다. `keyword-context.js`의 개념/어휘, 일반/교사/구조화 검색·형태/지리/관계/검색 이유, `broadcast-semantic-index.js`의 기존 구절 채택과 기존 API 준비/응답 검사가 같은 범위를 사용한다. 원문/저장소는 보존하며 노출하는 인용 오프셋은 원문 기준이다. 새 콘텐츠에도 런타임에 같은 검사를 적용한다. 필드별 규칙 적용과 모든 암시적 은유의 의미 판별 완료는 구분한다.

`figurative-search-check.js`는 은유/실제 설명/혼합 문장/OR·제외/유사도 구절/기존 API 거절을 확인한다. `figurative-catalog-check.js`는 전량 필드·제외/보류 범위·실제 채택 태그·6저장소 지문을 읽기 전용으로 감사한다. [전체 결과/한계](R12_03_FIGURATIVE_SEARCH.md)를 따른다. 시맨틱 규칙 버전은2026-10-15.1이며 기존 시맨틱 SQLite를 재빌드한 것으로 주장하지 않는다.

## 설명 경고·제목 반복 보충 — R12-02 (2026-10-15)

`repair-descriptions-collect.js`는 고정한 전체 대상의 공식 HTML 메타데이터를 대조하고 기존 `source-enrichment.js`를 통해 같은 회차의 소개문과 전후 이력을 반영한다. 제공 방식 차이만 있는 기존 응답은 `description-repair-variants.js`가 재요청 없이 다시 대조한다. 실제 다른 회차나 더 빈약한 응답은 덮어쓰지 않는다.

`description-guide.js`의 표시 안내는 온전한 원문 문장 재구성·짧은 원문 단서 인용·제목/프로그램 정보의 세 경로를 구분한다. `sourceNote`는 작성 근거와 확인 범위, `sourceIssues`는 원래 소개의 문제를 보존한다. `metadataEvidence`는 제목/짧은 소개의 정확한 원문 위치이며 상세 내용의 검색 근거가 아니다. 공식 `summary`와 작성 `contentPreview.text`는 별도다. `description-guide-check.js`·`description-guide-browser-check.js`·`description-repair-audit.js`는 해당 계약·화면·전체 대상과 보호 저장소를 검사한다.

보충 후 태그 SQLite와 로컬 문장 의미 검색 SQLite를 갱신했다. 시맨틱 빌드의 규칙 지문에는 `source-literal.js`도 포함한다. 공식 원문으로만 색인을 생성하며 작성 안내는 검색·태그 입력에 포함하지 않는다. 색인 갱신은 검색 범위의 갱신이며 영상 내용·교사 효용의 의미 검증을 뜻하지 않는다.

## 표현이 다른 의미의 검색 — R12-03 (2026-10-15)

`source-meaning-rules.js`는 대상·동의 표현·설명 관계의 의미 단위를 정의하고 `source-meaning.js`가 공식 소개문에서 원문 위치와 함께 대조한다. 같은 의미 단위를 일반 단어·등록 개념·OR 분기에 사용하며 미지의 필수 소재를 제거하지 않는다. 제목 반복/편성 안내·표시용 작성 설명은 의미 추론 입력으로 사용하지 않는다. 은유가 가려진 뷰와 분야 문맥을 사용하고 `meaningMatches`를 `RELATED_SOURCE_CUE` 수준으로 반환한다. 이 단서를 기존 원문 개념 태그나 교육과정 승인으로 저장하지 않는다.

`discovery-intent.js`는 알려진 명사 끝을 조사로 자르지 않고 보유 의미 단위 전체로 분해되는 붙여쓰기만 정리한다. `discovery-search.js`는 각 필수 조건에 직접 원문 일치 또는 의미 단서를 요구하며 프로그램/지역/제외/관계 조건을 보존한다. 기존 로컬 문장 유사도는 계속 후보 순위에 사용한다. `source-explanation.js`·`teacher-source.js`는 대조한 검색어와 다른 원문 표현·원문 강조를 제공하고, 저장 사본의 인용 위치를 다시 확인한다.

계약/대조 사례는 `source-meaning-check.js`, 격리 화면은 `source-meaning-browser-check.js`, 고정 개발170은 기존 `request-development-evaluate.js`로 검증한다. 의미 단위와 문맥 규칙이 지원하지 않는 표현의 완전한 의미 이해는 별도이며 범용 모델 추론을 실행한 결과로 표시하지 않는다.


## R12 자연 다큐 공식 설명·의미·장르 — 2026-10-15

`nature-description-collect.js`는 자연·과학 다큐7프로그램의 짧은 소개를 대상으로 공식 보도자료 목록/상세를 HTML 파싱해 회차 후보와 응답 지문을 수집한다. 증거 스냅샷은 `docs/nature-source-cache/`, 조사/연결 결과는 `docs/r12-nature-*`다. `nature-description-apply.js`는 전체 제목·프로그램·방송/게시 시기와 단일 회차 문서를 대조하고 기존 source-supplements 저장 경로로 연결한다. `nature-detail-collect.js`는 보조 원문이 없는 짧은 회차의 공식 상세 메타를 대조하며 불일치는 적용하지 않는다. 영상/외부 스크립트를 실행하지 않는다.

`source-meaning.js`는 같은 회차로 확인한 보조 원문에도 동일 의미 대조를 적용하고 인용을 sourceSupplement/supplementId/출처로 분리한다. `source-explanation.js`·`content-preview.js`는 빈약한 소개에 공식 보조 설명의 문장 안내를 제공하되 원문 소개의 품질/승인을 바꾸지 않는다. 생태계·자연환경의 다른 설명 관계는 source-meaning-rules에 공통 정의한다. `discovery-request.js`는 일반 분야+다큐 표현과 명시적 프로그램 지정을 구분한다. `program-form-source.js`·`discovery-genre.js`는 동일 프로그램/강좌/단계의 공식 장르 선언을 별도 근거로 제공한다. 계약은 `nature-search-check.js`, 고정170은 기존 평가 실행기를 사용한다. [결과](R12_NATURE_SEARCH.md).


## 폴더별 수업 영상 리스트 — R12-15

`public/lesson-playlist.js`는 현재 폴더의 구간 ID 순서·드래그/버튼 정렬·리스트 추가/제거·총길이 표시를 담당한다. `lesson.js`는 현재 폴더와 기존 충돌 검사 저장 함수를 전달한다. `segment-ui.js`의 자료 구간 카드를 입력으로 사용하며, 재생은 기존 `lesson-segments.js`의 회차 재확인·확장 OPEN 경로를 따른다. `lesson-playlist.css`는 넓은 화면 오른쪽/좁은 화면 아래 배치와 카드 스타일을 담당한다. 순서는 기존 폴더 레코드의 videoPlaylist에 보존하고 원본 구간은 별도 저장소를 유지한다. 리스트 제거는 원본 삭제가 아니며 자동 연속 재생을 제공하지 않는다.

## 전체 빈 소개·오류 소개 재점검 — R12-02 (2026-10-15)

`description-recheck-collect.js`는 고정한 전체 미확보/오류 대상의 공식 회차·목록을 대조한다. 목록 중간 공백 페이지로 수집을 종료하지 않으며 `description-recheck-list-retry.js`가 범위 안의 공백 페이지를 다시 확인한다. `description-recheck-canonical.js`는 같은 courseId/lectId의 EBS 표준 주소가 안내한 공식 페이지를 대조한다. 기존 주소의 링크 상태를 이 결과로 덮어쓰지 않는다. `repair-descriptions-collect.js`의 공용 DOMParser는 회차 VideoObject URL과 같은 플레이어의 긴 소개 본문을 우선한다. 제목의 제공 방식 접두사·HTML 줄바꿈만 정리해 비교하며 실제 다른 제목은 보류한다.

`description-recheck-other.js`는 방송 테이블 밖의 목록/클립/등록 자료에 대한 실제 공식 설명을 대조한다. `source-description-patches.js`는 이를 방송 SQLite의 별도 보충 테이블에 저장하고 `discovery-catalog.js`가 원래 ID·제목·프로그램·URL·소개 지문이 유지된 경우만 읽어 적용한다. 승인 JSON/교사 등록 원본은 수정하지 않는다. 공식 원문 자체가 잘린 경우에는 완결된 문장만 `OFFICIAL_DESCRIPTION_EXCERPT`로 저장하고 전체 원문·발췌 위치를 보존한다. 화면은 전체 소개와 발췌를 구분한다. `description-recheck-cached-excerpts.js`는 보존한 공식 응답과 현재 원문이 정확히 같을 때만 완결 문장을 발췌하고 원래 sourceCheckedAt도 기록한다. 빈 글/제목 반복/잘림을 새 내용 설명으로 계산하지 않으며 제공 방식 표시만 다른 제목 반복도 같은 기준으로 판정한다.

수집은 공개 HTML 메타데이터만 사용하며 사이트 스크립트/영상/로그인을 실행하지 않는다. 접근 제한은 호스트별로 중단한다. `description-recheck-check.js`는 회차/출처/동시변경·발췌 위치 계약을 확인하고 `description-recheck-audit.js`는 전수 원문·변경 이력·FTS·보호 저장소 및 미확보 사유를 대조한다. 산출물은 `docs/r12-description-recheck-*`와 `docs/R12_DESCRIPTION_RECHECK.md`다.

## 자료 유형 표시 단순화 — R12-05 (2026-10-15)

`resource-presentation.js`는 기존 kind/navigation/genreEvidence를 읽어 자료 단위(VIDEO/LISTING), 확인된 내용 형식, 이동 대상을 분리한 응답용 파생값을 제공한다. 원본 kind·주소·승인·개인 저장 스키마는 변경하지 않는다. `teacher-filters.js`의 기본 all은 개별 영상이며 collection과 강의 목록(LESSON_LIST)/안내는 제외한다. listing 조건은 이를 함께 조회하고 lesson은 실제 개별 강의만 포함한다. 기존 collection 조건은 유지한다. `teacher-discovery.js`가 파생 메타데이터를 응답한다.

`discover.html`의 상단 유형 탭을 제거하고 상세 필터의 자료 유형 선택으로 이동했다. 0건 유형은 활성 조건을 제외하고 숨기며 활성 조건은 해제할 수 있다. `teacher-cards.js`는 방송 회차 태그를 반복하지 않고 클립과 목록만 표시한다. 목록 카드에는 개별 방송일·재생시간을 표시하지 않는다. `discovery-related.js`는 기본 검색의 listing facet 수로 접힌 관련 목록 영역을 표시하고 펼칠 때만 같은 질문/조건의 listing 검색을 수행한다. 목록은 자체 페이지·로딩/실패·재시도와 이전 응답 무효화를 갖는다. 새 검색은 목록을 닫고 요청/결과를 초기화한다. 가져오기 조회는 보조 목록 결과도 포함하며 실제 저장 경로는 기존 folderPicker를 재사용한다.

검증은 `resource-presentation-check.js`, `resource-types-browser-check.js`와 기존 정렬/필터·검색 초기화 계약을 사용한다. 실제 API/화면 및 기존 개발170의 실행 결과는 `docs/r12-05-resource-types-*`에 기록한다.

## 과거 장소·풍경 관계 검색 — R12-03 (2026-10-15)

`historical-place.js`는 기존 장소 어휘와 과거/옛날/예전 등의 요청을 읽고 장소·시대·거리/생활의 연결 단서를 대조한다. `request-content-plan.js`는 원래 요청과 장소 조건을 보존하고 ‘과거’ 단어의 단순 포함 대신 이 관계를 필수로 전달한다. 추가 주제와 명시적 시대 어휘는 삭제하지 않으며 방송/방영 시점을 찾는 요청과 과거 시험이라는 동음어는 이 조건으로 변환하지 않는다. 미등록 장소는 임의 추정하지 않고 기존 내용어 검색에 남긴다.

`discovery-search.js`는 같은 문장/절 또는 명시적인 역사 도시 표제의 연결 단서를 가진 자료만 통과시키고 직접적인 과거 모습 표현을 우선한다. 서로 다른 문장의 과거·서울, 다른 지역 여행의 출발점, 대학/병원 이름과 미래 학교의 배경 언급은 관계 근거로 승격하지 않는다. 회차 소개·유효한 공식 보조 설명·표제의 필드/발췌 위치를 보존하고 실제 기록 영상/촬영 장면을 확인한 것으로 표시하지 않는다. `request-search-plan.js`의 호출자 제공 구조화 해석도 원래 요청의 이 관계를 우회하지 못한다. `source-explanation.js`는 해당 관계 근거와 보조 원문 인용을 제공하며 보조 원문 일치를 프로그램명 일치로 잘못 안내하지 않는다.

역사 지명 연결은 과거 장소 요청 안에서만 허용한다. 서울의 한양/경성/한성부/경성부 연결은 [서울역사편찬원 타임라인](https://history.seoul.go.kr/archive/content.do?key=2211240006)을 근거로 보관하며 현대 행정 경계의 동일성 판정으로 확장하지 않는다. 일반 ‘서울’ 검색에는 역사 지명 확장을 강제로 적용하지 않는다. `historical-place-check.js`가 부정 사례/다른 장소/동음어/인용/구조화 경로를 확인한다. 산출물은 `docs/r12-historical-place-*`와 `docs/R12_HISTORICAL_PLACE_SEARCH.md`다. 원본/색인 DB는 변경하지 않는다.

## 교육과정 기반 공통 주제 필터 (R12-21)

`server/curriculum-topics.js`는 초3~4·초5~6·중1 참고의 공식214기준/73단원을 11묶음·38공통 주제에 대응한다. `units`는 공식 코드의 단원 접두사이며 전체 기준 대응표는 `docs/r12-curriculum-topics-check.json`에 남긴다. 중1은 기존 EBS 편성 참고 범위로, 학교별 편성·영상 학년 적합성·교육과정 연계 승인이 아니다.

`teacher-filters.js`는 별도 `curriculum-*` ID로 필터용 주제를 파생한다. 기존60개 시맨틱 개념·자연어 검색 순위·승인 저장소는 유지한다. 제목/소개·회차/판본/지문이 유효한 공식 보조 원문만 사용하고 프로그램명만으로 분류하지 않는다. `source-literal.js`와 `keyword-context.js`의 은유/부정/동음이의어 검사를 재사용한다. 분류는 제한된 어휘·문맥 규칙이며 영상 내용 전체를 이해한 판정은 아니다.

`discovery-filters.js`는 새11묶음/38주제 중 현재 조건에서 결과가 있는 선택지만 표시한다. 선택된0건 주제와 이전 개념/묶음 주소는 표시·해제 가능하게 유지한다. 검색에 학년 선택을 추가하지 않으며 단원 정보는 내부 대응으로만 제공한다. 기존60개 개념은 호환 API/주소에서 사용할 수 있지만 새 기본 목록에는 개별 인물/사물 항목으로 나열하지 않는다.

## 사용자 제공200문장 고정 검증 (R12-22)

`server/request-test200-evaluate.js`는 `docs/r12-search-test-200-input.json`과 원본 엑셀 SHA를 대조하고 같은 교사 검색 함수에 원문q만 전달한다. 표의 학년/교과/기대 유형은 주입하지 않으며 오류도 별도 행으로 기록한다. 새 실행명별 결과를 고정하고 기존 결과 덮어쓰기는 거절한다. `request-test200-analyze.js`는 고정 baseline과 별도 진단/메타데이터 점검 기록을 결합해 분포·인용 오프셋·변경 지문을 확인한다. 검색 런타임에서는 두 도구를 호출하지 않는다.

기존170개와 새200개는 별도 분모로 보존한다. 결과 있음은 관련성 정답이 아니며, 소개문 기반 에이전트 점검과 영상/교사 평가를 구분한다. 원본 엑셀/교사 평가 칸을 보존하고 `outputs/r12-search-test-200/`에 별도 결과 파일을 제공한다. 상세 방법·한계는 `docs/R12_SEARCH_TEST_200.md`를 따른다.

## 질문 문법과 원문 문맥의 공통 대조 (R12-23)

`request-language.js`는 질문/시청/수업 목적의 문법과 알려진 일상 동작 확장을 담당하며 `natural-request.js`에서 기존 내용 해석에 연결한다. 미지 명사·명시 AND/OR·제외·프로그램/형태/시간/지역은 보존한다. `source-context.js`는 제목·소개·검증된 공식 보조 원문과 실제 의미/태그 인용을 대조하며 제작자 경력·사진 첨부 안내, 동음이의어와 장소/대상·주제/문제·낮밤 변화 관계를 보수적으로 구분한다. 서로 다른 화제의 단어는 제목/같은 문장/450 UTF-16 이내 인접 두 문장의 연결 단서로 제한하며 별도 관계 검사는 유지한다. 원문/인용 오프셋/DB는 변경하지 않는다.

이 검사는 `discovery-search.js`의 후보 통과와 `request-search-plan.js`의 호출자 제공 구조화 해석 경로에 공통 적용한다. 의미 확장/시맨틱 태그의 검증된 인용과 역사 지명·프로그램명 탐색을 보존한다. `common-request-quality-check.js`가 원래 문장 외의 기능·긍정/부정/변형을 검사한다. 최종200/170은 별도 개발 회귀 집합으로 비교하며 내용 단서와 실제 영상/교사 적합성을 구분한다. 실행과 한계는 `docs/R12_COMMON_REQUEST_QUALITY.md`에 기록한다.

## 키워드 누락 보충 — R12-25

`keyword-vocabulary.js`는 내용 키워드가 없는 자료에 사용할 소재 어휘·원문 조리명·명시적 주제 명사구 후보를 제공한다. `content-keywords.js`가 기존 문맥/단어 경계 규칙으로 실제 소개문의 위치를 대조한 뒤 `SOURCE_KEYWORD`로 제공한다. 제목의 단어를 자유 추출하지 않으며 추정 상위 개념·학년·교육과정 승인을 만들지 않는다. 소개문에서 확보할 수 없으면 `supplement-search.js`가 회차·판본·지문을 확인한 공식 보조 원문만 대조한다.

`source-editorial.js`는 기존 `source-context.js`의 제작자 경력/첨부 안내 보류를 키워드 추출에서도 공유한다. 원문과 같은 길이의 공백 치환이며 인용 위치는 보존한다. `keyword-context.js`는 명사 설명형 어미를 별도 허용하되 부정·파생 부사·명시적인 비유 언어를 보류한다. `teacher-cards.js`는 키워드 툴팁에서 소개문/공식 보조 원문을 구분한다.

`missing-keywords-check.js`가 원문/부정/은유/회차 식별 계약을 확인한다. `missing-keywords-audit.js`는 고정 전후 목록과 원문 지문을 대조하고 모든 키워드 인용을 검사해 JSONL과 집계를 저장하며 기존 `semantic-build.js`로 파생 SQLite를 재생성한다. 공식 원본/승인/개인 자료/임베딩 DB는 보호한다. 추출 단어의 원문 존재는 의미·장면·수업 적합성의 사람 검수가 아니다.

## 검색 후 결과 필터의 대기 상태 — R12-26

`discovery-filters.js`는 결과에 종속된 주제/프로그램/자료 유형 등의 선택 가능 상태를 관리한다. `pending`은 이전 선택을 차단하고 `render`는 최신 선택지·건수를 반영한 후 활성화한다. `failed`는 이전 선택지를 지우고 검색 완료 전 선택을 차단한다. `discover.js`는 현재 요청 오류에서만 이 실패 처리를 호출한다. 요청 취소/이전 응답은 기존 요청 번호 검사를 유지한다. 검색 조건·분류·저장소는 바꾸지 않는다. `topic-filter-pending-browser-check.js`는 실제 API와 브라우저의 지연/오류 응답으로 검색 후 주제 전환의 상태를 검증한다.

## 검색 완료 후 결과 이동 — R12-28

`discover.js`는 현재 요청의 결과/오류 표시·로딩 해제 후 `curi-search-complete`를 보낸다. `curi-v11.js`는 사용자 조작으로 시작한 검색의 완료 이벤트에서 결과 영역을 열고 헤더로 이동한다. 제출/질문 예시 클릭 즉시 스크롤하지 않는다. 다음 프레임까지 새 검색이 시작되면 이전 스크롤도 생략한다. 기존 모션 줄이기 설정을 유지한다. `curi-v11.css`는 검색란 지우기/자료찾기 버튼 높이를44px로 통일한다.

## 자료를 찾은 검색어를 반영한 교육과정 후보 — R12-33

`curriculum-related.js`는 자료 제목/소개문q의 후보 안에서 선택적searchQuery와도 관련된 기준을 우선 정렬한다. 검색어만으로 내용 근거 없는 기준을 추가하지 않는다. `discover.js`는 현재 검색어를 `teacher-folder-picker.js`의 콜백으로 전달하며, 내 수업 자료에서는 기존resource.query를 재사용한다. `curriculum-selection.js`는 관련 후보의 서버 순서를 유지하고 전체 기준 보기의 공식 목록 순서와 구분한다. 개인 저장 형식/교육과정 승인 경로는 유지한다. 검토 범위와 의미 연결의 한계는 [검토 기록](R12_CURRICULUM_RELATED_REVIEW.md)을 따른다.

- `public/lesson-resource-actions.js`는 내 수업 자료 회차명 오른쪽 옵션 메뉴·폴더 이동창·위치별 삭제/이동을 담당한다. 메모/선택 교육과정/구간/리스트 참조를 함께 이동하며 폴더·미지정·구간 저장의 충돌 확인과 쓰기 실패 복구를 수행한다. 이미 동일 자료가 있는 목적지는 중복 방지를 위해 제외한다. `lesson.js`는 상태/저장 후 화면 갱신을 연결하고 공통 카드의 libraryActions 영역에 메뉴를 전달한다.

## 교육과정 후보의 전체 소개문·의미/범위 대조 — R12-34

`server/curriculum-content-match.js`는 공식 기준과 자료에 같은 의미 어휘를 적용하고 핵심 소재·지역/시대/대상·은유/부정 문맥과 원문 위치를 대조한다. 기준ID별 추천 목록을 만들지 않는다. `curriculum-related.js`는 이 결과를 원 검색어로 재정렬한다. `server.js`의 읽기 전용POST `/api/curi/curriculum/related`는 전체 제목/소개문 본문을 검증하고 기존GET q도 유지한다. `public/curriculum-selection.js`가 앞200자 절단을 제거하고 전체 본문을 전달한다. 원문·공식 기준·저장/승인 계약은 유지한다. 검증·제한은 [반영 기록](R12_CURRICULUM_CONTENT_MEANING.md)을 따른다.

- `server/set-admin-password.js`는 npm run admin:password의 로컬 터미널 설정 도구다. 비밀번호 숨김 입력/재입력과 기존 .env 설정 보존·원자 쓰기를 담당하며 입력값은 출력하지 않는다. 로그인 권한/세션 검증은 기존 admin-auth.js가 담당한다.

## EBS CURI 폴더 브랜드 — R12-36

- 확장 `popup.js`의 `clipResume`는 본편 확인을 대기하는 공개 회차 주소/식별/탭 정보를 보관하고 기존 `draft:identity`에 폴더·이름·시간·메모를 저장한다. 로그인 이동 중에도 초안을 보존하며 명시적 재확인은 같은 공개 회차만 대상으로 한다. EBS 로그인 정보는 읽지 않고 본편 플레이어 확인 성공으로 안내를 해제한다.

- 확장1.2.25부터 로그인 안내는 EBS 로그인/영상으로 돌아가기 두 버튼이다. `background.js`의 패널 전용 `RESUME_CLIP`이 같은 회차 탭 복귀/없으면 새 탭을 담당하고 미확인 본편만 새로고침한다. `popup.js`는 기존3초 주기에 대기 회차의 본편 준비를 확인해 같은 회차/현재 대기 문맥일 때만 초안을 복원한다. 별도 다시 확인 버튼/자동 저장은 없다.

- 확장 `panel-updates.js`는 설정된 Curi 주소의 `downloads/curi-segments-version.json`과 설치 manifest 버전을 비교해 상단 업데이트 안내를 관리한다. `package-segment-extension.js`가 ZIP 생성 성공 후 manifest 버전으로 공개 JSON을 생성한다. 시작/포커스/주소 변경/패널 표시 중 5분 간격으로 확인하며 확인 실패는 업데이트로 판정하지 않는다.

`public/brand/ebs-curi-folder.svg`는 헤더/파비콘/확장 아이콘의 폴더 정본이다. `server/render-brand-icons.js`가16/32/48/128px PNG를 만들고 `package-segment-extension.js`가 확장 자산과ZIP을 동기화한다. 호환용curi-symbol 계열은 점 없는 폴더로,curi-wordmark 계열은 폴더+EBS CURI 벡터로 갱신했다. 운영 웹과 확장 헤더는 텍스트와 장식용SVG를 조합해 표시한다. 확장1.2.18은 표시/아이콘 변경이며 권한·연결/저장 계약을 유지한다.


## R12-38 검색 정밀도 비교

- `server/request-relevance.js`는 제목·도입·주제 공출현과 내용의 중심성을 비교한다. 동일 소개문/제목 충돌은 자기 제목의 본문 근거까지 대조한다. 배경 언급은 낮게 정렬하고 정당한 긴 원문을 일괄 제거하지 않는다.
- `server/source-context.js`는 명시한 개념·대상·원리와 모든 내용군의 국소 근거를 확인한다. `source-editorial.js`는 같은 보도자료 안에 명시된 다른 회차의 구간을 같은 길이로 가린다. 원문·인용 위치·승인 데이터는 바꾸지 않는다.
- `server/demo-search-evaluate.js`·`demo-search-precision-compare.js`·`demo-search-precision-check.js`는 고정40개 입력/원문 진단·고정 라벨 비교·합성 양성/음성 검사를 담당한다. 실행 중단 시 `.partial.json`은 미완료 기록이며 성공 보고서와 구분한다.
- `server/demo-search-snapshot-preload.cjs`는 `CURI_EVAL_CODE_DIR`를 명시한 실험에서만 서버JS 고정 사본을 로드한다. 병행 수정은 보존하고, 전후 공통 코드와6저장소 지문을 같게 맞춘다. 운영 서버는 이 로더를 사용하지 않는다. 기록은 `docs/r12-38-precision-*`, 진행 결과는 [R12-38](../Tasks/task-r12-38-demo-search-quality.md)을 따른다.

## R12-40 기존370 실패 단계와 원문 비교

- `server/search-diagnostics.js`는 내부 평가의 최초 탈락·조건 일치 수를 기록한다. `search-bottleneck-evaluate.js`는 원문370/서버JS 사본/원천 지문을 고정하고 `search-bottleneck-compare.js`는 같은 원문 라벨의 상위3개와 기존 관련 자료 보존을 비교한다. 일반 HTTP에는 진단을 노출하지 않는다.
- `server/request-predicates.js`·`request-predicate-evidence.js`는 활용된 동작을 명사 조건과 구분하고 기존 의미 규칙·자기 회차 인용으로 대조한다. `source-polarity.js`는 명시적 부재와 대조를 구분한다. 지역 수식·제작/변화/차이의 대상 검사는 `source-context.js`에 모은다. 승인·원천 저장소는 변경하지 않는다.
- `server/search-coverage-audit.js`는 실패한 등록 표현의 전체 원문 단서를 읽기 전용으로 감사한다. 실행·판정의 범위와 제한적 결과는 [R12-40 보고](R12_SEARCH_BOTTLENECKS.md)에 기록한다.


### R12-40 후속 조건 분리와 교사 검색

- `server/request-ranking-context.js`는 학교급·학년·학기·교과 수업·활용 목적·설명 난이도·흥미 선호를 내용 투영에서 분리하고 원문 좌표를 보존한다. `request-context-roles.js`·`request-search-plan.js`가 로컬/외부 계약에도 같은 구분을 적용한다. 실제 내용의 어린이 인권·교육용 로봇, 지역·시대·관계·제외·길이·장면 조건은 별도로 보존한다. `teacher-filters.js`의 설명 방식 순위 신호는 통과 집합이나 학년 적합성을 결정하지 않는다.
- `server/query-condition-contract.js`는 후보를 보기 전에 질문을 분할하고 각 필수를 원문 내용 조각에 연결한다. 구조/분할 오류는 제한된 재해석을 거치며 내용 없는 질의를 전체 목록으로 바꾸지 않는다. `condition-source-packets.js`는 전체 소개문과 검색 자격이 있는 공식 보조 원문에서 구절을 골라 서버 번호·원문 좌표를 부여한다. `condition-source-review.js`는 모든 필수 조건에 유효한 원문 근거가 있는 후보만 통과시킨다. 인용이 존재한다는 사실만으로 의미 함의가 보증되지는 않는다.
- `server/supplement-search.js`는 원래 저장 검증을 통과한 보조 원문 중 프로그램명뿐인 회차 제목에는 정확한 회차 URL 또는 명시된 방송일 대조를 추가한다. 근접 게시일만으로 다른 회차의 내용을 검색에 섞지 않으며 저장 원문은 삭제·수정하지 않는다. `supplement-identity-audit.js`는 전체 카탈로그를 읽기 전용 감사한다.
- `server/teacher-model-search.js`는 질문 계약→혼합 후보 최대12개→원문 조건 검증을 연결한다. `teacher-discovery.js`는 일반 교사 GET 검색에서 정책이 활성일 때 이 결과를 적용하고 기존 필터·판본 묶음·교육과정·가져오기 화면을 유지한다. API/예산 실패는 검색 실패로 구분하며 미검증 결과를 자동 합치지 않는다. HEAD·빈 질문·기준 지정 검색은 새 유료 경로를 사용하지 않는다.
- `server/data/teacher-search-model-policy.json`의 비밀 없는 명시적 설정과 기존 누적 원장을 공유한다. 총$2를 자동 증액하지 않으며 다른 유료 기능의 전역 스위치를 켜지 않는다. `model-response-cache.js`는 질문·프롬프트·원문·모델이 같은 실제 완료 응답만 재사용하고 캐시는 Git에서 제외한다. `prime-teacher-model-cache.js`는 실제 실험 응답만 옮기며 평가 라벨은 검색에 넣지 않는다.
- `server/teacher-model-evaluate.js`는 실제 교사 함수로 같은370을 검증하고 코드/원천 지문·체크포인트를 보존한다. `teacher-model-compare.js`는 같은 원문 라벨을 재사용하고 새 상위3개를 미평가로 명시한다. `anchored-search-evaluate.js`·`anchored-search-compare.js`의 실험 비교 및 전체 질문 독립 재심사 시험은 별도 보존한다. 관련 자료를 과도하게 탈락시킨 전체 질문 일괄 재심사 경로는 운영에 사용하지 않는다.


### R12-40 기생 회차 누락 보강

- `server/broadcast-list-parser.js`는 수집기의 공식 목록 파싱을 공유한다. 각 회차 링크 내부의 제목·소개문·날짜만 읽고 지정 시리즈의 courseId/stepId·회차 ID를 대조한다. `broadcast-series-refresh.mjs`는 지정한 공식 시리즈 최대10개만 미리보기/갱신하고 수정 전 SQLite 일관 사본과 수집 결과를 남긴다. 기존 방송 수집기와 같은 파서·저장 경로를 사용하며 시리즈 설명을 모든 회차에 복사하지 않는다.
- `server/condition-candidate-recheck.js`는 내용 조건만 부분 판정이고 나머지 요구가 모두 yes인 후보 최대3개를 자기 원문만으로 독립 재검사한다. 질문에 없는 하위 유형 전체를 추가 필수로 요구하지 않도록 범주/구체적 사례의 관계를 명시하되, 단순 소재 언급은 통과 근거로 쓰지 않는다. 원문 번호·지문·전체 조건 검사는 기존과 동일하며 unknown/contradicted 및 장면/시간/제외/형식 부분 판정은 대상에서 제외한다. 추가 검사 실패 시 이미 검증한 결과를 유지한다. 모델/질문/원문이 같으면 재검사도 실제 응답 캐시를 재사용한다.
- 사용자의 후속 지시로 기생 보강 후370개 전체 검증은 실행하지 않는다. `docs/r12-40-parasitism-*`에는 공식 수집·회차별 보조 원문·합성 계약 및 관련3/동음이의어1/인권1의 국소 검색만 기록한다. 종전370 결과는 해당 판본의 이력이며 새 수정의 전체 성능으로 인용하지 않는다.
