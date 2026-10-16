# EBS CURA FINAL PACKAGE v1.3 — Evidence & Data Quality 강화판

> 기준일: 2026-09-15  
> 목적: v1.2의 기능 범위를 늘리지 않고 **현업 근거 대체전략, 데이터 품질, 평가 엄밀성**을 강화

## v1.3 핵심 변화

1. 검증되지 않은 ‘현재 반복업무’ 주장을 줄임
2. 일반 VOD와 교과연계 Clip의 Metadata 비대칭을 문제정의의 핵심 근거로 사용
3. 604 Raw Catalog 재점검
   - synopsis 92/604
   - raw content_id 0/604
   - 초5·6 사회/과학 공식 Clip 40건
4. P0 Candidate Dataset 실제 생성
   - Mapping-ready Seed 75건
   - Description Enrichment Queue 15건
   - 총 Candidate 90건
5. Stable content_id 생성
6. Gold Hold-out Protocol 강화
7. Confidence/Ranking 표현 보수화
8. TCO·구독·Curriculum Lifecycle은 유지하되 Appendix/Q&A로 후순위화

## 먼저 읽을 문서

1. `docs/00_최종의사결정_v1.3.md`
2. `docs/01_EBS_CURA_최종_개발기획서_v1.3.md`
3. `docs/02_P0_데이터_준비도_및_WorkingSet_v1.3.md`
4. `docs/03_EBS_공개메타데이터_관찰_및_문제증거_v1.3.md`
5. `docs/04_Gold_Search_평가프로토콜_v1.3.md`
6. `docs/05_ID_Schema_DataQuality_v1.3.md`

## P0 Dataset

- `data/p0/p0_mapping_ready_seed_75.csv`
- `data/p0/p0_enrichment_queue_15.csv`
- `data/p0/p0_candidate_pool_90.csv`
- `data/p0/data_quality_summary_v1.3.csv`

`p0_mapping_ready_seed_75`는 Gold가 아니다.

## 최종 포지셔닝

**EBS CURA – 2022 개정 교육과정 기반 교육 메타데이터 구축 자동화 Agent**

부제: **검수된 교육 메타데이터를 교사 검색에 즉시 재사용**
