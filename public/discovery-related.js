(() => {
  'use strict';
  const $ = selector => document.querySelector(selector), panel = $('#related-listings');
  let state, shelf = [], rows = [], page = 1, pages = 1, retryPage = 1, controller, revision = 0, loaded = false;
  function reset() {
    revision++; controller?.abort(); state = null; rows = []; loaded = false; page = 1;
    panel.open = false; panel.hidden = true; $('#related-listing-cards').replaceChildren();
    $('#related-listing-pagination').hidden = true; $('#related-listing-retry').hidden = true;
    $('#related-listing-status').textContent = '';
  }
  async function load(nextPage = 1) {
    if (!state) return;
    retryPage = nextPage;
    controller?.abort(); controller = new AbortController();
    const active = controller, version = ++revision;
    $('#related-listing-status').textContent = '관련 목록을 불러오고 있습니다…';
    $('#related-listing-retry').hidden = true;
    $('#related-listing-pagination').hidden = true;
    $('#related-listing-cards').replaceChildren(); rows = [];
    const timeout = setTimeout(() => active.abort(), 30000);
    try {
      const params = CuriSearchState.apiParams({ ...state, kind: 'listing', page: String(nextPage) });
      const response = await fetch('/api/curi/discover?' + params, { signal: active.signal });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '관련 목록을 불러오지 못했습니다.');
      if (version !== revision) return;
      rows = data.results; page = data.page; pages = data.pages; loaded = true;
      $('#related-listing-status').textContent = data.total ? `관련 목록 ${data.total}건` : '현재 조건에 맞는 관련 목록이 없습니다.';
      $('#related-listing-cards').innerHTML = rows.map((item, index) => CuriTeacher.card(item, (page - 1) * data.pageSize + index + 1, shelf)).join('');
      $('#related-listing-pagination').hidden = pages <= 1;
      $('#related-listing-page').textContent = `${page} / ${pages} 페이지`;
      $('#related-listing-previous').disabled = page <= 1;
      $('#related-listing-next').disabled = page >= pages;
    } catch (error) {
      if (version !== revision) return;
      loaded = false;
      $('#related-listing-status').textContent = error.name === 'AbortError' ? '응답이 늦습니다. 다시 시도해 주세요.' : error.message;
      $('#related-listing-retry').hidden = false;
    } finally { clearTimeout(timeout); }
  }
  panel.addEventListener('toggle', () => { if (panel.open && !loaded && state) load(); });
  $('#related-listing-previous').addEventListener('click', () => load(Math.max(1, page - 1)));
  $('#related-listing-next').addEventListener('click', () => load(Math.min(pages, page + 1)));
  $('#related-listing-retry').addEventListener('click', () => load(retryPage));
  CuriTeacher.related = { reset, render(data, current, currentShelf) {
    state = { ...current }; shelf = currentShelf;
    const count = data.filters.kind.find(option => option.value === 'listing')?.count || 0;
    panel.hidden = !count || ['collection', 'listing'].includes(current.kind);
    $('#related-listing-count').textContent = `(${count}건)`;
  }, find(id) { return rows.flatMap(item => [item, ...(item.alternatives || [])]).find(item => item.id === id); } };
})();
