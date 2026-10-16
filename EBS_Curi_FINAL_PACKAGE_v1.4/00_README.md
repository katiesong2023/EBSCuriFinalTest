# EBS Curi FINAL PACKAGE v1.4

> 기준일: 2026-09-15  
> 이전 기준본: v1.3 Evidence & Data Quality 강화판  
> v1.4 목적: **Curi / CuriMap / CuriBase 브랜드 구조 전면 반영**

## 1. 최종 브랜드

- **Curi** = 서비스 브랜드
- **CuriMap** = 교육과정 연계 Agent
- **CuriBase** = 검증된 교육 메타데이터 저장소

```text
EBS 콘텐츠
   ↓
CuriMap
   ↓
Human Review
   ↓
CuriBase
   ↓
Curi
```

핵심 문장:

> **CuriMap으로 연결하고, CuriBase에 쌓아, Curi에서 찾습니다.**

## 2. 공식 과제명

**Curi – 2022 개정 교육과정 기반 EBS 교육 메타데이터 구축·활용 Agent**

## 3. v1.4에서 유지한 핵심

- Track 1 포지셔닝
- 공개 Metadata 기반 문제증거
- 초5~6 사회 중심 Pilot
- 과학 확장 Sample
- Mapping-ready Seed 75
- Candidate Pool 90
- Gold Hold-out 20~30
- Search Query 15~20
- Human Review
- Controlled Mapping Task Benchmark
- TCO/구독/Lifecycle은 Appendix

## 4. 먼저 읽을 문서

1. `docs/00_Curi_브랜드_아키텍처_v1.4.md`
2. `docs/01_Curi_최종_개발기획서_v1.4.md`
3. `docs/02_P0_데이터_준비도_및_WorkingSet_v1.4.md`
4. `docs/03_EBS_공개메타데이터_관찰_및_문제증거_v1.4.md`
5. `docs/04_Gold_Search_평가프로토콜_v1.4.md`
6. `docs/05_ID_Schema_CuriBase_DataQuality_v1.4.md`
7. `docs/06_현업Baseline_대체_Evidence전략_v1.4.md`
8. `docs/07_신청_발표_메시지_v1.4.md`

## 5. 데이터

Raw 원본은 유지했다.

P0:
- `data/p0/p0_mapping_ready_seed_75.csv`
- `data/p0/p0_enrichment_queue_15.csv`
- `data/p0/p0_candidate_pool_90.csv`
- `data/p0/data_quality_summary_v1.3.csv`

내부 `content_id` Prefix는 브랜드 변경에 맞춰 `CURI-`로 통일했다.

## 6. 최종 메시지

> **방송 아카이브를, 검증된 수업 자산으로.**
