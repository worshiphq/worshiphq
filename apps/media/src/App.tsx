import { useState, useEffect } from "react";
import { AppHeader, AppSidebar, type Workspace } from "./components/AppShell";
import { LiveView } from "./components/LiveView";
import { ServiceView } from "./components/ServiceView";
import { ScriptureView } from "./components/ScriptureView";
import { SongsView } from "./components/SongsView";
import { MediaView } from "./components/MediaView";
import { VoiceView } from "./components/VoiceView";
import { SettingsView, type SettingsTab } from "./components/SettingsView";
import { VoiceBanner } from "./components/VoiceBanner";
import { LicenseGate } from "./components/LicenseGate";
import { useProjectionStore } from "./stores/projection-store";
import { useVoiceStore } from "./stores/voice-store";
import { useThemeStore } from "./stores/theme-store";
import { Launcher } from "./components/Launcher";
import type { Slide } from "./types";

export default function App() {
  const [launched, setLaunched] = useState(false);
  const [workspace, setWorkspaceRaw] = useState<Workspace>("bible");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("looks");
  // "looks" and "screens" open those tabs of Settings.
  const setWorkspace = (w: Workspace) => {
    if (w === "looks" || w === "screens") { setSettingsTab(w); setWorkspaceRaw("settings"); }
    else setWorkspaceRaw(w);
  };

  // Shortcuts, like EasyWorship: Ctrl+C clear/unclear the words, Ctrl+B black, Ctrl+L logo,
  // Ctrl+1…6 to move between screens. (Ctrl+C still copies when you have text selected or are typing.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!launched || !e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;
      const k = e.key.toLowerCase();
      const proj = useProjectionStore.getState();
      if (k === "c" && !e.shiftKey) {
        if (typing || (window.getSelection()?.toString() ?? "").length > 0) return;
        e.preventDefault(); proj.toggleClearText();
      } else if (k === "b" && !e.shiftKey && !typing) { e.preventDefault(); proj.toggleBlack(); }
      else if (k === "l" && !e.shiftKey && !typing) { e.preventDefault(); proj.toggleLogo(); }
      else if (/^[1-7]$/.test(k)) {
        const map: Workspace[] = ["service", "live", "bible", "songs", "media", "voice", "settings"];
        e.preventDefault(); setWorkspace(map[Number(k) - 1]);
      } else if (k === ",") { e.preventDefault(); setWorkspace("settings"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launched]);

  // Keep the stage display (confidence monitor) up to date with what's on screen and what's next.
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let last = "";
    const toText = (sl: Slide | null) =>
      sl ? { text: sl.media ? `[${sl.media.kind === "video" ? "Video" : "Picture"}] ${sl.label ?? ""}` : sl.content.primaryText ?? "", label: sl.label ?? sl.content.secondaryText ?? "" } : null;
    const push = () => {
      const p = useProjectionStore.getState();
      const state = {
        current: p.isLive && !p.textCleared ? toText(p.currentSlide) : null,
        next: toText(p.nextSlide),
        message: p.stageMessage,
        timerTo: p.stageTimerTo,
        black: p.isBlack,
      };
      const json = JSON.stringify(state);
      if (json === last) return;
      last = json;
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("stage_update", { stateJson: json }).catch(() => {}));
    };
    push();
    return useProjectionStore.subscribe(push);
  }, []);

  // Messages from the desktop side: the voice assistant, and the projector window being closed by hand.
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    const off: (() => void)[] = [];
    let cancelled = false;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const { invoke } = await import("@tauri-apps/api/core");
      off.push(await listen<string>("voice-event", (e) => useVoiceStore.getState().handleEvent(e.payload)));
      const voice = useVoiceStore.getState();
      if (voice.autoStart && voice.status === "off") voice.start();
      off.push(await listen("projection-closed", () => useProjectionStore.getState().markProjectionClosed()));
      off.push(await listen("stage-closed", () => useProjectionStore.getState().markStageClosed()));
      // After a reload, find out whether the projector window is still open.
      const open = await invoke<boolean>("projection_is_open").catch(() => false);
      if (!open) useProjectionStore.getState().markProjectionClosed();
      if (cancelled) off.forEach((f) => f());
    })();
    return () => { cancelled = true; off.forEach((f) => f()); };
  }, []);

  // Changing Look & fonts updates what is already on the projector.
  useEffect(() => {
    let t: number | undefined;
    const off = useThemeStore.subscribe(() => {
      window.clearTimeout(t);
      t = window.setTimeout(() => useProjectionStore.getState().refreshLive(), 120);
    });
    return () => { off(); window.clearTimeout(t); };
  }, []);

  if (!launched) {
    return <Launcher onEnter={() => setLaunched(true)} />;
  }

  return (
    <LicenseGate>
      <div className="flex h-full flex-col bg-surface">
        <AppHeader />
        <VoiceBanner />
        <div className="flex min-h-0 flex-1">
          <AppSidebar workspace={workspace} onChange={setWorkspace} />
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {workspace === "bible" ? (
              <ScriptureView onOpenLooks={() => setWorkspace("looks")} />
            ) : workspace === "songs" ? (
              <SongsView />
            ) : workspace === "media" ? (
              <MediaView />
            ) : workspace === "settings" ? (
              <SettingsView tab={settingsTab} onTab={setSettingsTab} onOpenMedia={() => setWorkspace("media")} />
            ) : workspace === "voice" ? (
              <VoiceView onOpenBible={() => setWorkspace("bible")} />
            ) : workspace === "service" ? (
              <ServiceView onGoLive={() => setWorkspace("live")} onOpenBible={() => setWorkspace("bible")} onOpenMedia={() => setWorkspace("media")} />
            ) : (
              <LiveView onOpenBible={() => setWorkspace("bible")} />
            )}
          </main>
        </div>
      </div>
    </LicenseGate>
  );
}
