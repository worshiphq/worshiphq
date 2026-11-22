import { useEffect, useState } from "react";
import { Check, Church, Monitor, MonitorCheck, MonitorOff, RefreshCw, TvMinimal } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import { isDesktopApp, mediaUrl } from "../lib/media-src";
import type { Slide } from "../types";
import { SlidePreview } from "./SlidePreview";

const TEST_SLIDE: Slide = {
  type: "custom",
  label: "Test screen",
  content: {
    primaryText: "If you can read this,\nthe projector is working",
    secondaryText: "WorshipHQ Media · test screen",
  },
  template: {
    background: "linear-gradient(135deg, #0f766e 0%, #134e4a 45%, #0f172a 100%)",
    textLayout: "center",
    fontFamily: "system-ui, sans-serif",
    fontSize: 72,
    fontColor: "#ffffff",
    textShadow: "0 4px 20px rgba(0,0,0,0.5)",
  },
};

export function ScreensView({ onOpenMedia }: { onOpenMedia: () => void }) {
  const {
    displays, setDisplays, projectionDisplay, setProjectionDisplay, projectionOpen,
    openProjection, closeProjection, goLive, goClear, currentSlide, isLive, logo, setLogo, goLogo,
    stageOpen, openStage, closeStage, stageDisplay, setStageDisplay,
  } = useProjectionStore();
  const [checking, setChecking] = useState(false);
  const desktop = isDesktopApp();

  async function refresh() {
    if (!desktop) return;
    setChecking(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const list = await invoke<{ id: number; name: string; width: number; height: number; is_primary: boolean }[]>("list_displays");
      setDisplays(list.map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height, isPrimary: d.is_primary })));
    } catch { /* keep the old list */ }
    setChecking(false);
  }
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const testShowing = isLive && currentSlide?.label === TEST_SLIDE.label;
  const chosen = projectionDisplay ?? displays.find((d) => !d.isPrimary)?.id ?? null;

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto grid max-w-5xl gap-3">
        <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <h2 className="text-[18px] font-bold text-ink">Screens</h2>
              <p className="text-[14px] text-ink-muted">Choose which screen the congregation sees. Plug in the projector or TV first.</p>
            </div>
            <button
              onClick={refresh}
              disabled={!desktop}
              className="flex h-10 items-center gap-2 rounded-lg border border-line-bright px-3 text-[14px] font-semibold text-ink hover:bg-surface-4 disabled:text-ink-faint"
            >
              <RefreshCw className={`size-4 ${checking ? "whq-spin" : ""}`} /> Look for screens again
            </button>
          </div>

          {!desktop ? (
            <p className="rounded-lg bg-surface-4 p-4 text-[14px] text-ink-muted">Screens are found when you run the installed desktop app.</p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
              {displays.map((d) => {
                const isChosen = chosen === d.id;
                return (
                  <div key={d.id} className={`rounded-xl border-2 p-3 ${isChosen ? "border-primary bg-primary-soft/40" : "border-line"}`}>
                    <div className="mb-2 flex items-center gap-2">
                      {d.isPrimary ? <Monitor className="size-5 text-ink-muted" /> : <TvMinimal className="size-5 text-primary-bright" />}
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{d.isPrimary ? "This computer's screen" : `Screen ${d.id + 1}`}</span>
                    </div>
                    <p className="text-[13px] text-ink-muted">{d.width} × {d.height}{d.name ? ` · ${d.name.replace(/^\\\\\.\\/, "")}` : ""}</p>
                    {isChosen ? (
                      <p className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-primary-bright"><Check className="size-4" /> Projector screen</p>
                    ) : (
                      <button
                        onClick={() => { setProjectionDisplay(d.id); if (projectionOpen) openProjection(d.id); }}
                        className="mt-3 h-9 w-full rounded-lg bg-surface-4 text-[14px] font-semibold text-ink hover:bg-surface-5"
                      >
                        Use for the projector
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {desktop && displays.length < 2 && (
            <p className="mt-3 rounded-lg bg-gold/10 p-3 text-[14px] text-ink">
              Only one screen is connected. You can still test: the projector opens as a normal window on this screen that you can move and close.
            </p>
          )}
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
            <h3 className="mb-1 text-[16px] font-semibold text-ink">Projector window</h3>
            <p className="mb-3 text-[14px] text-ink-muted">
              {projectionOpen ? "Open. Whatever you show appears on it." : "Closed. Open it before the service starts."}
            </p>
            <div className="flex flex-wrap gap-2">
              {projectionOpen ? (
                <button onClick={closeProjection} className="flex h-11 items-center gap-2 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4">
                  <MonitorOff className="size-4" /> Close it
                </button>
              ) : (
                <button onClick={() => openProjection()} disabled={!desktop} className="flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright disabled:bg-surface-5 disabled:text-ink-faint">
                  <MonitorCheck className="size-4" /> Open the projector
                </button>
              )}
              <button
                onClick={() => { if (testShowing) goClear(); else { if (desktop && !projectionOpen) openProjection(); goLive(TEST_SLIDE); } }}
                className="flex h-11 items-center gap-2 rounded-lg bg-surface-4 px-4 text-[14px] font-semibold text-ink hover:bg-surface-5"
              >
                {testShowing ? "Hide the test screen" : "Show a test screen"}
              </button>
            </div>
            <div className="mt-3"><SlidePreview slide={TEST_SLIDE} highlight={testShowing ? "live" : undefined} /></div>
          </section>

          <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm md:col-span-2">
            <h3 className="mb-1 text-[16px] font-semibold text-ink">Stage display (confidence monitor)</h3>
            <p className="mb-3 text-[14px] text-ink-muted">A screen facing the preacher and band: the words on screen now, what comes next, the time, the countdown and your messages.</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={stageDisplay ?? ""}
                onChange={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); setStageDisplay(v); if (stageOpen && v !== null) openStage(v); }}
                disabled={!desktop}
                className="h-11 min-w-[220px] rounded-lg border border-line-bright bg-surface-2 px-2 text-[14px] text-ink"
              >
                <option value="">Choose automatically</option>
                {displays.map((d) => <option key={d.id} value={d.id}>{d.isPrimary ? "This computer's screen" : `Screen ${d.id + 1}`} ({d.width}×{d.height})</option>)}
              </select>
              {stageOpen ? (
                <button onClick={closeStage} className="h-11 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4">Close it</button>
              ) : (
                <button onClick={() => openStage()} disabled={!desktop} className="h-11 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright disabled:bg-surface-5 disabled:text-ink-faint">Open the stage display</button>
              )}
            </div>
            {desktop && displays.length < 3 && <p className="mt-2 text-[13px] text-ink-faint">With fewer than three screens it opens as a window you can move and resize.</p>}
          </section>

          <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
            <h3 className="mb-1 text-[16px] font-semibold text-ink">Church logo</h3>
            <p className="mb-3 text-[14px] text-ink-muted">Shown when you press the Logo button at the top, e.g. before the service starts.</p>
            <div className="relative aspect-video overflow-hidden rounded-lg bg-black ring-1 ring-line-bright">
              {logo ? (
                <img src={mediaUrl(logo.src)} alt="Church logo" className="h-full w-full object-contain" />
              ) : (
                <div className="grid h-full place-items-center text-[13px] text-white/60">No logo chosen yet</div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={onOpenMedia} className="flex h-10 items-center gap-2 rounded-lg bg-surface-4 px-3 text-[14px] font-semibold text-ink hover:bg-surface-5">
                <Church className="size-4" /> {logo ? "Choose a different picture" : "Choose a picture"}
              </button>
              {logo && (
                <>
                  <button onClick={goLogo} className="h-10 rounded-lg bg-surface-4 px-3 text-[14px] font-semibold text-ink hover:bg-surface-5">Show it now</button>
                  <button onClick={() => setLogo(null)} className="h-10 rounded-lg px-3 text-[14px] font-semibold text-ink-faint hover:bg-surface-4 hover:text-ink">Remove</button>
                </>
              )}
            </div>
            {!logo && <p className="mt-2 text-[13px] text-ink-faint">In Pictures &amp; videos, pick your logo and press “Use as the church logo”.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
