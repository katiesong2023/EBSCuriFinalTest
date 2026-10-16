# EBS CURA FINAL PACKAGE v1.2

> 기준일: 2026-09-15  
> 상태: **FINAL DEVELOPMENT BASELINE / Scope Freeze 권고**  
> 이전 버전: v1.0(데이터·아키텍처 정리) → v1.1(수상전략·Track 1 포지셔닝 강화) → **v1.2(TCO·접근권한·교육과정 Lifecycle·사업 KPI 반영)**

## 1. v1.2 핵심 의사결정

이번 버전은 기능을 더 많이 만드는 버전이 아니다.

기존 P0 핵심 루프:

`EBS 콘텐츠 → AI 교육과정 Mapping → Human Review → 저장 → 교사 검색 → Top5`

를 그대로 유지하면서 다음 설계를 추가했다.

1. **콘텐츠 접근조건 Metadata**
   - FREE / LOGIN_REQUIRED / SUBSCRIPTION / SINGLE_PURCHASE / SUBSCRIPTION_OR_PURCHASE / UNKNOWN
   - 유료 여부는 추천 점수에 사용하지 않고 사용자 안내·사업성과 측정에 사용
2. **사업효과 Funnel**
   - 검색 → 콘텐츠 발견 → EBS 상세/VOD 유입 → 유료·구독 콘텐츠 발견 → 구독/구매 전환 기회
   - 해커톤에서 구독 증가를 성과로 주장하지 않고, 서비스화 이후 측정 KPI로 분리
3. **TCO 설계**
   - 영상 분석 대신 텍스트 Metadata 중심
   - Content Mapping은 최초 1회 후 재사용
   - Search는 Verified Mapping + Vector Search 우선
   - 고성능 LLM은 Mapping 등 품질 중요 단계에 제한
4. **교육과정 Lifecycle**
   - Curriculum Versioning
   - Old↔New Crosswalk
   - UNCHANGED / MODIFIED / SPLIT / MERGED / NEW / REMOVED
   - 변경 영향을 받는 Content만 증분 Re-Mapping
5. **정량 KPI 확대**
   - Hackathon: Hit@5 / Precision@5 / 작업시간 절감 / 콘텐츠당 AI 비용
   - Service: CTR / Play Start / Archive Reuse / Subscription Page Visit / Conversion

## 2. 먼저 읽을 문서

1. `docs/00_버전리뷰_및_최종의사결정_v1.2.md`
2. `docs/01_EBS_CURA_최종_개발기획서_v1.2.md`
3. `docs/07_비용_TCO_유지운영_사업KPI_v1.2.md`
4. `docs/06_통합_스키마_데이터품질_수명주기_v1.2.md`
5. `docs/02_메타데이터_인벤토리_및_상태_v1.2.md`

## 3. 데이터 파일

`data/`의 기존 CSV는 v1.0에서 확보한 Raw/Seed 데이터를 **원형 보존**했다.

이번 버전에서는 기존 Raw 데이터에 추정 유료/무료 값을 임의로 덧씌우지 않았다.  
접근조건은 실제 페이지에서 확인한 경우에만 `Verified Access Metadata`로 추가하는 것이 원칙이다.

## 4. Archive

- `archive/v1.0/`: 기존 데이터·아키텍처 정의
- `archive/v1.1/`: Track 1 수상전략 반영본
- 별도 TCO 및 참가서식 초안도 보존

## 5. 최종 포지셔닝

**EBS CURA — 2022 개정 교육과정 기반 콘텐츠 메타데이터 자동 매핑·검색 Agent**

> 콘텐츠를 읽고 교육과정을 찾아 태그를 입력하는 반복업무를 AI가 초안화하고 사람이 검수한다.  
> 그 결과는 교사의 자연어 검색에 즉시 재사용되고, 장기적으로는 EBS 아카이브의 이용·구독 전환 기회를 확대할 수 있다.

**프로그램을 찾는 EBS에서, 수업을 찾는 EBS로.**
