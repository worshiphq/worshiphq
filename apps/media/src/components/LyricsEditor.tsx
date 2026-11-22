import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Type } from "lucide-react";
import { FONTS } from "../lib/themes";
import { AKAN_LETTERS, cssFont, listSystemFonts, parseRuns, runsToText, type Run } from "../lib/rich-text";

/**
 * The song words box, like a small word processor: select words and pick a colour or a font (or pick one first and
 * keep typing). No codes are ever shown. Section headings such as [Chorus] stay as plain lines.
 */

const SWATCHES = ["#ffffff", "#facc15", "#f59e0b", "#ef4444", "#ec4899", "#a855f7", "#3b82f6", "#22d3ee", "#22c55e"];
const DEFAULT_FONT = "__default"; // "back to the normal font" (never saved)
const HEADING = /^\s*\[[^\]]{1,30}\]\s*$/;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Song text → editor HTML (one <div> per line). */
function toHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line) return "<div><br></div>";
      if (HEADING.test(line)) return `<div class="lyric-heading">${esc(line)}</div>`;
      const html = parseRuns(line)
        .map((r) => {
          if (!r.color && !r.font) return esc(r.text);
          const style = [r.color ? `color: ${r.color}` : "", r.font ? `font-family: ${cssFont(r.font).replace(/"/g, "'")}` : ""].filter(Boolean).join("; ");
          return `<span style="${style}">${esc(r.text)}</span>`;
        })
        .join("");
      return `<div>${html}</div>`;
    })
    .join("");
}

function hexOf(color: string): string | undefined {
  if (!color) return undefined;
  if (color.startsWith("#")) return color.length === 7 ? color.toLowerCase() : undefined;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("") : undefined;
}

function firstFont(family: string): string | undefined {
  const f = family.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return !f || f === DEFAULT_FONT || f === "inherit" ? undefined : f;
}

/** Editor HTML → song text with hidden colour/font marks. */
function fromDom(root: HTMLElement): string {
  const runs: Run[] = [];
  const endsWithNewline = () => {
    const last = runs[runs.length - 1];
    return !last || last.text.endsWith("\n");
  };
  const walk = (node: Node, color?: string, font?: string) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").replace(/ /g, " ").replace(/​/g, "");
      if (t) runs.push({ text: t, color, font });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") { runs.push({ text: "\n" }); return; }
    let c = color, f = font;
    if (node.style.color) c = hexOf(node.style.color) ?? c;
    if (node.style.fontFamily) f = firstFont(node.style.fontFamily);
    if (node.tagName === "FONT") {
      const fc = node.getAttribute("color"), ff = node.getAttribute("face");
      if (fc) c = hexOf(fc) ?? c;
      if (ff) f = firstFont(ff);
    }
    if (node.classList.contains("lyric-heading")) c = undefined; // its colour is only for the editor
    const block = node !== root && /^(DIV|P|LI|H\d)$/.test(node.tagName);
    if (block && runs.length && !endsWithNewline()) runs.push({ text: "\n" });
    node.childNodes.forEach((n) => walk(n, c, f));
    if (block && !endsWithNewline()) runs.push({ text: "\n" });
  };
  walk(root);
  return runsToText(runs).replace(/\n$/, "");
}

export function LyricsEditor({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastSent = useRef<string | null>(null);
  const saved = useRef<Range | null>(null);
  const [fonts, setFonts] = useState<string[]>([]);
  const [custom, setCustom] = useState("#facc15");
  const [empty, setEmpty] = useState(!value);
  useEffect(() => { listSystemFonts().then(setFonts); }, []);
  const builtIn = useMemo(() => new Set(FONTS.map((f) => f.value.split(",")[0].replace(/'/g, "").trim().toLowerCase())), []);

  // Show the words (again) when a different song is opened, not while typing.
  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastSent.current) return;
    el.innerHTML = toHtml(value);
    lastSent.current = value;
    setEmpty(!value);
  }, [value]);

  // Remember where the cursor was, so the toolbar acts on it.
  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection();
      if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const text = fromDom(el);
    lastSent.current = text;
    setEmpty(!text.trim());
    onChange(text);
  }

  /** Runs a formatting command on the selection (or on what is typed next, if nothing is selected). */
  function format(cmd: "foreColor" | "fontName" | "removeFormat" | "insertText", arg?: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(cmd, false, arg);
    emit();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-4/40 p-2">
        <label className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted" title="Select words and pick a font, or pick a font and start typing">
          <Type className="size-4" /> Font
          <select
            value=""
            onMouseDown={() => { /* keep the selection */ }}
            onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) format("fontName", v); }}
            className="h-8 max-w-[230px] rounded-md border border-line-bright bg-surface-2 px-1.5 text-[13px] text-ink"
          >
            <option value="">Choose a font…</option>
            <option value={DEFAULT_FONT}>Normal font (from Look &amp; fonts)</option>
            <optgroup label="Recommended">
              {FONTS.map((f) => {
                const name = f.value.split(",")[0].replace(/'/g, "").trim();
                return <option key={f.value} value={name} style={{ fontFamily: f.value }}>{f.label}</option>;
              })}
            </optgroup>
            {fonts.length > 0 && (
              <optgroup label="All fonts on this computer">
                {fonts.filter((f) => !builtIn.has(f.toLowerCase())).map((f) => <option key={f} value={f} style={{ fontFamily: cssFont(f) }}>{f}</option>)}
              </optgroup>
            )}
          </select>
        </label>

        <div className="flex items-center gap-1" title="Select words and click a colour, or click a colour and start typing">
          <span className="mr-1 text-[13px] font-medium text-ink-muted">Colour</span>
          {SWATCHES.map((c) => (
            <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => format("foreColor", c)} aria-label={`Colour ${c}`}
              className="size-6 rounded-full ring-1 ring-black/20 transition-transform hover:scale-110" style={{ background: c }} />
          ))}
          <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => format("foreColor", custom)} title="Any colour"
            className="h-6 w-7 cursor-pointer rounded border border-line-bright bg-transparent p-0" />
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => format("removeFormat")} title="Back to normal colour and font"
            className="ml-1 flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] font-semibold text-ink-muted hover:bg-surface-2">
            <Eraser className="size-3.5" /> Plain
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-[13px] font-medium text-ink-muted">Twi</span>
          {AKAN_LETTERS.map((l) => (
            <button key={l} onMouseDown={(e) => e.preventDefault()} onClick={() => format("insertText", l)} title={`Type ${l}`}
              className="grid size-7 place-items-center rounded-md border border-line-bright bg-surface-2 text-[15px] font-semibold text-ink hover:border-primary hover:text-primary-bright">
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {empty && <div className="pointer-events-none absolute left-3 top-3 whitespace-pre text-[15px] text-ink-faint">{placeholder}</div>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Song words"
          spellCheck={false}
          onInput={emit}
          onPaste={(e) => {
            // Paste words only (no web page colours or sizes).
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          className="lyrics-editor h-full overflow-y-auto rounded-lg border border-line-bright bg-surface-2 p-3 text-[15px] leading-relaxed text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-glow"
          style={{ userSelect: "text", whiteSpace: "pre-wrap" }}
        />
      </div>
    </div>
  );
}
