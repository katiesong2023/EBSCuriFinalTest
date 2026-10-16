# P0 후보 풀 360건 감사 결과

- 확인일: 2026-09-16
- 원본: `data/raw/ebs_content_unified_604_with_status.csv` (604건)
- 후보 계층: `data/p0/p0_candidate_pool_360.csv` (360건)
- 원본 Raw 파일은 수정하지 않았다.

## 구성

| 출처 | 건수 | 분류 | 매핑 상태 |
| --- | ---: | --- | --- |
| EBS 초등 교과연계 클립 | 40 | A_OFFICIAL_CLIP_SEED | MAPPING_READY_SILVER |
| PD로그 | 92 | B_SYNOPSIS_VOD | MAPPING_READY_TEXT |
| EBS 다큐프라임 | 228 | C_DOCUPRIME_ENRICH | NOT_READY_NEEDS_DESCRIPTION |
| 합계 | 360 | 후보 풀 | - |

클립은 P0 범위인 초등 5·6학년 사회·과학 40건만 포함했다. 다큐프라임 228건은 기존 15건을 포함해 Raw 행 순서로 결정적으로 확장했다.

## 구조·품질 점검

| 점검 항목 | 결과 | 판정 |
| --- | ---: | --- |
| `record_id` 고유 | 360/360 | 통과 |
| Candidate `content_id` 고유 | 360/360 | 통과 |
| 제목 비어 있지 않음 | 360/360 | 통과 |
| synopsis 비어 있지 않음 | 92/360 | 텍스트 보강 필요 여부로 분리 |
| 학년군 비어 있지 않음 | 360/360 | 통과 |
| 교과 비어 있지 않음 | 360/360 | 통과 |
| 단원/차시 비어 있지 않음 | 40/360 | 출처별 차이 기록 |
| `source_url` 비어 있지 않음 | 360/360 | 통과 |

## 상태 분류

- 사용 가능 후보 계층(사람 검수 전): `MAPPING_READY_SILVER` 40건 + `MAPPING_READY_TEXT` 92건 = 132건
- 소개문 보강 필요: `NOT_READY_NEEDS_DESCRIPTION` 228건
- 구조적 제외: 0건. 단, 사용 가능 132건도 사람 검수 전에는 CuriBase나 Gold 정답으로 사용하지 않는다.
- 소개문 보강 플래그: `Y` 228건 / `N` 132건
- 딥링크 보강 플래그: `Y` 132건 / `N` 228건

## 링크·라벨 품질

- 링크 품질: `COURSE_PAGE` 40건, `LIST_PAGE` 92건, `STEP_SPECIFIC_PAGE` 228건.
- 클립 40건은 공식 교과연계 Silver이며 2022 교육과정 정합성 재검토 전 정답으로 사용하지 않는다.
- PD로그·다큐프라임 320건은 제목/소개문 기반 휴리스틱 후보이며 Gold 정답으로 사용하지 않는다.
- 후보 풀 360건은 Working Set 200~250건 및 초기 CuriBase 100~150건보다 상위의 후보 계층이다. 후속 소개문 보강·공식 원문 QA·사람 검수에서 실제 적격 건수를 다시 확정한다.
