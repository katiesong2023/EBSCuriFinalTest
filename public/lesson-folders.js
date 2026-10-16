(() => {
  "use strict";
  const key = "curi.teacher.folders.v1";
  let storedValue = null;
  const text = (value, max = 4000) => typeof value === "string" ? value.slice(0, max) : "";
  const empty = () => ({ folders: [], selectedId: "" });
  function readFolders(track = true) {
    try {
      const raw = localStorage.getItem(key);
      if (track) storedValue = raw;
      if (raw !== null) {
        const saved = JSON.parse(raw);
        if (!saved || !Array.isArray(saved.folders) || saved.folders.some((folder) => !folder || typeof folder.id !== "string" || !Array.isArray(folder.items) || folder.items.some((entry) => !entry || !CuriTeacher.validResource(entry.resource)))) throw new Error("invalid folders");
        return { ...saved, folders: saved.folders.map((folder) => ({ ...folder, title: text(folder.title, 200), note: text(folder.note), topic: text(folder.topic, 200), targetGrade: text(folder.targetGrade, 100),lessonGoal:text(folder.lessonGoal,1000), curriculumStandards: Array.isArray(folder.curriculumStandards) ? folder.curriculumStandards : [] })) };
      }
      // 이전 키는 삭제하거나 덮어쓰지 않는다. 새 폴더 저장에 실패해도 다음 방문에 다시 가져온다.
      const old = CuriTeacher.readPlan();
      if (!old.items.length && !old.title && !old.topic && !old.note) return empty();
      const folder = { id: "legacy-lesson", title: old.title || "이전 수업 준비", topic: old.topic, note: old.note, updatedAt: old.updatedAt,
        items: old.items.map(({ resource, note, question, activity, role }) => ({ resource, note, legacy: { question, activity, role } })) };
      return { folders: [folder], selectedId: folder.id, needsMigration: true };
    } catch {
      return { ...empty(), loadError: true };
    }
  }
  function saveFolders(value) {
    try {
      if (localStorage.getItem(key) !== storedValue) {
        CuriTeacher.folderSaveError = "다른 창에서 폴더가 변경되어 저장을 멈췄습니다. 현재 폴더 목록을 내려받은 뒤 새로고침해 주세요.";
        return false;
      }
      const nextValue = JSON.stringify({ folders: value.folders, selectedId: value.selectedId });
      localStorage.setItem(key, nextValue);
      storedValue = nextValue;
      CuriTeacher.folderSaveError = "";
      return true;
    } catch { CuriTeacher.folderSaveError = ""; return false; }
  }
  function deleteFolder(library, id) {
    if (localStorage.getItem(key) !== storedValue) throw new Error("다른 창에서 폴더가 변경됐습니다. 새로고침 후 다시 삭제해 주세요.");
    const next = { ...library, folders: library.folders.filter(folder => folder.id !== id) };
    if (next.selectedId === id) next.selectedId = next.folders[0]?.id || "";
    const segmentRaw = localStorage.getItem(CuriSegments.key);
    const segments = CuriSegments.read();
    const records = segments.records.filter(record => record.folderId !== id);
    const hasSegments = records.length !== segments.records.length;
    // 폴더 저장 실패 시 먼저 변경한 구간을 복구해 삭제가 일부만 적용되지 않게 한다.
    try {
      if (hasSegments) localStorage.setItem(CuriSegments.key, JSON.stringify({ ...segments, records, revision: segments.revision + 1 }));
      if (!saveFolders(next)) throw new Error(CuriTeacher.folderSaveError || "폴더를 삭제하지 못했습니다. 다시 시도해 주세요.");
    } catch (error) {
      if (hasSegments && localStorage.getItem(CuriSegments.key) !== segmentRaw) localStorage.setItem(CuriSegments.key, segmentRaw);
      throw new Error(error.message || "폴더를 삭제하지 못했습니다. 다시 시도해 주세요.");
    }
    return next;
  }
  function deleteClip(library, id, revision) {
    if (localStorage.getItem(key) !== storedValue) throw new Error('다른 창에서 폴더가 변경됐습니다. 새로고침 후 다시 삭제해 주세요.');
    const raw = localStorage.getItem(CuriSegments.key), state = CuriSegments.read();
    if (state.revision !== revision) throw new Error('다른 창에서 구간이 변경됐습니다. 다시 확인해 주세요.');
    if (!state.records.some(record => record.id === id)) throw new Error('삭제할 구간 클립 카드를 찾지 못했습니다.');
    const next = { ...library, folders: library.folders.map(folder => Array.isArray(folder.videoPlaylist) && folder.videoPlaylist.includes(id)
      ? { ...folder, videoPlaylist: folder.videoPlaylist.filter(value => value !== id), updatedAt: new Date().toISOString() } : folder) };
    try {
      localStorage.setItem(CuriSegments.key, JSON.stringify({ ...state, records: state.records.filter(record => record.id !== id), revision: state.revision + 1 }));
      if (!saveFolders(next)) throw new Error(CuriTeacher.folderSaveError || '클립을 삭제하지 못했습니다. 다시 시도해 주세요.');
    } catch (error) {
      if (localStorage.getItem(CuriSegments.key) !== raw) {
        if (raw === null) localStorage.removeItem(CuriSegments.key); else localStorage.setItem(CuriSegments.key, raw);
      }
      throw error;
    }
    return next;
  }
  function resourceCurriculum(resource) {
    if (Array.isArray(resource.personalCurriculumStandards)) return resource.personalCurriculumStandards;
    const standards = (resource.selectionContexts || []).filter(choice => choice.standardId).map(choice => ({
      id: choice.standardId, text: choice.standardText, subject: choice.subject,
      courseId: choice.courseId || choice.courses?.[0] || '', courseLabel: choice.courseLabel,
      gradeBand: choice.officialGradeBand, curriculumVersion: choice.curriculumVersion
    }));
    return [...new Map(standards.map(standard => [standard.id, standard])).values()];
  }
  function syncFolderCurriculum(folder) {
    const standards = new Map((folder.curriculumStandards || []).map(standard => [standard.id, standard]));
    const excluded = new Set(folder.excludedCurriculumStandardIds || []);
    const before = standards.size;
    for (const entry of folder.items) for (const standard of resourceCurriculum(entry.resource)) {
      if (!excluded.has(standard.id) && !standards.has(standard.id)) standards.set(standard.id, structuredClone(standard));
    }
    if (standards.size === before) return false;
    folder.curriculumStandards = [...standards.values()];
    return true;
  }
  function setFolderCurriculum(folder, standards) {
    const selected = new Set(standards.map(standard => standard.id));
    const excluded = new Set(folder.excludedCurriculumStandardIds || []);
    // 폴더에서 직접 지운 기준이 자료의 자동 반영으로 다시 생기지 않게 한다.
    for (const standard of folder.curriculumStandards || []) if (!selected.has(standard.id)) excluded.add(standard.id);
    for (const id of selected) excluded.delete(id);
    folder.excludedCurriculumStandardIds = [...excluded];
    folder.curriculumStandards = standards;
  }
  function addResourceToFolder(folder, resource) {
    if(!folder.lessonGoal && resource.lessonGoalContext?.lessonGoal)folder.lessonGoal=resource.lessonGoalContext.lessonGoal;
    const existing = folder.items.find(entry => entry.resource.id === resource.id);
    if (!existing && folder.items.length >= 100) throw new Error("한 폴더에 100개 자료까지 담을 수 있습니다.");
    if (existing) {
      const standards = [...new Map([...resourceCurriculum(existing.resource), ...resourceCurriculum(resource)].map(standard => [standard.id, standard])).values()];
      const choices = CuriTeacher.mergeSelectionContexts(existing.resource, resource);
      if (Array.isArray(existing.resource.personalCurriculumStandards) || Array.isArray(resource.personalCurriculumStandards)) existing.resource.personalCurriculumStandards = standards;
      existing.resource.selectionContexts = choices;
    }
    else folder.items.push({ resource: { ...structuredClone(resource), selectionContexts: CuriTeacher.choicesFor(resource) }, note: "" });
    syncFolderCurriculum(folder);
  }
  Object.assign(CuriTeacher, { readFolders, saveFolders, deleteFolder, deleteClip, addResourceToFolder, resourceCurriculum, syncFolderCurriculum, setFolderCurriculum, foldersKey: key });
})();
