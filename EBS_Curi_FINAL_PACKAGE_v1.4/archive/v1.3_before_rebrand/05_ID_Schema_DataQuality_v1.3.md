# ID / Schema / Data Quality v1.3

## Core Table
- CURRICULUM_STANDARD
- CONTENT
- CONTENT_CURRICULUM_MAP

## Stable ID
Raw의 `record_id/course_id/step_id`는 Source ID로 보존.
P0 `content_id`는 CURA 내부 Stable ID.

URL을 PK로 사용하지 않는다.

## Granularity
program_series / episode / clip / episode_seed가 혼재.

추천 결과는 실제 사용자가 열 수 있는 episode/clip 중심으로 정리한다.

## Text Quality
우선순위:

`title + synopsis/description`
>
`title + curriculum unit`
>
`title only`

title only는 Gold Mapping에 사용하지 않는 것을 권장.

## Provenance
- SOURCE
- SILVER_EXISTING_LINKAGE
- AI_GENERATED
- HUMAN_VERIFIED

## Access/TCO/Lifecycle
v1.2 설계는 유지하되 P0 Main Scope는 아님.
