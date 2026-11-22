import { useEffect, useMemo, useState, type RefObject } from "react";
import { Eraser, Type } from "lucide-react";
import type { Song } from "../types";
import { FONTS } from "../lib/themes";
import { AKAN_LETTERS, akanFontToUnicode, colourSelection, cssFont, isAkanFont, listSystemFonts } from "../lib/rich-text";

const SWATCHES = ["#ffffff", "#facc15", "#f59e0b", "#ef4444", "#ec4899", "#a855f7", "#3b82f6", "#22d3ee", "#22c55e"];

/**
 * Above the song words: the song's font, colours for selected words (like EasyWorship), and Akan letters.
 */
export function SongToolbar({ song, text, setText, area, onChange }: {
  song: Song;
  text: string;
  setText: (t: string) => void;
  area: RefObject<HTMLTextAreaElement | null>;
  onChange: (changes: Partial<Song>) => void;
}) {
  const [fonts, setFonts] = useState<string[]>([]);
  const [custom, setCustom] = useState("#facc15");
  useEffect(() => { listSystemFonts().then(setFonts); }, []);
  const builtIn = useMemo(() => new Set(FONTS.map((f) => f.label.split(" (")[0].toLowerCase())), []);
  const akanInstalled = fonts.filter(isAkanFont);

  /** Colour (or un-colour) whatever is selected in the words box. */
  function colour(c: string | null) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    if (a === b) { el.focus(); return; }
    const r = colourSelection(text, a, b, c);
    setText(r.text);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.start, r.end); });
  }

  function insert(letter: string) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    setText(text.slice(0, a) + letter + text.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + letter.length, a + letter.length); });
  }

  return (
    <div className="mb-2 space-y-2 rounded-lg border border-line bg-surface-4/40 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted">
          <Type className="size-4" /> Font
          <select
            value={song.font ?? ""}
            onChange={(e) => onChange({ font: e.target.value || undefined, ...(isAkanFont(e.target.value) ? {} : {}) })}
            className="h-8 max-w-[220px] rounded-md border border-line-bright bg-surface-2 px-1.5 text-[13px] text-ink"
            style={{ fontFamily: song.font ? cssFont(song.font) : undefined }}
          >
            <option value="">Same as Look &amp; fonts</option>
            <optgroup label="Recommended">
              {FONTS.map((f) => {
                const name = f.value.split(",")[0].replace(/'/g, "").trim();
                return <option key={f.value} value={name} style={{ fontFamily: f.value }}>{f.label}</option>;
              })}
            </optgroup>
            {akanInstalled.length > 0 && (
              <optgroup label="Akan fonts on this computer">
                {akanInstalled.map((f) => <option key={f} value={f} style={{ fontFamily: cssFont(f) }}>{f}</option>)}
              </optgroup>
            )}
            {fonts.length > 0 && (
              <optgroup label="All fonts on this computer">
                {fonts.filter((f) => !builtIn.has(f.toLowerCase())).map((f) => <option key={f} value={f} style={{ fontFamily: cssFont(f) }}>{f}</option>)}
              </optgroup>
            )}
          </select>
        </label>

        <span className="mx-1 h-6 w-px bg-line" />
        <span className="text-[13px] font-medium text-ink-muted" title="Select words in the box below, then click a colour">Colour selected words</span>
        <div className="flex items-center gap-1">
          {SWATCHES.map((c) => (
            <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => colour(c)} title={`Make the selected words ${c}`}
              className="size-6 rounded-full ring-1 ring-black/20 hover:scale-110" style={{ background: c }} />
          ))}
          <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => colour(custom)} title="Pick any colour (applies when you close the picker)"
            className="h-6 w-7 cursor-pointer rounded border border-line-bright bg-transparent p-0" />
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => colour(null)} title="Remove colour from the selected words"
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] font-semibold text-ink-muted hover:bg-surface-2">
            <Eraser className="size-3.5" /> Plain
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-ink-muted">Twi letters</span>
        {AKAN_LETTERS.map((l) => (
          <button key={l} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(l)} title={`Type ${l}`}
            className="grid size-7 place-items-center rounded-md border border-line-bright bg-surface-2 text-[15px] font-semibold text-ink hover:border-primary hover:text-primary-bright">
            {l}
          </button>
        ))}
        <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-[13px] text-ink" title="For words typed for an old Akan font, where j means ɛ and c means ɔ">
          <input type="checkbox" checked={!!song.akan} onChange={(e) => onChange({ akan: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
          Typed with an Akan font (show j as ɛ, c as ɔ)
        </label>
        {song.akan && (
          <button onClick={() => { setText(akanFontToUnicode(text)); onChange({ akan: false }); }}
            className="rounded-md px-2 py-0.5 text-[12px] font-semibold text-primary-bright hover:bg-primary-soft"
            title="Change the letters in the words themselves, so they show right in every font and on other computers">
            Change them to ɛ and ɔ for good
          </button>
        )}
      </div>
    </div>
  );
}
