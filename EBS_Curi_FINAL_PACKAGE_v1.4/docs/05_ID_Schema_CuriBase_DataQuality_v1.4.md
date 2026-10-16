# Curi ID / CuriBase Schema / Data Quality v1.4

## 1. Core Data Structure

### CURRICULUM_STANDARD
공식 국가교육과정.

### CONTENT
EBS Source Metadata.

### CONTENT_CURRICULUM_MAP
CuriMap이 생성하고 사람이 검수한 Content ↔ Curriculum 관계.

물리 DB Table명은 개발 편의를 위해 유지할 수 있지만,
서비스 관점에서는 이 검증 Metadata 저장영역 전체를 **CuriBase**라고 부른다.

## 2. CuriBase에 들어가는 핵심 데이터

- EBS Content ID
- 프로그램/제목/설명
- 학년군
- 교과
- 핵심개념
- 성취기준
- 연계근거
- 수업활용
- Review Status
- Provenance
- Curriculum Version

## 3. ID

P0 내부 Content ID Prefix:
`CURI-`

Source:
- record_id
- course_id
- step_id

는 별도 보존.

## 4. Provenance

- SOURCE
- SILVER_EXISTING_LINKAGE
- AI_GENERATED_BY_CURIMAP
- HUMAN_VERIFIED

## 5. Review Status

- AI_GENERATED
- REVIEW_REQUIRED
- HUMAN_APPROVED
- HUMAN_EDITED
- REJECTED

## 6. Data Quality Gate

CuriBase의 Verified 영역에 들어가기 전:
- Source 확인
- Text 충분성
- Content Granularity
- Curriculum ID 유효성
- Human Review

확인.
