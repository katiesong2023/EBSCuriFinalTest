# Curi 다운로드·설치·테스트 안내

작성일: 2026-10-16. 대상: macOS/Windows, 데스크톱 Chrome.

Windows 사용자는 [00_실행방법.txt](../00_실행방법.txt)에 Node.js 설치 링크부터 파일 탐색기에서 명령 프롬프트를 여는 단계까지 순서대로 안내되어 있습니다.

Node.js 공식 다운로드: https://nodejs.org/en/download
Windows x64 테스트 버전 설치 파일: https://nodejs.org/dist/v24.18.0/node-v24.18.0-x64.msi
Windows ARM64 테스트 버전 설치 파일: https://nodejs.org/dist/v24.18.0/node-v24.18.0-arm64.msi

## 다운로드

GitHub 저장소에서 Code → Download ZIP을 누르고 ZIP을 완전히 풉니다. package.json이 바로 보이는 폴더가 프로젝트 폴더입니다. source라는 하위 폴더를 찾을 필요가 없습니다. Git clone이나 Release의 Source code ZIP도 같은 구성입니다.

## 준비물과 실행

Node.js24.18.0 이상과 npm, Chrome이 필요합니다. 프로젝트 폴더에서 터미널을 열어 다음을 한 줄씩 실행합니다.

```sh
node --version
npm --version
npm ci
npm start
```

Windows에서는 설치 후 열려 있던 터미널 창을 모두 닫고, 프로젝트 폴더를 탐색기로 열어 Alt+D → cmd → Enter를 누릅니다. 검은 명령 프롬프트에서 dir package.json, node --version, npm.cmd --version을 확인한 뒤 npm.cmd ci, npm.cmd start를 순서대로 실행합니다. 이 방법은 cd나 경로 붙여넣기가 필요하지 않습니다. PowerShell에서도 npm.cmd 명령을 사용하면 npm.ps1 실행 정책 문제를 피할 수 있습니다. macOS에서는 터미널에 cd와 공백을 입력한 뒤 프로젝트 폴더를 끌어놓고 Enter를 눌러 이동할 수 있습니다.

npm start는 먼저 server/data/submission-seed의 압축 데이터와 지문을 검사하고 없는 DB만 자동 복원합니다. 이미 있는 DB는 덮어쓰지 않습니다. 데이터를 준비한 뒤 로컬 서버가 시작됩니다. 수동 복원이 필요할 때는 npm run data:restore도 가능합니다. 복원 오류가 나면 원본 압축 데이터를 다시 받으세요. 개인 DB나 자료를 임의로 삭제하지 않습니다.

브라우저에서 http://localhost:3000을 엽니다. 첫 검색의 색인 준비는 수십 초 걸릴 수 있으며 첫 검색 대기는 최대120초입니다. 종료는 서버 터미널에서 Ctrl+C입니다. 같은 브라우저 프로필과 같은 localhost 주소를 사용해야 개인 자료가 유지됩니다.

## API 키와 데이터

실제 .env와 API 키는 포함하지 않습니다. 기본 로컬 검색은 키 없이 사용하며 교사 모델 정책은 비활성입니다. 데이터 복원에는 인터넷이 필요하지 않습니다. npm 설치·필요한 로컬 모델의 최초 다운로드·EBS 페이지/영상 이용에는 인터넷이 필요할 수 있습니다. 로그인이나 시청 권한은 EBS에서 별도로 처리합니다.

## 기본 확인

1. 첫 화면이 열리면 지구의 자전 또는 기후 변화로 검색하고 결과/빈 결과 안내가 표시되는지 확인합니다.
2. 자료의 원문·출처·설명을 확인합니다. 검색 후보와 실제 수업 적합성은 별도 판단입니다.
3. 가져가기에서 교육과정을 선택하거나 선택 안 함으로 진행합니다. 설치 테스트라는 새 폴더를 만들어 저장합니다.
4. 내 수업 자료에서 폴더·자료·영상 노트 메모를 확인하고 새로고침해 보존되는지 확인합니다.
5. 개인 자료는 브라우저별/접속 주소별 저장입니다. 다른 기기 동기화는 제공하지 않습니다.

## Chrome 확장

chrome://extensions → 개발자 모드 켜기 → 압축해제된 확장 프로그램을 로드합니다 → 프로젝트의 extensions/curi-segments 폴더를 선택합니다. manifest.json이 바로 있는 폴더여야 합니다.

http://localhost:3000/lesson.html 탭을 유지하고 도구 모음에 확장 아이콘을 고정해 누릅니다. EBS CURI 연결에서 http://localhost:3000으로 연결하면 웹의 폴더를 불러올 수 있습니다. 확장을 갱신하면 확장 카드와 Curi/EBS 탭을 새로고침합니다.

실제 EBS 회차를 열고 필요하면 로그인한 뒤 본편을 직접 재생합니다. 확장에서 영상·폴더를 확인하고 시작/끝을 지정해 저장합니다. 구간은 영상 파일이 아니라 원본 링크와 시간 기록입니다. 모든 EBS 플레이어의 지원을 보장하지 않습니다.

저장된 구간 카드를 수업 영상 리스트로 드래그해 담고 순서를 변경할 수 있습니다. 리스트에서 지워도 원래 구간은 유지됩니다. 실제 재생·시점 이동·끝 정지는 계정과 회차에서 별도 확인해야 합니다.

## 확인 범위

앞선 macOS 독립 ZIP 검사에서 설치·서버·검색·교육과정 선택·폴더/메모 저장·새로고침·합성 구간 리스트·확장 브리지를 확인했습니다. 새 압축 DB 구성도 Git 소스 ZIP을 새 폴더에 풀어 초기 DB0개에서 npm ci/npm start·DB4개 자동 복원/지문/무결성·브라우저8검사를 통과했습니다. 복원 계약4검사에서 기존 데이터 보존과 손상 파일 차단도 확인했습니다. Windows 설치·네이티브 사이드 패널 전체 UI·실제 EBS 본편/끝 정지는 미검증입니다.

## Hugging Face 의존성과 차단 시 동작

실행 DB와 모델 파일은 별개다. 현재 ZIP은 DB만 포함하며 Xenova/multilingual-e5-small 모델(revision 761b726dd34fb83930e26aab4e9ac3899aa1fa78)은 최초 사용 시 Hugging Face에서 받는다. local-embedding-worker.js는 config.json/tokenizer_config.json/tokenizer.json/onnx/model_quantized.onnx를 server/data/.model-cache/Xenova/multilingual-e5-small/해당revision/ 경로에 준비하고 로컬 전용으로 모델을 로드한다. 모델이 완전히 준비되면 임베딩에 Hugging Face 접속은 필요하지 않다.

모델이 없는 사본에서 워커의 외부 fetch를 거절한 실제 검사로 지구의 자전2개·기후 변화85개(첫 페이지9개) 결과와 retrieval.semantic=LOCAL_FAILED, keyword=true를 확인했다. 직접 임베딩 실행은 실패했다. 이는 단어 검색 fallback 두 사례의 확인이며 전체 검색 품질·의미 검색 성공 검증은 아니다. 사내망이나 Windows에서 직접 검사한 결과도 아니다.

앞선 ZIP 설치·브라우저 검사는 모델 다운로드 완료를 검증하지 않았다. 같은 검사 사본에서 모델의 .download 임시 파일이 남은 것을 확인해 의미 검색 완료로 간주하지 않는다. 최초 다운로드가 검색 제한 시간 내 끝나지 않을 수도 있다.

Hugging Face 접속이 차단된 환경에서는 보안 담당자와 승인된 다운로드/모델 파일 제공 방법을 협의한다. 홈페이지뿐 아니라 저장/CDN 연결 대상도 필요하다. 공식 안내: https://huggingface.co/docs/hub/en/models-downloading#downloading-behind-a-proxy-or-firewall
