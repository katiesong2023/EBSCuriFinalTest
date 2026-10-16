# GitHub 업로드와 다운로드

이 폴더가 저장소 최상위입니다. 소스·압축 DB·검색 모델·Windows x64 실행 환경·Chrome 확장을 올립니다. 모델과 실행 환경의 큰 압축은 조각당70MiB 이하로 나눠 일반 Git 파일당100MiB 제한 안에 둡니다. 실행 후 만들어진 node_modules/runtime/모델 캐시/DB는 추적하지 않습니다.

## 올리는 사람

GitHub Desktop에서 변경 내용을 확인하고 커밋한 뒤 Push origin을 눌러야 온라인 파일이 바뀝니다. 새 Release를 만들 경우 이 변경을 포함한 커밋에 새 태그를 붙이면 자동 Source code ZIP에도 동봉 파일이 포함됩니다. 기존 태그의 Release는 자동으로 최신 main을 반영하지 않습니다. 별도 완성 ZIP을 첨부하려면 이번에 새로 만든 EBSCuriFinalTest-Windows-x64.zip을 사용하세요.

## 받는 사람

Code → Download ZIP 또는 새 태그의 Source code ZIP 다운로드 → 모두 압축 풀기 → start-windows.cmd 두 번 클릭 → Chrome에서 http://localhost:3000 순서입니다. 실행 환경·DB·모델을 자동 복원하므로 Windows x64에서는 Node/npm/Hugging Face 설치·다운로드가 필요 없습니다. 일부 PC에서는 동봉된 Visual C++ 보조 설치가 필요할 수 있습니다. Chrome과 EBS 영상용 인터넷은 별도입니다.

압축 조각을 직접 풀거나 별도 파일을 추가 다운로드하지 않습니다. Windows ARM/macOS 실행과 확장 설치는 00_실행방법.txt를 참고하세요. 보고서 PDF·시연 MP4는 별도 준비 대상이며 GitHub 게시만으로 웹 배포 URL이 생기지는 않습니다.
