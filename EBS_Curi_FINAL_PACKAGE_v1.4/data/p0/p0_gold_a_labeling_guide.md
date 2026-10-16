# Gold 1차 10건 사람 라벨 작성 안내

> 보관 안내 (2026-09-17): 제작자가 교육과정 전문가가 아닌 조건에 맞춰 평가 설계가 공식근거·기능검증 방식으로 전환됐다. 이 문서와 `p0_gold_a_labels.csv`는 작성하지 않는 이력 자료이며, 정답·튜닝·성능 수치에 사용하지 않는다. 현재 기준은 `p0_evaluation_design.md`다.

## 목적과 독립성

`p0_gold_a_labels.csv`의 10건에 대해 공개 콘텐츠 텍스트와 2022 개정 교육과정 원문만 근거로 독립 라벨을 작성한다. 이 파일은 최종 CuriMap 평가용 `TEST_GOLD` 후보이며, 작성 중·작성 후 모두 프롬프트, 후보 검색, 랭킹 조정과 오류 분석에 사용하지 않는다.

이 작업은 "AI의 답을 맞히기"가 아니라, **이 콘텐츠가 초등 5~6학년 사회 또는 과학의 어느 성취기준을 실제 수업 자료로 뒷받침할 수 있는지**를 사람의 근거와 함께 남기는 일이다. 한 항목이 애매하거나 연결되지 않아도 괜찮다. 억지로 기준을 고르지 말고 `NOT_MAPPABLE` 또는 `INDETERMINATE`로 기록하는 것이 올바른 Gold 라벨이다.

라벨을 작성하기 전과 작성 중에는 아래 자료를 열거나 보지 않는다.

- CuriMap의 결과·후보·로그
- Working Set의 `grade_band_seed`, `subject_seed`, `curriculum_unit_seed`, `curriculum_label_status` 열
- 기존 heuristic·Silver·AI 제안 라벨

## 시작 전: 파일을 여는 방법

1. 이 안내 파일을 한 창에 열어 둔다.
2. 다른 창에서 `p0_gold_a_labels.csv`를 연다. VS Code의 표 보기 확장, Excel, Numbers 중 편한 도구를 쓴다.
3. 스프레드시트 프로그램을 사용했다면 작업 후 **UTF-8 CSV 형식**으로 저장한다. 열을 삭제·이동하거나 첫 7개 열의 값과 `tuning_exclusion` 값을 바꾸지 않는다.
4. 사회·과학 성취기준 CSV를 각각 별도 탭으로 연다. 처음에는 모든 행을 읽을 필요 없이, 콘텐츠 내용을 읽은 뒤 관련 있어 보이는 단원부터 찾아도 된다.

한 번에 10건을 끝낼 필요는 없다. 한 행을 끝까지 작성하고 저장한 뒤 다음 행으로 넘어가면 된다.

## 참조 원문

공식 성취기준은 아래 사람 승인 QA 파일에서 **코드와 본문을 함께** 확인한다. 콘텐츠별 예측이나 후보가 들어 있지 않은 교육과정 원문 자료다.

- 사회: `p0_social_curriculum_qa_27.csv` 및 원문 `[별책7] 사회과 교육과정.pdf` 34~44쪽
- 과학: `p0_science_curriculum_qa_51.csv` 및 원문 `[별책9] 과학과 교육과정.pdf` 32~45쪽

각 행의 `content_source_url`과 가능한 경우 `description_source_url`을 열어 공개 콘텐츠 정보를 보강한다. 링크가 열리지 않거나 공개 텍스트가 충분하지 않으면 추측하지 말고 `INDETERMINATE`로 기록한다.

성취기준 CSV에서는 다음 네 열만 우선 보면 된다.

| 확인할 열 | 의미 |
| --- | --- |
| `unit_title` | 성취기준이 속한 단원 |
| `achievement_standard_id` | 입력지에 옮길 공식 ID |
| `achievement_standard` | 콘텐츠와 비교할 공식 문장 |
| `source_pdf_page` | 근거에 적을 원문 쪽수 |

`human_review_status=HUMAN_APPROVED`와 `usability_status=USABLE_HUMAN_APPROVED`인 행만 사용한다.

## 한 행을 작성하는 실제 순서

아래 과정을 `GOLD-A-01`부터 한 행씩 반복한다.

1. 입력지의 `title`과 `public_text`를 읽고, `content_source_url`을 연다. 설명이 더 필요할 때만 `description_source_url`도 연다.
2. 콘텐츠가 다루는 대상·현상·사건·문제를 짧게 메모한다. 이 메모는 별도 파일에 남길 필요가 없고, 나중에 `content_evidence`에 쓴다.
3. 사회·과학 성취기준 CSV에서 키워드나 단원명을 찾아 공식 문장을 읽는다. 제목이 비슷하다는 이유만으로 고르지 말고, **콘텐츠의 공개 설명이 그 성취기준의 핵심 학습 내용을 실제로 뒷받침하는지** 비교한다.
4. 아래 세 상태 중 하나를 선택한다.
   - 기준 하나 이상을 분명히 뒷받침하면 `MAPPABLE`
   - 정보는 충분하지만 해당하는 승인 성취기준이 없으면 `NOT_MAPPABLE`
   - 링크가 열리지 않거나 설명이 너무 짧아 판단 자체가 어려우면 `INDETERMINATE`
5. 선택한 상태에 맞춰 아래 열을 채우고 저장한다. 판단에 100% 확신이 없어도, 공개 정보로 판단 가능하면 `MAPPABLE` 또는 `NOT_MAPPABLE`을 고르고 이유를 남긴다.

## 열별로 무엇을 쓰는가

| 열 | 작성 방법 |
| --- | --- |
| `gold_item_id`~`description_source_url` | 이미 입력된 식별자·공개 텍스트·출처다. 수정하지 않는다. |
| `label_state` | 작성 전 `PENDING_HUMAN_REVIEW`, 한 행을 끝낸 뒤 `HUMAN_LABELED`로 바꾼다. |
| `mapping_decision` | `MAPPABLE`, `NOT_MAPPABLE`, `INDETERMINATE` 중 하나만 정확히 입력한다. |
| `subject` | `MAPPABLE`일 때만 `사회` 또는 `과학`을 입력한다. |
| `grade_band` | `MAPPABLE`일 때만 `초등 5~6학년군`을 그대로 입력한다. |
| `achievement_standard_ids` | `MAPPABLE`일 때만 공식 ID를 쓴다. 둘 이상이면 `ID1;ID2`처럼 세미콜론으로 나눈다. |
| `rationale` | 왜 적합·부적합·판단 불가인지 한두 문장으로 쓴다. |
| `content_evidence` | 콘텐츠 설명의 구체적 대상·현상·사건을 짧게 적는다. |
| `official_curriculum_evidence` | `공식 ID, p.쪽수: 핵심 내용` 형식으로 적는다. |
| `reviewed_on` | 검토한 날짜를 `2026-09-17`처럼 입력한다. |
| `reviewer_role_id` | 실명 대신 `REVIEWER_01`처럼 일관된 역할 ID를 쓴다. |
| `tuning_exclusion` | 이미 `EXCLUDED_FROM_TUNING`으로 설정돼 있다. 수정하지 않는다. |
| `labeler_attestation` | 아래 문장을 그대로 붙여 넣는다. |
| `review_notes` | 링크 오류, 정보 부족, 망설인 이유처럼 나중에 재검토할 정보를 쓴다. 없으면 비워 둔다. |

붙여 넣을 확인 문장:

```text
CuriMap 출력·기존 seed·heuristic·AI 라벨을 보지 않고 공개 텍스트와 공식 원문으로 검토함
```

## 상태별 최소 입력 예시

실제 콘텐츠나 실제 성취기준의 정답 예시가 아니라, **형식 예시**다.

### `MAPPABLE`

```text
mapping_decision: MAPPABLE
subject: 사회 또는 과학
grade_band: 초등 5~6학년군
achievement_standard_ids: 공식-ID-1;공식-ID-2
rationale: 공개 설명의 [대상·현상]이 성취기준의 [핵심 학습 내용]을 직접 다루므로 연계 가능하다고 판단함.
content_evidence: 공개 설명에 [대상·현상·사건]이 제시됨.
official_curriculum_evidence: 공식-ID-1, p.__: [성취기준 핵심 내용]
```

### `NOT_MAPPABLE`

```text
mapping_decision: NOT_MAPPABLE
subject: (비움)
grade_band: (비움)
achievement_standard_ids: (비움)
rationale: 콘텐츠 정보는 충분하지만 승인된 사회·과학 5~6학년군 성취기준의 핵심 내용과 직접 연결되지 않음.
content_evidence: 공개 설명에 [확인한 내용]이 제시됨.
official_curriculum_evidence: 검토한 단원·성취기준에 직접 해당하지 않음.
```

### `INDETERMINATE`

```text
mapping_decision: INDETERMINATE
rationale: 공개 설명이 부족하고 출처 링크에서도 학습 내용 확인이 불가능해 판단할 수 없음.
content_evidence: 제목 외에 확인 가능한 공개 정보 없음.
official_curriculum_evidence: 판단 불가이므로 특정 성취기준을 선택하지 않음.
review_notes: 링크 접속 시 [오류 또는 부족한 정보] 확인.
```

## 작성 뒤 확인할 사항

- `MAPPABLE` 행에 교과·학년군·성취기준 ID·근거·검토일·검토 역할이 모두 있는지 확인한다.
- `NOT_MAPPABLE`·`INDETERMINATE` 행에도 결정 사유·공개 텍스트 근거·검토일·검토 역할이 있는지 확인한다.
- 이 10건은 `PLANNED` 상태다. 2차 10건까지 작성하고 파생 관계·분할 중복·파일 해시를 확인하기 전에는 `LOCKED`로 바꾸지 않는다.
- 1인 검토이면 독립 2인 검토라고 기록하지 않는다. 두 번째 검토자가 생기면 Task 00-08에서 사전 지정 5건을 별도 파일로 독립 검토한다.
