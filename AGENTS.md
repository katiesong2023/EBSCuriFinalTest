# AGENTS.md

이 문서는 `EBS_Curi` 저장소에서 작업하는 AI 에이전트의 시작 문서입니다.

## 프로젝트 개요

- 주제: 2022 개정 교육과정 기반 EBS 교육 메타데이터 구축·활용 Agent 서비스
- 유형: CuriMap 교육과정 연계, 사람 검수, CuriBase 저장, Curi 교사 자연어 검색·추천을 연결하는 웹서비스 MVP
- 주요 환경: HTML, CSS, JavaScript, Node.js 기반 웹 화면·서버, LLM API, 공식 교육과정·EBS 텍스트 메타데이터, 검증 메타데이터 저장소·의미 검색 (세부 기술 구성은 준비 task에서 확정)
- 프로젝트명: `EBS_Curi`
- 방식: 사회·과학을 동등한 핵심 범위로 두고 공식 방송 수집 → 근거 시맨틱 레이어 → 자연어 탐색 → 원문·사람 확인 → 필요 시 프로덕션 추론 순으로 진행합니다. R09-01에서 기존 초등 5~6학년에 초등 3~4학년·중학교 1학년을 추가하여 공식 기준214개를 제공하며 사용자 결과 확인을 대기합니다. 중1은 EBS 뉴런 편성 참고이고 학교별 배치는 미확인입니다. 학년은 이용자 문맥이며 수집 제한이나 자동 적합성 판정이 아닙니다. 기존 CuriMap → 사람 검수 → CuriBase 승인 경로는 별도로 보존합니다. 현재 순서·상태는 docs/PLANS.md를 따릅니다.

## 문서 맵

- `AGENTS.md`: AI 에이전트용 시작 문서, 프로젝트 개요와 문서 맵
- `docs/ARCHITECTURE.md`: 프로젝트 구조, 폴더 책임, 파일 배치 원칙
- `docs/STYLEGUIDE.md`: HTML/CSS/JavaScript 작업 규칙
- `docs/TESTING.md`: 검증 기준과 실행 확인 원칙
- `docs/HARNESS.md`: 하네스 엔지니어링 개념 안내, 이탈 대응, 규칙 추가 판단 기준
- `docs/WORKFLOW.md`: task 진행 순서와 상태 관리 규칙
- `docs/ERD.md`: 방송 SQLite·시맨틱 SQLite·기존 승인 JSON의 실제 저장 구조
- `docs/PLANS.md`: 단계별 진행 현황과 최근 작업 로그
- `docs/TASK_WRITING.md`: task 문서 작성과 구현 후 갱신 규칙
- `Tasks/_template.md`: 새 task 문서 작성용 최소 복사 템플릿

## 먼저 읽을 문서

세션 첫 작업 시작 전 아래 문서를 순서대로 읽습니다.

1. `docs/HARNESS.md`
2. `docs/WORKFLOW.md`
3. `docs/PLANS.md`

같은 세션에서 이미 읽은 문서는 다시 읽지 않습니다. 재확인이 필요하면 관련 구간만 조회합니다. 다만 task 전환, 문서 충돌, 상태 불일치처럼 흐름 판단에 영향이 있는 경우에는 관련 문서를 다시 넓게 확인할 수 있습니다.

이후 같은 세션에서는 아래 상황에서 관련 문서를 기준으로 판단합니다.

- 구조 변경 또는 새 폴더/화면 추가 전 → `docs/ARCHITECTURE.md`
- 코드 수정 또는 새 화면 구현 전 → `docs/STYLEGUIDE.md`
- 검증 단계 전 → `docs/TESTING.md`
- task 시작, 전환, 상태 갱신 전 → `docs/WORKFLOW.md`, `docs/PLANS.md`
- task 문서 작성 또는 갱신 전 → `docs/TASK_WRITING.md`, `Tasks/_template.md`
- 하네스 규칙 추가, 문서 절차 조정, 에이전트 흐름 이탈 대응, `.md` 문서 규칙 위반 발견 시 → 답변이나 수정 제안 전에 반드시 `docs/HARNESS.md`를 다시 확인한다.


## 문서 처리 규칙

- Markdown 문서는 UTF-8로 저장합니다.
- PowerShell에서 Markdown을 읽을 때는 `Get-Content -Encoding UTF8`을 사용합니다.
