# Gold / Search 평가 Protocol v1.3

## Gold
- 20~30건
- AI Mapping 실행 전에 사람이 독립 라벨링
- Prompt/Ranking 튜닝에 사용하지 않는 Hold-out
- 가능하면 일부 2인 검토

## Split
- DEV: Prompt/Ranking 개선
- TEST/GOLD: 최종 수치
- DEMO: UX 안정화, 성능산정 제외

## Mapping Metrics
- Subject Accuracy
- Grade-band Accuracy
- Hit@3
- Hit@5
- 필요 시 Recall@K

F1은 relevant Curriculum Label을 exhaustive하게 라벨링한 경우에만 사용.

## Search Query
15~20개 권장:
1. 학년/교과 직접형
2. 개념형
3. 활용목적형
4. 모호형
5. Negative Query

## Search Result Rating
- 2: 직접 활용
- 1: 보조 활용
- 0: 부적합

측정:
- Precision@5
- Precision@10
- 평균 유용성@5·@10
- Query Success@10
- 11위 이후 결과 표본 Precision
- Negative 빈 결과율

서비스 화면은 최소 연관도 기준을 통과한 검증 결과 전체를 10개 단위로 제공한다. 상위 10개를 모두 채점하고, 11위 이후 결과가 있으면 결과를 보기 전에 고정한 방식으로 최대 5개를 표본 채점한다. Precision@5는 상단 품질 비교를 위해 유지한다.

## Confidence
P0 Verified Mapping은 모두 Human Review.

Confidence는 calibrated probability가 아니라 Review Priority 참고값.

## Ranking
P0:
1. grade/subject hard filter
2. semantic similarity
3. minimum relevance threshold
4. broadcast date as tie-breaker or user-selected ordering

Weight를 쓰면 초기 heuristic으로 명시.
