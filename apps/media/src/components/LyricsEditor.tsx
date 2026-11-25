import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bold, Eraser, Italic, Underline } from "lucide-react";
import { FONTS } from "../lib/themes";
import { AKAN_LETTERS, cssFont, isPlain, listSystemFonts, parseRuns, plainText, runsToText, type Run, type RunLook } from "../lib/rich-text";

/**
 * The words box of songs and notes, like a small word processor: select words and pick a colour or a font (or pick one first and
 * keep typing). No codes are ever shown. Section headings such as [Chorus] stay as plain lines.
 */

const SWATCHES = ["#ffffff", "#facc15", "#f59e0b", "#ef4444", "#ec4899", "#a855f7", "#3b82f6", "#22d3ee", "#22c55e"];
const DEFAULT_FONT = "__default"; // "back to the normal font" (never saved)
const SIZES = [60, 75, 125, 150, 200];
const HEADING = /^\s*\[[^\]]{1,30}\]\s*$/;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Song text → editor HTML (one <div> per line). */
function toHtml(text: string, headings: boolean): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line) return "<div><br></div>";
      if (headings && HEADING.test(line)) return `<div class="lyric-heading">${esc(line)}</div>`;
      const html = parseRuns(line)
        .map((r) => {
          if (isPlain(r)) return esc(r.text);
          const style = [r.color ? `color: ${r.color}` : "", r.font ? `font-family: ${cssFont(r.font).replace(/"/g, "'")}` : "",
            r.bold ? "font-weight: bold" : "", r.italic ? "font-style: italic" : "", r.under ? "text-decoration: underline" : "", r.size ? `font-size: ${r.size / 100}em` : ""].filter(Boolean).join("; ");
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
  const walk = (node: Node, look: RunLook = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").replace(/ /g, " ").replace(/​/g, "");
      if (t) runs.push({ text: t, ...look });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") { runs.push({ text: "\n" }); return; }
    let c = look.color, f = look.font;
    const l: RunLook = { ...look };
    const st = node.style;
    if (st.fontWeight) l.bold = st.fontWeight === "bold" || +st.fontWeight >= 600;
    if (st.fontStyle) l.italic = st.fontStyle === "italic";
    const deco = st.textDecorationLine || st.textDecoration;
    if (deco) l.under = deco.includes("underline");
    if (st.fontSize.endsWith("em")) { const n = Math.round(parseFloat(st.fontSize) * 100); l.size = n === 100 ? undefined : n; }
    if (node.tagName === "B" || node.tagName === "STRONG") l.bold = true;
    if (node.tagName === "I" || node.tagName === "EM") l.italic = true;
    if (node.tagName === "U") l.under = true;
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
    l.color = c;
    l.font = f;
    node.childNodes.forEach((n) => walk(n, l));
    if (block && !endsWithNewline()) runs.push({ text: "\n" });
  };
  walk(root);
  return runsToText(runs).replace(/\n$/, "");
}

/** Where the cursor is: which line, and how many letters in. */
type Spot = { line: number; at: number };
function spotOf(root: HTMLElement, node: Node | null, offset: number): Spot | null {
  if (!node || !root.contains(node)) return null;
  if (node === root) return { line: Math.min(offset, Math.max(0, root.childNodes.length - 1)), at: 0 };
  let top: Node = node;
  while (top.parentNode !== root) top = top.parentNode!;
  const r = document.createRange();
  r.setStart(top, 0);
  r.setEnd(node, offset);
  return { line: Array.prototype.indexOf.call(root.childNodes, top), at: r.toString().length };
}
function pointOf(root: HTMLElement, s: Spot): [Node, number] {
  const top = root.childNodes[Math.min(s.line, root.childNodes.length - 1)];
  if (!top) return [root, 0];
  let left = s.at;
  const w = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
  let last: Node | null = null;
  while (w.nextNode()) {
    last = w.currentNode;
    const len = last.textContent!.length;
    if (left <= len) return [last, left];
    left -= len;
  }
  return last ? [last, last.textContent!.length] : [top, 0];
}

export interface EditorSelection { from: number; to: number; /** The highlighted words, with their look. */ words: string }
export interface EditorHandle { deleteSelection: () => void }

export const LyricsEditor = forwardRef<EditorHandle, {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  /** The line the cursor is on (0 = first), so the preview can show that part. */
  onCaretLine?: (line: number) => void;
  onSelection?: (s: EditorSelection) => void;
  /** Notes: no [Chorus] headings, and lists ("1. ", "- ") carry on after Enter. */
  notes?: boolean;
  /** Notes: more buttons at the end of the bar. */
  extra?: ReactNode;
  className?: string;
  style?: CSSProperties;
}>(function LyricsEditor({ value, onChange, placeholder, onCaretLine, onSelection, notes = false, extra, className, style }, handle) {
  const [colours, setColours] = useState(false);
  const selCb = useRef(onSelection);
  selCb.current = onSelection;
  useImperativeHandle(handle, () => ({ deleteSelection: () => format("delete") }));
  const ref = useRef<HTMLDivElement>(null);
  const lastSent = useRef<string | null>(null);
  const saved = useRef<Range | null>(null);
  const caretCb = useRef(onCaretLine);
  caretCb.current = onCaretLine;
  const [fonts, setFonts] = useState<string[]>([]);
  const [custom, setCustom] = useState("#facc15");
  const [empty, setEmpty] = useState(!value);
  useEffect(() => { listSystemFonts().then(setFonts); }, []);
  const builtIn = useMemo(() => new Set(FONTS.map((f) => f.value.split(",")[0].replace(/'/g, "").trim().toLowerCase())), []);

  // Show the words (again) when a different song is opened, not while typing.
  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastSent.current) return;
    // Notes are also written while you type: keep the cursor with the same words.
    const before = lastSent.current?.split("\n");
    const sel = document.getSelection();
    const focused = before && document.activeElement === el && sel?.rangeCount;
    const a = focused ? spotOf(el, sel.anchorNode, sel.anchorOffset) : null, b = focused ? spotOf(el, sel.focusNode, sel.focusOffset) : null;
    const scroll = el.scrollTop;
    el.innerHTML = toHtml(value, !notes);
    lastSent.current = value;
    if (before) el.scrollTop = scroll;
    if (before && a && b && sel) {
      const after = value.split("\n");
      let same = 0;
      while (same < before.length && same < after.length && before[same] === after[same]) same++;
      const move = (s: Spot): Spot => (s.line < same ? s : { line: Math.max(0, s.line + after.length - before.length), at: s.at });
      sel.setBaseAndExtent(...pointOf(el, move(a)), ...pointOf(el, move(b)));
    } else saved.current = null;
    setEmpty(!value);
  }, [value]);

  // Remember where the cursor was, so the toolbar acts on it.
  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection();
      if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) {
        saved.current = sel.getRangeAt(0).cloneRange();
        // Which line: the top-level <div> holding the cursor.
        let n: Node | null = sel.anchorNode;
        while (n && n.parentNode !== ref.current) n = n.parentNode;
        const line = n ? Array.prototype.indexOf.call(ref.current!.childNodes, n) : 0;
        caretCb.current?.(Math.max(0, line));
        if (selCb.current) {
          const r = sel.getRangeAt(0), root = ref.current!;
          const from = spotOf(root, r.startContainer, r.startOffset), to = spotOf(root, r.endContainer, r.endOffset);
          if (from && to) selCb.current({ from: from.line, to: to.line, words: sel.isCollapsed ? "" : wordsOf(r, root) });
        }
      }
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
  function format(cmd: "foreColor" | "fontName" | "removeFormat" | "insertText" | "bold" | "italic" | "underline" | "delete", arg?: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(cmd, false, arg);
    emit();
  }

  /** A size for the selected words (there is no browser command for an exact one: marked, then replaced). */
  function setSize(percent: number) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (saved.current && sel) { sel.removeAllRanges(); sel.addRange(saved.current); }
    if (!sel || sel.isCollapsed) return;
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("fontSize", false, "7");
    const made: HTMLElement[] = [];
    el.querySelectorAll('font[size="7"]').forEach((f) => {
      const s = document.createElement("span");
      if (percent !== 100) s.style.fontSize = `${percent / 100}em`;
      while (f.firstChild) s.appendChild(f.firstChild);
      s.querySelectorAll<HTMLElement>("[style]").forEach((x) => { x.style.fontSize = ""; });
      f.replaceWith(s);
      // A size inside a size would multiply.
      let p = s.parentElement;
      while (p && p !== el) { if (p.style.fontSize && p.textContent === s.textContent) p.style.fontSize = ""; p = p.parentElement; }
      made.push(s);
    });
    if (made.length) { const r = document.createRange(); r.setStartBefore(made[0]); r.setEndAfter(made[made.length - 1]); sel.removeAllRanges(); sel.addRange(r); }
    emit();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!notes || e.key !== "Enter" || e.shiftKey || e.ctrlKey) return;
    const el = ref.current, sel = document.getSelection();
    if (!el || !sel?.isCollapsed) return;
    const at = spotOf(el, sel.anchorNode, sel.anchorOffset);
    const line = at ? (el.childNodes[at.line]?.textContent ?? "").replace(/\u00a0/g, " ") : "";
    const m = line.match(/^(\s*)(?:(\d{1,2})([.)])|([-•–*]))\s+(.*)$/);
    // Enter after "1. …" starts "2. "; after "- …" another "- "; on an empty one it stops the list.
    if (!at || !m || at.at < line.length) return;
    e.preventDefault();
    if (!m[5].trim()) {
      sel.setBaseAndExtent(...pointOf(el, { line: at.line, at: 0 }), ...pointOf(el, { line: at.line, at: line.length }));
      document.execCommand("delete");
    } else {
      document.execCommand("insertParagraph");
      document.execCommand("insertText", false, `${m[1]}${m[2] ? `${+m[2] + 1}${m[3]}` : m[4]} `);
    }
    emit();
  }

  const slim = "h-8 rounded-md bg-transparent px-1 text-[13px] text-ink-muted hover:bg-surface-4 hover:text-ink";
  const fontOptions = (
    <>
      <option value={DEFAULT_FONT}>Normal font</option>
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
    </>
  );
  const styleButtons = (cls: string) => ([["bold", Bold, "Bold"], ["italic", Italic, "Italic"], ["underline", Underline, "Underline"]] as const).map(([cmd, Icon, name]) => (
    <button key={cmd} onMouseDown={(e) => e.preventDefault()} onClick={() => format(cmd)} title={name} aria-label={name} className={cls}><Icon className="size-4" /></button>
  ));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-4 py-1.5">
          <select value="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) format("fontName", v); }} aria-label="Font" title="Select words and pick a font" className={`${slim} w-24`}>
            <option value="">Font</option>
            {fontOptions}
          </select>
          <select value="" onChange={(e) => { const v = +e.target.value; e.target.value = ""; if (v) setSize(v); }} title="Select words and pick a size" aria-label="Size" className={`${slim} w-16`}>
            <option value="">Size</option>
            <option value={100}>Normal</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}%</option>)}
          </select>
          <span className="mx-1 h-5 w-px bg-line" />
          {styleButtons("grid size-8 place-items-center rounded-md text-ink-muted hover:bg-surface-4 hover:text-ink")}
          <span className="relative">
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => setColours(!colours)} title="Colour" aria-label="Colour" aria-expanded={colours} className="grid size-8 place-items-center rounded-md hover:bg-surface-4"><span className="size-4 rounded-full ring-1 ring-black/20" style={{ background: "conic-gradient(#ef4444,#facc15,#22c55e,#22d3ee,#3b82f6,#a855f7,#ef4444)" }} /></button>
            {colours && (
              <span className="absolute left-0 top-full z-30 mt-1 grid w-40 grid-cols-5 gap-2 rounded-xl border border-line-bright bg-surface-2 p-3 shadow-xl" onMouseLeave={() => setColours(false)}>
                {SWATCHES.map((c) => <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => { format("foreColor", c); setColours(false); }} aria-label={`Colour ${c}`} className="size-6 rounded-full ring-1 ring-black/20 hover:scale-110" style={{ background: c }} />)}
                <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => format("foreColor", custom)} title="Any colour" aria-label="Any colour" className="size-6 cursor-pointer rounded border border-line-bright bg-transparent p-0" />
              </span>
            )}
          </span>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => format("removeFormat")} title="Back to plain" aria-label="Back to plain" className="grid size-8 place-items-center rounded-md text-ink-muted hover:bg-surface-4 hover:text-ink"><Eraser className="size-4" /></button>
          {!notes && (
            <select value="" onChange={(x) => { const v = x.target.value; x.target.value = ""; if (v) format("insertText", v); }} title="Type a Twi letter" aria-label="Twi letters" className={`${slim} w-14`}>
              <option value="">ɛ ɔ</option>
              {AKAN_LETTERS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {extra}
        </div>

      <div className="relative min-h-0 flex-1">
        {empty && <div className="pointer-events-none absolute left-5 top-3 whitespace-pre text-[15px] text-ink-faint">{placeholder}</div>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={notes ? "Notes" : "Song words"}
          spellCheck={notes}
          onInput={emit}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            // Paste words only (no web page colours or sizes).
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          className={`lyrics-editor h-full overflow-y-auto text-ink outline-none px-5 py-3 ${className ?? "text-[16px] leading-[1.45]"}`}
          style={{ ...style, userSelect: "text", whiteSpace: "pre-wrap" }}
        />
      </div>
    </div>
  );
});

/** The highlighted words with their look: each piece keeps what it inherits from where it sits. */
function wordsOf(r: Range, root: HTMLElement): string {
  const from = spotOf(root, r.startContainer, r.startOffset)!, to = spotOf(root, r.endContainer, r.endOffset)!;
  const all = fromDom(root).split("\n").slice(from.line, to.line + 1);
  return all.map((line, i) => {
    const start = i === 0 ? from.at : 0, end = i === all.length - 1 ? to.at : plainText(line).length;
    let at = 0;
    return runsToText(parseRuns(line).map((x) => {
      const a = Math.max(0, start - at), b = Math.min(x.text.length, end - at);
      at += x.text.length;
      return { ...x, text: b > a ? x.text.slice(a, b) : "" };
    }));
  }).join("\n");
}
