(() => {
  "use strict";
  const core = CuriSegmentCore;
  if (!core.publicUrl(location.href)) return;
  if (globalThis.CuriPlayerVersion === '1.2.5') return;
  globalThis.CuriPlayerVersion = '1.2.5';
  let active = null, timer = null, panel = null, readyTimer = null, starting = false;
  function inspect() {
    const metadata = globalThis.CuriSourceReader?.metadata();
    const id = metadata?.identity || core.identity(location.href);
    const scripts = Array.from(document.scripts).filter(s => !s.src);
    const script = scripts.find(s => /var\s+vodCommonIDs\s*=/.test(s.textContent))?.textContent || "";
    const block = script.match(/var\s+vodCommonIDs\s*=\s*\{([^}]+)\}/)?.[1] || "";
    const parts = ["courseId", "stepId", "lectId"].map(k => block.match(new RegExp(k + '\\s*:\\s*["\x27]([A-Za-z0-9]+)["\x27]'))?.[1]);
    if (script && (!id || parts.join(":") !== id)) throw new Error("페이지 주소와 플레이어 회차 선언이 다릅니다. 원본 회차를 다시 여세요.");
    const common = document.querySelectorAll("#mediaplayerWrap .mpv-device video");
    const videos = common.length ? common : document.querySelectorAll("video");
    if (videos.length !== 1) throw new Error("지원 본편 플레이어가 준비되지 않았습니다. 영상 재생 후 다시 시도하세요.");
    const video = videos[0];
    if (!video.currentSrc || !Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < 1) throw new Error("영상 시간을 읽지 못했습니다. 본편이 준비될 때까지 기다려 주세요.");
    // 광고·연속 재생·미리보기 소스를 회차 본편으로 오인하지 않게 공개 품질 선언과 대조한다.
    const sourceBlock = script.match(/source\s*=\s*\[([\s\S]*?)var\s+realTime/)?.[1] || "";
    const sources = Array.from(sourceBlock.matchAll(/code:\s*['"](M\d+)['"][^}]*?src:\s*['"](https:[^'"]+)['"]/g));
    const normalize = u => { const parsed = new URL(u); return parsed.origin + parsed.pathname; };
    const match = sources.find(s => normalize(s[2]) === normalize(video.currentSrc));
    const stateBlock = script.match(/var\s+vodstate\s*=\s*\{([^}]+)\}/)?.[1] || "";
    const buyKey = { M05: "lowVodBuy", M10: "midVodBuy", M20: "highVodBuy", M50: "high2VodBuy" }[match?.[1]];
    if (script && (!match || !buyKey || !new RegExp(buyKey + '\\s*:\\s*["\x27]Y["\x27]').test(stateBlock))) throw new Error("광고·미리보기·다른 영상 또는 본편 접근 미확인입니다. 구간 제어를 보류합니다.");
    if (!script && (!metadata || metadata.kind !== "episode" || video.closest?.("[class*=advert], [class*=ad-player], [id*=advert], [data-ad]"))) throw new Error("광고/프로그램 목록에서는 자동 구간 지정이 보류됩니다.");
    const media = normalize(video.currentSrc);
    const publicText = document.querySelector(".player_title_wrap")?.textContent.trim() || "";
    const title = document.querySelector("#mpv-title-text")?.textContent.trim() || document.querySelector(".player_title_wrap > strong")?.textContent.trim() || publicText.split("\n")[0].trim() || "EBS 회차";
    return { video, identity: id, media, time: video.currentTime, duration: video.duration,
      title: metadata?.title || title, program: metadata?.program || document.querySelector("#mpv-program-text")?.textContent.trim() || "", summary: metadata?.summary || document.querySelector(".player_title_wrap > p")?.textContent.trim().slice(0, 4000) || "", sourceUrl: metadata?.sourceUrl || location.href.split("#")[0] };
  }
  function banner(text) {
    if (!panel) {
      panel = document.createElement("section");
      panel.setAttribute("aria-label", "Curi 구간 재생");
      panel.style.cssText = "position:fixed;right:16px;bottom:20px;z-index:2147483647;max-width:360px;background:#f7faf7;color:#243e31;border:2px solid #305f43;border-radius:10px;padding:16px;font:14px/1.6 system-ui;box-shadow:0 4px 20px #0003";
      const message = document.createElement("p"); message.dataset.curiMessage = ""; message.setAttribute("role", "status"); panel.append(message);
      for (const [label, action] of [["구간 다시 재생", () => active && begin(active.record)], ["구간 제어 해제", () => { stop(); panel.remove(); panel = null; }]]) {
        const b = document.createElement("button"); b.textContent = label; b.style.cssText = "padding:8px;margin:4px;min-height:40px";
        b.addEventListener("click", () => { Promise.resolve().then(action).catch(e => banner(e.message)); }); panel.append(b);
      }
      document.body.append(panel);
    }
    panel.querySelector("[data-curi-message]").textContent = text;
  }
  function stop() {
    clearInterval(timer); timer = null;
    if (active) active.video.removeEventListener("timeupdate", tick);
    active = null;
  }
  function tick() {
    if (!active) return;
    try {
      const current = inspect();
      if (current.video !== active.video || current.identity !== core.identity(active.record.sourceUrl) || current.media !== active.media) throw new Error("영상/회차가 바뀌어 이전 구간 제어를 해제했습니다.");
      if (current.time >= Math.min(active.record.end, current.duration)) {
        // EBS 자체 제어가 pause 후 다시 재생해도 구간 밖으로 넘어가지 않게 유지한다.
        current.video.pause();
        const end = Math.min(active.record.end, current.duration);
        if (current.video.currentTime !== end) current.video.currentTime = end;
        if (!active.finished) {
          active.finished = true;
          banner(`‘${active.record.name}’ 구간 끝 ${core.time(current.time)}에서 일시정지했습니다. 지정 끝 ${core.time(active.record.end)} · 다시 재생하거나 구간 제어를 해제할 수 있습니다.`);
        }
      }
    } catch (error) { stop(); banner(error.message); }
  }
  async function begin(record) {
    const clean = core.validate(record), current = inspect();
    if (current.identity !== core.identity(clean.sourceUrl) || clean.end > Math.ceil(current.duration)) throw new Error("회차가 다르거나 구간이 영상 길이를 넘습니다.");
    stop(); current.video.pause(); current.video.currentTime = clean.start;
    active = { record: clean, video: current.video, media: current.media };
    current.video.addEventListener("timeupdate", tick); timer = setInterval(tick, 100);
    banner(`‘${clean.name}’ ${core.time(clean.start)}~${core.time(clean.end)} 구간 재생 준비 · 영상의 재생 버튼을 눌러도 됩니다.`);
    try { await current.video.play(); banner(`‘${clean.name}’ 구간 재생 중 · 실제 시간 ${core.time(current.video.currentTime)} · 끝에서 정지`); }
    catch { banner(`시작 ${core.time(clean.start)}로 이동했습니다. EBS 재생 버튼을 누르면 끝 ${core.time(clean.end)}에서 정지합니다.`); }
  }
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (m?.type === "PLAY_AVAILABLE") {
      clearInterval(readyTimer);
      readyTimer = setInterval(ready, 1000);
      ready().then(() => reply({ value: true })).catch(error => reply({ error: error.message }));
      return true;
    }
    if (m?.type !== "INSPECT") return;
    try { const { video, ...value } = inspect(); reply({ value }); } catch (error) { reply({ error: error.message }); }
  });
  async function ready() {
    if (starting) return;
    starting = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "PLAYER_READY" });
      if (result?.error) { banner(result.error); clearInterval(readyTimer); return; }
      if (!result?.value) { clearInterval(readyTimer); return; }
      try { await begin(result.value); await chrome.runtime.sendMessage({ type: "PLAY_CONSUMED" }); clearInterval(readyTimer); }
      catch (error) { banner("구간 대기: " + error.message); }
    } catch { clearInterval(readyTimer); }
    finally { starting = false; }
  }
  readyTimer = setInterval(ready, 1000);
  const expires = setTimeout(() => { clearInterval(readyTimer); if (!active && panel) banner("구간 제어 준비 시간이 지났습니다. 본편을 재생한 뒤 Curi에서 구간을 다시 여세요."); }, 65000);
  window.addEventListener("pagehide", () => { stop(); clearInterval(readyTimer); clearTimeout(expires); });
})();
