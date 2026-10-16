// 연결된 Curi 서버의 배포 버전과 현재 설치 버전을 비교한다.
(() => {
  'use strict';
  const notice = document.querySelector('#extension-update');
  let requestNumber = 0;
  function parts(version) {
    if (typeof version !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(version)) return null;
    const values = version.split('.').map(Number);
    return values.every(value => Number.isInteger(value) && value <= 65535) ? values : null;
  }
  function isNewer(latest, installed) {
    const a = parts(latest), b = parts(installed);
    if (!a || !b) return false;
    for (let i = 0; i < 4; i++) {
      const difference = (a[i] || 0) - (b[i] || 0);
      if (difference) return difference > 0;
    }
    return false;
  }
  async function check() {
    const number = ++requestNumber;
    try {
      const settings = await chrome.storage.local.get('curiOrigin');
      const origin = CuriSegmentCore.origin(settings.curiOrigin || 'http://localhost:3000');
      if (!origin) throw new Error('invalid origin');
      const response = await fetch(`${origin}/downloads/curi-segments-version.json`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('version unavailable');
      const release = await response.json();
      if (number !== requestNumber) return;
      const installed = chrome.runtime.getManifest().version;
      notice.hidden = !isNewer(release.version, installed);
      if (notice.hidden) return;
      notice.querySelector('[data-update-version]').textContent = `현재 ${installed} → 최신 ${release.version}`;
      notice.querySelector('[data-update-download]').href = `${origin}/downloads/curi-segments-extension.zip`;
    } catch {
      // 서버 연결 실패를 업데이트 필요로 표시하지 않는다.
      if (number === requestNumber) notice.hidden = true;
    }
  }
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.curiOrigin) { notice.hidden = true; void check(); }
  });
  window.addEventListener('focus', () => { void check(); });
  setInterval(() => { if (!document.hidden) void check(); }, 300000);
  void check();
})();
