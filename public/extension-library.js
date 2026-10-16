(() => {
  "use strict";
  const undoReceipts = new Map();
  const folderKey = 'curi.teacher.folders.v1', shelfKey = 'curi.discovery.shelf.v1';
  function snapshot() {
    const raw = localStorage.getItem(folderKey), shelfRaw = localStorage.getItem(shelfKey);
    const library = raw === null ? CuriTeacher.readFolders() : JSON.parse(raw);
    if (library.loadError || !Array.isArray(library.folders) || library.folders.some(f => !f || typeof f.id !== 'string' || !Array.isArray(f.items) || f.items.some(e => !e || !CuriTeacher.validResource(e.resource)))) throw new Error('기존 수업 폴더를 읽지 못했습니다. 원본을 보존하고 등록을 멈췄습니다.');
    return { raw, shelfRaw, library };
  }
  async function token(state) {
    const bytes = new TextEncoder().encode(JSON.stringify([state.raw, state.shelfRaw]));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function list() {
    const state = snapshot();
    return { folders: state.library.folders.map(f => ({ id: f.id, title: f.title || '이름 없는 수업', count: f.items.length, sourceUrls: [...new Set(f.items.map(entry => CuriSegmentCore.publicUrl(entry.resource.navigation?.url || entry.resource.sourceUrl)).filter(Boolean))], labelColor:['coral','sun','lilac','mint'].includes(f.labelColor)?f.labelColor:'folder', sceneCount:CuriSegments.read().records.filter(r=>r.folderId===f.id).length })), selectedFolderId: state.library.selectedId || '', libraryRevision: await token(state) };
  }
  async function createFolder(input) {
    const state = snapshot();
    if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200 || !/^[A-Za-z0-9_-]{1,100}$/.test(input.id)) throw new Error('새 폴더 이름을 200자 이내로 입력하세요.');
    const existing = state.library.folders.find(folder => folder.id === input.id);
    if (existing) {
      if (existing.title !== input.title.trim()) throw new Error('생성 요청의 폴더 이름이 다릅니다. 다시 확인하세요.');
      return { revision:CuriSegments.read().revision, created:true, folderId:existing.id, folderTitle:existing.title, ...(await list()) };
    }
    if (input.libraryRevision !== await token(state) || localStorage.getItem(folderKey) !== state.raw || localStorage.getItem(shelfKey) !== state.shelfRaw) throw new Error('다른 창에서 폴더가 변경됐습니다. 다시 불러온 뒤 생성하세요.');
    if (state.library.folders.length >= 50) throw new Error('수업 폴더는 50개까지 만들 수 있습니다.');
    state.library.folders.push({id:input.id,title:input.title.trim(),note:'',targetGrade:'',topic:'',items:[],curriculumStandards:[],updatedAt:new Date().toISOString()});
    state.library.selectedId = input.id;
    localStorage.setItem(folderKey,JSON.stringify({folders:state.library.folders,selectedId:input.id}));
    window.dispatchEvent(new Event('curi-library-changed'));
    return {revision:CuriSegments.read().revision,created:true,folderId:input.id,folderTitle:input.title.trim(),...(await list())};
  }
  async function deleteFolder(input) {
    const state = snapshot();
    if (!input || input.libraryRevision !== await token(state)) throw new Error('다른 창에서 자료·폴더가 변경됐습니다. 내용을 다시 불러온 뒤 삭제하세요.');
    if (!state.library.folders.some(folder => folder.id === input.folderId)) throw new Error('삭제할 폴더를 다시 확인해 주세요.');
    const library = CuriTeacher.readFolders();
    if (library.loadError || localStorage.getItem(folderKey) !== state.raw || localStorage.getItem(shelfKey) !== state.shelfRaw) throw new Error('다른 창에서 내용이 변경되어 삭제를 멈췄습니다.');
    CuriTeacher.deleteFolder(library, input.folderId);
    window.dispatchEvent(new Event('curi-library-changed'));
    window.dispatchEvent(new Event('curi-segments-changed'));
    return { deleted:true, revision:CuriSegments.read().revision, ...(await list()) };
  }
  async function register(input) {
    const state = snapshot(), segmentState = CuriSegments.read();
    if (!input || input.libraryRevision !== await token(state)) throw new Error('다른 창에서 자료·폴더가 변경됐습니다. Curi 내용을 다시 불러오세요. 입력은 유지됩니다.');
    if (!CuriSegmentCore.identity(input.video?.sourceUrl)) throw new Error('지원 본편의 회차 주소를 확인하세요.');
    let folder = state.library.folders.find(f => f.id === input.folderId);
    if (input.newFolderTitle !== undefined) {
      if (typeof input.newFolderTitle !== 'string' || !input.newFolderTitle.trim() || input.newFolderTitle.length > 200 || !/^[A-Za-z0-9_-]{1,100}$/.test(input.newFolderId)) throw new Error('새 수업 이름을 200자 이내로 입력하세요.');
      folder = state.library.folders.find(f => f.id === input.newFolderId);
      if (folder && folder.title !== input.newFolderTitle.trim()) throw new Error('새 폴더 정보가 변경됐습니다. 내용을 다시 불러오세요.');
      if (!folder) {
        if (state.library.folders.length >= 50) throw new Error('수업 폴더는 50개까지 만들 수 있습니다.');
        folder = { id: input.newFolderId, title: input.newFolderTitle.trim(), note: '', topic: '', targetGrade: '', curriculumStandards: [], items: [] };
        state.library.folders.push(folder);
      }
    }
    if (!folder) throw new Error('저장할 수업 폴더를 선택하세요.');
    const wholeVideo = input.wholeVideo;
    if (wholeVideo && (input.segment || typeof wholeVideo.name !== 'string' || !wholeVideo.name.trim() || wholeVideo.name.length > 200 || typeof wholeVideo.note !== 'string' || wholeVideo.note.length > 4000)) throw new Error('구간 이름과 메모 길이를 확인하세요.');
    // 등록 전 구간 형식/길이를 확인한다. 서버 실패 때 개인 자료는 변경하지 않는다.
    let segmentInput = input.segment;
    if (wholeVideo && input.video.kind !== 'collection') {
      if (!Number.isFinite(input.video.duration) || input.video.duration <= 0) throw new Error('전체 영상 길이를 확인하지 못했습니다. 확장을 갱신하고 EBS 본편을 재생한 뒤 다시 저장하세요.');
      segmentInput = { id:wholeVideo.id, name:wholeVideo.name, note:wholeVideo.note, start:0, end:Math.ceil(input.video.duration), capture:'PLAYER' };
    }
    const segment = segmentInput ? CuriSegmentCore.validate({ ...segmentInput, resourceId: 'pending', folderId: folder.id, sourceUrl: input.video.sourceUrl, variant: 'EPISODE', duration: input.video.duration }) : null;
    if (segment && input.revision !== segmentState.revision) throw new Error('다른 창에서 구간이 변경됐습니다. Curi 내용을 다시 불러오세요.');
    const oldSegment = segment && segmentState.records.find(r => r.id === segment.id);
    if (oldSegment && oldSegment.folderId !== folder.id) throw new Error('다른 폴더에 저장한 구간입니다. 새 구간을 눌러 별도로 저장하세요.');
    if (!oldSegment && segment && segmentState.records.length >= 2000) throw new Error('구간은 2,000개까지 저장할 수 있습니다.');
    if (folder.items.length >= 100 && !folder.items.some(e => CuriSegmentCore.identity(e.resource.navigation?.url || e.resource.sourceUrl) === CuriSegmentCore.identity(input.video.sourceUrl))) throw new Error('한 폴더에 100개 자료까지 담을 수 있습니다.');
    const response = await fetch('/api/curibase/teacher-resources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input.video), signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok || !result.stored || !CuriTeacher.validResource(result.resource)) throw new Error(result.error || 'CuriBase 저장을 확인하지 못했습니다. 서버를 최신 코드로 다시 시작하세요.');
    if (!CuriSegmentCore.sameSource(result.resource.navigation?.url || result.resource.sourceUrl, input.video.sourceUrl)) throw new Error('등록 응답의 회차가 다릅니다. 개인 저장을 멈췄습니다.');
    if (localStorage.getItem(folderKey) !== state.raw || localStorage.getItem(shelfKey) !== state.shelfRaw || CuriSegments.read().revision !== segmentState.revision) throw new Error('CuriBase에는 저장했지만 다른 창에서 개인 자료가 변경되어 폴더 저장은 보류했습니다. 내용을 다시 불러오세요.');
    const resource = result.resource;
    if (oldSegment && oldSegment.resourceId !== resource.id) throw new Error('기존 구간의 자료 연결이 다릅니다. 새 구간으로 저장하세요.');
    if (!folder.items.some(entry => entry.resource.id === resource.id)) CuriTeacher.addResourceToFolder(folder, resource);
    if (wholeVideo) {
      const entry = folder.items.find(value => value.resource.id === resource.id);
      entry.videoName = wholeVideo.name.trim();
      entry.note = wholeVideo.note;
    }
    folder.updatedAt = new Date().toISOString(); state.library.selectedId = folder.id;
    const previousSegments = localStorage.getItem(CuriSegments.key);
    try {
      localStorage.setItem(folderKey, JSON.stringify({ folders: state.library.folders, selectedId: folder.id }));
      if (segment) CuriSegments.write({ ...segment, resourceId: resource.id, sourceUrl: resource.navigation?.url || resource.sourceUrl, variant: resource.variant || '' }, input.revision);
    } catch (error) {
      try {
        if (state.raw === null) localStorage.removeItem(folderKey); else localStorage.setItem(folderKey, state.raw);
        if (previousSegments === null) localStorage.removeItem(CuriSegments.key); else localStorage.setItem(CuriSegments.key, previousSegments);
      } catch { throw new Error('CuriBase 저장 후 개인 저장 공간 오류가 발생했습니다. 내 수업의 저장 내용을 확인하세요. 입력은 유지됩니다.'); }
      throw new Error('CuriBase에는 저장했지만 내 수업 저장 공간 오류로 폴더·구간 저장을 되돌렸습니다. 입력을 유지했습니다.');
    } finally { window.dispatchEvent(new Event('curi-library-changed')); }
    const undoToken = crypto.randomUUID();
    undoReceipts.set(undoToken, {beforeFolders:state.raw,beforeSegments:previousSegments,afterFolders:localStorage.getItem(folderKey),afterSegments:localStorage.getItem(CuriSegments.key),expires:Date.now()+60000});
    for (const [key,value] of undoReceipts) if(value.expires<Date.now())undoReceipts.delete(key);
    return { undoToken, resource, segmentId:segment?.id || null, saved: true, curibaseStored: true, resourceId: resource.id, folderId: folder.id, folderTitle: folder.title, revision: CuriSegments.read().revision, ...(await list()) };
  }
  async function undoRegister(input) {
    const receipt=undoReceipts.get(input?.undoToken);
    if(!receipt || receipt.expires<Date.now())throw new Error('되돌리기 시간이 지났어요. 내 수업 자료에서 확인해 주세요.');
    if(localStorage.getItem(folderKey)!==receipt.afterFolders || localStorage.getItem(CuriSegments.key)!==receipt.afterSegments)throw new Error('다른 변경이 있어 되돌리기를 멈췄어요. 내 수업 자료에서 확인해 주세요.');
    const restore=(key,raw)=>raw===null?localStorage.removeItem(key):localStorage.setItem(key,raw);
    try {restore(folderKey,receipt.beforeFolders);restore(CuriSegments.key,receipt.beforeSegments);}
    catch(error){restore(folderKey,receipt.afterFolders);restore(CuriSegments.key,receipt.afterSegments);throw new Error('되돌리지 못했어요. 저장 공간을 확인해 주세요.');}
    undoReceipts.delete(input.undoToken);
    // 원천 등록은 유지하고 방금 담은 개인 폴더·구간만 복구한다.
    localStorage.removeItem('curi.teacher.extension-save.v1');
    window.dispatchEvent(new Event('curi-library-changed'));
    window.dispatchEvent(new Event('curi-segments-changed'));
    return {undone:true,...(await list())};
  }
  globalThis.CuriExtensionLibrary = { list, createFolder, deleteFolder, register, undoRegister };
})();
