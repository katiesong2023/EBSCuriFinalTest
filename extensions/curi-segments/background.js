importScripts("segment-core.js");
const core = CuriSegmentCore;
// Chrome 자체 패널을 사용해 영상 페이지 옆에서 작업을 계속한다.
function configureSidePanel() {
  return chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(error => console.error("Curi 사이드 패널 설정 실패:", error));
}
chrome.runtime.onInstalled.addListener(configureSidePanel);
chrome.runtime.onStartup.addListener(configureSidePanel);
void configureSidePanel();
async function configuredOrigin() {
  return core.origin((await chrome.storage.local.get("curiOrigin")).curiOrigin || "http://localhost:3000");
}
let clipOrigin = null;
void configuredOrigin().then(origin => { clipOrigin = origin; }).catch(() => {});
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === 'local' && changes.curiOrigin) clipOrigin = core.origin(changes.curiOrigin.newValue || 'http://localhost:3000');
});
async function notifyClipReady(tabId) {
  try {
    const key = 'clip:' + tabId, task = (await chrome.storage.session.get(key))[key];
    if (!task || task.notified || task.origin !== clipOrigin || !core.sameSource(task.sourceUrl, (await chrome.tabs.get(tabId)).url)) return;
    await chrome.storage.session.set({ [key]: { ...task, notified: true } });
    chrome.runtime.sendMessage({ type: 'CLIP_READY', tabId }).catch(() => {});
  } catch { /* 로딩 중 닫힌 탭은 후속 실행하지 않는다. */ }
}
async function readyCuriTab() {
  const origin = await configuredOrigin();
  if (!origin) throw new Error("Curi 주소를 다시 설정하세요.");
  const candidates = (await chrome.tabs.query({})).filter(t => {
    try { const u = new URL(t.url); return u.origin === origin && u.pathname === "/lesson.html"; } catch { return false; }
  });
  async function ping(tab) {
    let timer;
    try {
      const result = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: "CURI_REQUEST", action: "PING" }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("연결 지연")), 2000); })
      ]);
      return result && !result.error && result.value?.origin === origin && result.value?.protocol === 4;
    } catch { return false; }
    finally { clearTimeout(timer); }
  }
  // 확장 갱신 전 열린 탭을 새로고침해 사용자의 입력을 없애지 않는다.
  for (const tab of candidates) if (await ping(tab)) return tab;
  const tab = await chrome.tabs.create({ url: origin + "/lesson.html", active: false });
  for (let i = 0; i < 20; i++) {
    if (await ping(tab)) return tab;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Curi에 연결하지 못했습니다. ${origin}/lesson.html 에 접속되는지 확인하세요. 서버 주소의 localhost/127.0.0.1과 포트가 같아야 합니다. 입력은 보존됩니다.`);
}
async function askCuri(action, value) {
  const tab = await readyCuriTab();
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: "CURI_REQUEST", action, value });
    if (!result || result.error) throw new Error(result?.error || "Curi 응답이 없습니다.");
    return result.value;
  } catch (error) {
    throw new Error(`Curi 요청 실패: ${error.message}. 입력을 유지했습니다. Curi 연결·자료 불러오기로 다시 확인하세요.`);
  }
}
async function openSegment(record) {
  const clean = core.validate(record), tab = await chrome.tabs.create({ url: clean.sourceUrl, active: true });
  await chrome.storage.session.set({ ["play:" + tab.id]: { record: clean, origin: await configuredOrigin(), createdAt: Date.now() } });
  // 빠른 페이지가 요청 저장 전에 준비 확인을 끝낸 경우에도 다시 전달한다.
  // 아직 스크립트가 없는 탭은 로드 후 PLAYER_READY로 요청을 가져간다.
  await chrome.tabs.sendMessage(tab.id, { type: "PLAY_AVAILABLE" }).catch(() => {});
  return { opened: true };
}
async function readSourceTab(tabId, type) {
  let result;
  try {
    result = await chrome.tabs.sendMessage(tabId, { type });
    if (!result) throw new Error('영상 읽기 연결이 없습니다.');
  } catch {
    // 확장 갱신 전 열린 EBS 탭은 페이지/재생 위치를 유지한 채 읽기 스크립트만 연결한다.
    await chrome.scripting.executeScript({ target:{tabId}, files:['segment-core.js','source-reader.js','player.js'] });
    result = await chrome.tabs.sendMessage(tabId, { type });
  }
  if (!result || result.error) throw new Error(result?.error || '플레이어를 찾지 못했습니다.');
  return result.value;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'CREATE_CLIP') {
    try {
      const page = new URL(sender.url), sourceUrl = core.publicUrl(message.sourceUrl);
      if (sender.id !== chrome.runtime.id || !sender.tab || !core.origin(page.origin) || (clipOrigin && page.origin !== clipOrigin) || page.pathname !== '/lesson.html') throw new Error('확장의 Curi 연결 주소를 확인한 뒤 다시 눌러 주세요.');
      if (!sourceUrl || typeof message.folderId !== 'string' || !/^[A-Za-z0-9_-]{0,100}$/.test(message.folderId)) throw new Error('구간 클립 카드의 영상·폴더 정보를 확인해 주세요.');
      // await 전에 열어 버튼 클릭의 사용자 활성화를 유지한다. 글로벌 패널은 새 EBS 탭에도 유지된다.
      const opening = chrome.sidePanel.open({ windowId: sender.tab.windowId });
      (async () => {
        // 워커가 절전에서 깨어난 첫 클릭도 처리하고 새 EBS 탭 생성 전 정확한 주소를 대조한다.
        const [, origin] = await Promise.all([opening, configuredOrigin()]);
        if (page.origin !== origin) throw new Error('확장의 Curi 연결 주소를 확인한 뒤 다시 눌러 주세요.');
        clipOrigin = origin;
        const tab = await chrome.tabs.create({ url: sourceUrl, active: true });
        await chrome.storage.session.set({ ['clip:' + tab.id]: { sourceUrl, folderId: message.folderId, origin } });
        if ((await chrome.tabs.get(tab.id)).status === 'complete') await notifyClipReady(tab.id);
        return { opened: true, tabId: tab.id };
      })().then(value => respond({ value })).catch(error => respond({ error: error.message }));
    } catch (error) { respond({ error: error.message }); }
    return true;
  }
  const run = async () => {
    if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") throw new Error("허용하지 않은 연결입니다.");
    const fromPopup = !sender.tab && sender.url === chrome.runtime.getURL("popup.html");
    const origin = await configuredOrigin();
    const fromCuri = sender.tab && new URL(sender.url).origin === origin && new URL(sender.url).pathname === "/lesson.html";
    if (message.type === "PLAYER_READY") {
      if (!sender.tab || !core.identity(sender.url)) throw new Error("지원 EBS 페이지가 아닙니다.");
      const key = "play:" + sender.tab.id, task = (await chrome.storage.session.get(key))[key];
      if (!task) return null;
      if (Date.now() - task.createdAt > 120000 || task.origin !== origin || core.identity(sender.url) !== core.identity(task.record.sourceUrl)) {
        await chrome.storage.session.remove(key); throw new Error("구간 재생 요청이 만료됐거나 회차가 다릅니다.");
      }
      return task.record;
    }
    if (message.type === "PLAY_CONSUMED") {
      if (!sender.tab || !core.identity(sender.url)) throw new Error("지원 EBS 페이지가 아닙니다.");
      await chrome.storage.session.remove("play:" + sender.tab.id); return true;
    }
    if (message.type === "OPEN" && fromCuri) return openSegment(message.record);
    if (!fromPopup) throw new Error("확장 프로그램에서 요청해 주세요.");
    if (message.type === "CONFIGURE") {
      const next = core.origin(message.origin); if (!next) throw new Error("http://localhost:포트 또는 http://127.0.0.1:포트 주소를 입력하세요.");
      await chrome.storage.local.set({ curiOrigin: next });
      return askCuri("PING", null, true);
    }
    if (message.type === "VIDEOS") {
      const tabs = (await chrome.tabs.query({})).filter(t => core.publicUrl(t.url));
      const tasks = await chrome.storage.session.get(tabs.map(tab => 'clip:' + tab.id));
      return tabs.map(t => {
        const task = tasks['clip:' + t.id];
        return { id: t.id, title: t.title, sourceUrl: t.url, active: t.active === true, ...(task?.origin === origin && core.sameSource(task.sourceUrl, t.url) ? { clipFolderId: task.folderId } : {}) };
      });
    }
    if (message.type === 'RESUME_CLIP') {
      const sourceUrl = core.publicUrl(message.sourceUrl);
      if (!sourceUrl) throw new Error('이어갈 EBS 회차 주소를 확인하세요.');
      const matching = (await chrome.tabs.query({})).filter(tab=>core.sameSource(tab.url,sourceUrl));
      let tab = matching.find(tab=>tab.id===message.preferredTabId) || matching.find(tab=>tab.active) || matching[0];
      if (tab) {
        tab = await chrome.tabs.update(tab.id,{active:true});
        if (message.reload === true) await chrome.tabs.reload(tab.id);
      } else tab = await chrome.tabs.create({url:sourceUrl,active:true});
      if (chrome.windows?.update && tab.windowId !== undefined) await chrome.windows.update(tab.windowId,{focused:true});
      return {opened:true,tabId:tab.id};
    }
    if (message.type === "FOLDER_OPEN") {
      const workspace=await askCuri("WORKSPACE");
      if(!workspace.folders.some(folder=>folder.id===message.folderId))throw new Error("수업 폴더를 다시 선택하세요.");
      await chrome.tabs.create({url:origin+"/lesson.html?view=folder&folder="+encodeURIComponent(message.folderId)}); return {opened:true};
    }
    if (message.type === "UNDO_REGISTER") {
      const result=await askCuri("UNDO_REGISTER",{undoToken:message.undoToken});
      if(result.undone)await chrome.storage.local.remove('lastSave');
      return result;
    }
    if (message.type === "WORKSPACE") return askCuri("WORKSPACE");
    if (message.type === "CREATE_FOLDER") return askCuri("CREATE_FOLDER", message.value);
    if (message.type === "DELETE_FOLDER") return askCuri("DELETE_FOLDER", message.value);
    if (message.type === "TARGETS") return askCuri("LIST");
    if (message.type === "REGISTER") {
      const tab = (await chrome.tabs.query({})).find(t => t.id === message.tabId);
      if (!tab || !core.identity(tab.url)) throw new Error("지원 EBS 회차 페이지에서 사용하세요.");
      const inspected = await chrome.tabs.sendMessage(tab.id, { type: message.value?.segment?.capture === "PLAYER" ? "INSPECT" : "METADATA" });
      if (!inspected?.value || inspected.error) throw new Error(inspected?.error || "본편 확인 실패");
      let v = inspected.value;
      if (message.expectedIdentity && v.identity !== message.expectedIdentity) throw new Error("영상이 바뀌었습니다. 영상 목록을 새로고침해 저장 대상을 다시 확인하세요.");
      if (message.value?.wholeVideo && v.kind !== 'collection') {
        // 맛보기/광고 길이를 전체 영상 끝으로 저장하지 않도록 본편 길이를 확인한다.
        const full = await readSourceTab(tab.id, 'INSPECT');
        if (!core.sameSource(full.sourceUrl, v.sourceUrl) || full.identity !== v.identity) throw new Error('영상이 바뀌었습니다. 영상 목록을 새로고침해 주세요.');
        if (!Number.isFinite(full.duration) || full.duration <= 0) throw new Error('전체 영상 길이를 확인하지 못했습니다. EBS 본편을 재생한 뒤 다시 저장하세요.');
        v = { ...v, duration: full.duration };
      }
      const result = await askCuri("REGISTER", { ...message.value, video: { title: v.title, sourceUrl: v.sourceUrl, summary: v.summary || "", program: v.program || "", kind:v.kind || "episode", duration: v.duration } });
      if (result?.saved) await chrome.storage.local.set({ lastSave: { ...result, identity: v.identity, origin, savedAt: new Date().toISOString(), notice: `내 수업 페이지와 CuriBase에 저장되었습니다 · ${result.folderTitle}.` } });
      return result;
    }
    if (message.type === "SAVE") return askCuri("IMPORT", { record: core.validate(message.record), revision: message.revision });
    if (["METADATA", "INSPECT", "SET_START", "SET_END"].includes(message.type)) {
      const tab = (await chrome.tabs.query({})).find(t => t.id === message.tabId);
      if (!tab || !core.identity(tab.url)) throw new Error("지원 EBS 회차 페이지에서 사용하세요.");
      const value = await readSourceTab(tab.id, message.type === 'METADATA' ? 'METADATA' : 'INSPECT');
      if (['SET_START','SET_END'].includes(message.type)) {
        if (value?.identity !== message.expectedIdentity && !core.sameSource(value?.sourceUrl, message.expectedSourceUrl)) throw new Error('회차가 바뀌었습니다. 영상 목록을 새로고침해 주세요.');
        if (!Number.isFinite(value?.time) || value.time < 0) throw new Error('현재 재생 시간을 읽지 못했습니다. 본편을 재생한 뒤 다시 지정해 주세요.');
        return { ...value, currentTime:value.time, time:core.boundary(value.time,message.type==='SET_END'?'end':'start'), tabId:tab.id };
      }
      return { ...value, tabId: tab.id };
    }
    throw new Error("지원하지 않는 요청입니다.");
  };
  run().then(value => respond({ value })).catch(e => respond({ error: e.message }));
  return true;
});
chrome.tabs.onUpdated.addListener((id, change) => { if (change.status === 'complete') void notifyClipReady(id); });
chrome.tabs.onRemoved.addListener(id => chrome.storage.session.remove(["play:" + id, 'clip:' + id]));
