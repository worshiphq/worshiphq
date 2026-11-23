import { useEffect, useMemo, useRef, useState } from "react";
import { Film, Image as ImageIcon } from "lucide-react";
import type { Slide } from "../types";
import { GRADIENTS } from "../lib/themes";
import { useMediaStore } from "../stores/media-store";
import { useShowStore } from "../stores/show-store";
import { useSongStore } from "../stores/song-store";
import { isDesktopApp, mediaUrl } from "../lib/media-src";

type Bg = NonNullable<Slide["background"]>;

/** A slide with only a background (no words). */
export function backgroundSlide(bg: Bg, label = "Background"): Slide {
  return { type: "song", label, content: { primaryText: "" }, template: { background: "#000", textLayout: "center" }, background: bg };
}

/**
 * The Background button, like EasyWorship's: pick a colour, picture or video. It goes to Preview first
 * (on top of whatever is in Preview); Enter or double-click sends it live.
 */
export function BackgroundPicker() {
  const [open, setOpen] = useState(false);
  const [bundled, setBundled] = useState<{ id: string; title: string; path: string; thumb: string }[]>([]);
  const items = useMediaStore((s) => s.items);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open || bundled.length || !isDesktopApp()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => invoke<typeof bundled>("stock_bundled").then(setBundled).catch(() => {}));
  }, [open, bundled.length]);

  const mine = useMemo(() => items.filter((i) => i.kind === "image" || i.kind === "video"), [items]);

  /** Put the background on what is in Preview (or on its own), ready to go live. */
  function pick(bg: Bg, name: string, sendNow = false) {
    const { preview, setPreview, sendPreviewLive } = useShowStore.getState();
    const words = preview?.slides.some((s) => !s.media && s.content.primaryText?.trim());
    if (preview && words) {
      setPreview(preview.title, preview.slides.map((s) => (s.media ? s : { ...s, background: bg })), preview.index, preview.songId);
      // A song keeps this background from now on (Edit the song to change it).
      if (preview.songId) useSongStore.getState().updateSong(preview.songId, { background: bg });
    }
    else setPreview(`Background: ${name}`, [backgroundSlide(bg, name)]);
    if (sendNow) { sendPreviewLive(); setOpen(false); }
  }

  const tile = "group relative aspect-video overflow-hidden rounded-md ring-1 ring-line hover:ring-2 hover:ring-primary";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Pick a background. It goes to Preview first; press Enter or double-click to send it live."
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors ${open ? "border-primary bg-primary-soft text-primary-bright" : "border-line-bright text-ink hover:bg-surface-4"}`}
      >
        <ImageIcon className="size-4" /> Background
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[70] mt-1 w-[min(560px,90vw)] rounded-xl border border-line-bright bg-surface-2 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.25)]">
          <p className="mb-2 text-[12px] text-ink-muted">Click to put it in <b>Preview</b>. Double-click to show it now.</p>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            <Group title="Colours">
              {GRADIENTS.map((g) => (
                <button key={g.value} title={g.label} className={tile} style={{ background: g.value }}
                  onClick={() => pick({ kind: g.value.startsWith("#") ? "color" : "gradient", value: g.value }, g.label)}
                  onDoubleClick={() => pick({ kind: g.value.startsWith("#") ? "color" : "gradient", value: g.value }, g.label, true)} />
              ))}
            </Group>
            {mine.length > 0 && (
              <Group title="Your pictures and videos">
                {mine.map((m) => (
                  <button key={m.id} title={m.name} className={tile}
                    onClick={() => pick({ kind: m.kind === "video" ? "video" : "image", value: m.path }, m.name)}
                    onDoubleClick={() => pick({ kind: m.kind === "video" ? "video" : "image", value: m.path }, m.name, true)}>
                    {m.kind === "video"
                      ? <><video src={mediaUrl(m.path)} muted preload="metadata" className="h-full w-full object-cover" /><Film className="absolute left-1 top-1 size-3.5 text-white drop-shadow" /></>
                      : <img src={mediaUrl(m.path)} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </button>
                ))}
              </Group>
            )}
            {bundled.length > 0 && (
              <Group title="WorshipHQ backgrounds">
                {bundled.map((b) => (
                  <button key={b.id} title={b.title} className={tile}
                    onClick={() => pick({ kind: "image", value: b.path }, b.title)}
                    onDoubleClick={() => pick({ kind: "image", value: b.path }, b.title, true)}>
                    <img src={mediaUrl(b.thumb)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </Group>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-muted">{title}</div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">{children}</div>
    </div>
  );
}
