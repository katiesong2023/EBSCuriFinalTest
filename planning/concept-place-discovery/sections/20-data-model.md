# 데이터 모델과 주요 엔티티

실제 테이블·키·관계는 [ERD](../../../docs/ERD.md)에 정리했다. 기존 제안의 독립 Evidence/Relation/DiscoveryReview 테이블을 모두 구현했다고 표현하지 않는다.

| 저장소 | 실제 엔티티 | 역할 |
| --- | --- | --- |
| broadcast-programs.json | programs, courseId, 출처·확인일·표시 회차 수 | 공식 프로그램/시즌 인벤토리 |
| broadcast-catalog.sqlite | episodes, pages, link_checks, episode_text | 고유 회차·수집 체크포인트·도착 대조·FTS 저장 |
| semantic-layer.sqlite | builds, concepts, resources, tags | 버전·내용 지문·직접 언급·추론 후보의 재현 스냅샷 |
| discovery-geography.json | concepts, places, resources | 기존 출처 기반 지리 연결 |
| curi-store.json | contents, curriculumStandards, mappingRuns, contentCurriculumMaps, verifiedAssets 등 | 원본 Working Set·교육과정·사람 판단·승인 검색 |

SOURCE_MENTION은 제목 또는 소개문 필드의 위치·구절·출처로 확인되는 표현이다. INFERRED_CANDIDATE는 편집한 상위 개념 후보로 기본 검색의 직접 일치 근거에 포함하지 않는다. 공식 성취기준과 이 편집 어휘는 별개다.

각 자료의 내용 지문과 규칙 버전을 보존한다. 제목 반복 소개문은 충분한 설명으로 세지 않는다. 원문이 바뀌면 메모리 태그를 갱신하고 디스크 스냅샷은 빌드 명령으로 재생성한다. 별도 승인 이력을 수정하지 않는다. 구간·재생시간·자막·좌표는 확보하지 못했으면 만들지 않는다.
