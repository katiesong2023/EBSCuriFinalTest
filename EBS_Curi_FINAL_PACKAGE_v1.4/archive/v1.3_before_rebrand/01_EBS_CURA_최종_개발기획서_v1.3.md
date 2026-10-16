# EBS CURA 최종 개발 기획서 v1.3 — Evidence & Data Quality 강화판

> 프로젝트명: **EBS CURA – 2022 개정 교육과정 기반 교육 메타데이터 구축 자동화 Agent**  
> 부제: **검수된 교육 메타데이터를 교사 검색에 즉시 재사용**  
> Track: 1 / Now Agent  
> Pilot: 초등 5~6학년군 사회 중심 + 과학 확장 Sample  
> 원칙: **기능 추가보다 증거·데이터 품질·평가 엄밀성**

## 1. 문제
일반 방송/VOD 공개 Metadata는 프로그램·제목·방송일·ID 중심인 반면, 학교용 공식 교과연계 Clip에는 학년·교과·단원/차시 Metadata가 존재한다.

> 일반 Archive까지 학교교육에서 검색·재활용하려면 교육과정 기준 Metadata Layer가 필요하다.

CURA는 이 구축 과정을 AI가 초안화하고 사람이 검수한다.

## 2. 핵심 Loop
`Content → Mapping → Review → Save → Search`

Search는 본체가 아니라 Metadata 재사용의 증거다.

## 3. 차별성
- 국가교육과정 Canonical
- Candidate Retrieval 기반 Mapping
- N:M
- Human Review
- Source/Silver/AI/Verified 분리
- DB Asset화
- Search 즉시 재사용

## 4. P0
2 Agent / 3 Core Table / 4 Screen 유지.

## 5. Data
- Raw 604
- P0 Candidate 90
- Mapping-ready Seed 75
- Enrichment Queue 15
- Working Set 80~100 목표
- Verified 50~80
- Gold 20~30
- Demo 5~10

## 6. Data Gate
Stable ID / title / 충분한 description / provenance / granularity / link quality / label status.

## 7. Gold
AI 실행 전 Human Label.
Hold-out 유지.
Official Clip은 Silver Benchmark.

## 8. Evaluation
Mapping:
- Subject Accuracy
- Grade-band Accuracy
- Hit@3
- Hit@5

Search:
- Query 15~20
- Precision@5
- 0/1/2 usefulness

## 9. Confidence
P0 Verified는 모두 Human Review.
Confidence는 Review Priority.

## 10. Ranking
1. grade/subject hard filter
2. semantic similarity
3. HUMAN_APPROVED boost

Weight는 초기 heuristic으로만 취급.

## 11. Baseline 대체
실제 현업 처리량 확보가 어려우면 Controlled Mapping Task Benchmark 실시.

‘현재 EBS 실제 업무시간 절감’이 아니라:
**동일 Mapping Task 기준 Prototype 보조효과**
로 표현.

## 12. Demo
0:00~0:20 Metadata Gap
0:20~1:05 Mapping
1:05~1:25 Human Review
1:25~2:05 Search에서 방금 승인한 Content 등장
2:05~2:25 Cross-program
2:25~3:00 Hit@5 / P@5 / Mapping Task Time / AI Cost

## 13. Week Plan
Week1: Data QA + 1건 Vertical Slice  
Week2: Core Product  
Week3: Verified/Gold/Evaluation  
Week4: Hardening/Demo

Week3 중반 이후 신규 기능 금지.

## 14. Appendix
TCO / 구독 / Access Metadata / Curriculum Lifecycle는 유지하되 Main Pitch 후순위.

## 15. 최종 메시지
**검색 Agent가 아니라, 공식 교육과정에 Grounding된 Education Metadata 구축 Agent.**

**방송 아카이브를, 검증된 수업 자산으로.**
