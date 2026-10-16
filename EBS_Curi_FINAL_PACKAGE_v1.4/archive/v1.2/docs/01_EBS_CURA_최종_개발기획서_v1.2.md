# EBS CURA 최종 개발 기획서 v1.2

> **상태**: FINAL DEVELOPMENT BASELINE / Scope Freeze 권고  
> **프로젝트명**: EBS CURA — 2022 개정 교육과정 기반 콘텐츠 메타데이터 자동 매핑·검색 Agent  
> **서브 카피**: 방송 아카이브를 수업 자산으로 전환합니다.  
> **대회**: 2026 EBS AI Innovation Challenge — Track 1 (Now Agent)  
> **Pilot**: 2022 개정 교육과정 초등학교 5~6학년군 / 사회 중심 + 과학 확장 검증  
> **핵심 원칙**: 제품 비전은 크게, P0 구현범위는 작게, 운영·비용·개정 Lifecycle까지 고려해 설계

---

# 0. Executive Summary

EBS CURA는 **EBS 콘텐츠에 교육과정 메타데이터를 부여하는 반복 업무를 AI가 초안화하고, 사람이 검수하여 재사용 가능한 교육 데이터 자산으로 축적하는 Agent**다.

```text
EBS 콘텐츠
      ↓
AI Curriculum Mapping
      ↓
Human Review
      ↓
Verified Metadata
      ↓
교사 자연어 검색
      ↓
Top5 추천
      ↓
EBS 콘텐츠 상세/VOD
```

해커톤의 핵심은 추천서비스 자체가 아니라:

> **교육 메타데이터 구축 업무 자동화 → 검수 → 실제 검색 활용까지 이어지는 닫힌 루프**

를 실제로 구동하는 것이다.

장기적으로는 검색성 향상으로 기존 EBS 방송 아카이브의 이용을 늘리고, 유료·구독 콘텐츠의 **발견 및 전환 기회**까지 확대할 수 있는 기반을 제공한다.

---

# 1. 문제 정의

EBS 콘텐츠는 주로:

- 프로그램
- 회차
- 제목
- 소개
- 방송일

언어로 관리·노출된다.

교사는:

- 학교급
- 학년/학년군
- 교과
- 단원
- 성취기준
- 수업목적

언어로 자료를 찾는다.

따라서:

> **프로그램 중심 메타데이터와 교육과정 중심 탐색 언어 사이에 구조적 간극이 있다.**

수작업 시:

```text
콘텐츠 확인
→ 교육적 활용 가능성 판단
→ 관련 교과/학년 판단
→ 국가교육과정 검색
→ 성취기준 확인
→ 태그 입력
```

이 반복된다.

CURA는 이 과정을:

```text
Content Metadata
→ AI Candidate Mapping
→ Human Review
→ Reusable Verified Mapping
```

으로 바꾼다.

---

# 2. Track 1 포지셔닝

## 2.1 1차 사용자 — EBS 콘텐츠·교육 서비스 운영 담당자

Job to be Done:

> 기존 또는 신규 콘텐츠에 학교급·교과·교육과정·수업활용 태그를 부여할 때, 콘텐츠를 읽고 교육과정을 찾아 입력하는 반복업무를 줄이고 싶다.

## 2.2 2차 사용자 — 교사

Job to be Done:

> 프로그램명을 몰라도 “초등 5~6학년 사회 기후변화 수업” 같은 실제 수업언어로 적합한 EBS 콘텐츠를 찾고 싶다.

## 2.3 서비스 포지셔닝

```text
단순 교사용 검색서비스                 X

교육 Metadata 구축 Agent
        +
Human Review
        +
검수 결과를 활용하는 교사 Search       O
```

---

# 3. CURA의 핵심 차별성

1. **공식 2022 개정 국가교육과정**을 Canonical 기준으로 사용
2. 교과전용 Clip뿐 아니라 다큐·교양·시사·직업 VOD까지 교육자산화
3. Content 1건 ↔ 여러 Curriculum의 **N:M Mapping**
4. AI `confidence` + `mapping_reason`
5. **Human-in-the-loop**
6. 교육과정 근거가 있는 Explainable Recommendation
7. AI가 생성한 결과를 1회성 답변이 아니라 **DB 자산으로 축적·재사용**
8. 영상 원본을 반복 분석하지 않는 **낮은 변동비 구조**

---

# 4. 현재 데이터 준비 수준

현재 확보된 개발용 Raw/Seed Catalog:

| Source | Row |
|---|---:|
| 다큐프라임 | 409 |
| 다큐멘터리K | 12 |
| PD로그 | 92 |
| 공식 교과연계 Clip Seed | 68 |
| 전방위 교육콘텐츠 Seed | 23 |
| **합계** | **604** |

주의:
- 604 row는 동일한 콘텐츠 레벨만 모은 수치가 아니다.
- episode / clip / series / seed가 혼재한다.
- 기존 휴리스틱 태그는 Candidate 선정용이며 2022 Gold Mapping이 아니다.

Pilot 교육과정:

| Data | Count |
|---|---:|
| 초5~6 사회 성취기준 | 27 |
| 초5~6 과학 성취기준 | 51 |
| **합계** | **78** |

공식 PDF 자동추출본은 사람 QA 이후 Canonical DB에 적재한다.

---

# 5. Pilot Scope

## 5.1 학교급
- 초등학교
- 5~6학년군

## 5.2 주력 — 사회

우선:
- 기후변화·자연재해
- 인구
- 법·인권
- 민주주의·미디어
- 경제·노동·무역
- 한국사
- 세계지리
- 지구촌 문제

## 5.3 확장 검증 — 과학

우선:
- 생명
- 지구와 우주
- 과학과 사회

과학은 P0-a 안정화 후 10~20건 수준으로 확장성을 검증한다.

---

# 6. P0 Data Target

| 항목 | 최소 성공선 | 목표 |
|---|---:|---:|
| Search Working Set | 80 | 100~120 |
| Verified Mapping | 50 | 60~80 |
| 사회 Verified | 40 | 50~60 |
| 과학 확장 Sample | 10 | 20 |
| Gold Test | 20 | 30 |
| Demo 고정 Content | 5 | 5~10 |

**추가 수집보다 검수된 데이터 품질을 우선한다.**

---

# 7. 핵심 End-to-End Loop

```text
[운영자]
EBS URL / Seed
      ↓
Source Metadata
      ↓
Mapping Agent
      ↓
교육과정 후보 + confidence + reason
      ↓
승인 / 수정 / 제외
      ↓
Verified Mapping 저장
      ↓
[교사]
자연어 Query
      ↓
Query 구조화
      ↓
Verified Mapping + Vector Search
      ↓
Top5
      ↓
추천 이유 + 성취기준 + 접근조건 + EBS 링크
```

핵심 Demo는:

> **새 Content를 승인한 직후, 동일 Content가 교사용 검색 결과에 실제로 등장하는 장면**

이다.

---

# 8. Agent 구조

## 8.1 Mapping Agent

Input:

```text
title
program_name
description_raw
source_url
```

Process:

1. 핵심개념 추출
2. CURRICULUM_STANDARD 후보 Retrieval
3. 후보 내 적합도 판단
4. teaching_use 생성
5. mapping_reason 생성
6. confidence 생성

Guardrail:

> 성취기준을 자유 생성하지 않고 DB Candidate 안에서만 선택한다.

## 8.2 Curation Agent

Input:

> “초등 5~6학년 사회에서 기후변화와 자연재해를 설명할 영상”

Process:

1. 학년군/교과/개념/수업목적 구조화
2. Structured Filter
3. Verified Mapping 우선 Retrieval
4. Semantic Similarity
5. Ranking
6. 추천 이유 출력

---

# 9. P0 Core Database — 3 Tables 유지

## 9.1 CURRICULUM_STANDARD

```text
curriculum_id PK
curriculum_version
school_level
grade_band
subject
unit_title
achievement_standard_id
achievement_standard_text
source_document
source_page
qa_status

# Lifecycle-ready
effective_from
effective_to
```

P0에서는 `2022`만 사용하되 Version 필드를 처음부터 보존한다.

## 9.2 CONTENT

```text
content_id PK
program_name
title
description_raw
broadcast_date
source_url
thumbnail_url
source_type
metadata_source
collected_at
embedding

# Access Metadata
access_type
access_label_raw
access_verified_at
```

`access_type`:

```text
FREE
LOGIN_REQUIRED
SUBSCRIPTION
SINGLE_PURCHASE
SUBSCRIPTION_OR_PURCHASE
UNKNOWN
```

원칙:
- 실제 공개 페이지에서 확인한 값만 기록
- 확인되지 않으면 `UNKNOWN`
- 유료/무료 여부를 AI가 추정하지 않음

## 9.3 CONTENT_CURRICULUM_MAP

```text
mapping_id PK
content_id FK
curriculum_id FK
concepts
teaching_use
mapping_reason
ai_confidence
mapping_source
review_status
reviewed_at
```

Status:

```text
AI_GENERATED
REVIEW_REQUIRED
HUMAN_APPROVED
HUMAN_EDITED
REJECTED
```

---

# 10. 콘텐츠 접근조건과 구독 구조

EBS 공식 서비스에는 방송 구독권 및 구독 프로그램 구조가 존재하므로 CURA도 Content 접근조건을 표현할 수 있어야 한다.

다만:

> 특정 Content가 실제로 무료인지, 로그인만 필요한지, 구독 또는 단건구매가 필요한지는 **Content Row 단위로 검증**한다.

## P0

접근조건은 검색 Ranking에 사용하지 않는다.

표시 예:

```text
[무료]
[로그인 필요]
[구독]
[개별 구매]
[이용조건 확인 필요]
```

## P0-b

Demo Content 5~10건에 대해 접근조건을 실제 확인해 Badge로 표시할 수 있다.

## 장기

가격·상품·기간이력까지 관리하려면 별도 `CONTENT_ACCESS_HISTORY` 계층으로 확장한다.

---

# 11. 추천 Ranking

```text
Final Score
=
0.45 * Curriculum Match
+
0.35 * Semantic Similarity
+
0.20 * Mapping Trust
```

Mapping Trust:

```text
HUMAN_APPROVED / HUMAN_EDITED
> Silver
> AI_GENERATED
> Heuristic Seed
```

**access_type은 Ranking Score에 넣지 않는다.**

교육적으로 더 적합한 무료/유료 Content를 동일 기준으로 평가하고, 접근조건만 투명하게 안내한다.

---

# 12. UI — 4 Screen 유지

1. `/` Search
2. `/search` Top5
3. `/admin` URL/Seed Analyze
4. `/admin/review/:id` Mapping Review

Search Result Card:

```text
프로그램 / 제목

[초5~6] [사회] [구독]
#기후변화 #자연재해

관련 성취기준
...

추천 이유
...

활용유형
도입 / 사례

[EBS에서 보기]
```

`[구독]` Badge는 검증된 경우에만 표시한다.

---

# 13. EBS 교재·강좌 Bridge

장기적으로:

```text
국가교육과정
5~6학년군 / 성취기준
      ↓
EBS 교재·강좌
5학년 / 2학기 / 단원 / 차시
      ↓
교사 Query
```

Priority:
- P0-a: 없어도 됨
- P0-b: 1~2종 / 10~20 row
- P1: 확대

Core Loop를 지연시키지 않는다.

---

# 14. 비용·운영 설계

## 14.1 비용 원칙

1. 영상 원본이 아니라 텍스트 Metadata 중심
2. Mapping은 Content당 최초 1회 후 저장·재사용
3. Search에서 전체 Content를 다시 LLM에 넣지 않음
4. Verified Mapping + SQL Filter + Vector Search 우선
5. Mapping은 품질/비용 균형형 Model
6. Query Parsing은 저비용 Model 또는 Rule
7. 대량 Mapping은 비동기 Batch 처리 검토
8. 사용량·Token·비용 로그를 남겨 실제 TCO 측정

## 14.2 Model Routing 예

```text
Content Mapping
→ GPT-5.6 Terra 수준의 균형형 Model

Search Intent Parsing
→ GPT-5.6 Luna 수준의 저비용 Model
   또는 Rule/Dictionary

Retrieval
→ PostgreSQL + pgvector
```

Model명은 구현 시점의 품질/가격 테스트에 따라 교체 가능하다.

## 14.3 비용 로그

권장 Logging:

```text
request_type
model_name
input_tokens
cached_input_tokens
output_tokens
embedding_tokens
latency_ms
estimated_api_cost_usd
content_id
created_at
```

P0에서 별도 Dashboard는 만들지 않고 Server Log 또는 간단 집계로 충분하다.

---

# 15. 비용 시뮬레이션

> 아래는 현재 공개 API 가격과 가정에 따른 추정치이며 실제 청구액이 아니다.

가정 — Mapping 1건:

```text
Input 3,000 tokens
Output 600 tokens
```

100건 Mapping:

| Model Tier 예 | 약 API 비용 |
|---|---:|
| 저비용 Luna | $0.13 |
| 균형형 Terra | $1.32 |
| 고성능 Sol | $2.40 |

Mapping을 Batch 처리할 수 있는 경우 동기 API 대비 비용을 추가로 낮출 수 있다.

가정 — Search 1건:

```text
Input 1,200
Output 250
```

10,000회 Search:

| Model Tier 예 | 약 API 비용 |
|---|---:|
| Luna | $5.40 |
| Terra | $54 |

따라서 Search 경로에는 고성능 Model을 매번 호출하지 않는 것이 중요하다.

Embedding 예:

```text
1,000 Content × 500 tokens
= 500,000 tokens
```

`text-embedding-3-small` 수준에서는 약 `$0.01` 규모다.

## 외부 SaaS 기준 예

Prototype/독립운영 참고:
- Supabase Pro: 월 $25부터
- Vercel Pro: 월 $20

즉 소규모에서는 LLM보다 기본 Infra 고정비가 더 클 수 있다.

**실제 EBS Production은 사내 Infra·보안·SSO·운영정책에 따라 별도 산정한다.**

---

# 16. 교육과정 개정 Lifecycle

교육과정이 바뀔 때 전체 Content를 삭제·재매핑하지 않는다.

## 16.1 Versioning

```text
curriculum_version = 2022
curriculum_version = NEXT
```

구버전 Mapping도 보존한다.

## 16.2 Crosswalk

Old Standard ↔ New Standard 관계:

```text
UNCHANGED
MODIFIED
SPLIT
MERGED
NEW
REMOVED
```

## 16.3 Update Flow

```text
신규 교육과정 적재
      ↓
Old↔New Crosswalk
      ↓
변경 영향 Curriculum 식별
      ↓
연결 Content Impact Analysis
      ↓
UNCHANGED 자동 승계 후보
      ↓
변경 영향 Content만 Re-Mapping
      ↓
Low-confidence Human Review
      ↓
검색 Default Version 전환
```

---

# 17. 교육과정 개정 비용 관점

예시 가정:

- 총 Content 10,000건
- 동일 Token Usage
- Terra 수준 Mapping

전면 Re-Mapping API 비용:

```text
약 $132
```

실제 변경 영향 Content가 20%라면:

```text
2,000건 ≈ $26.4
```

Batch 가능 시 API 비용은 더 낮아질 수 있다.

그러나 장기 TCO에서 더 큰 요소는 Human Review다.

검수시간을 1~2분/건으로 가정하면:

```text
2,000건 = 약 33~67시간
10,000건 = 약 167~333시간
```

따라서 개정 대응의 핵심은:

> API 가격보다 **자동 승계율·영향범위 선별·confidence 기반 검수량 감소**

이다.

---

# 18. 기대효과

## 18.1 직접효과 — Metadata 업무시간 단축

AI가 Mapping 초안을 만들고 담당자는 검수 중심으로 전환한다.

## 18.2 기존 EBS 아카이브의 교육자산화

교과전용이 아닌 다큐·교양·직업·시사 Content도 교육과정 기준으로 재활용할 수 있다.

## 18.3 교사 탐색시간 단축 및 EBS 플랫폼 유입 확대

프로그램명을 몰라도 수업언어로 검색하게 함으로써 기존에 발견되지 않던 Content의 노출을 늘릴 수 있다.

## 18.4 유료·구독 콘텐츠 발견 및 전환 기회 확대

교육과정 검색 결과가 EBS 상세/VOD 페이지로 연결되면 기존 검색에서 발견하기 어려웠던 유료·구독 Content의 노출과 접근 기회도 늘어날 수 있다.

이는 해커톤 단계의 확정 수익효과가 아니라:

> **Discovery 개선 → 상세페이지 유입 → 구독/구매 전환 기회**

라는 사업적 가설이다.

## 18.5 유지·운영비 통제

- Mapping 재사용
- Vector Search 중심
- Model Routing
- Batch
- Curriculum Diff Update

로 AI 변동비와 개정 유지비를 통제한다.

## 18.6 정량 검증

Prototype:
- Mapping Hit@5
- Search Precision@5
- Metadata 작업시간 절감률
- Content 1건당 AI 처리비용

Service:
- Recommendation CTR
- Play Start Rate
- Archive Reuse Rate
- Paid Content CTR
- Subscription Page Visit
- Purchase/Subscription Conversion

---

# 19. KPI — 두 단계로 분리

## Hackathon KPI

1. Mapping Hit@5
2. Search Precision@5
3. Metadata 작업시간 절감률
4. Content당 AI API Cost

## Service KPI

1. Search → Content CTR
2. Play Start Rate
3. 기존 Archive 이용 증가
4. Paid/Subscription Content CTR
5. Subscription Page Visit
6. Subscription/Purchase Conversion
7. 필요 시 Retention

해커톤에서 Service KPI의 실제 개선을 주장하지 않는다.

---

# 20. P0-a — 반드시 구현

## Function
- URL/Seed Input
- Mapping Agent
- 공식 Curriculum 후보
- confidence / reason
- Review
- Save
- 자연어 Search
- Top5
- 추천 이유
- EBS URL

## Data
- Working Set ≥ 80
- Verified Mapping ≥ 50
- Gold ≥ 20

## Evidence
- Mapping Accuracy
- Search Precision
- Work Time Reduction
- API Cost sample

---

# 21. P0-b

- 과학 10~20건
- Cross-subject Demo
- 교재 Bridge 10~20 row
- Content access badge 5~10건 검증
- 단원 검색 Demo
- 프로그램 Filter

---

# 22. 명시적 Non-Goals

- 실제 결제 기능
- EBS 회원/구독 Account Integration
- 유료 Content 우선 Ranking
- 영상 원본 AI 분석
- 전 콘텐츠 Crawler
- 퀴즈·교안·활동지 자동생성
- 학생 개인화
- LMS
- 복잡한 Auth
- Dashboard

---

# 23. 4주 Plan

## Week 1 — Vertical Slice
`Content 1건 → Mapping → Review → Save → Search`

## Week 2 — Core Product
- Admin/Search UI
- Query Parsing
- Vector Search
- Ranking
- Top5

## Week 3 — Data & Evidence
- Verified 50+
- Gold 20+
- Search Query 8~10
- Accuracy
- Search Usefulness
- Time Reduction
- API Cost Log

Week 3 중반 이후 대형 기능 추가 금지.

## Week 4 — Hardening
- Seed Cache
- Error/Loading
- Cross-program Top5
- access badge는 가능한 범위만
- 3분 Demo
- 보고서
- 배포 안정화

---

# 24. 3분 Demo

## 0:00~0:20
문제:
> 콘텐츠는 프로그램 단위로 존재하지만 교사는 수업 단위로 찾습니다.

## 0:20~1:10
운영자:
`URL → AI Mapping → 공식 성취기준 → confidence → 승인`

## 1:10~2:05
교사:
자연어 Query → Top5  
**방금 승인한 Content가 검색 결과에 등장**

## 2:05~2:30
서로 다른 프로그램이 하나의 교육과정 Query에서 함께 검색됨

## 2:30~2:45
가능하면 N:M 사회+과학 또는 Verified 접근조건 Badge

## 2:45~3:00
실제 측정:
- Hit@5
- Precision@5
- Time Reduction
- 1건당 AI Cost

---

# 25. 장기 Architecture

```text
국가교육과정 Version
        ↓
Curriculum Crosswalk
        ↓
EBS 교재·강좌 Bridge
        ↓
EBS VOD / Clip
        ↓
Verified Curriculum Mapping
        ↓
Search / Recommendation
        ↓
Access Metadata
        ↓
EBS 상세/VOD
        ↓
이용·구독 KPI
```

향후:
- Clip Retrieval
- Teacher Copilot
- 서비스 로그·성과분석
- 구독/이용 Funnel 분석

---

# 26. 최종 메시지

### 내부 업무
**콘텐츠를 읽고 교육과정을 찾아 태그를 입력하는 반복업무를 AI가 초안화하고, 사람은 검수합니다.**

### 교사
**프로그램명을 몰라도 수업 주제만으로 EBS 콘텐츠를 찾습니다.**

### EBS 자산
**찾히지 않던 기존 방송 아카이브를 교육과정 기준의 재사용 가능한 교육자산으로 전환합니다.**

### 운영
**한 번 생성·검수한 Mapping을 재사용하고, 교육과정 개정 시 변경 영향 Content만 다시 처리해 유지비를 통제합니다.**

### Business
**콘텐츠 발견성을 높여 EBS 플랫폼 이용을 확대하고, 장기적으로는 유료·구독 콘텐츠의 전환 기회를 넓힙니다.**

### 한 줄
**프로그램을 찾는 EBS에서, 수업을 찾는 EBS로.**
