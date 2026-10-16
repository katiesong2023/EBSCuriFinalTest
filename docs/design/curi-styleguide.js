'use strict';
const select = (selector) => document.querySelector(selector);
let bringTrigger;
let materialTitle = "";
let connected = true;
const bring = select('#bring-dialog');
function setStep(step) {
  select('#bring-curriculum').hidden = step !== 1;
  select('#bring-destination').hidden = step !== 2;
  select('#bring-step').textContent = step === 1 ? '1 / 2 · 교육과정' : '2 / 2 · 폴더';
  document.querySelectorAll('.step-dots i').forEach((dot, index) => dot.classList.toggle('active', index === step - 1));
  const count = document.querySelectorAll('#bring-curriculum input:checked').length;
  select('#bring-summary').textContent = `${materialTitle} · 연결 교육과정 ${count}개 · 아직 저장되지 않았습니다.`;
  if (bring.open) (step === 1 ? select('#curriculum-one') : select('#destination')).focus();
}
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== button.dataset.view; });
  document.querySelectorAll('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
}));
document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
  select('#search-page').hidden = button.dataset.page !== 'search';
  select('#library-page').hidden = button.dataset.page !== 'library';
  document.querySelectorAll('[data-page]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
}));
select('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  select('#search-status').textContent = select('#query').value.trim() ? '예시 후보 2개' + ' · 실제 검색 결과가 아닌 디자인 시안입니다.' : '수업 준비 요청을 입력해주세요.';
});
document.querySelectorAll('.bring-open').forEach((button) => button.addEventListener('click', () => {
  bringTrigger = button;
  materialTitle = button.closest("article").querySelector("h3").textContent;
  setStep(1);
  select('#bring-error').textContent = '';
  bring.showModal();
}));
select('#next-step').addEventListener('click', () => setStep(2));
select('#skip-curriculum').addEventListener('click', () => {
  document.querySelectorAll('#bring-curriculum input').forEach((input) => { input.checked = false; });
  setStep(2);
});
select('#previous-step').addEventListener('click', () => setStep(1));
select('#destination').addEventListener('change', () => {
  select('#new-folder-field').hidden = select('#destination').value !== 'new';
  if (!select('#new-folder-field').hidden) select('#new-folder').focus();
});
select('#finish-bring').addEventListener('click', () => {
  const name = select('#destination').value === 'new' ? select('#new-folder').value.trim() : select('#destination').value;
  if (!name) { select('#bring-error').textContent = '새 폴더 이름을 입력해주세요.'; select('#new-folder').focus(); return; }
  select('#web-save-status').textContent = `${materialTitle} · ${name} 폴더에 가져오는 화면을 확인했어요. (시뮬레이션 · 실제 저장 없음)`;
  bring.close();
});
bring.addEventListener('close', () => { if (bringTrigger) bringTrigger.focus(); });
document.querySelectorAll('dialog .close').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('.detail-open').forEach((button) => button.addEventListener('click', () => select('#detail-dialog').showModal()));
document.querySelectorAll('[data-folder]').forEach((button) => button.addEventListener('click', () => {
  select('#folder-title').textContent = button.dataset.folder;
  document.querySelectorAll('[data-folder]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  document.querySelectorAll('.library-row').forEach((row) => { row.hidden = button.dataset.folder !== '전체' && row.dataset.location !== button.dataset.folder; });
}));
select('#new-folder-open').addEventListener('click', () => {
  select('#folder-status').textContent = '실제 화면에서는 새 폴더 이름과 교육과정 선택을 제공합니다. 이 시안에서는 자료 찾기의 가져가기로 새 폴더 입력을 확인할 수 있습니다.';
});
document.querySelectorAll('input[name=content]').forEach((input) => input.addEventListener('change', () => {
  select('#segment-fields').hidden = select('input[name=content]:checked').value === 'video';
}));
select('#connection-toggle').addEventListener('click', () => {
  connected = !connected;
  select('#connection').textContent = connected ? '연결됨' : '연결 필요';
  select('#connection-toggle').textContent = connected ? '연결 실패 상태 보기' : '연결 복구 시뮬레이션';
  select('#ext-status').textContent = connected ? '연결 상태를 복구했어요. 입력은 유지됩니다. (시뮬레이션)' : 'Curi에 연결하지 못했어요. 입력을 유지한 채 다시 연결할 수 있습니다. (시뮬레이션)';
  select('#ext-status').className = connected ? 'save-message' : 'save-message error';
  select('#ext-save').disabled = !connected;
});
function seconds(text) {
  const parts = text.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d{1,2}$/.test(part))) return NaN;
  if (parts.slice(1).some((part) => Number(part) >= 60)) return NaN;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}
select('#ext-save').addEventListener('click', () => {
  const segment = select('input[name=content]:checked').value === 'segment';
  const start = seconds(select('#start').value);
  const end = seconds(select('#end').value);
  if (segment && (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > 504)) {
    select('#ext-status').textContent = '시작과 끝을 mm:ss로 입력하고, 끝은 시작 이후 08:24 이내로 지정해주세요.';
    select('#ext-status').className = 'save-message error';
    return;
  }
  select('#ext-status').textContent = `${select('#ext-folder').value} 폴더 · ${segment ? '영상과 구간 1개' : '영상 전체'} 가져오기 완료 예시. 실제 저장은 하지 않았습니다.`;
  select('#ext-status').className = 'save-message success';
});
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('button,input,select,a[href]')].filter((element) => !element.disabled && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}));
