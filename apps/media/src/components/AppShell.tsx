import type { ReactNode } from "react";
import {
  BookOpen, Cast, Church, Eraser, Image as ImageIcon, Mic, Minus, Monitor, MonitorOff,
  Music, Square, TvMinimal, X,
} from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";

export type Workspace = "live" | "bible";

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
  const { currentSlide, isLive, isBlack, projectionOpen, serviceItems, goBlack, goClear, goLogo, openProjection, closeProjection } =
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
    : isLive && currentSlide?.type === "logo" ? "Showing the church logo"
    : isLive && currentSlide ? `Showing: ${describe()}`
    : "Nothing on screen";
  const showingSomething = isLive && !isBlack;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface-2 pl-4" data-tauri-drag-region>
      <div className="flex items-center gap-2.5" data-tauri-drag-region>
        <div className="grid size-8 place-items-center rounded-lg bg-primary">
          <span className="text-[14px] font-black text-white">W</span>
        </div>
        <span className="text-[15px] font-bold tracking-tight text-ink" data-tauri-drag-region>
          WorshipHQ <span className="text-primary">Media</span>
        </span>
      </div>

      <div className="mx-2 h-7 w-px bg-line" />

      {/* The three emergency buttons every operator needs, always in the same place. */}
      <div className="flex items-center gap-1.5">
        <MasterButton
          icon={<MonitorOff className="size-4" />}
          label="Black screen"
          hint="Turn the projector screen black"
          active={isBlack}
          activeClass="bg-ink text-white"
          onClick={goBlack}
        />
        <MasterButton
          icon={<Eraser className="size-4" />}
          label="Clear"
          hint="Take everything off the screen"
          onClick={goClear}
        />
        <MasterButton
          icon={<Church className="size-4" />}
          label="Logo"
          hint="Show the church logo"
          active={isLive && currentSlide?.type === "logo"}
          activeClass="bg-primary text-white"
          onClick={goLogo}
        />
      </div>

      <div className="flex-1 self-stretch" data-tauri-drag-region />

      {/* What the congregation sees right now, in plain words. */}
      <div
        className={`flex max-w-[340px] items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium ${
          showingSomething ? "bg-danger/10 text-danger" : "bg-surface-4 text-ink-muted"
        }`}
        title={onScreen}
      >
        <span className={`size-2 shrink-0 rounded-full ${showingSomething ? "live-dot bg-danger" : "bg-ink-faint/60"}`} />
        <span className="truncate">{onScreen}</span>
      </div>

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
      {label}
    </button>
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
    items: [{ id: "live", label: "Live", Icon: Cast, ready: true }],
  },
  {
    heading: "Library",
    items: [
      { id: "bible", label: "Bible", Icon: BookOpen, ready: true },
      { id: "songs", label: "Songs", Icon: Music, ready: false },
      { id: "media", label: "Pictures & videos", Icon: ImageIcon, ready: false },
    ],
  },
  {
    heading: "Setup",
    items: [
      { id: "screens", label: "Screens", Icon: TvMinimal, ready: false },
      { id: "voice", label: "Voice assistant", Icon: Mic, ready: false },
    ],
  },
];

export function AppSidebar({ workspace, onChange }: { workspace: Workspace; onChange: (w: Workspace) => void }) {
  const { isTrial, isLicensed, trialDaysRemaining, isLive, isBlack } = useProjectionStore();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface-2">
      <nav className="flex-1 overflow-y-auto p-3" aria-label="Main menu">
        {NAV.map((group) => (
          <div key={group.heading} className="mb-4">
            <div className="px-3 pb-1.5 text-[12px] font-semibold text-ink-faint">{group.heading}</div>
            {group.items.map(({ id, label, Icon, ready }) => {
              const active = workspace === id;
              return (
                <button
                  key={id}
                  disabled={!ready}
                  onClick={() => ready && onChange(id as Workspace)}
                  aria-current={active ? "page" : undefined}
                  title={ready ? undefined : "Coming soon"}
                  className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors ${
                    active
                      ? "bg-primary-soft font-semibold text-primary-bright"
                      : ready
                        ? "text-ink hover:bg-surface-4"
                        : "cursor-default text-ink-faint"
                  }`}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="flex-1">{label}</span>
                  {id === "live" && isLive && !isBlack && <span className="live-dot size-2 rounded-full bg-danger" title="Something is on screen" />}
                  {!ready && <span className="rounded bg-surface-4 px-1.5 py-0.5 text-[11px] font-medium text-ink-faint">Soon</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-4 text-[13px]">
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
