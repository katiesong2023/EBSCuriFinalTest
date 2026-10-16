# Curi 최종 개발 기획서 v1.4

> **프로젝트명**: Curi – 2022 개정 교육과정 기반 EBS 교육 메타데이터 구축·활용 Agent  
> **브랜드 구조**: Curi / CuriMap / CuriBase  
> **Track**: Track 1 (Now Agent)  
> **Pilot**: 초등학교 5~6학년군 사회·과학, 교육과정형 강좌와 일반 방송형 아카이브의 이중 축
> **핵심 원칙**: 기능 확장보다 데이터 품질·검수·실측 효과를 우선

---

# 1. 한 문장 정의

> **CuriMap이 EBS 콘텐츠와 공식 교육과정을 연결하고, 사람이 검수한 결과를 CuriBase에 축적해, Curi가 교사의 수업 검색에 재사용하는 서비스입니다.**

---

# 2. 문제 정의

EBS 일반 방송·VOD의 공개 Metadata는 주로:

- 프로그램
- 제목
- 방송일
- ID
- URL
- 이미지
- 일부 수치 정보

중심이다.

반면 학교용 공식 교과연계 Clip에는:

- 학년
- 교과
- 단원/차시

같은 교육 문맥 Metadata가 존재한다.

따라서 문제는:

> **일반 EBS 아카이브까지 학교교육에서 검색·재활용하려면 교육과정 기준의 교육 메타데이터 Layer가 필요하다.**

Curi는 이 과정에서 콘텐츠를 일일이 보고 교육과정을 찾아 연결하는 작업의 초안을 **CuriMap**이 자동 생성하도록 한다.

---

# 3. 서비스 구조

```text
EBS 콘텐츠
   ↓
CuriMap
교육과정 연계 후보 생성
- 학년군
- 교과
- 핵심개념
- 성취기준
- 연계근거
- 수업활용
   ↓
Human Review
승인 / 수정 / 제외
   ↓
CuriBase
검증된 교육 메타데이터 저장
   ↓
Curi
교사 자연어 검색 및 추천
```

핵심 문장:

> **CuriMap으로 연결하고, CuriBase에 쌓아, Curi에서 찾습니다.**

---

# 4. 각 구성요소의 역할

## 4.1 CuriMap — 교육과정 연계 Agent

Input:
- title
- program_name
- description/synopsis
- source_url

Process:
1. 핵심개념 추출
2. 공식 교육과정 후보 Retrieval
3. 적합 후보 선택
4. 연계근거 생성
5. 수업 활용방식 제안
6. 검수 우선순위 참고값 생성

Guardrail:
> CuriMap은 성취기준을 자유롭게 만들어내지 않고 공식 Curriculum DB 후보 안에서만 선택한다.

---

## 4.2 CuriBase — 검증된 교육 Metadata 저장소

CuriMap 결과를 Human Review 후 저장한다.

주요 자산:
- 콘텐츠 Source Metadata
- 학교급/학년군
- 교과
- 핵심개념
- 성취기준
- 연계근거
- 수업 활용유형
- 검수상태
- Curriculum Version
- Provenance

CuriBase의 핵심가치:

> **AI 답변을 일회성 응답으로 버리지 않고, 재사용 가능한 검증 Metadata 자산으로 축적한다.**

---

## 4.3 Curi — 교사 검색·큐레이션 서비스

교사는 프로그램명을 몰라도:

> “초등 5~6학년 사회 기후변화 수업 영상”

처럼 실제 수업 언어로 검색한다.

Curi는 CuriBase의 검증 데이터와 Semantic Search를 활용해 최소 연관도 기준을 통과한 결과 전체를 순위화하고 10개 단위 페이지로 제공한다. 기본은 관련도순이며 방송일은 동점 보조 기준으로 사용한다. 사용자는 기준 통과 결과 안에서 최신 방송순·오래된 방송순으로 바꿀 수 있다.

결과 Card:
- 프로그램/제목
- 학년군/교과
- 핵심개념
- 관련 성취기준
- 추천근거
- 수업 활용유형
- 접근조건
- EBS 원문 링크

---

# 5. 차별성

일반 아카이브 검색·자동 Tagging과 구분되는 점:

1. **공식 2022 개정 국가교육과정**을 Canonical 기준으로 사용
2. CuriMap이 LLM 자유생성이 아니라 공식 Candidate 안에서 연계
3. 콘텐츠 1건과 여러 성취기준의 N:M 관계 지원
4. Human Review 필수
5. 검수 결과를 CuriBase에 누적
6. 검증 데이터를 Curi 검색에서 즉시 재사용
7. Source / Silver / AI / Verified 분리
8. 향후 Curriculum Version 관리 가능

핵심 차별화 문장:

> **Curi는 검색 Agent 하나가 아니라, 공식 교육과정에 Grounding된 검증 교육 Metadata를 구축·축적·활용하는 구조입니다.**

---

# 6. 데이터 전략

현재 Raw/Seed Catalog:
- 전체 604건

하지만 604건 전체를 동일한 Mapping 품질로 취급하지 않는다.

P0 Candidate:
- Mapping-ready Seed 75건
- Enrichment Queue 15건
- Candidate Pool 90건

목표:
- Working Set 80~100
- Human Verified 50~80
- 검증용 정답셋(Gold Set) 20~30
- Demo 5~10

---

# 7. CuriBase Data Quality Gate

CuriBase의 Verified Metadata로 들어가기 전:

- Stable content_id
- title
- 충분한 description
- Source provenance
- 콘텐츠 단위 확인
- link quality
- 기존 Label 상태
- Human Review

를 확인한다.

Raw Dataset의 `content_id`는 비어 있었기 때문에 P0 Candidate Layer에서 deterministic internal ID를 부여한다.

Prefix:
`CURI-`

---

# 8. 검증용 정답셋(Gold Set)

Gold Set은:

> **CuriMap의 연계 정확도를 평가하기 위해 AI 결과를 보기 전에 사람이 독립적으로 만든 정답 데이터**

다.

권장:
- 20~30건
- AI 실행 전 라벨링
- Prompt/검색 Ranking 튜닝에 사용하지 않는 Hold-out
- 가능하면 일부 2인 검수

기존 공식 교과연계 Clip의 연계정보는 2022 개정 정합성 재검증 전까지 Silver로 관리한다.

---

# 9. CuriMap 평가

필수:
- Subject Accuracy
- Grade-band Accuracy
- Hit@3
- Hit@5

F1은 모든 관련 성취기준을 충분히 라벨링한 경우에만 사용한다.

CuriMap의 confidence는 정확도 확률로 표현하지 않고:

> **사람 검수 우선순위 참고값**

으로 사용한다.

---

# 10. Curi 검색 평가

Query 15~20개:

1. 학년/교과 직접형
2. 개념 중심형
3. 수업 활용목적형
4. 모호한 자연어형
5. Negative Query

상위·후속 결과 평가:

- 2 = 수업에 직접 활용 가능
- 1 = 보조자료로 활용 가능
- 0 = 부적합

Metrics:
- Precision@5
- Precision@10
- 평균 유용성@5·@10
- Query Success@10
- 11위 이후 결과 표본 Precision
- Negative 빈 결과율

---

# 11. 검색 Ranking

P0:

```text
학년군·교과 Hard Filter
       ↓
Semantic Similarity
       ↓
Minimum Relevance Threshold
       ↓
관련도순, 방송일 동점 보조 또는 사용자 선택 날짜순
```

고정 Weight를 사용할 경우:
- Dev Set에서 조정
- Hold-out Test에서는 고정
- 초기 휴리스틱임을 명시

---

# 12. 현업 Baseline을 확보하기 어려운 경우

확인되지 않은:

- 실제 담당부서 처리량
- 월 콘텐츠 처리건수
- 현재 1건당 업무시간

을 사실처럼 주장하지 않는다.

대신:

### Evidence 1
일반 VOD와 공식 교과연계 Clip의 Metadata 구조 차이

### Evidence 2
CuriMap으로 새 Metadata가 생성되는 실제 Prototype

### Evidence 3
동일 Curriculum 연계 Task의 Controlled Benchmark

비교:

```text
수작업
공식 Curriculum 문서에서 직접 성취기준 탐색

vs

CuriMap 보조
Candidate와 근거 검수·수정
```

이를:

> **동일 교육과정 연계 Task 기준 Prototype 보조효과**

로 표현한다.

---

# 13. P0 기능

## 반드시 구현
- 콘텐츠 URL/Seed 입력
- CuriMap 실행
- 공식 Curriculum Candidate
- 연계근거
- Review
- CuriBase 저장
- Curi 자연어 Search
- 최소 연관도 기준 통과 결과 전체의 순위·페이지 제공
- 관련도순·방송일순
- 성취기준/추천근거
- EBS 원문 링크

## P0-b
- 과학 10~20
- 교재 Bridge
- Access Badge 5~10
- 프로그램 Filter

---

# 14. 핵심 Demo

### 0:00~0:20
일반 VOD vs 학교용 Clip Metadata 차이

### 0:20~1:05 — CuriMap
신규 콘텐츠 → 교육과정 후보·근거 자동 생성

### 1:05~1:25 — Human Review
승인/수정

### 1:25~2:05 — CuriBase → Curi
방금 승인한 결과를 CuriBase에 저장  
교사가 검색하면 **방금 승인한 콘텐츠가 연관도 기준을 통과한 결과에 등장**

### 2:05~2:25
여러 EBS 프로그램이 하나의 수업 주제로 함께 검색

### 2:25~3:00
실측 KPI:
- Hit@5
- Precision@5
- Precision@10
- Mapping Task 시간
- AI Cost / Content

가장 중요한 Demo 장면:

> **CuriMap에서 승인 → CuriBase 저장 → Curi 검색 결과 즉시 반영**

---

# 15. 비용·운영

원칙:
1. 영상 원본 대신 텍스트 Metadata
2. CuriMap 연계는 Content당 1회 후 저장
3. Curi 검색에서 Mapping을 반복 실행하지 않음
4. CuriBase + Vector Search 재사용
5. 고성능 LLM은 연계 판단에 제한
6. Query Parsing은 저비용 Model/Rule 가능
7. Batch 가능
8. API 사용량 기록

즉:

> **CuriMap의 AI 처리결과를 CuriBase에서 재사용하기 때문에 검색할 때마다 비싼 AI 처리를 반복하지 않는다.**

---

# 16. 교육과정 개정

CuriBase는 Curriculum Version을 보존한다.

향후 개정 시:

```text
신규 Curriculum
→ 기존/신규 성취기준 Crosswalk
→ 변경 영향 Content 식별
→ 영향 Content만 CuriMap 재실행
→ Human Review
→ CuriBase 신규 Version 저장
```

전체 콘텐츠를 처음부터 다시 처리하지 않는 구조를 목표로 한다.

---

# 17. 장기 사업효과

Curi가 기존 아카이브의 발견성을 높이면:

```text
Curi Search
→ EBS Content 발견
→ 상세/VOD 방문
→ 이용 증가
→ 유료·구독 Content 발견
→ 구독/구매 전환 기회
```

로 이어질 가능성이 있다.

단 해커톤에서는 구독자 증가를 확정효과로 주장하지 않는다.

---

# 18. 4주 개발계획

## Week 1
- 공개 Metadata 구조 확인
- Curriculum QA
- P0 Dataset 정리
- CuriMap 1건 Vertical Slice

## Week 2
- CuriMap
- Review
- CuriBase Save
- Curi Search

## Week 3
- Human Verified 50+
- Gold 20+
- Search Query 15~20
- Controlled Benchmark
- 평가

## Week 4
- UI 안정화
- Demo Seed
- 3분 영상
- 보고서
- 배포

Week 3 중반 이후 신규 기능 추가 금지.

---

# 19. 최종 메시지

### CuriMap
**EBS 콘텐츠와 교육과정을 연결합니다.**

### CuriBase
**사람이 검수한 교육 메타데이터를 쌓습니다.**

### Curi
**검증된 데이터를 이용해 교사가 수업 자료를 찾습니다.**

### 한 문장
> **CuriMap으로 연결하고, CuriBase에 쌓아, Curi에서 찾습니다.**

### 서비스 메시지
> **방송 아카이브를, 검증된 수업 자산으로.**
