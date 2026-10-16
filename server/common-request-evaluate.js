// 두 고정 개발 집합을 같은 카탈로그·로컬 의미 엔진으로 검증한다. 각 실행기의 별도 결과/지문은 유지한다.
(async () => {
  await require('./discovery-catalog').loadDiscoveryCatalog();
  require('./request-test200-evaluate');
  require('./request-development-evaluate');
})().catch(error => { console.error(error); process.exitCode = 1; });
