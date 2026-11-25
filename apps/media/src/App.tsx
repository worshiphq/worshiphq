import { X } from "lucide-react";
import { useState, useEffect } from "react";
import { plainText } from "./lib/rich-text";
import { backgroundSlide } from "./components/BackgroundPicker";
import { lastBackground } from "./stores/show-store";
import { useExtrasStore } from "./stores/extras-store";
import { runRemoteAction, startMidi } from "./lib/remote";
import { PreviewLive } from "./components/PreviewLive";
import { useShowStore } from "./stores/show-store";
import type { MenuAction } from "./components/MenuBar";
import { openSchedule, saveSchedule } from "./lib/schedule-file";
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
import { NotesView } from "./components/NotesView";
import { startNotes } from "./stores/notes-store";
import { UpdateBanner } from "./components/UpdateBanner";
import { startUpdateChecks, useUpdateStore } from "./lib/updates";
import { startAccountCheckIns } from "./lib/account";

export default function App() {
  const [launched, setLaunched] = useState(false);
  const [workspace, setWorkspaceRaw] = useState<Workspace>("bible");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("looks");
  // Settings opens as a window over the page you are on, so you never lose your place.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewShown, setPreviewShownRaw] = useState(() => { try { return localStorage.getItem("whq-preview-shown") !== "0"; } catch { return true; } });
  const setPreviewShown = (v: boolean) => { setPreviewShownRaw(v); try { localStorage.setItem("whq-preview-shown", v ? "1" : "0"); } catch { /* ignore */ } };

  /** Menu bar actions. Song and media actions open their page, then tell it what to do. */
  async function onMenu(a: MenuAction) {
    const tell = (page: Workspace, action: string) => { setWorkspace(page); setTimeout(() => window.dispatchEvent(new CustomEvent("whq-menu", { detail: action })), 80); };
    const proj = useProjectionStore.getState();
    switch (a) {
      case "bible": case "songs": case "media": case "voice": case "notes": setWorkspace(a); break;
      case "live:tools": case "live": setWorkspace("live"); break;
      case "schedule:plan": setWorkspace("service"); break;
      case "settings": setSettingsOpen(true); break;
      case "settings:looks": case "settings:screens": case "settings:audio": case "settings:shortcuts": case "settings:about": case "settings:backup":
        setSettingsTab(a.split(":")[1] as SettingsTab); setSettingsOpen(true); break;
      case "bible:versions": setSettingsTab("bibles"); setSettingsOpen(true); break;
      case "view:preview": setPreviewShown(!previewShown); break;
      case "song:new": case "song:edit": case "song:import-ew": case "song:import-files": tell("songs", a); break;
      case "media:add": case "media:presentation": case "media:free": case "media:design": tell("media", a); break;
      case "live:send": useShowStore.getState().sendPreviewLive(); break;
      case "live:obs":
        if ((window as any).__TAURI_INTERNALS__) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("open_obs_window").catch((e) => window.alert(String(e)));
          window.alert("The livestream words window is open. In OBS: add a Window Capture of “WorshipHQ — Livestream words (OBS)”, then right-click it › Filters › Color Key (green). The words then appear over your camera.");
        }
        break;
      case "live:black": proj.toggleBlack(); break;
      case "live:clear": proj.toggleClearText(); break;
      case "live:logo": proj.toggleLogo(); break;
      case "live:projector": proj.projectionOpen ? proj.closeProjection() : proj.openProjection(); break;
      case "schedule:first": {
        const i = proj.serviceItems.findIndex((it) => it.slides?.length);
        if (i >= 0) { proj.setActiveItem(i); useShowStore.getState().setPreview(proj.serviceItems[i].title, proj.serviceItems[i].slides!, 0); useShowStore.getState().sendPreviewLive(0); }
        break;
      }
      case "schedule:new": case "schedule:clear":
        if (!proj.serviceItems.length || window.confirm("Start a new, empty schedule? (What is on the screen stays.)")) proj.newService();
        break;
      case "schedule:save": await saveSchedule(); break;
      case "schedule:open": await openSchedule(); break;
      case "help:updates":
        setSettingsTab("about"); setSettingsOpen(true); useUpdateStore.getState().check(true); break;
      case "help:account":
        setSettingsTab("about"); setSettingsOpen(true); break;
      case "help:website":
        try { const { open } = await import("@tauri-apps/plugin-shell"); await open("https://worshiphq.app"); } catch { window.open("https://worshiphq.app", "_blank"); }
        break;
      case "exit":
        if ((window as any).__TAURI_INTERNALS__) { const { getCurrentWindow } = await import("@tauri-apps/api/window"); getCurrentWindow().close(); }
        break;
    }
  }
  // "looks" and "screens" open those tabs of Settings.
  const setWorkspace = (w: Workspace) => {
    if (w === "looks" || w === "screens") { setSettingsTab(w); setSettingsOpen(true); }
    else if (w === "settings") setSettingsOpen(true);
    else { setSettingsOpen(false); setWorkspaceRaw(w); }
  };

  // Other parts of the app can run a menu action (e.g. the trial bar opens the account page).
  useEffect(() => {
    const on = (e: Event) => onMenu((e as CustomEvent).detail as MenuAction);
    window.addEventListener("whq-menu-open", on);
    return () => window.removeEventListener("whq-menu-open", on);
  });

  // Notes of the message are taken in the background, whatever page is open.
  useEffect(() => startNotes(), []);

  // Account check-ins and automatic updates (both quiet when offline).
  useEffect(() => { const a = startAccountCheckIns(); const u = startUpdateChecks(); return () => { a(); u(); }; }, []);

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
      else if (/^[1-8]$/.test(k)) {
        const map: Workspace[] = ["service", "live", "bible", "songs", "media", "voice", "settings", "notes"];
        e.preventDefault(); setWorkspace(map[Number(k) - 1]);
      } else if (k === ",") { e.preventDefault(); setWorkspace("settings"); }
    };
    window.addEventListener("keydown", onKey);
    // Enter sends Preview live (like EasyWorship); Page Down / Page Up move through what is live.
    const onPlain = (e: KeyboardEvent) => {
      if (!launched || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT" || el?.isContentEditable || el?.closest?.("[role=dialog]")) return;
      if (e.key === "Enter" && el?.tagName !== "BUTTON") {
        if (!useShowStore.getState().preview) return;
        e.preventDefault();
        useShowStore.getState().sendPreviewLive();
      } else if (e.key === "PageDown") { e.preventDefault(); useShowStore.getState().liveStep(1); }
      else if (e.key === "PageUp") { e.preventDefault(); useShowStore.getState().liveStep(-1); }
    };
    window.addEventListener("keydown", onPlain);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keydown", onPlain); };
  }, [launched]);

  // Opening the app: the projector comes on by itself and shows the last background, with no words.
  // Only once this computer is licensed: nothing goes on the church screen from the sign-in page.
  const licensed = useProjectionStore((s) => s.isLicensed);
  useEffect(() => {
    if (!launched || !licensed) return;
    const proj = useProjectionStore.getState();
    if (!(window as any).__TAURI_INTERNALS__ || proj.isLive) return;
    const bg = lastBackground();
    // Daily cloud backup (when switched on and there is internet).
    window.setTimeout(() => {
      try {
        if (localStorage.getItem("whq-backup-auto") === "0") return;
        const last = localStorage.getItem("whq-backup-last");
        if (!last || Date.now() - Date.parse(last) > 20 * 3600_000) import("./lib/backup").then((b) => b.cloudBackup()).catch(() => {});
      } catch { /* ignore */ }
    }, 60_000);
    // Screen tuning (and anything else on the projector's extra layers) goes to the projector again.
    window.setTimeout(() => useExtrasStore.getState().resend(), 2500);
    const t = window.setTimeout(() => {
      if (!proj.projectionOpen) proj.openProjection();
      window.setTimeout(() => {
        const slide = backgroundSlide(bg ?? { kind: "gradient", value: "linear-gradient(180deg, #000428 0%, #004e92 100%)" }, "Background");
        useProjectionStore.getState().goLive(slide);
      }, 900);
    }, 300);
    return () => window.clearTimeout(t);
  }, [launched, licensed]);

  // Signed out, or the licence ran out: take the projector down.
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__ || licensed) return;
    const proj = useProjectionStore.getState();
    if (proj.projectionOpen) proj.closeProjection();
  }, [licensed]);

  // Keep the stage display (confidence monitor) up to date with what's on screen and what's next.
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let last = "";
    const toText = (sl: Slide | null) =>
      sl ? { text: sl.media ? `[${sl.media.kind === "video" ? "Video" : sl.media.kind === "camera" ? "Camera" : "Picture"}] ${sl.label ?? ""}` : plainText(sl.content.primaryText ?? ""), label: sl.label ?? sl.content.secondaryText ?? "", chords: sl.chords } : null;
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
      off.push(await listen("video-ended", () => useShowStore.getState().liveStep(1)));
      off.push(await listen<string>("remote-action", (e) => runRemoteAction(e.payload)));
      startMidi();
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
        <AppHeader onMenu={onMenu} previewShown={previewShown} />
        <UpdateBanner />
        <VoiceBanner />
        <div className="flex min-h-0 flex-1">
          <AppSidebar workspace={settingsOpen ? "settings" : workspace} onChange={setWorkspace} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {previewShown && <PreviewLive />}
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {workspace === "bible" ? (
              <ScriptureView onOpenLooks={() => setWorkspace("looks")} />
            ) : workspace === "songs" ? (
              <SongsView />
            ) : workspace === "media" ? (
              <MediaView />
            ) : workspace === "notes" ? (
              <NotesView />
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
      </div>
      {settingsOpen && (
        <SettingsWindow onClose={() => setSettingsOpen(false)}>
          <SettingsView tab={settingsTab} onTab={setSettingsTab} onOpenMedia={() => setWorkspace("media")} />
        </SettingsWindow>
      )}
    </LicenseGate>
  );
}

/** Settings as a window over the app: big enough to work in, not full screen. Esc, the X or a click outside closes it. */
function SettingsWindow({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Settings"
        className="relative flex h-[min(780px,88vh)] w-[min(1120px,92vw)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close settings" title="Close (Esc)"
          className="absolute right-3 top-2.5 z-10 grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-4 hover:text-ink">
          <X className="size-5" />
        </button>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
