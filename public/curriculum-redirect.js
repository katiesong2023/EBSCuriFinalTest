// 이전 교사 주소의 기준 목록 조건을 보존하고 통합 화면으로 이동한다.
location.replace(`/?${CuriSearchState.legacyParams(new URLSearchParams(location.search))}`);
