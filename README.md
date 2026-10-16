# EBS CURI

2022 개정 교육과정과 EBS 공식 방송 메타데이터를 활용하는 교사 수업 준비 MVP입니다. 자료 검색·원문 근거 확인·교육과정 연결·개인 수업 폴더·구간 북마크·수업 영상 리스트를 제공합니다.

처음 실행하는 경우 **[00_실행방법.txt](00_실행방법.txt)**를 순서대로 따라 하세요.

## 다운로드하고 실행하기

**GitHub의 Code → Download ZIP으로 받은 파일에 실행 데이터와 Chrome 확장이 모두 포함됩니다.** 별도의 Release 파일을 첨부하거나 DB를 따로 받을 필요가 없습니다.

1. 저장소 화면의 초록색 **Code → Download ZIP**을 누릅니다.
2. 받은 ZIP을 완전히 풀고 **package.json이 있는 폴더**에서 터미널을 엽니다.
3. Node.js **24.18.0 이상**과 npm을 설치한 뒤 아래 명령을 한 줄씩 실행합니다.

```sh
npm ci
npm start
```

4. Chrome에서 **http://localhost:3000**을 엽니다. 첫 검색은 자료 색인을 준비하므로 수십 초 걸릴 수 있습니다.
5. Chrome 확장 기능은 `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**로 `extensions/curi-segments` 폴더를 선택합니다.

실행 DB는 `server/data/submission-seed`의 압축 파일로 포함되어 있습니다. `npm start`가 처음 실행될 때 SHA-256과 크기를 검증해 누락된 DB만 자동 복원합니다. 이미 존재하는 DB는 덮어쓰지 않습니다. 이 데이터 복원에는 인터넷이나 API 키가 필요하지 않습니다. npm 설치·EBS 영상 이용에는 인터넷과 영상별 시청 권한이 필요할 수 있습니다.

[설치 안내](docs/INSTALL_AND_TEST_GUIDE.md)에서 세부 절차를 확인할 수 있습니다. Git clone 또는 Release가 자동 생성한 Source code ZIP으로도 같은 방식으로 실행합니다.

## 제출 사본의 범위

- 현재 작업본의 소스와 공식 메타데이터·교육과정·근거 문서를 제공합니다. 구체적인 진행 상태와 한계는 [PLANS](docs/PLANS.md)를 참고합니다.
- 실제 API 키·개인 `.env`·기존 Git 이력·개인 교사 등록 DB·브라우저 개인 자료·모델 및 응답 캐시는 포함하지 않습니다.
- 교사 모델 정책은 `enabled: false`입니다. 유료 API를 켜지 않는 로컬 검색이며 모델 검색을 사용한 개발 환경과 결과·순위가 다를 수 있습니다.
- 개인 폴더·메모·구간은 사용하는 브라우저와 접속 주소에 저장됩니다. 영상 원본은 포함하지 않습니다.
- 최종 보고서 PDF와 실제 시연 MP4는 아직 준비되지 않았습니다. 문안·촬영 시나리오는 최종 보고서·영상의 대체물이 아닙니다.
- GitHub 저장소는 내려받아 로컬에서 실행하는 소스·데이터 제공용입니다. 현재 Node.js 서버가 GitHub Pages에서 실행되는 구조는 아닙니다.

## 문서

- [개발 정리](docs/CURI_DEVELOPMENT_SUMMARY.md)
- [핵심 설명](docs/SUBMISSION_CORE_MESSAGE.md)
- [향후 확장](docs/SUBMISSION_FUTURE_EXPANSION.md)
- [촬영 시나리오](docs/SUBMISSION_VIDEO_SCENARIO.md)
- [구조](docs/ARCHITECTURE.md) · [저장 구조](docs/ERD.md)
- [기존 개발 README 이력](docs/README_DEVELOPMENT_HISTORY.md)

공식 교육과정·EBS 자료 및 외부 라이브러리의 권리는 각 권리자에게 있습니다. 저장소에 자료를 포함했다는 사실만으로 재배포·상업 이용 권한을 부여하지 않습니다.
