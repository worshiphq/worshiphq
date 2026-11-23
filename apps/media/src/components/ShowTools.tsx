import { useEffect, useState } from "react";
import { BellRing, MessageSquare, Timer, X, Rss, Stamp } from "lucide-react";
import { PropTools, TickerTools } from "./ShowExtras";
import { useProjectionStore } from "../stores/projection-store";
import { formatCountdown } from "./SlideCanvas";
import type { Slide } from "../types";
import { isDesktopApp } from "../lib/media-src";

type Tab = "countdown" | "alert" | "stage" | "ticker" | "props";

/** Countdown clock, alert messages (nursery calls) and messages to the stage display, during the service. */
export function ShowTools() {
  const [tab, setTab] = useState<Tab>("countdown");
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-surface-4 p-1 xl:grid-cols-5">
        {([["countdown", "Countdown", Timer], ["alert", "Alert", BellRing], ["ticker", "Ticker", Rss], ["props", "Props", Stamp], ["stage", "Stage", MessageSquare]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] font-medium ${tab === id ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted hover:text-ink"}`}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "countdown" && <Countdown />}
      {tab === "alert" && <Alert />}
      {tab === "stage" && <StageTools />}
      {tab === "ticker" && <TickerTools />}
      {tab === "props" && <PropTools />}
    </section>
  );
}

function Countdown() {
  const { goLive, projectionOpen, openProjection, setStageTimer, stageTimerTo, currentSlide, isLive } = useProjectionStore();
  const [mode, setMode] = useState<"minutes" | "until">("minutes");
  const [minutes, setMinutes] = useState(5);
  const [until, setUntil] = useState("09:00");
  const [title, setTitle] = useState("The service starts in");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(t); }, []);

  const target = () => {
    if (mode === "minutes") return Date.now() + minutes * 60_000;
    const [h, m] = until.split(":").map(Number);
    const d = new Date(); d.setHours(h || 0, m || 0, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  };
  const showing = isLive && !!currentSlide?.countdownTo;

  function start(onScreen: boolean) {
    const to = target();
    setStageTimer(to);
    if (onScreen) {
      const slide: Slide = {
        type: "announcement",
        label: "Countdown",
        countdownTo: to,
        content: { primaryText: "Welcome", secondaryText: title || undefined },
        template: { background: "#000", textLayout: "center" },
      };
      if (isDesktopApp() && !projectionOpen) openProjection();
      goLive(slide);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-4 p-1 text-[13px]">
        <button onClick={() => setMode("minutes")} className={`rounded-md py-1 ${mode === "minutes" ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted"}`}>For a number of minutes</button>
        <button onClick={() => setMode("until")} className={`rounded-md py-1 ${mode === "until" ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted"}`}>Until a time</button>
      </div>
      {mode === "minutes" ? (
        <div className="flex items-center gap-2">
          {[1, 3, 5, 10].map((m) => (
            <button key={m} onClick={() => setMinutes(m)} className={`h-9 flex-1 rounded-lg text-[13px] font-semibold ${minutes === m ? "bg-primary text-white" : "bg-surface-4 text-ink hover:bg-surface-5"}`}>{m} min</button>
          ))}
          <input type="number" min={1} max={180} value={minutes} onChange={(e) => setMinutes(Math.max(1, +e.target.value || 1))} aria-label="Minutes" className="h-9 w-16 rounded-lg border border-line-bright px-2 text-[13px]" />
        </div>
      ) : (
        <input type="time" value={until} onChange={(e) => setUntil(e.target.value)} className="h-9 w-full rounded-lg border border-line-bright px-2 text-[14px]" />
      )}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Words under the clock (optional)" className="h-9 w-full rounded-lg border border-line-bright px-2.5 text-[13px]" />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => start(true)} className="h-10 rounded-lg bg-primary text-[13px] font-bold text-white hover:bg-primary-bright">Show on screen</button>
        <button onClick={() => start(false)} className="h-10 rounded-lg border border-line-bright text-[13px] font-semibold text-ink hover:bg-surface-4">Stage display only</button>
      </div>
      {(showing || stageTimerTo) && (
        <div className="flex items-center justify-between rounded-lg bg-surface-4 px-3 py-2 text-[13px]">
          <span>Running: <b className="font-mono text-[15px]">{formatCountdown((currentSlide?.countdownTo ?? stageTimerTo ?? now) - now)}</b></span>
          <button onClick={() => setStageTimer(null)} className="font-semibold text-ink-muted hover:text-danger">Stop timer</button>
        </div>
      )}
    </div>
  );
}

const ALERT_COLOURS = [
  { bg: "#dc2626", fg: "#ffffff", label: "Red" },
  { bg: "#0f766e", fg: "#ffffff", label: "Teal" },
  { bg: "#facc15", fg: "#111827", label: "Yellow" },
  { bg: "rgba(0,0,0,0.85)", fg: "#ffffff", label: "Black" },
];

function Alert() {
  const { alert, sendAlert } = useProjectionStore();
  const [text, setText] = useState("");
  const [scroll, setScroll] = useState(true);
  const [colour, setColour] = useState(0);
  const presets = ["Parent of child #___, please come to the nursery", "The owner of car ______, please come outside", "Please switch your phones to silent"];

  function send() {
    const t = text.trim();
    if (!t) return;
    sendAlert({ text: t, scroll, background: ALERT_COLOURS[colour].bg, color: ALERT_COLOURS[colour].fg });
  }

  return (
    <div className="space-y-2.5">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Message across the bottom of the screen" className="w-full resize-none rounded-lg border border-line-bright px-2.5 py-2 text-[13px]" style={{ userSelect: "text" }} />
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button key={p} onClick={() => setText(p)} className="rounded-full bg-surface-4 px-2.5 py-1 text-[12px] text-ink hover:bg-surface-5">{p.split(",")[0]}</button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {ALERT_COLOURS.map((c, i) => (
          <button key={c.label} title={c.label} onClick={() => setColour(i)} className={`size-7 rounded-full ${colour === i ? "ring-2 ring-primary ring-offset-2" : "ring-1 ring-line"}`} style={{ background: c.bg }} />
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[13px] text-ink">
          <input type="checkbox" checked={scroll} onChange={(e) => setScroll(e.target.checked)} className="size-4 accent-[var(--color-primary)]" /> Move across
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={send} disabled={!text.trim()} className="h-10 rounded-lg bg-primary text-[13px] font-bold text-white hover:bg-primary-bright disabled:bg-surface-5 disabled:text-ink-faint">Show alert</button>
        <button onClick={() => sendAlert(null)} disabled={!alert} className="flex h-10 items-center justify-center gap-1 rounded-lg border border-line-bright text-[13px] font-semibold text-ink hover:bg-surface-4 disabled:text-ink-faint">
          <X className="size-4" /> Remove alert
        </button>
      </div>
      {alert && <p className="truncate rounded-lg bg-danger/10 px-2.5 py-1.5 text-[12px] text-danger">On screen: {alert.text}</p>}
    </div>
  );
}

function StageTools() {
  const { stageOpen, openStage, closeStage, stageMessage, setStageMessage } = useProjectionStore();
  const [text, setText] = useState(stageMessage);
  const quick = ["5 minutes", "Wrap up", "Slow down", "Speak up", "Final song"];
  return (
    <div className="space-y-2.5">
      <p className="text-[13px] text-ink-muted">The stage display shows the preacher and band what's on screen, what's next, the time and your messages.</p>
      <button
        onClick={() => (stageOpen ? closeStage() : openStage())}
        disabled={!isDesktopApp()}
        className={`h-10 w-full rounded-lg text-[13px] font-bold ${stageOpen ? "border border-line-bright text-ink hover:bg-surface-4" : "bg-primary text-white hover:bg-primary-bright disabled:bg-surface-5 disabled:text-ink-faint"}`}
      >
        {stageOpen ? "Close the stage display" : "Open the stage display"}
      </button>
      <div className="flex flex-wrap gap-1">
        {quick.map((q) => (
          <button key={q} onClick={() => { setText(q); setStageMessage(q); }} className="rounded-full bg-surface-4 px-2.5 py-1 text-[12px] text-ink hover:bg-surface-5">{q}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setStageMessage(text); }} placeholder="Message to the stage" className="h-9 min-w-0 flex-1 rounded-lg border border-line-bright px-2.5 text-[13px]" />
        <button onClick={() => setStageMessage(text)} className="h-9 rounded-lg bg-surface-4 px-3 text-[13px] font-semibold text-ink hover:bg-surface-5">Send</button>
      </div>
      {stageMessage && (
        <div className="flex items-center justify-between rounded-lg bg-danger/10 px-2.5 py-1.5 text-[12px] text-danger">
          <span className="truncate">Showing: {stageMessage}</span>
          <button onClick={() => { setStageMessage(""); setText(""); }} className="font-semibold">Clear</button>
        </div>
      )}
    </div>
  );
}
