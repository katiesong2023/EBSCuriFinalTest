# GitHub 업로드·다운로드 안내

이 폴더가 저장소의 최상위입니다. 소스·교육과정·압축 DB·Chrome 확장을 함께 올립니다. 데이터 파일은 각각100MiB 미만이므로 일반 Git으로 올릴 수 있습니다. Git LFS나 별도 Release 첨부는 필요하지 않습니다.

## 올리는 사람

GitHub Desktop에서 이 변경 내용을 커밋하고 Push origin으로 GitHub에 반영합니다. 별도의 제출 ZIP을 첨부할 필요가 없습니다. 새 Release를 만들고 싶으면 이 커밋을 가리키는 새 태그로 발행하면 포함된 데이터 폴더까지 Source code ZIP에 자동 포함됩니다.

## 받는 사람

Code → Download ZIP → 압축 해제 → package.json 폴더에서 npm ci → npm start → http://localhost:3000 순서로 실행합니다. Node.js24.18.0 이상이 필요합니다. npm start가 포함된 데이터의 누락 DB를 자동 복원하며 기존 DB는 덮어쓰지 않습니다.

브라우저 확장은 extensions/curi-segments 폴더를 Chrome의 압축해제된 확장 프로그램 로드로 설치합니다. 자세한 절차는 README와 docs/INSTALL_AND_TEST_GUIDE.md에 있습니다.

최종 보고서 PDF·시연 MP4는 여전히 별도 제출 준비 대상입니다. GitHub 게시만으로 웹 서비스가 자동 실행되지는 않습니다.
