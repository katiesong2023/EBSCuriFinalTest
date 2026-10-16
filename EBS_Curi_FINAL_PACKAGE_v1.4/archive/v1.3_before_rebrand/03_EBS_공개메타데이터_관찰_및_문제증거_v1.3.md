# EBS 공개 Metadata 관찰 및 문제증거 v1.3

## 전제

내부 CMS 입력 프로세스를 직접 확인한 문서가 아니다.
**공개 웹 Output 및 현재 수집 Raw Metadata를 관찰한 결과**다.

## 일반 방송/VOD에서 관찰된 필드

```text
program/program_label
title
broadcast_date
source_metric_1
source_metric_2
course_id
step_id
detail/source_url
thumbnail/image_url
```

PD로그는 `synopsis`도 확보했다.

## 공식 교과연계 Clip에서 관찰된 필드

```text
grade
subject
title
curriculum_unit_or_lesson
view_count
like_count
course_id
source_url
```

Pilot `초5·6 + 사회/과학` 해당 Row: **40건**

- 초5 사회 16
- 초6 사회 2
- 초5 과학 13
- 초6 과학 9

## 문제증거

일반 VOD:
`프로그램 / 제목 / 방송일 / ID / 이미지`

학교용 Clip:
`학년 / 교과 / 단원·차시`

따라서 CURA는:

> **EBS가 학교용 콘텐츠에서 이미 사용하는 교육 문맥 Metadata를 일반 방송 아카이브까지 확장하는 자동화 방식**

으로 설명할 수 있다.

## Metadata 이질성

604건:
- program_series: 421
- episode: 92
- clip: 68
- episode_seed: 23

synopsis:
- 92/604 (15.2%)

따라서 604 전체를 동일 품질의 Mapping Dataset으로 취급하지 않는다.
