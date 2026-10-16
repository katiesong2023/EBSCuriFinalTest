(() => {
  'use strict';
  const pending = new Map();
  let guide;
  function installGuide(section, message = '') {
    if (!guide) {
      guide = document.createElement('dialog');
      guide.id = 'clip-extension-guide';
      guide.setAttribute('aria-labelledby', 'clip-extension-guide-title');
      guide.innerHTML = `<div class="dialog-header"><h2 id="clip-extension-guide-title">구간 클립 카드 만들기</h2><button type="button" data-close>닫기</button></div><p>Chrome용 Curi 확장 프로그램으로 영상의 시작·끝을 지정하고 구간 클립 카드를 저장할 수 있습니다.</p><p data-connection-note role="status"></p><a class="clip-extension-download" href="/downloads/curi-segments-extension.zip" download>Curi 확장 프로그램 다운로드</a><ol><li>다운로드한 ZIP 파일을 마우스 오른쪽 클릭하고 ‘모두 압축 풀기’를 선택합니다. ZIP 미리보기 안에서 설치하지 마세요.</li><li>Chrome 주소창에 <code>chrome://extensions</code>를 입력하고 ‘개발자 모드’를 켭니다.</li><li>‘압축해제된 확장 프로그램을 로드합니다’를 눌러 <code>manifest.json</code>이 바로 들어 있는 폴더를 선택합니다. 폴더 안에 <code>background.js</code>와 <code>popup.html</code>도 보여야 합니다. 상위 폴더나 ZIP 파일을 선택하면 ‘매니페스트 파일이 없거나 읽을 수 없음’ 오류가 납니다. 전체 프로젝트를 받았다면 <code>extensions → curi-segments</code> 폴더를 선택해도 됩니다. 기존 설치는 새 파일로 갱신합니다.</li><li>Chrome 오른쪽 위의 확장 프로그램(퍼즐 모양) 메뉴에서 EBS CURI를 고정하세요.<div class="clip-extension-launch"><img src="/brand/icon-32.png" alt="EBS CURI 확장 프로그램의 폴더 아이콘" width="32" height="32"><span><strong>EBS CURI</strong>이 폴더 아이콘을 누르면 확장 프로그램이 열립니다. 영상 옆 패널에서 구간을 지정하고 저장하세요.</span></div></li><li>열린 확장 프로그램의 ‘EBS CURI 연결’에서 아래 Curi 주소로 연결합니다.<code data-curi-origin></code></li><li>이 페이지를 새로고침하고 ‘구간 클립 카드 만들기’를 다시 누릅니다. EBS에서 시작·끝을 정한 뒤 저장하면 이 카드 아래에 나타납니다.</li></ol><a data-open-source target="_blank" rel="noopener noreferrer">EBS 방송 먼저 열기 ↗</a>`;
      document.body.append(guide);
      guide.querySelector('[data-close]').addEventListener('click', () => guide.close());
    }
    guide.querySelector('[data-curi-origin]').textContent = location.origin;
    guide.querySelector('[data-open-source]').href = section.dataset.segmentUrl;
    guide.querySelector('[data-connection-note]').textContent = message || '확장 프로그램이 연결되지 않았습니다. 설치하거나 기존 확장의 연결·버전을 확인해 주세요.';
    const button = section.querySelector('[data-create-clip]');
    guide.onclose = () => { if (button.isConnected) button.focus({ preventScroll: true }); };
    guide.showModal();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-create-clip]');
    if (!button) return;
    const section = button.closest('.lesson-clip-list');
    const id = button.dataset.extensionOpening;
    delete button.dataset.extensionOpening;
    if (!id) return installGuide(section);
    button.disabled = true;
    section.querySelector('[data-clip-status]').textContent = 'EBS와 구간 클립 카드 확장 프로그램을 여는 중입니다…';
    const timer = setTimeout(() => {
      pending.delete(id); button.disabled = false;
      if (section.isConnected) installGuide(section, '확장 실행 응답이 없습니다. 확장을 갱신하고 이 페이지를 새로고침해 주세요.');
    }, 8000);
    pending.set(id, { section, button, timer });
  });
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'CURI_CLIP_LAUNCH') return;
    const task = pending.get(event.data.id);
    if (!task) return;
    clearTimeout(task.timer); pending.delete(event.data.id); task.button.disabled = false;
    if (!task.section.isConnected) return;
    if (event.data.error) return installGuide(task.section, event.data.error);
    task.section.querySelector('[data-clip-status]').textContent = 'EBS와 구간 클립 카드 패널을 열었습니다. 저장한 클립은 아래에 표시됩니다.';
  });
})();
