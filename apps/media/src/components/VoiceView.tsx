import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, BookOpen, Loader2, Mic, MicOff, MonitorPlay, Send, Trash2 } from "lucide-react";
import { useVoiceStore, type VoiceMode } from "../stores/voice-store";
import { useBibleStore } from "../stores/bible-store";
import { isDesktopApp } from "../lib/media-src";

const MODES: { id: VoiceMode; title: string; detail: string; tag?: string }[] = [
  { id: "ask", title: "Ask me first", detail: "A banner pops up with the verse. You press Show (or Space) to put it on the screen.", tag: "Recommended" },
  { id: "auto", title: "Show it automatically", detail: "The verse goes on the screen by itself after a short countdown. Press Esc to stop it." },
  { id: "list", title: "Only list it", detail: "Nothing pops up. Verses are listed below so you can show them when you're ready." },
];

export function VoiceView({ onOpenBible }: { onOpenBible: () => void }) {
  const v = useVoiceStore();
  const { packs, activePack, loadPacks } = useBibleStore();
  const [typed, setTyped] = useState("");
  const listening = v.status === "listening";
  const pack = packs.find((p) => p.id === activePack);

  useEffect(() => { if (!packs.length) loadPacks(); }, [packs.length, loadPacks]);

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto grid max-w-6xl gap-3">
        {/* ─── Master switch ─── */}
        <section className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
          <div className={`grid size-14 place-items-center rounded-2xl ${listening ? "bg-primary text-white" : "bg-surface-4 text-ink-muted"}`}>
            {listening ? <Mic className="size-7" /> : <MicOff className="size-7" />}
          </div>
          <div className="min-w-[260px] flex-1">
            <h2 className="text-[20px] font-bold text-ink">Voice assistant</h2>
            <p className="text-[14px] text-ink-muted">
              Listens to the preacher's microphone. When a Bible verse is mentioned, like “turn with me to John chapter three verse sixteen”, it finds it for you.
            </p>
          </div>
          <button
            onClick={() => (listening || v.status === "starting" ? v.stop() : v.start())}
            className={`flex h-12 min-w-[190px] items-center justify-center gap-2 rounded-xl px-5 text-[16px] font-bold transition-colors ${
              listening ? "bg-danger text-white hover:bg-danger/90" : "bg-primary text-white hover:bg-primary-bright"
            }`}
          >
            {v.status === "starting" ? <><Loader2 className="size-5 whq-spin" /> Starting…</>
              : listening ? <><MicOff className="size-5" /> Stop listening</>
              : <><Mic className="size-5" /> Start listening</>}
          </button>
        </section>

        {v.status === "error" && v.message && (
          <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/10 p-4 text-[14px] text-ink">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-gold" />
            <span>{v.message}</span>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid content-start gap-3">
            {/* ─── Microphone ─── */}
            <Card title="Microphone" aside={listening ? <span className="font-semibold text-success">● Listening</span> : "Off"}>
              <div className="h-3 overflow-hidden rounded-full bg-surface-4">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-teal transition-[width] duration-150" style={{ width: `${listening ? v.level : 0}%` }} />
              </div>
              <p className="mt-2 text-[13px] text-ink-muted">
                {listening
                  ? "The bar moves when someone speaks. If it stays still, check the microphone."
                  : "Uses the computer's default microphone. To change it, open Windows Settings › System › Sound › Input."}
              </p>
              {v.recognizer && listening && <p className="mt-1 text-[12px] text-ink-faint">Using {v.recognizer} · works offline</p>}
            </Card>

            {/* ─── What it heard ─── */}
            <Card title="What it heard">
              <div className="h-56 overflow-y-auto rounded-lg bg-surface-4/60 p-3">
                {listening && v.partial && <p className="mb-1.5 text-[14px] italic text-ink-faint">{v.partial}…</p>}
                {v.lines.length === 0 && !v.partial && (
                  <p className="text-[14px] text-ink-faint">{listening ? "Waiting for someone to speak…" : "Start listening, or type a sentence below to try it."}</p>
                )}
                {v.lines.map((l) => (
                  <p key={l.id} className={`mb-1.5 text-[14px] ${l.isReference ? "font-semibold text-primary-bright" : "text-ink"}`}>
                    <span className="mr-2 font-mono text-[11px] text-ink-faint">{new Date(l.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>
                    {l.text}
                  </p>
                ))}
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); v.tryText(typed); setTyped(""); }}
                className="mt-3 flex gap-2"
              >
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Try it: type what a preacher might say, e.g. “turn to Romans chapter eight verse twenty eight”"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-line-bright px-3 text-[14px] text-ink outline-none focus:border-primary"
                />
                <button type="submit" className="flex h-10 items-center gap-1.5 rounded-lg bg-surface-4 px-3 text-[14px] font-semibold text-ink hover:bg-surface-5">
                  <Send className="size-4" /> Try
                </button>
              </form>
            </Card>
          </div>

          {/* ─── Settings ─── */}
          <div className="grid content-start gap-3">
            <Card title="When a verse is heard">
              <div className="space-y-2">
                {MODES.map((m) => (
                  <label key={m.id} className={`flex cursor-pointer gap-3 rounded-lg p-3 ${v.mode === m.id ? "bg-primary-soft/70 ring-1 ring-primary/40" : "bg-surface-4/60 hover:bg-surface-4"}`}>
                    <input type="radio" name="voice-mode" checked={v.mode === m.id} onChange={() => v.setMode(m.id)} className="mt-1 size-4 accent-[var(--color-primary)]" />
                    <span>
                      <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                        {m.title}
                        {m.tag && <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-primary-bright">{m.tag}</span>}
                      </span>
                      <span className="block text-[13px] text-ink-muted">{m.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
              {v.mode === "auto" && (
                <label className="mt-3 block text-[14px] text-ink">
                  Wait <b>{v.autoDelay} seconds</b> before showing
                  <input type="range" min={1} max={8} step={1} value={v.autoDelay} onChange={(e) => v.setAutoDelay(+e.target.value)} className="mt-1 w-full accent-[var(--color-primary)]" />
                </label>
              )}
              <label className="mt-3 block text-[14px] text-ink">
                How sure it must be: <b>{v.minConfidence < 0.45 ? "less strict" : v.minConfidence > 0.7 ? "very strict" : "normal"}</b>
                <input type="range" min={0.3} max={0.85} step={0.05} value={v.minConfidence} onChange={(e) => v.setMinConfidence(+e.target.value)} className="mt-1 w-full accent-[var(--color-primary)]" />
                <span className="text-[12px] text-ink-muted">Stricter means fewer mistakes but it may miss some verses.</span>
              </label>
            </Card>

            <Card title="Bible version used">
              <p className="text-[14px] text-ink">{pack ? `${pack.name} (${pack.abbreviation})` : "Loading…"}</p>
              <button onClick={onOpenBible} className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-primary-bright hover:underline">
                <BookOpen className="size-4" /> Change it on the Bible page
              </button>
            </Card>
          </div>
        </div>

        {/* ─── History ─── */}
        <Card
          title="Verses heard"
          aside={v.detections.length ? <button onClick={v.clearHistory} className="flex items-center gap-1 font-semibold text-ink-muted hover:text-danger"><Trash2 className="size-3.5" /> Clear</button> : undefined}
        >
          {v.detections.length === 0 ? (
            <p className="py-4 text-center text-[14px] text-ink-muted">No verses yet.</p>
          ) : (
            <table className="w-full text-left text-[14px]">
              <thead className="text-[12px] font-semibold text-ink-muted">
                <tr><th className="py-1.5">Time</th><th>What was said</th><th>Verse</th><th>Sure</th><th /></tr>
              </thead>
              <tbody>
                {v.detections.map((d) => (
                  <tr key={d.id} className="border-t border-line-soft">
                    <td className="py-2 font-mono text-[12px] text-ink-faint">{new Date(d.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                    <td className="max-w-[360px] truncate py-2 pr-3 text-ink-muted" title={d.said}>“{d.said}”</td>
                    <td className="py-2 font-semibold text-ink">{d.label}</td>
                    <td className="py-2 text-ink-muted">{Math.round(d.confidence * 100)}%</td>
                    <td className="py-2 text-right">
                      <button onClick={() => v.showDetection(d.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-soft px-3 text-[13px] font-semibold text-primary-bright hover:bg-primary hover:text-white">
                        <MonitorPlay className="size-4" /> {d.status === "shown" ? "Show again" : "Show"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        {!isDesktopApp() && <p className="text-center text-[12px] text-ink-faint">Browser preview: the microphone only works in the installed app.</p>}
      </div>
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {aside && <span className="text-[12px] text-ink-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
