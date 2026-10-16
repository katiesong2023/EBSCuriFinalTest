# EBS CURA 비용·TCO·유지운영·사업 KPI v1.2

> 수치는 2026-09-15 현재 공개 가격과 명시된 Token 가정에 따른 **시뮬레이션**이다.  
> 실제 EBS Production 비용은 사내 Infra, 보안, SSO, 운영인력, 계약조건에 따라 별도 산정한다.

## 1. 비용 구조

```text
초기 개발
+
Content 신규/변경 시 Mapping
+
사용자 Search
+
DB/Web Infra
+
Human Review
+
교육과정 개정 유지보수
```

## 2. 비용 최적화 Architecture

- 영상 원본 분석 없음(P0)
- 텍스트 Metadata 중심
- Mapping은 1회 후 DB 재사용
- Search는 SQL + pgvector 우선
- Query Parsing은 저비용 Model/Rule
- 고성능 Model은 Mapping 등 중요 판단에 제한
- Batch 가능한 Offline Mapping은 비동기 Batch 고려

## 3. 현재 공개가격 Reference

2026-09-15 기준 공식 공개가격:

- GPT-5.6 Luna: Input $0.20 / 1M tokens, Output $1.20 / 1M
- GPT-5.6 Terra: Input $2.00 / 1M, Output $12.00 / 1M
- GPT-5.6 Sol: Input $4.00 / 1M, Output $20.00 / 1M
- text-embedding-3-small: $0.02 / 1M tokens
- Batch API: 동기 API 대비 50% 비용 할인(지원 Model/Endpoint 확인 필요)
- Supabase Pro: $25/month부터
- Vercel Pro: $20/month

Source:
- OpenAI API / model pricing pages, accessed 2026-09-15
- OpenAI Batch API FAQ, accessed 2026-09-15
- Supabase Pricing, accessed 2026-09-15
- Vercel Pricing, accessed 2026-09-15

## 4. Mapping 비용 예

가정:
- 1건 Input 3,000
- Output 600

100건:

| Tier | 예상비용 |
|---|---:|
| Luna | $0.13 |
| Terra | $1.32 |
| Sol | $2.40 |

100건 수준의 해커톤에서는 API비보다 Human QA 시간이 더 중요한 Cost Driver다.

## 5. Search 비용 예

가정:
- Query 1회 Input 1,200
- Output 250

10,000회:

| Tier | 예상비용 |
|---|---:|
| Luna | $5.40 |
| Terra | $54 |

따라서 검색에 Terra급 이상을 항상 쓰는 구조는 피한다.

## 6. Embedding

1,000 Content × 평균 500 tokens = 0.5M tokens.

text-embedding-3-small 가격 수준에서는 약 `$0.01`.

Embedding 자체보다 데이터 QA/Review/Infra가 더 큰 비용요소다.

## 7. 월 운영 Scenario 예

가정:
- 신규/변경 Content Mapping 1,000건/월, Terra
- Search 10,000회/월, Luna
- Supabase Pro + Vercel Pro
- 추가 사용량, 세금, 인건비 제외

```text
Infra                $45.00
Mapping              $13.20
Search                $5.40
---------------------------
합계                 $63.60 / month
```

Mapping Batch가 적용되면 Mapping 비용은 가정상 절반 수준으로 낮아져 총액도 감소 가능.

이 예시는 **외부 SaaS/API 비용만**이다.

## 8. 경쟁 후보 대비 경제성

정량 비교가 아니라 기능구조 기반 상대평가.

| 주제 | 반복 처리 | 추가 AI/Integration 가능성 | 비용통제 |
|---|---|---|---|
| CURA | 1회 Mapping 후 재사용 | Text/Vector 중심 | 높음 |
| 콘텐츠 품질검수 | 수정 때마다 재검수 | 자막/OCR/Video 가능 | 중간 |
| 방송→학습자료 생성 | 변환 때마다 장문 생성 | 장문/Video | 낮~중 |
| 성과분석·추천 | Batch | DW/내부지표 | 중간 |
| 교재·문항검수 | 개정마다 재검수 | 장문/비공개 DB | 중간 |
| 제작 리스크검토 | 제작물마다 검토 | Web/권리/정책 | 중간 |

CURA의 장점은 **반복 AI 호출을 DB 재사용으로 치환할 수 있다는 점**이다.

## 9. 진짜 TCO Driver — Human Review

가정:
- 1건 Review = 1~2분

2,000건:
- 약 33~67시간

10,000건:
- 약 167~333시간

따라서:
- confidence
- 자동승계
- Diff
- Review Priority

가 장기 비용에 더 중요하다.

## 10. 교육과정 개정 비용 예

10,000 Content 전면 Terra Re-Mapping:
- 약 `$132` API 비용 가정

영향 Content 20%만:
- 2,000건 ≈ `$26.4`

Batch 적용 가능 시 더 낮출 수 있다.

하지만 Human Review 비용이 더 클 가능성이 높으므로 **Impact Analysis가 핵심**이다.

## 11. Prototype KPI

- Hit@5
- Precision@5
- 업무시간 절감률
- Content당 AI API Cost
- Review Time/Content

## 12. Service KPI

- Search Volume
- Recommendation CTR
- EBS Detail/VOD CTR
- Play Start
- Archive Reuse Rate
- Paid/Subscription Content CTR
- Subscription Page Visit
- Purchase/Subscription Conversion

## 13. 구독 효과 표현 원칙

EBS 공식 서비스에는 방송 구독권 및 구독 프로그램 구조가 존재한다.

하지만 해커톤 Prototype만으로:

> “CURA가 구독자를 증가시킨다”

고 주장하지 않는다.

대신:

> **교육과정 기반 Discovery를 개선해 기존 유료·구독 Content의 노출과 상세페이지 유입, 구독·구매 전환 기회를 확대할 수 있다.**

라고 표현한다.

실제 도입 후 Funnel KPI로 검증한다.
