# EBS CURI

2022 개정 교육과정과 EBS 공식 방송 메타데이터를 활용하는 교사 검색·수업 자료 서비스입니다.

## Windows에서 실행

1. **Code → Download ZIP**으로 내려받고 완전히 압축을 풉니다.
2. **CURI_START.cmd**를 두 번 클릭합니다.
3. 준비 완료 후 Chrome에서 **http://localhost:3000**을 엽니다. 실행 창은 열어 둡니다.

Windows 10/11 x64(Intel/AMD)용 Node.js 24.18.0·패키지·검색 모델·실행 DB를 포함합니다. 첫 실행 시 로컬 압축 파일을 자동 검사·복원하므로 Node 설치, npm 설치, Hugging Face 다운로드, API 키가 필요 없습니다. Chrome은 별도 준비합니다. 일부 PC에서 Microsoft Visual C++ 라이브러리가 없으면 동봉된 `runtime/windows-x64/vc_redist.x64.exe`를 설치해야 하며 관리자 승인이 필요할 수 있습니다.

자세한 절차·문제 해결·macOS/Windows ARM 소스 실행은 [00_실행방법.txt](00_실행방법.txt), [설치 및 확인 안내](docs/INSTALL_AND_TEST_GUIDE.md)를 참고하세요. Chrome 확장 설치 파일은 `extensions/curi-segments`입니다.

## 포함 범위

- 실행 DB 4개와 고정 버전 `Xenova/multilingual-e5-small` 검색 모델 4파일을 포함합니다. 모델은 최초 실행 시 로컬 캐시에 복원됩니다.
- Windows 실행 환경과 모델은 GitHub 파일 크기를 고려해 분할 압축했습니다. 수동으로 합치거나 풀 필요가 없습니다.
- 실제 API 키·개인 `.env`·기존 Git 이력·개인 교사 등록 DB·브라우저 개인 자료·유료 모델 응답 캐시는 포함하지 않습니다.
- 유료 교사 검색 정책은 `enabled: false`입니다. 동봉한 로컬 의미 검색은 유료 LLM 검색을 사용하는 개발 환경과 결과·순위가 다를 수 있습니다.
- 검색 모델 추론에 Hugging Face 접속은 필요 없습니다. EBS 영상·로그인·외부 이미지는 인터넷이 필요합니다. 영상 원본은 포함하지 않습니다.
- 개인 폴더·메모·구간은 브라우저와 접속 주소별로 저장됩니다.
- Windows 실제 실행과 실제 EBS 재생은 별도 확인 대상입니다. 최종 보고서 PDF·시연 MP4도 별도 준비 대상입니다.
- GitHub 저장소는 로컬 실행 파일을 제공하는 용도이며 GitHub Pages에서 Node 서버가 실행되지는 않습니다.

## 라이선스 및 문서

모델 출처·고정 버전·MIT 라이선스는 `third-party/model`, Node.js 라이선스·패키지 출처는 `third-party/windows-runtime` 및 실행 환경 내부 각 패키지에 포함합니다. 공식 교육과정·EBS 자료와 외부 라이브러리 권리는 각 권리자에게 있습니다.

[개발 정리](docs/CURI_DEVELOPMENT_SUMMARY.md) · [핵심 설명](docs/SUBMISSION_CORE_MESSAGE.md) · [향후 확장](docs/SUBMISSION_FUTURE_EXPANSION.md) · [촬영 시나리오](docs/SUBMISSION_VIDEO_SCENARIO.md) · [구조](docs/ARCHITECTURE.md) · [저장 구조](docs/ERD.md) · [기존 README 이력](docs/README_DEVELOPMENT_HISTORY.md)
