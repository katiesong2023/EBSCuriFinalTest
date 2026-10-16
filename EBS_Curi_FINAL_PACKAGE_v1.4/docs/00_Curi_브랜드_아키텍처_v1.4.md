# Curi 브랜드 아키텍처 및 명명 규칙 v1.4

## 1. 브랜드 구조

| 명칭 | 역할 | 설명 |
|---|---|---|
| **Curi** | 서비스 브랜드 | 검증된 교육 메타데이터를 활용해 교사가 수업 언어로 EBS 콘텐츠를 찾는 전체 서비스 |
| **CuriMap** | 교육과정 연계 Agent | EBS 콘텐츠를 분석해 학교급·교과·핵심개념·성취기준 후보와 연계 근거를 생성 |
| **CuriBase** | 검증된 Metadata 저장소 | CuriMap 결과를 사람이 검수한 뒤 축적하는 교육 메타데이터 저장소 |

## 2. 한눈에 보는 구조

```text
EBS 콘텐츠
   ↓
CuriMap
교육과정 연계 후보·근거 생성
   ↓
Human Review
승인 / 수정 / 제외
   ↓
CuriBase
검증된 교육 메타데이터 축적
   ↓
Curi
교사가 수업 언어로 검색·추천
```

## 3. 핵심 설명

> **CuriMap으로 연결하고, CuriBase에 쌓아, Curi에서 찾습니다.**

이 문장을 서비스 구조를 설명하는 기본 문장으로 사용한다.

## 4. 용어 통일

기존 표현 → v1.4 표현

- Curriculum Mapping → **교육과정 연계**
- Mapping Agent → **CuriMap**
- Verified Metadata DB → **CuriBase**
- Teacher Search / Curation Service → **Curi**
- Verified Mapping → **검증된 교육과정 연계 메타데이터**
- Curi → **Curi**

## 5. 추천 과제명

### 공식 과제명
**Curi – 2022 개정 교육과정 기반 EBS 교육 메타데이터 구축·활용 Agent**

### 설명형 부제
**CuriMap으로 교육과정을 연결하고, CuriBase에 검증된 메타데이터를 축적해 Curi에서 검색·활용**

## 6. 브랜드별 역할 경계

### CuriMap
하는 일:
- 콘텐츠 텍스트 분석
- 핵심개념 추출
- 공식 교육과정 후보 검색
- 성취기준 연계 후보 생성
- 연계 근거 및 활용방법 제시

하지 않는 일:
- 사람 검수 대체
- 교육과정 자유 생성
- 검색서비스 전체 역할

### CuriBase
저장:
- Source Metadata
- 교육과정 연계 결과
- Human Review 상태
- 연계 근거
- 수업 활용정보
- Curriculum Version
- Provenance

CuriBase는 단순 DB명보다 **검증된 교육 메타데이터 자산**이라는 의미를 강조한다.

### Curi
사용:
- 자연어 수업 Query
- 학년군/교과/개념 검색
- 최소 연관도 기준을 통과한 CuriBase 검증 콘텐츠 전체의 순위·페이지 제공
- 관련도순 기본, 방송일 보조·선택 정렬
- 성취기준·추천근거·EBS 원문 링크 제공

## 7. 심사 메시지

> **Curi는 검색 Agent 하나가 아닙니다. CuriMap이 교육과정 연계 메타데이터를 만들고, 사람이 검수한 결과를 CuriBase에 축적하며, Curi가 그 검증된 자산을 실제 교사 검색에 재사용하는 구조입니다.**
