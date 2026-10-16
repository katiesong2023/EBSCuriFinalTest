# EBS CURI

2022 개정 교육과정과 EBS 공식 방송 메타데이터를 활용하는 교사 수업 준비 MVP입니다. 자료 검색·원문 근거 확인·교육과정 연결·개인 수업 폴더·구간 북마크·수업 영상 리스트를 제공합니다.

## 실행 파일 받기

**이 저장소는 소스 열람용이며, 실행에 필요한 SQLite DB는 Releases의 전체 패키지에 들어 있습니다.**

1. 이 저장소의 **Releases**에서 `EBS_CURI_Submission_20261016.zip`을 받습니다. GitHub가 자동 생성한 `Source code (zip)`에는 실행 DB가 없으므로 직접 첨부한 패키지를 선택합니다.
2. ZIP을 완전히 풀고 `EBS_CURI_Submission_20261016/source` 폴더로 이동합니다.
3. Node.js **24.18.0 이상**과 npm을 설치한 뒤 아래를 실행합니다.

```sh
npm ci
npm start
```

4. Chrome에서 `http://localhost:3000`을 엽니다.
5. 확장 기능은 압축을 푼 패키지의 `source/extensions/curi-segments`를 Chrome 개발자 모드에서 로드합니다.

자세한 설치·테스트 방법은 [설치 안내](docs/INSTALL_AND_TEST_GUIDE.md)를 따릅니다. 처음 npm 설치·필요 모델 다운로드·EBS 영상 시청에는 인터넷과 영상별 이용 권한이 필요할 수 있습니다.

Git clone으로 실행하려면 같은 버전의 Release ZIP에 들어 있는 `source/server/data/*.sqlite` 파일을 이 저장소의 `server/data/`에 복사한 뒤 위 명령을 실행합니다. 원천 재수집이나 seed 명령으로 DB를 임의 복구하지 않습니다.

## 제출 사본의 범위

- 현재 작업본의 소스와 공식 메타데이터·교육과정·근거 문서를 제공합니다. 구체적인 진행 상태와 한계는 [PLANS](docs/PLANS.md)를 참고합니다.
- 실제 API 키·개인 `.env`·기존 Git 이력·개인 교사 등록 DB·브라우저 개인 자료·모델 및 응답 캐시는 포함하지 않습니다.
- 교사 모델 정책은 `enabled: false`입니다. 유료 API를 켜지 않는 로컬 검색이며 모델 검색을 사용한 개발 환경과 결과·순위가 다를 수 있습니다.
- 개인 폴더·메모·구간은 사용하는 브라우저와 접속 주소에 저장됩니다. 영상 원본은 포함하지 않습니다.
- 최종 보고서 PDF와 실제 시연 MP4는 아직 준비되지 않았습니다. 문안·촬영 시나리오는 최종 보고서·영상의 대체물이 아닙니다.
- GitHub 저장소는 소스 제공용입니다. 현재 Node.js 서버가 GitHub Pages에서 실행되는 구조는 아닙니다.

## 문서

- [개발 정리](docs/CURI_DEVELOPMENT_SUMMARY.md)
- [핵심 설명](docs/SUBMISSION_CORE_MESSAGE.md)
- [향후 확장](docs/SUBMISSION_FUTURE_EXPANSION.md)
- [촬영 시나리오](docs/SUBMISSION_VIDEO_SCENARIO.md)
- [구조](docs/ARCHITECTURE.md) · [저장 구조](docs/ERD.md)
- [기존 개발 README 이력](docs/README_DEVELOPMENT_HISTORY.md)

공식 교육과정·EBS 자료 및 외부 라이브러리의 권리는 각 권리자에게 있습니다. 저장소에 자료를 포함했다는 사실만으로 재배포·상업 이용 권한을 부여하지 않습니다.
