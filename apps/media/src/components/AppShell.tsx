import { useEffect, useState, type ReactNode } from "react";
import { useShowStore } from "../stores/show-store";
import logoMark from "../assets/worshiphq-mark.png";
import { MenuBar, type MenuAction } from "./MenuBar";
import { BackgroundPicker } from "./BackgroundPicker";
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

export function AppHeader({ onMenu, previewShown }: { onMenu: (a: MenuAction) => void; previewShown: boolean }) {
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
    <header className="shrink-0 border-b border-line bg-surface-2">
      {/* Title row: logo, menus, window buttons (drag the empty space to move the window). */}
      <div className="flex h-9 items-center gap-2 border-b border-line/70 pl-3" data-tauri-drag-region>
        <img src={logoMark} alt="WorshipHQ" className="size-6 object-contain" draggable={false} data-tauri-drag-region />
        <span className="hidden whitespace-nowrap text-[13px] font-bold tracking-tight text-ink xl:inline" data-tauri-drag-region>
          WorshipHQ <span className="text-primary">Media</span>
        </span>
        <div className="mx-1 h-5 w-px bg-line" />
        <MenuBar onAction={onMenu} previewShown={previewShown} projectorOn={projectionOpen} />
        <div className="h-full flex-1" data-tauri-drag-region />
        <div className="flex h-full items-center">
          <WindowButton label="Minimise" onClick={() => windowAction("minimize")}><Minus className="size-4" /></WindowButton>
          <WindowButton label="Maximise" onClick={() => windowAction("toggleMaximize")}><Square className="size-3.5" /></WindowButton>
          <WindowButton label="Close" danger onClick={() => windowAction("close")}><X className="size-4" /></WindowButton>
        </div>
      </div>

      <div className="flex h-12 items-center gap-3 px-3">
      {/* The emergency buttons every operator needs, always in the same place, plus the background picker. */}
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
        <BackgroundPicker />
      </div>

      <div className="flex-1 self-stretch" />

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
      { id: "service", label: "Plan the service", Icon: CalendarDays, ready: true },
      { id: "settings", label: "Settings", Icon: Settings, ready: true },
    ],
  },
];

export function AppSidebar({ workspace, onChange }: { workspace: Workspace; onChange: (w: Workspace) => void }) {
  const { isTrial, isLicensed, trialDaysRemaining, isLive, isBlack } = useProjectionStore();
  const voiceOn = useVoiceStore((v) => v.status === "listening");

  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-line bg-surface-2 lg:w-64 xl:w-72">
      <ScheduleBox onOpen={onChange} />
      <nav className="shrink-0 overflow-y-auto px-3 pb-2 pt-1" aria-label="Main menu">
        {NAV.map((group) => (
          <div key={group.heading} className="mb-1.5">
            <div className="hidden px-3 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint lg:block">{group.heading}</div>
            {group.items.map(({ id, label, Icon, ready }) => {
              const active = workspace === id || (id === "settings" && (workspace === "looks" || workspace === "screens"));
              return (
                <button
                  key={id}
                  disabled={!ready}
                  onClick={() => ready && onChange(id as Workspace)}
                  aria-current={active ? "page" : undefined}
                  title={ready ? label : "Coming soon"}
                  className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] transition-colors ${
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

      <div className="hidden border-t border-line px-4 py-2.5 text-[13px] lg:block">
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

/* ─────────────────────────── Schedule (EasyWorship-style) ─────────────────────────── */

const ITEM_ICON: Record<string, typeof Music> = { song: Music, scripture: BookOpen, media: ImageIcon, announcement: CalendarDays, custom: CalendarDays };

/**
 * The service order, always on the left: click an item to open it on Live, double-click to show it,
 * drag to reorder, right-click for more.
 */
function ScheduleBox({ onOpen }: { onOpen: (w: Workspace) => void }) {
  const { serviceItems, activeItemIndex, setActiveItem, goLive, removeFromService, reorderService, projectionOpen, openProjection, currentSlide, isLive } = useProjectionStore();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [menuAt, setMenuAt] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menuAt) return;
    const close = () => setMenuAt(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuAt]);

  const open = (i: number) => {
    setActiveItem(i);
    const it = serviceItems[i];
    if (it?.slides?.length) useShowStore.getState().setPreview(it.title, it.slides, 0, it.data?.songId);
  };
  const show = (i: number) => {
    const it = serviceItems[i];
    if (!it?.slides?.length) return;
    setActiveItem(i);
    useShowStore.getState().setPreview(it.title, it.slides, 0, it.data?.songId);
    useShowStore.getState().sendPreviewLive(0);
  };
  const onAir = (i: number) => isLive && !!currentSlide && !!serviceItems[i]?.slides?.includes(currentSlide);

  return (
    <section className="flex min-h-[180px] flex-1 flex-col border-b border-line p-2 lg:p-3" aria-label="Schedule">
      <div className="mb-1.5 hidden items-center justify-between lg:flex">
        <span className="text-[13px] font-bold text-ink">Schedule <span className="font-normal text-ink-muted">· {serviceItems.length}</span></span>
        <button onClick={() => onOpen("service")} className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-primary-bright hover:bg-primary-soft">Plan</button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-line bg-surface-4/40 p-1"
        onDragOver={(e) => e.preventDefault()}
      >
        {serviceItems.length === 0 ? (
          <p className="hidden px-2 py-6 text-center text-[12px] leading-relaxed text-ink-muted lg:block">
            Nothing in the schedule yet. Right-click a song, verse or picture and choose <b>Add to service</b>.
          </p>
        ) : (
          serviceItems.map((item, i) => {
            const Icon = ITEM_ICON[item.type] ?? CalendarDays;
            const active = i === activeItemIndex;
            const live = onAir(i);
            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDrag(i)}
                onDragEnter={() => setOver(i)}
                onDragEnd={() => { if (drag !== null && over !== null && drag !== over) reorderService(drag, over); setDrag(null); setOver(null); }}
                onClick={() => open(i)}
                onDoubleClick={() => show(i)}
                onContextMenu={(e) => { e.preventDefault(); setMenuAt({ i, x: e.clientX, y: e.clientY }); }}
                title={`${item.title} · click for Preview, double-click (or Enter) to show`}
                className={`mb-0.5 flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 ${live ? "bg-danger/10 ring-1 ring-danger/40" : active ? "bg-primary-soft" : "hover:bg-surface-2"} ${over === i && drag !== null && drag !== i ? "border-t-2 border-primary" : ""}`}
              >
                <Icon className={`size-4 shrink-0 ${live ? "text-danger" : active ? "text-primary-bright" : "text-ink-faint"}`} />
                <span className="hidden min-w-0 flex-1 lg:block">
                  <span className="block truncate text-[13px] font-semibold text-ink">{item.title}</span>
                  {item.subtitle && <span className="block truncate text-[11px] text-ink-muted">{item.subtitle}</span>}
                </span>
                {live && <span className="hidden rounded bg-danger px-1 text-[9px] font-bold text-white lg:inline">LIVE</span>}
              </div>
            );
          })
        )}
      </div>
      {menuAt && (
        <div className="fixed z-50 w-48 rounded-xl border border-line-bright bg-surface-2 py-1 shadow-[0_10px_30px_rgba(15,23,42,0.18)]" style={{ left: menuAt.x, top: menuAt.y }}>
          {[
            ["Put in Preview", () => open(menuAt.i)],
            ["Open on the Live page", () => { setActiveItem(menuAt.i); onOpen("live"); }],
            ["Show on screen", () => show(menuAt.i)],
            ["Move up", () => menuAt.i > 0 && reorderService(menuAt.i, menuAt.i - 1)],
            ["Move down", () => menuAt.i < serviceItems.length - 1 && reorderService(menuAt.i, menuAt.i + 1)],
            ["Remove from schedule", () => removeFromService(menuAt.i)],
          ].map(([label, fn]) => (
            <button key={label as string} onClick={() => { (fn as () => void)(); setMenuAt(null); }}
              className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-primary-soft ${label === "Remove from schedule" ? "text-danger" : "text-ink"}`}>
              {label as string}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
