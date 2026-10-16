# 설치 및 최종 확인

## Windows x64 실행

최상위 [00_실행방법.txt](../00_실행방법.txt)가 최신 실행 절차입니다. ZIP을 완전히 풀고 `start-windows.cmd`를 두 번 클릭한 뒤 Chrome에서 http://localhost:3000 을 엽니다. 창을 닫으면 서버도 종료됩니다. Chrome을 준비해야 하며 일부 PC에는 동봉한 Microsoft Visual C++ 보조 설치 파일 설치가 필요합니다.

Windows 10/11 x64용 Node.js·네이티브 패키지와 검색 모델을 포함합니다. 스크립트는 runtime-seed/windows-x64의 조각/전체 ZIP SHA-256 확인 후 실행 환경을 복원하고, server/prepare-submission.js로 DB4개와 모델4개를 준비합니다. 모델은 고정 revision 및 원본 해시·분할 압축 해시를 검증합니다. 기존 DB는 보존하며 손상된 모델은 동봉본으로 복구합니다. 실제 .env는 자동 실행에서 읽지 않고 유료 API는 비활성입니다.

## 소스 실행

macOS·Windows ARM은 해당 환경용 Node.js24.18.0 이상 설치 후 프로젝트 폴더에서 `npm ci`, `npm start`를 실행합니다(Windows CMD에서는 npm.cmd). npm 설치에는 인터넷이 필요합니다. Windows x64용으로 복원한 node_modules는 다른 OS에서 재사용하지 마세요. 동봉 모델 자동 복원 후에는 Hugging Face 접속 없이 의미 검색을 실행합니다.

## 화면 확인

1. Chrome에서 http://localhost:3000 을 열고 주제를 입력해 검색합니다. 첫 검색은 색인 준비로 수십 초 걸릴 수 있습니다.
2. 검색 결과의 원문 출처와 교육과정 표시를 확인합니다.
3. 자료를 폴더에 저장하고 메모를 작성한 뒤 새로고침하여 보존을 확인합니다.
4. Chrome 확장 관리에서 개발자 모드를 켜고 extensions/curi-segments를 로드합니다. http://localhost:3000/lesson.html 탭을 유지하고 확장의 Curi 주소를 동일하게 맞춥니다.
5. 인터넷 연결 후 EBS 본편을 열고 필요한 경우 로그인하여 구간 저장·실제 재생·끝 정지를 확인합니다. 영상 이용 권한과 플레이어 조건은 별도입니다.

## 확인 범위와 한계

기존 macOS 독립 소스 ZIP 검사에서는 DB 복원·서버·검색·교육과정·폴더/메모·확장 브리지를 확인했습니다. 당시 모델 다운로드가 완료되지 않아 의미 검색 성공으로 간주하지 않습니다. 이후 모델 없는 상태에서 외부 fetch 차단 시 단어 검색 fallback과 임베딩 실패를 확인했습니다.

이번 모델 동봉본은 별도 새 폴더에서 외부 접속을 차단한 실제 로컬 임베딩과 의미 검색을 검사하며 결과를 배포 준비 기록에 남깁니다. Windows용 파일 구성·해시는 macOS에서 검사할 수 있지만 Windows .cmd/PowerShell 실행, 시스템 라이브러리·보안 정책, 실제 EBS 본편과 끝 정지는 Windows에서 최종 확인해야 합니다. 이 안내 자체가 Windows 실행 통과 기록은 아닙니다.
