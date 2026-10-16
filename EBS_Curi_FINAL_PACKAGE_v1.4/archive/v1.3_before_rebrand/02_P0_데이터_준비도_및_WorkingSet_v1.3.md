# P0 데이터 준비도 및 Working Set v1.3

## Raw Catalog

전체: **604**

- program_series: 421
- episode: 92
- clip: 68
- episode_seed: 23
- synopsis 존재: **92/604 (15.2%)**
- raw content_id 존재: **0/604**
- record_id unique: **604/604**
- source_url unique: **444**

## v1.3 P0 Candidate

### Mapping-ready Seed 75
- 공식 초5·6 사회/과학 Clip: **40**
- synopsis가 있는 PD로그 우선 Candidate: **35**

파일:
`data/p0/p0_mapping_ready_seed_75.csv`

### Enrichment Queue 15
다큐프라임 후보.
현재 설명 Text가 부족하므로 상세 소개문 확보 후 사용.

파일:
`data/p0/p0_enrichment_queue_15.csv`

### Candidate Pool 90
`data/p0/p0_candidate_pool_90.csv`

## Mapping-ready Gate
- Stable content_id
- title
- 충분한 description
- Source provenance
- granularity 확인
- link quality 기록
- label status 구분

## ID
Raw 원본을 수정하지 않고 P0 Candidate Layer에서 deterministic UUID 기반 ID 생성.

기준:
`source_group | record_id`

## URL Quality
- 다큐프라임: STEP_SPECIFIC_PAGE
- PD로그: LIST_PAGE
- 교과연계 Clip: COURSE_PAGE

따라서 Mapping Ready와 Demo Deep-link Ready를 구분한다.

## Gold
- Official Clip은 Silver Benchmark
- Gold는 AI 실행 전에 독립 Human Label
- 20~30 Hold-out 권장
