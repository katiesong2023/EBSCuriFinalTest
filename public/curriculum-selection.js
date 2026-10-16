(() => {
  "use strict";
  const { escape } = CuriTeacher;
  let catalog, pending;
  async function load() {
    if (catalog) return catalog;
    if (!pending) pending = fetch('/api/curi/curriculum', { signal: AbortSignal.timeout(15000) }).then(async response => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.standards) || !data.standards.length) throw Error('공식 교육과정을 불러오지 못했습니다.');
      catalog = data.standards;
      CuriTeacher.setSelectionStandards(catalog);
      CuriTeacher.shelfContext?.standardsLoaded();
      return catalog;
    }).finally(() => { pending = null; });
    return pending;
  }
  function snapshot(standard) {
    return Object.fromEntries(['id','text','subject','courseId','courseLabel','gradeBand','curriculumVersion'].map(key => [key, typeof standard[key] === 'string' ? standard[key] : '']));
  }
  function withStandards(resource, selected) {
    const next = structuredClone(resource);
    const choices = Array.isArray(next.selectionContexts) && next.selectionContexts.length ? CuriTeacher.choicesFor(next) : [];
    for (const standard of selected) {
      if (choices.some(choice => choice.standardId === standard.id && choice.courseId === standard.courseId)) continue;
      const choice = CuriTeacher.newChoice({ ...next, teachingContext: null, selectedStandard: null, lessonGoalContext: null }, true);
      Object.assign(choice, { standardId: standard.id, standardText: standard.text, subject: standard.subject, courseId: standard.courseId,
        courses: standard.courseId ? [standard.courseId] : [], courseLabel: standard.courseLabel, officialGradeBand: standard.gradeBand,
        curriculumVersion: standard.curriculumVersion, snapshot: { ...choice.snapshot, standardId: standard.id, standardText: standard.text,
          subject: standard.subject, courseLabel: standard.courseLabel, label: '교사가 개인 수업 활용 기준으로 선택 · 자료 연계 검증과 별개' } });
      choices.push(choice);
    }
    if (choices.length > 20) throw Error('한 자료에는 선택 이유를 20개까지 보존할 수 있습니다.');
    next.selectionContexts = choices.length ? choices : [CuriTeacher.newChoice(next, true)];
    if (Array.isArray(next.personalCurriculumStandards)) {
      next.personalCurriculumStandards = [...new Map([...next.personalCurriculumStandards, ...selected.map(snapshot)].map(standard => [standard.id, standard])).values()];
    }
    return next;
  }
  function mount(host, { selected = [], resource = null, searchQuery = resource?.query || "", leadingControl = null, initialCourse = "", onChange = () => {} } = {}) {
    const chosen = new Map(selected.map(item => [item.id, snapshot(item)]));
    let list = [], related = [], mode = resource ? 'related' : 'all', relatedFailed = false;
    host.classList.add('curriculum-select');
    host.innerHTML = `<p class="curriculum-select-intro">교육과정 연결 · 선택 사항 · 여러 개 선택 가능</p><div data-views ${resource ? '' : 'hidden'}><button type="button" data-related aria-pressed="${mode === 'related'}">이 자료 관련 후보 보기</button><button type="button" data-all aria-pressed="${mode === 'all'}">전체 기준 보기</button></div><div class="curriculum-select-controls" ${mode === 'related' ? 'hidden' : ''}><label>교과<select data-subject><option value="">사회·과학</option><option>사회</option><option>과학</option></select></label><label>과정<select data-course><option value="">전체 과정</option><option value="elementary34">초등 3~4학년군</option><option value="elementary56">초등 5~6학년군</option><option value="middle1">중1 · EBS 편성 참고</option></select></label><label>기준 찾기<input data-query type="search" maxlength="200" placeholder="주제어·기준 문장·코드"></label></div><p data-status role="status">교육과정 목록을 불러오는 중입니다…</p><button type="button" data-retry hidden>다시 불러오기</button><div data-selected class="curriculum-selected"></div><div data-options class="curriculum-select-options" role="group" aria-label="교육과정 다중 선택"></div>`;
    const $ = selector => host.querySelector(selector);
    if (leadingControl) {
      const controls = $('.curriculum-select-controls');
      controls.prepend(leadingControl);
      controls.insertBefore($('[data-course]').closest('label'), $('[data-subject]').closest('label'));
      $('[data-query]').closest('label').firstChild.textContent = '검색';
    }
    $('[data-course]').value = initialCourse;
    function setCourse(value) { $('[data-course]').value = value || ''; render(); }
    const values = () => [...chosen.values()];
    function remove(id) { chosen.delete(id); onChange(values()); render(); }
    function render() {
      const all = mode === 'all';
      $('.curriculum-select-controls').hidden = !all;
      const q = all ? $('[data-query]').value.trim().toLocaleLowerCase() : '', subject = all ? $('[data-subject]').value : '', course = all ? $('[data-course]').value : '';
      const byId = new Map(list.map(item => [item.id, item]));
      const candidates = all ? list : related.map(item => byId.get(item.id)).filter(Boolean);
      const options = candidates.filter(item => (!subject || item.subject === subject) && (!course || item.courseId === course) && (!q || `${item.id} ${item.text} ${item.goalTopic || ''}`.toLocaleLowerCase().includes(q)));
      $('[data-related]').setAttribute('aria-pressed', String(!all));
      $('[data-all]').setAttribute('aria-pressed', String(all));
      $('[data-selected]').innerHTML = `<b>선택 ${chosen.size}개</b>` + values().map(item => `<button type="button" data-unselect="${escape(item.id)}" aria-label="${escape(GradeContext.standardLabel(item))} 선택 해제">${escape(GradeContext.standardLabel(item))} ×</button>`).join('');
      $('[data-options]').innerHTML = options.map(item => `<label><input type="checkbox" value="${escape(item.id)}" ${chosen.has(item.id) ? 'checked' : ''}><span><b>${escape(GradeContext.standardLabel(item))} · ${escape(item.courseLabel)}</b><br>${escape(item.text)}</span></label>`).join('');
      $('[data-status]').textContent = !all ? relatedFailed ? '관련 후보를 불러오지 못했습니다. 전체 기준에서 직접 선택하거나 다시 불러오세요.' : options.length ? `${options.length}개 관련 후보 · ${searchQuery ? '검색어와 자료 내용을 반영한' : '자료 내용에 따른'} 관련도순` : '관련 기준 후보가 없습니다. 전체 기준에서 직접 선택할 수 있습니다.' : `${options.length}개 기준 · 선택하지 않고 가져갈 수도 있습니다.`;
    }
    async function refresh() {
      $('[data-status]').textContent = '교육과정 목록을 불러오는 중입니다…'; $('[data-retry]').hidden = true;
      try {
        list = await load();
        if (resource) {
          try {
            const response = await fetch('/api/curi/curriculum/related', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body:JSON.stringify({title:resource.title || '',summary:resource.summary || '',searchQuery}),
              signal:AbortSignal.timeout(12000)
            });
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.related)) throw Error('관련 후보 조회 실패');
            related = data.related; relatedFailed = false;
          } catch { relatedFailed = true; $('[data-retry]').hidden = false; }
        }
        render();
      } catch { $('[data-status]').textContent = '교육과정을 불러오지 못했습니다. 선택한 기준은 유지됩니다. 기준 없이 가져가거나 다시 불러오세요.'; $('[data-retry]').hidden = false; }
    }
    host.addEventListener('input', event => { if (event.target.matches('[data-query]')) render(); });
    host.addEventListener('change', event => {
      if (event.target.type === 'checkbox') {
        const standard = list.find(item => item.id === event.target.value);
        if (!standard) return;
        if (event.target.checked && chosen.size >= 20) { event.target.checked = false; $('[data-status]').textContent = '교육과정은 20개까지 선택할 수 있습니다.'; return; }
        if (event.target.checked) chosen.set(standard.id, snapshot(standard)); else chosen.delete(standard.id);
        onChange(values());
      }
      render();
    });
    host.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.unselect) remove(button.dataset.unselect);
      if (button.matches('[data-all], [data-related]')) { mode = button.matches('[data-all]') ? 'all' : 'related'; render(); }
      if (button.matches('[data-retry]')) refresh();
    });
    refresh();
    return { values, setCourse, remove, setSelected(standards) { chosen.clear(); for (const standard of standards) chosen.set(standard.id, snapshot(standard)); render(); }, clear() { chosen.clear(); render(); } };
  }
  CuriTeacher.curriculumSelection = { mount, withStandards, load };
})();
