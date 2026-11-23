import { useEffect, useState } from "react";
import type { Slide } from "../types";
import { richText } from "../lib/rich-text";

/**
 * Livestream window: only the words, as a lower third on plain green. In OBS add a "Window Capture" of this window
 * and a "Color Key" filter (green) — the words then sit on top of your camera.
 * Pictures and videos are left out (they would cover the camera); black and clear empty the window.
 */
const GREEN = "#00b140";

export function ObsWindow() {
  const [slide, setSlide] = useState<Slide | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let off: (() => void)[] = [];
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const { invoke } = await import("@tauri-apps/api/core");
      off = [
        await listen<string>("slide-update", (e) => { try { setSlide(JSON.parse(e.payload)); setHidden(false); } catch { /* ignore */ } }),
        await listen("go-black", () => setHidden(true)),
        await listen("go-clear", () => setSlide(null)),
      ];
      const st = await invoke<{ slide: string | null; black: boolean }>("get_output_state").catch(() => null);
      if (st?.slide) { try { setSlide(JSON.parse(st.slide)); } catch { /* ignore */ } }
      if (st?.black) setHidden(true);
    })();
    document.title = "WorshipHQ — Livestream words (OBS)";
    return () => off.forEach((f) => f());
  }, []);

  const words = !hidden && slide && !slide.media && !slide.hideText ? slide.content.primaryText?.trim() : "";
  const label = slide?.content.secondaryText;

  return (
    <div style={{ position: "fixed", inset: 0, background: GREEN, overflow: "hidden", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {words ? (
        <div style={{ position: "absolute", left: "4%", right: "4%", bottom: "6%", padding: "2.2vh 3vw", borderRadius: "1.2vh", background: "rgba(10, 20, 35, 0.82)", color: "#fff", textAlign: "center" }}>
          <div style={{ fontSize: "4.2vh", fontWeight: 700, lineHeight: 1.3, whiteSpace: "pre-line", fontFamily: slide?.font }}>{richText(words)}</div>
          {label && <div style={{ marginTop: "0.8vh", fontSize: "2.4vh", fontWeight: 600, color: "#5eead4" }}>{label}</div>}
          {slide?.second?.text && <div style={{ marginTop: "0.8vh", fontSize: "3vh", fontWeight: 600, color: "#e2e8f0", whiteSpace: "pre-line" }}>{richText(slide.second.text)}</div>}
        </div>
      ) : null}
    </div>
  );
}
