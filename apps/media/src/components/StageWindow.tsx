import { useEffect, useState } from "react";
import { formatCountdown } from "./SlideCanvas";

/** What the operator's app sends to the stage display. */
export interface StageState {
  current: { text: string; label: string; chords?: string } | null;
  next: { text: string; label: string; chords?: string } | null;
  message: string;
  timerTo: number | null;
  black: boolean;
}

/**
 * The confidence monitor for the preacher, singers and band: the words on screen now, what comes next,
 * the time, a countdown and messages from the operator. Big, high-contrast text for reading from a distance.
 */
export function StageWindow() {
  const [state, setState] = useState<StageState | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { invoke } = await import("@tauri-apps/api/core");
        off = await listen<string>("stage-update", (e) => { try { setState(JSON.parse(e.payload)); } catch { /* ignore */ } });
        const saved = await invoke<string | null>("get_stage_state");
        if (saved) setState(JSON.parse(saved));
      } catch { /* browser preview */ }
    })();
    return () => off?.();
  }, []);

  // Chord charts show when the song has them (press C on the stage screen to switch them off and on).
  const [showChords, setShowChords] = useState(true);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "c") setShowChords((v) => !v); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const clock = new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const remaining = state?.timerTo ? state.timerTo - now : null;

  return (
    <div className="flex h-screen w-screen cursor-none flex-col bg-black p-[2vw] text-white" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
      <div className="flex items-center justify-between text-[3.2vw] font-bold leading-none">
        <span className="text-white/90">{clock}</span>
        {remaining !== null && (
          <span className={remaining > 60_000 ? "text-[#facc15]" : "text-[#f87171]"}>{formatCountdown(remaining)}</span>
        )}
      </div>

      {state?.message && (
        <div className="mt-[1.5vw] rounded-[1vw] bg-[#dc2626] px-[2vw] py-[1vw] text-center text-[3vw] font-bold">{state.message}</div>
      )}

      <div className="mt-[1.5vw] flex min-h-0 flex-[3] flex-col rounded-[1vw] border-[0.3vw] border-[#16a34a] p-[1.5vw]">
        <div className="mb-[0.6vw] text-[1.6vw] font-semibold uppercase tracking-wide text-[#4ade80]">
          Now {state?.current?.label ? `· ${state.current.label}` : ""} {state?.black ? "· SCREEN IS BLACK" : ""}
        </div>
        {state?.current?.chords && showChords ? (
          // Music stand: the chord chart for this part (chords above the words, lined up).
          <pre className="min-h-0 flex-1 overflow-hidden whitespace-pre text-[2.6vw] font-bold leading-[1.25]" style={{ fontFamily: "Consolas, 'Courier New', monospace" }}>
            {state.current.chords.split("\n").map((line, i) => (
              <div key={i} className={isChordLine(line) ? "text-[#facc15]" : "text-white"}>{line || " "}</div>
            ))}
          </pre>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden whitespace-pre-line text-[4vw] font-bold leading-[1.2]">
            {state?.current?.text || <span className="text-white/40">Nothing on screen</span>}
          </div>
        )}
      </div>

      <div className="mt-[1.2vw] flex min-h-0 flex-[2] flex-col rounded-[1vw] border-[0.3vw] border-white/25 p-[1.5vw]">
        <div className="mb-[0.6vw] text-[1.6vw] font-semibold uppercase tracking-wide text-[#facc15]">
          Next {state?.next?.label ? `· ${state.next.label}` : ""}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden whitespace-pre-line text-[2.8vw] font-semibold leading-[1.2] text-white/75">
          {state?.next?.text || <span className="text-white/30">—</span>}
        </div>
      </div>
    </div>
  );
}

/** A line of chords (G  D/F#  Em7  Csus2…) rather than words. */
function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => /^[A-G][#b]?(m|maj|min|dim|aug|sus|add)?\d*(\/[A-G][#b]?)?$/.test(t) || /^[|:x\d.-]+$/.test(t));
}
