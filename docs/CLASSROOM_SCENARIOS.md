# 수업 탐색 시나리오 30개

실행: 2026-09-30T14:09:18.967Z · 재실행: `npm run simulate:classroom`

교사가 사용할 법한 가상 상황을 5개 영역에 6개씩 구성했다. 초등 수업 준비를 위한 요구 목록이며, 공식 성취기준 매핑·학년 적합성 승인·실제 교사 평가를 뜻하지 않는다.

## 현재 결과

- 보유 개별 자료 21674건, 개별 도착 페이지 확인 341건. 시나리오 추가로 콘텐츠가 늘어난 것은 아니다.
- 요청 문장 그대로 후보가 나온 경우: 15/30.
- 작성자가 고른 핵심어로 후보가 나온 경우: 30/30. 이 수치는 자연어 검색 성공률이 아니다.
- 핵심어 결과에 개별 페이지 확인 자료가 있는 경우: 22/30.
- 핵심어 결과 전체의 중복 제거 자료: 425건. 여러 시나리오의 결과 수를 콘텐츠 수로 합산하지 않는다.
- 유료 API 호출 0회. 실제 승인 저장소 변경 없음. 영상 재생·정답률·교육적 적합성은 측정하지 않았다.

## 읽는 방법

요청은 문장을 그대로 검색한 건수, 핵심어는 문서 작성자가 명시적으로 줄인 검색어의 건수, 개별 링크는 핵심어 결과 중 클립·회차 도착 페이지가 확인된 건수다. 모두 프로그램 묶음을 제외한다. 0건은 현재 검색에서 못 찾았다는 뜻이며 EBS 전체에 자료가 없다는 뜻은 아니다.

일반 검색은 제목·소개문의 단어 조건을 사용한다. 장소 확장은 기존 3개 개념만 지원한다. 후보가 많아도 부분 문자열 일치나 소개문 주변 문맥 때문에 무관한 자료가 섞일 수 있다. 재생 시간·자막 조건은 아직 지원하지 않는다.

## 시나리오별 결과

| ID · 영역 | 수업 상황 / 실제 요청 | 핵심어 | 요청 | 핵심어 | 개별 링크 | 현재 한계 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| G01 · 지리·지역 | 산지와 평야 비교 / 동고서저 관련 클립을 추천해줘 | 동고서저 | 10 | 10 | 8 | 검색 후보 있음 · 내용 적합성 미판정 |
| G02 · 지리·지역 | 화산 지형 관찰 / 화산 지형을 보여줘 | 화산 지형 | 17 | 17 | 9 | 검색 후보 있음 · 내용 적합성 미판정 |
| G03 · 지리·지역 | 해안 지형 비교 / 해안 지형 관련 영상 추천해줘 | 해안 지형 | 1 | 1 | 0 | 검색 후보 있음 · 내용 적합성 미판정 |
| G04 · 지리·지역 | 산지의 생활 / 지리산에서 일하는 사람들의 생활을 보여줘 | 지리산 | 0 | 25 | 1 | 핵심어 후보 있음 · 요청 해석 부족 |
| G05 · 지리·지역 | 영토와 바다 / 우리나라 영해 관련 클립 찾아줘 | 영해 | 2 | 2 | 1 | 검색 후보 있음 · 내용 적합성 미판정 |
| G06 · 지리·지역 | 인구 분포와 지역 문제 / 인구 감소로 달라진 지역 생활을 보여줘 | 인구 | 0 | 28 | 6 | 핵심어 후보 있음 · 요청 해석 부족 |
| E01 · 환경·생태 | 기후 변화 토론 / 기후 변화가 우리 생활에 미치는 영향 관련 영상 찾아줘 | 기후 변화 | 39 | 39 | 3 | 검색 후보 있음 · 내용 적합성 미판정 |
| E02 · 환경·생태 | 옷의 재사용 경로 / 헌옷 관련 방송 추천해줘 | 헌옷 | 1 | 1 | 0 | 검색 후보 있음 · 내용 적합성 미판정 |
| E03 · 환경·생태 | 생물 다양성 탐구 / 꿀벌이 줄어들면 생기는 문제를 설명하는 영상 찾아줘 | 꿀벌 | 0 | 22 | 0 | 핵심어 후보 있음 · 요청 해석 부족 |
| E04 · 환경·생태 | 야생동물 보호 / 야생동물 구조와 보호 사례 찾아줘 | 야생동물 | 0 | 36 | 0 | 핵심어 후보 있음 · 요청 해석 부족 |
| E05 · 환경·생태 | 산림 보전 / 백두대간 관련 방송 찾아줘 | 백두대간 | 15 | 15 | 1 | 검색 후보 있음 · 내용 적합성 미판정 |
| E06 · 환경·생태 | 바다 쓰레기 해결 / 해양 쓰레기를 줄이는 실천 사례 추천해줘 | 해양 쓰레기 | 0 | 5 | 0 | 핵심어 후보 있음 · 요청 해석 부족 |
| C01 · 공동체·경제 | 다문화 교실 이야기 / 다문화 관련 방송 추천해줘 | 다문화 | 15 | 15 | 2 | 검색 후보 있음 · 내용 적합성 미판정 |
| C02 · 공동체·경제 | 우리 동네 안전 / 119 관련 방송 보여줘 | 119 | 17 | 17 | 1 | 검색 후보 있음 · 내용 적합성 미판정 |
| C03 · 공동체·경제 | 학교의 분업 / 학교 급식이 만들어지는 과정을 보여줘 | 급식 | 0 | 7 | 1 | 핵심어 후보 있음 · 요청 해석 부족 |
| C04 · 공동체·경제 | 지역 생산과 가공 / 제주 감귤이 상품이 되는 과정 찾아줘 | 감귤 | 0 | 4 | 1 | 핵심어 후보 있음 · 요청 해석 부족 |
| C05 · 공동체·경제 | 민주적 의사 결정 / 민주주의를 학급 회의로 설명하는 영상 추천해줘 | 민주주의 | 0 | 37 | 8 | 핵심어 후보 있음 · 요청 해석 부족 |
| C06 · 공동체·경제 | 물가와 합리적 소비 / 물가가 오르면 소비가 어떻게 달라지는지 보여줘 | 물가 | 0 | 3 | 0 | 핵심어 후보 있음 · 요청 해석 부족 |
| H01 · 역사·문화 | 유적으로 생활 추론 / 고인돌 관련 클립 찾아줘 | 고인돌 | 5 | 5 | 2 | 검색 후보 있음 · 내용 적합성 미판정 |
| H02 · 역사·문화 | 옛 지도 관찰 / 대동여지도 관련 영상 추천해줘 | 대동여지도 | 7 | 7 | 1 | 검색 후보 있음 · 내용 적합성 미판정 |
| H03 · 역사·문화 | 문화유산의 특징 / 불국사의 특징을 관찰할 수 있는 영상 찾아줘 | 불국사 | 0 | 1 | 1 | 핵심어 후보 있음 · 요청 해석 부족 |
| H04 · 역사·문화 | 농민 운동의 원인과 전개 / 동학 농민 운동의 원인과 결과를 비교할 자료 찾아줘 | 동학 | 0 | 5 | 1 | 핵심어 후보 있음 · 요청 해석 부족 |
| H05 · 역사·문화 | 개항과 변화 / 강화도 조약 관련 클립 보여줘 | 강화도 조약 | 2 | 2 | 1 | 검색 후보 있음 · 내용 적합성 미판정 |
| H06 · 역사·문화 | 독립운동 인물 탐구 / 유관순의 독립운동을 초등학생에게 소개할 영상 추천해줘 | 유관순 | 0 | 1 | 0 | 핵심어 후보 있음 · 요청 해석 부족 |
| S01 · 과학·관찰 | 계절의 날씨 비교 / 계절별 날씨 관련 클립 추천해줘 | 날씨 | 1 | 15 | 3 | 검색 후보 있음 · 내용 적합성 미판정 |
| S02 · 과학·관찰 | 달의 모양 변화 / 달의 모양 변화 관련 클립 찾아줘 | 달의 모양 | 10 | 10 | 2 | 검색 후보 있음 · 내용 적합성 미판정 |
| S03 · 과학·관찰 | 구름 생성 실험 준비 / 구름 발생 실험을 5분 이내 영상으로 보여줘 | 구름 | 0 | 24 | 1 | 핵심어 후보 있음 · 요청 해석 부족 · 재생 시간 상한 필터·실험 안전성 판정 미지원 |
| S04 · 과학·관찰 | 식물의 물 이동 / 증산 작용 관련 클립 찾아줘 | 증산 | 71 | 71 | 4 | 검색 후보 있음 · 내용 적합성 미판정 |
| S05 · 과학·관찰 | 화재 대처 안전교육 / 자막이 있는 화재 대피 영상 추천해줘 | 화재 | 0 | 16 | 2 | 핵심어 후보 있음 · 요청 해석 부족 · 자막 유무 필터·안전 수칙의 최신성 판정 미지원 |
| S06 · 과학·관찰 | 전기 회로 탐구 / 전기 회로 실험 관련 영상 찾아줘 | 전기 회로 | 0 | 3 | 0 | 핵심어 후보 있음 · 요청 해석 부족 |

## 필요한 근거와 실제 검색 표본

아래는 검색 순서상 최대 3건의 표본이다. 추천 승인 목록이 아니다. 전체 ID는 JSON 보고서의 candidateIds에 기록한다.

| ID | 수업 활용에 필요한 근거 | 검색 표본 |
| --- | --- | --- |
| G01 | 동쪽 산지와 서쪽 평야의 실제 장면 및 비교 근거 | GEO-GIMJE · [김제 — 1부 하늘, 땅을 만나다 지평선 이야기](https://home.ebs.co.kr/worldtrip/replayView?siteCd=KH&courseId=BP0PAPD0000000022&stepId=01BP0PAPD0000000022&lectId=3054984) / BCAST-0266ccbdac38db6404e4 · [또 걸어보길 1부 금강산에서 해파랑까지](https://home.ebs.co.kr/worldtrip/replayView?siteCd=KH&courseId=BP0PAPD0000000022&stepId=01BP0PAPD0000000022&lectId=60542547) / BCAST-5b234f3204d1a1f0bafe · [바람이 불어오는 곳 2부 설악산에 삽니다](https://home.ebs.co.kr/worldtrip/replayView?siteCd=KH&courseId=BP0PAPD0000000022&stepId=01BP0PAPD0000000022&lectId=60077085) |
| G02 | 화산 분화구·용암 지형을 식별할 수 있는 장면 | GEO-PARK-HALLA · [제7호 한라산 국립공원](https://mid.ebs.co.kr/course/view?courseId=100005142&left=grade) / BCAST-e62e352286bfdf0e7886 · [[2025, 과학이 여는 새로운 미래] 4부 기후 변화를 감시하는 눈, 니사르 위성](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60569067) / BCAST-faaaeedd22b29cb42374 · [900개의 영혼,파푸아뉴기니 1부 화산섬, 마투핏](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60055774&lectId=10316791) |
| G03 | 동해안과 서해안의 특징을 비교할 서로 다른 자료 | GEO-PARK-HALLYEO · [제4호 한려해상 국립공원](https://mid.ebs.co.kr/course/view?courseId=100005142&left=grade) |
| G04 | 산지 환경과 생활 방식의 관계를 보여주는 소개문·장면 | PDLOG-060 · [해발 1,601미터로 출근합니다, 지리산 대피소](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=40049722&stepId=60053813&lectId=60613869) / BCAST-dfcfb7d2c2751fa5a2c6 · [山에 사네, 지리산 사람들](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPF0000000022&stepId=01BP0PAPF0000000022&lectId=10405522) / BCAST-f7a1dc12090d9e89d747 · [섬진강 은어 지리산 석이](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=10008202&stepId=10009338&lectId=10515558) |
| G05 | 영해 설명과 지도, 표현의 최신성 확인 | BCAST-a243129f08f5622ea60a · [여섯 번째 대멸종 4부-사라진 경계](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60055783&lectId=60145878) / ECLIP-047 · [우리나라의 영해](https://primary.ebs.co.kr/parent/clip/teacherClip?courseId=10019659&lectureId=LS0000000010294001&clipId=CS000000000000005148) |
| G06 | 지역별 인구 변화와 생활 변화의 구체적 사례 | BCAST-570bed2ca0947519dd5d · [기후 우울증에 걸린 사람들](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60463530) / BCAST-aedb344a88a7c6293744 · [인구절벽에서 살아남기](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60468399) / BCAST-95cde06223e3b1919195 · [저출생 보고서 인구에서 인간으로 - 1부 선택](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60055762&lectId=60302806) |
| E01 | 기후 변화의 원인과 영향을 구분하는 설명·사례 | BCAST-e62e352286bfdf0e7886 · [[2025, 과학이 여는 새로운 미래] 4부 기후 변화를 감시하는 눈, 니사르 위성](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60569067) / BCAST-570bed2ca0947519dd5d · [기후 우울증에 걸린 사람들](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60463530) / BCAST-01ec9cc11359ce2150f1 · [영주, 내성천 사람들](https://home.ebs.co.kr/worldtrip/replayView?siteCd=KH&courseId=40046448&stepId=60055522&lectId=60571481) |
| E02 | 수거 이후 재사용·재활용 경로를 확인할 회차와 소개문 | PDLOG-012 · [옷은 돌고 돈다, 최PD의 헌옷 추적기](https://www.ebs.co.kr/search?query=PD%EB%A1%9C%EA%B7%B8+%EC%98%B7%EC%9D%80+%EB%8F%8C%EA%B3%A0+%EB%8F%88%EB%8B%A4%2C+%EC%B5%9CPD%EC%9D%98+%ED%97%8C%EC%98%B7+%EC%B6%94%EC%A0%81%EA%B8%B0) |
| E03 | 양봉 직업 소개를 넘어 수분·생태계 관계를 설명하는 근거 | BCAST-58c5a1f27d5199b7a817 · [[창사특집] SF 자연다큐멘터리 꿀벌 - 1부 꿀벌 은하](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60056315&lectId=60609053) / BCAST-2169d23411329938f461 · [[창사특집] SF 자연다큐멘터리 꿀벌 - 2부 꿀벌의 마음](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60056315&lectId=60609300) / BCAST-c795af87c725960152da · [[창사특집] SF 자연다큐멘터리 꿀벌 - 3부 두 여왕 이야기](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60056315&lectId=60611008) |
| E04 | 구조 이유·보호 방법과 학생 시청에 적절한 장면 | BCAST-eb8df09e07b844a6e8f1 · [‘검은 늑대’가 전해준 이야기](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=20223837) / BCAST-6e9ace47e4ca4af0c627 · [가축 1부 - 왜 길들였을까?](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=20381396) / BCAST-68e880e9966ebc1c28fd · [가축 2부 - 어떻게 길들였을까?](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=20381400) |
| E05 | 산림 보전 활동과 그 필요성에 대한 구체적 근거 | PDLOG-059 · [위기의 백두대간을 지켜라](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=40049722&stepId=60053813&lectId=60611006) / BCAST-9f6f5b44d6b3fc2e0c8b · [4년의 기록, 위기의 백두대간](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPF0000000022&stepId=01BP0PAPF0000000022&lectId=10461382) / BCAST-c113e9ccb76b6cc8448d · [백두대간의 중추 태백산, 국립공원이 되다](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPF0000000022&stepId=01BP0PAPF0000000022&lectId=10581694) |
| E06 | 오염 원인·영향과 실천 결과를 보여주는 사례 | BCAST-158ddca800fdd87ee003 · [바다별을 깨끗하게 지켜요!](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=BA0AA000000000015&lectId=60524985&stepId=01BA0AA000000000015) / BCAST-545139e5a746aeff4b6e · [반짝 반짝 불가사리](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=20371524) / BCAST-a32a7837933a881b83b5 · [세상 어디에도 없던 쓰레기 줍는 섬 여행](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPF0000000022&stepId=01BP0PAPF0000000022&lectId=10474590) |
| C01 | 문화 차이를 존중하는 교실 사례, 편견을 강화하지 않는 맥락 | PDLOG-048 · [다 함께 자라요, 다문화 초등 교실](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=40049722&stepId=60053813&lectId=60584697) / BCAST-006958cbcbf16462144b · [잘 지내나요, 이방인?](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=20217008) / BCAST-85d72913fc864cac86dd · [산골 마을 촘린의 겨울](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=10008202&stepId=10009338&lectId=10428495) |
| C02 | 공공 서비스 역할과 안전한 시청 구간, 자극적 구조 장면 여부 | PDLOG-077 · [119, 평범한 사람들의 뜨거운 이야기](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=40049722&stepId=60053813&lectId=60658184) / BCAST-0fb5a16aeeed9badc838 · [가정의 달 특집 119수난구조대 1부](https://www.ebs.co.kr/tv/show?courseId=BP0PHPN0000000006&stepId=01BP0PHPN0000000006&lectId=10112452) / BCAST-ab131b03eca2217c89f6 · [가정의 달 특집 119수난구조대 2부](https://www.ebs.co.kr/tv/show?courseId=BP0PHPN0000000006&stepId=01BP0PHPN0000000006&lectId=10112609) |
| C03 | 급식 준비 과정과 구성원별 역할을 관찰할 장면 | PDLOG-074 · [삼시세끼의 기적, 급식 조리실](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=40049722&stepId=60053813&lectId=60650807) / BCAST-2a88cbc242d29908b6f0 · [방학 특집 급식 해방](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=20117412) / BCAST-a334e0c4d27f7656da86 · [얼굴있는 먹거리 로컬푸드 학교급식을 바꾸다](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPF0000000022&stepId=01BP0PAPF0000000022&lectId=10176469) |
| C04 | 생산·가공·유통 단계 중 실제로 설명되는 범위 | PDLOG-037 · [제주 감귤의 여정, 감귤농장 & 과줄공장](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=40049722&stepId=60053813&lectId=60559810) / BCAST-ae05d1e8e7e1cac5535b · [감귤 기차](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=BA0AA000000000009&lectId=10626486&stepId=01BA0AA000000000009) / BCAST-12ac4de07cb0b2c77f76 · [문동일의 깻잎 멸치찜과 감귤 된장무침](https://www.ebs.co.kr/tv/show?courseId=BP0PHPN0000000020&stepId=01BP0PHPN0000000020&lectId=10625984) |
| C05 | 참여·토론·의사 결정 과정의 학생 눈높이 사례 | BCAST-41236586c72656a2741e · [<지방의회, 결코 작지 않은 민주주의> 1부 의회](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60525261) / BCAST-4091c34734ae75151231 · [<지방의회, 결코 작지 않은 민주주의> 2부 조례](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60525640) / BCAST-ce1721b43f7741c59028 · [<지방의회, 결코 작지 않은 민주주의> 3부 시민](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60526117) |
| C06 | 가격 변화와 가계 소비의 관계를 설명할 근거 | BCAST-de1d0ca88548674755b2 · [누리엘 루비니 <재앙의 경제학> 4강 세계 인플레이션 전쟁](https://home.ebs.co.kr/greatminds/vodReplay/vodReplayView?courseId=40023168&stepId=60057875&lectId=60467276) / BCAST-705ecc225398d70c72cb · [돈의 얼굴 3부 돈이 떨어졌습니다](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60055748&lectId=60464077) / BCAST-1305463d0cee04bd39e3 · [혼돈시대의 중앙은행 - 1부 물가를 조절하는 보이지 않는 손](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60055808&lectId=20296035) |
| H01 | 제작 과정과 사회 모습을 연결할 유물·설명 | BCAST-edc5b3f9fd8742c0b2f0 · [“쌤들이 골라준” 벌거벗은 농사꾼 [농경문 청동기]](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60403527) / BCAST-a9ae022bed5a04b977c3 · [<불의 검> 2부 설원의 노래](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60055843&lectId=10878507) / BCAST-0e6786e007b16522e6bd · [황금비율의 비밀 - 1부 숨은 그림 찾기](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=BP0PAPB0000000005&stepId=60055909&lectId=10242022) |
| H02 | 지도 표현 방식과 지명·기호를 관찰할 장면 | BCAST-a65e80aa1b59128e5aa2 · [김정호의 갈비맛 닭다리구이×구운 양배추무침](https://www.ebs.co.kr/tv/show?courseId=BP0PHPN0000000020&stepId=01BP0PHPN0000000020&lectId=20315132) / BCAST-e92a890f9d3f1a6b393f · [김정호의 도라지 육회×들기름비빔면](https://www.ebs.co.kr/tv/show?courseId=BP0PHPN0000000020&stepId=01BP0PHPN0000000020&lectId=20316626) / BCAST-d50d5ebda538feb1b799 · [김정호의 등심스테이크×더덕조림](https://www.ebs.co.kr/tv/show?courseId=BP0PHPN0000000020&stepId=01BP0PHPN0000000020&lectId=20315133) |
| H03 | 건축물의 특징과 역사적 배경을 구분하는 설명 | ECLIP-042 · [불국사](https://primary.ebs.co.kr/parent/clip/teacherClip?courseId=10016600&lectureId=LS0000000010385734&clipId=CS000000000000005188) |
| H04 | 원인·전개·결과의 시간 순서를 확인할 자료 | BCAST-a6d0756abc2a0aa941a9 · [전봉준 - 꺼지지 않는 불꽃, 녹두장군](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=BA0AA000000000066&lectId=10139083&stepId=01BA0AA000000000066) / BCAST-7da97bb5537ae758fbc8 · [전봉준 - 백성이 하늘인 세상](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=BA0AA000000000066&lectId=10135020&stepId=01BA0AA000000000066) / BCAST-20c179826eea57fc8ed5 · [전봉준 - 일어나라 백성이여](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=BA0AA000000000066&lectId=10137517&stepId=01BA0AA000000000066) |
| H05 | 조약 내용과 당시 상황을 설명하는 근거 | BCAST-8de75540526fcd892066 · [알렉시스 더든 - 한일근대사 1강 페리 원정과 강화도 조약](https://home.ebs.co.kr/greatminds/vodReplay/vodReplayView?courseId=40023168&stepId=60057747&lectId=60309540) / ECLIP-063 · [강화도 조약](https://primary.ebs.co.kr/parent/clip/teacherClip?menuClsfnId=&menuPClsfnId=&lectureId=LS0000000010181360&clipId=CS000000000000001186) |
| H06 | 활동의 역사적 근거와 연령에 적합한 설명 | BCAST-94aa3e106b4757d14ac4 · [18살 소녀 유관순의 외침](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=40051471&lectId=60628314&stepId=60055539) |
| S01 | 계절별 기온·습도 등 관찰 항목의 비교 | BCAST-4fd098ad6619cd0bd8b6 · [막대기 하나의 힘](https://home.ebs.co.kr/worldtrip/replayView?siteCd=KH&courseId=40051878&stepId=60056366&lectId=60625543) / BCAST-b426c1e2894b8fd8648e · [한라산 날씨, 예측이 어려운 이유](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=20296126) / BCAST-b49f80b10a95303f32cc · [4월 6일의 날씨](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60094797) |
| S02 | 달의 위상과 태양·지구·달 위치 관계 설명 | BCAST-8eaaa9343c1e2e9e4bb9 · [[지식知食, 아는 만큼 맛있다] 왜 크루아상은 초승달 모양일까?](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60718140) / BCAST-47e900dbfe7e198061a8 · [293회 추석, 보름달이 떴어요!](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=10205003&lectId=60104533&stepId=20006583) / BCAST-c3a386a37448f35ea4bb · [동글동글 보름달 떡](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=BA0AA000000000017&lectId=10309606&stepId=01BA0AA000000000017) |
| S03 | 실험 과정·안전 사항·실제 재생 시간 5분 이내 | BCAST-232fc6d677c23cd16480 · [51화. 먹구름과 뭉게구름의 대결](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=10210610&lectId=60654358&stepId=20012349) / BCAST-347b86708d83ddce4793 · [구름 박사의 그림](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60122219) / BCAST-7891431a604bbf88aef4 · [구름이 없어졌어요](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=10006152&lectId=10256465&stepId=10011154) |
| S04 | 관찰·실험 결과와 증산 작용의 연결 근거 | PDLOG-059 · [위기의 백두대간을 지켜라](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=40049722&stepId=60053813&lectId=60611006) / PDLOG-056 · [환상의 나라에서 만난 정원사들](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=40049722&stepId=60053813&lectId=60604264) / BCAST-b15043803d8e35e71e15 · [[한 번쯤 궁금했던 그 질문들] 5부 식물이 먼저냐, 씨앗이 먼저냐](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=60654393) |
| S05 | 대피 행동의 정확성·자막 제공·시청 연령 적합성 | BCAST-6f42d64fdb65e6be59ff · [역사의 문을 여는 문화재 여행](https://www.ebs.co.kr/tv/show?courseId=BP0PAPC0000000028&stepId=01BP0PAPC0000000028&lectId=20185556) / BCAST-b60b2f5f607c50b1185a · [잿더미 속 진실을 찾아라!화재감식 전문 수사관](https://www.ebs.co.kr/tv/show?courseId=BP0PHPN0000000006&stepId=01BP0PHPN0000000006&lectId=20437906) / PDLOG-077 · [119, 평범한 사람들의 뜨거운 이야기](https://docuprime.ebs.co.kr/docuprime/vodReplayView?siteCd=DP&courseId=40049722&stepId=60053813&lectId=60658184) |
| S06 | 회로 연결 과정과 전기 안전 수칙을 확인할 자료 | BCAST-c709d016d655f564b923 · [어린 왕자야, 그런 일이 진짜로 있단다](https://jisike.ebs.co.kr/jisike/vodReplayView?siteCd=JE&prodId=352&courseId=BP0PAPB0000000009&stepId=01BP0PAPB0000000009&lectId=20385301) / BCAST-09875a8b67ea1ffbcb47 · [꼬마 전구들의 꿈 / 인어공주](https://anikids.ebs.co.kr/vodCommon/show?siteCd=AK&courseId=BA0AA000000000015&lectId=10622212&stepId=01BA0AA000000000015) / BCAST-5a6282770abd1f1b0487 · [페트병 전구](https://www.ebs.co.kr/tv/show?courseId=BB0CZ000000000104&stepId=01BB0CZ000000000104&lectId=10226993) |

## 다음 작업의 우선순위

모집단 확대는 [일반방송 회차 5,000건 이상 설계](DATA_EXPANSION_5000.md)를 따른다. 이 30개 시나리오는 자료 범위를 제한하는 목록이 아니라 확대 전후의 검색 공백을 비교하는 기준선이다.

1. 핵심어도 0건인 부터 공식 개별 회차·클립의 확보 가능성을 조사한다. 단어가 달라 못 찾은 것인지도 확인한다.
2. 후보가 있으나 요청 문장으로 못 찾는 경우는 학년·수업 목적·주제·제약의 분리 문제다. 자료 수집과 별도 개선 대상으로 둔다. 미지원 시간·자막 조건을 무시한 채 검색 성공으로 처리하지 않는다.
3. 지리 개념은 소개문·상품 목록·강의 목록보다 실제 해당 회차·클립 링크와 장면 근거를 보강한다.
4. 각 우선 주제에서 서로 비교 가능한 자료 3건 이상을 확보하는 것을 다음 수집 목표로 제안한다. 이는 설계 목표이며 검증된 출시 기준은 아니다. 사람에게는 근거가 확보된 후보의 최종 적합성만 요청한다.

홈페이지의 예시는 현재 후보가 있는 검색어를 쉽게 실행하는 진입점이다. 여기의 30개 요구가 모두 지원된다는 뜻은 아니다.
