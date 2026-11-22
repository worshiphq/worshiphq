import type { ReactNode } from "react";
import logoMark from "../assets/worshiphq-mark.png";
import {
  BookOpen, CalendarDays, Cast, Church, Eraser, Image as ImageIcon, Mic, Minus, Monitor, MonitorOff,
  Music, Settings, Square, X,
} from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import { useVoiceStore } from "../stores/voice-store";
import { useAudioStore } from "../stores/audio-store";

export type Workspace = "service" | "live" | "bible" | "songs" | "media" | "screens" | "voice" | "looks" | "settings";

const isDesktopApp = () => typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

async function windowAction(action: "minimize" | "toggleMaximize" | "close") {
  if (!isDesktopApp()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  if (action === "minimize") await win.minimize();
  else if (action === "toggleMaximize") await win.toggleMaximize();
  else await win.close();
}

/* ─────────────────────────── Top bar ─────────────────────────── */

export function AppHeader() {
  const { currentSlide, isLive, isBlack, textCleared, projectionOpen, serviceItems, toggleBlack, toggleClearText, toggleLogo, openProjection, closeProjection, alert } =
    useProjectionStore();

  // Name what's showing: "How Great Is Our God · Chorus", or the verse reference.
  const fromItem = currentSlide ? serviceItems.find((i) => i.slides?.includes(currentSlide)) : undefined;
  const describe = () => {
    if (!currentSlide) return "a slide";
    if (fromItem && currentSlide.type !== "scripture") return [fromItem.title, currentSlide.label].filter(Boolean).join(" · ");
    return currentSlide.content.secondaryText ?? fromItem?.title ?? currentSlide.label ?? "a slide";
  };
  const onScreen =
    isBlack ? "The screen is black"
    : textCleared ? "Words cleared (background showing)"
    : isLive && currentSlide?.type === "logo" ? "Showing the church logo"
    : isLive && currentSlide ? `Showing: ${describe()}`
    : "Nothing on screen";
  const showingSomething = isLive && !isBlack;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface-2 pl-4" data-tauri-drag-region>
      <div className="flex items-center gap-2.5" data-tauri-drag-region>
        <img src={logoMark} alt="WorshipHQ" className="size-8 object-contain" draggable={false} data-tauri-drag-region />
        <span className="hidden text-[15px] font-bold tracking-tight text-ink lg:inline" data-tauri-drag-region>
          WorshipHQ <span className="text-primary">Media</span>
        </span>
      </div>

      <div className="mx-2 h-7 w-px bg-line" />

      {/* The three emergency buttons every operator needs, always in the same place. */}
      <div className="flex items-center gap-1.5">
        <MasterButton
          icon={<MonitorOff className="size-4" />}
          label="Black"
          hint="Turn the projector black. Press again to bring it back. (Ctrl+B)"
          active={isBlack}
          activeClass="bg-ink text-white"
          onClick={toggleBlack}
        />
        <MasterButton
          icon={<Eraser className="size-4" />}
          label="Clear"
          hint="Hide the words, keep the background. Press again to bring them back. (Ctrl+C)"
          active={textCleared}
          activeClass="bg-gold text-white"
          onClick={toggleClearText}
        />
        <MasterButton
          icon={<Church className="size-4" />}
          label="Logo"
          hint="Show the church logo. Press again to go back. (Ctrl+L)"
          active={isLive && currentSlide?.type === "logo"}
          activeClass="bg-primary text-white"
          onClick={toggleLogo}
        />
      </div>

      <div className="flex-1 self-stretch" data-tauri-drag-region />

      {/* What the congregation sees right now, in plain words. */}
      <div
        className={`flex max-w-[170px] items-center gap-2 rounded-full xl:max-w-[340px] px-3 py-1.5 text-[13px] font-medium ${
          showingSomething ? "bg-danger/10 text-danger" : "bg-surface-4 text-ink-muted"
        }`}
        title={onScreen}
      >
        <span className={`size-2 shrink-0 rounded-full ${showingSomething ? "live-dot bg-danger" : "bg-ink-faint/60"}`} />
        <span className="truncate">{onScreen}</span>
      </div>
      <VoicePill />
      <NowPlaying />
      {alert && <span className="max-w-[180px] truncate rounded-full bg-danger px-3 py-1.5 text-[12px] font-bold text-white" title={alert.text}>Alert: {alert.text}</span>}

      <button
        onClick={() => (projectionOpen ? closeProjection() : openProjection())}
        title={projectionOpen ? "Close the projector screen" : "Open the projector screen"}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
          projectionOpen
            ? "border-success/30 bg-success/10 text-success"
            : "border-line-bright bg-surface-2 text-ink hover:bg-surface-4"
        }`}
      >
        <Monitor className="size-4" />
        {projectionOpen ? "Projector on" : "Open projector"}
      </button>

      <div className="flex h-full items-center">
        <WindowButton label="Minimise" onClick={() => windowAction("minimize")}><Minus className="size-4" /></WindowButton>
        <WindowButton label="Maximise" onClick={() => windowAction("toggleMaximize")}><Square className="size-3.5" /></WindowButton>
        <WindowButton label="Close" danger onClick={() => windowAction("close")}><X className="size-4" /></WindowButton>
      </div>
    </header>
  );
}

/** Music that's playing, with pause and fade out, wherever you are in the app. */
function NowPlaying() {
  const { trackId, name, playing, toggle, fadeOut } = useAudioStore();
  if (!trackId) return null;
  return (
    <div className="flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-3 pr-1 text-[12px] font-semibold text-primary-bright">
      <span className="max-w-[140px] truncate">{playing ? "♪ " : "❚❚ "}{name}</span>
      <button onClick={toggle} className="rounded-full px-2 py-0.5 hover:bg-surface-2">{playing ? "Pause" : "Play"}</button>
      {playing && <button onClick={() => fadeOut()} className="rounded-full px-2 py-0.5 hover:bg-surface-2">Fade</button>}
    </div>
  );
}

function MasterButton({
  icon, label, hint, active, activeClass, onClick,
}: {
  icon: ReactNode; label: string; hint: string; active?: boolean; activeClass?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
        active ? activeClass : "bg-surface-4 text-ink hover:bg-surface-5"
      }`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

/** Minimise / maximise / close, for screens that have no top bar (launcher, licence). */
export function WindowControls() {
  return (
    <div className="fixed right-0 top-0 z-50 flex h-10 items-center" data-tauri-drag-region>
      <WindowButton label="Minimise" onClick={() => windowAction("minimize")}><Minus className="size-4" /></WindowButton>
      <WindowButton label="Maximise" onClick={() => windowAction("toggleMaximize")}><Square className="size-3.5" /></WindowButton>
      <WindowButton label="Close" danger onClick={() => windowAction("close")}><X className="size-4" /></WindowButton>
    </div>
  );
}

function WindowButton({ children, label, danger, onClick }: { children: ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-full w-11 place-items-center text-ink-muted transition-colors ${
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-surface-4 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Left menu ─────────────────────────── */

type NavItem = { id: Workspace | string; label: string; Icon: typeof Cast; ready: boolean };

const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "During the service",
    items: [
      { id: "service", label: "Service plan", Icon: CalendarDays, ready: true },
      { id: "live", label: "Live", Icon: Cast, ready: true },
      { id: "voice", label: "Voice assistant", Icon: Mic, ready: true },
    ],
  },
  {
    heading: "Library",
    items: [
      { id: "bible", label: "Bible", Icon: BookOpen, ready: true },
      { id: "songs", label: "Songs", Icon: Music, ready: true },
      { id: "media", label: "Media", Icon: ImageIcon, ready: true },
    ],
  },
  {
    heading: "Setup",
    items: [
      { id: "settings", label: "Settings", Icon: Settings, ready: true },
    ],
  },
];

export function AppSidebar({ workspace, onChange }: { workspace: Workspace; onChange: (w: Workspace) => void }) {
  const { isTrial, isLicensed, trialDaysRemaining, isLive, isBlack } = useProjectionStore();
  const voiceOn = useVoiceStore((v) => v.status === "listening");

  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-line bg-surface-2 lg:w-56">
      <nav className="flex-1 overflow-y-auto p-3" aria-label="Main menu">
        {NAV.map((group) => (
          <div key={group.heading} className="mb-4">
            <div className="hidden px-3 pb-1.5 text-[12px] font-semibold text-ink-faint lg:block">{group.heading}</div>
            {group.items.map(({ id, label, Icon, ready }) => {
              const active = workspace === id || (id === "settings" && (workspace === "looks" || workspace === "screens"));
              return (
                <button
                  key={id}
                  disabled={!ready}
                  onClick={() => ready && onChange(id as Workspace)}
                  aria-current={active ? "page" : undefined}
                  title={ready ? label : "Coming soon"}
                  className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors ${
                    active
                      ? "bg-primary-soft font-semibold text-primary-bright"
                      : ready
                        ? "text-ink hover:bg-surface-4"
                        : "cursor-default text-ink-faint"
                  }`}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="hidden flex-1 lg:inline">{label}</span>
                  {id === "live" && isLive && !isBlack && <span className="live-dot size-2 rounded-full bg-danger" title="Something is on screen" />}
                  {id === "voice" && voiceOn && <span className="live-dot size-2 rounded-full bg-success" title="Listening" />}
                  {!ready && <span className="rounded bg-surface-4 px-1.5 py-0.5 text-[11px] font-medium text-ink-faint">Soon</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="hidden border-t border-line p-4 text-[13px] lg:block">
        {isLicensed ? (
          <span className="font-medium text-success">Licensed</span>
        ) : isTrial ? (
          <span className="text-ink-muted">
            Free trial · <b className="text-ink">{trialDaysRemaining} days</b> left
          </span>
        ) : (
          <span className="font-medium text-gold">Trial ended</span>
        )}
      </div>
    </aside>
  );
}

/** The voice assistant keeps listening on every page: shows it, what it last heard, and starts / stops it. */
function VoicePill() {
  const status = useVoiceStore((v) => v.status);
  const level = useVoiceStore((v) => v.level);
  const last = useVoiceStore((v) => v.lines[0]);
  const start = useVoiceStore((v) => v.start);
  const stop = useVoiceStore((v) => v.stop);
  const on = status === "listening" || status === "starting";
  const fresh = last && Date.now() - last.at < 8000 ? last : null;
  return (
    <button
      onClick={() => (on ? stop() : start())}
      title={on ? "The voice assistant is listening on every page. Click to stop." : "Start the voice assistant"}
      className={`flex h-9 max-w-[320px] items-center gap-2 rounded-lg border px-2.5 text-[13px] font-semibold ${on ? "border-success/40 bg-success/10 text-ink" : status === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-line-bright text-ink-muted hover:bg-surface-4"}`}
    >
      <span className="relative grid size-5 place-items-center">
        <Mic className={`size-4 ${on ? "text-success" : ""}`} />
        {on && <span className="absolute -bottom-0.5 left-0 h-0.5 rounded bg-success transition-[width]" style={{ width: `${Math.min(100, level * 1.5)}%` }} />}
      </span>
      <span className="hidden min-w-0 truncate xl:inline">
        {status === "starting" ? "Starting…" : on ? (fresh ? (fresh.command ?? fresh.text) : "Listening") : status === "error" ? "Voice stopped" : "Voice off"}
      </span>
    </button>
  );
}
