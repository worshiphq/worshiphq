import { ask, dialogOpen } from "./Dialogs";
import { useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import type { Song } from "../types";
import { songToText, textToSections } from "../lib/song-text";
import { buildSongSlides } from "../lib/song-slides";
import { partColor } from "../lib/part-colors";
import { plainText } from "../lib/rich-text";
import { LyricsEditor } from "./LyricsEditor";
import { SlidePreview } from "./SlidePreview";

/**
 * Edit a song in its own window: title, writer, key and the words (with fonts and colours).
 * Nothing changes until Save, unless "Save automatically" is on.
 */
export function SongEditorDialog({ song, isNew, onSave, onCancel }: {
  song: Song;
  /** A brand-new song: Cancel throws it away. */
  isNew: boolean;
  onSave: (changes: Partial<Song>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(song.title);
  const [author, setAuthor] = useState(song.author ?? "");
  const [keyName, setKeyName] = useState(song.key ?? "");
  const [text, setText] = useState(() => songToText(song));
  const [ccli, setCcli] = useState(song.ccli ?? "");
  const [translation, setTranslation] = useState(song.translation ?? "");
  const [trName, setTrName] = useState(song.translationName ?? "Twi");
  const [tab, setTab] = useState<"words" | "translation" | "chords">("words");
  const [chords, setChords] = useState(song.chords ?? "");
  /** The newest values of the extra fields (read when saving). */
  const extra = useRef({ ccli, translation, translationName: trName, chords });
  extra.current = { ccli, translation, translationName: trName, chords };
  const [dirty, setDirty] = useState(isNew);
  const [showHelp, setShowHelp] = useState(false);
  const [autoSave, setAutoSaveRaw] = useState(() => { try { return localStorage.getItem("whq-songs-autosave") === "1"; } catch { return false; } });
  const setAutoSave = (v: boolean) => { setAutoSaveRaw(v); try { localStorage.setItem("whq-songs-autosave", v ? "1" : "0"); } catch { /* ignore */ } };
  const titleRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { if (isNew) setTimeout(() => { titleRef.current?.focus(); titleRef.current?.select(); }, 60); }, [isNew]);

  const changes = (t = title, a = author, k = keyName, words = text): Partial<Song> => ({
    title: t.trim() || "Untitled song", author: a, key: k, ...textToSections(words),
    ccli: extra.current.ccli.trim() || undefined,
    translation: extra.current.translation.trim() ? extra.current.translation : undefined,
    translationName: extra.current.translationName.trim() || undefined,
    chords: extra.current.chords.trim() ? extra.current.chords : undefined,
  });

  /** Running order: the parts in the order they are sung (drag to change, × to drop a repeat, + to add). */
  const arrangement = useMemo(() => textToSections(text), [text]);
  const [dragAt, setDragAt] = useState<number | null>(null);
  function setOrder(order: string[]) {
    edit({ w: songToText({ ...song, sections: arrangement.sections, order } as Song) });
  }
  function editExtra(f: () => void) {
    f();
    edit({});
  }
  const [caretLine, setCaretLine] = useState(1);
  /** The paragraph the cursor is in (lines between empty lines), shown on the one big screen. */
  const current = useMemo(() => {
    const lines = text.split("\n");
    const heading = (l: string) => /^\s*\[[^\]]{1,30}\]\s*$/.test(l);
    let i = Math.min(caretLine, lines.length - 1);
    // On a heading or an empty line: use the next paragraph.
    while (i < lines.length && (heading(lines[i]) || !lines[i].trim())) i++;
    if (i >= lines.length) { i = Math.min(caretLine, lines.length - 1); while (i > 0 && (heading(lines[i]) || !lines[i].trim())) i--; }
    let a = i, b = i;
    while (a > 0 && lines[a - 1].trim() && !heading(lines[a - 1])) a--;
    while (b < lines.length - 1 && lines[b + 1].trim() && !heading(lines[b + 1])) b++;
    let label = "";
    for (let k = a - 1; k >= 0; k--) { const m = lines[k].match(/^\s*\[([^\]]{1,30})\]\s*$/); if (m) { label = m[1]; break; } }
    const words = lines.slice(a, b + 1).join("\n").trim();
    const slide = words ? buildSongSlides({ ...song, translation, translationName: trName, sections: [{ id: "p", label: label || "Words", lyrics: words, order: 0 }], order: ["p"] } as Song)[0] : null;
    // Which screen this is, counting paragraphs from the top.
    let n = 0, total = 0, inPara = false;
    lines.forEach((l, k) => { const word = !!l.trim() && !heading(l); if (word && !inPara) { total++; if (k <= a) n = total; } inPara = word; });
    return { slide, label, n, total };
  }, [text, caretLine, song, translation, trName]);

  function edit(next: { t?: string; a?: string; k?: string; w?: string }) {
    const t = next.t ?? title, a = next.a ?? author, k = next.k ?? keyName, w = next.w ?? text;
    if (next.t !== undefined) setTitle(t);
    if (next.a !== undefined) setAuthor(a);
    if (next.k !== undefined) setKeyName(k);
    if (next.w !== undefined) setText(w);
    setDirty(true);
    if (autoSave) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { onSave(changes(t, a, k, w)); setDirty(false); }, 500);
    }
  }

  function save() {
    window.clearTimeout(timer.current);
    onSave(changes());
    setDirty(false);
  }

  async function close() {
    if (dialogOpen()) return;
    if (dirty && !autoSave && !isNew) {
      if (!(await ask(`Close without saving your changes to “${title || "this song"}”?`, "Close without saving", { danger: true, no: "Keep editing" }))) return;
    }
    window.clearTimeout(timer.current);
    if (autoSave && dirty) onSave(changes());
    onCancel();
  }

  // Esc closes (asking first if there are changes); Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopImmediatePropagation(); save(); onCancel(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const field = "h-9 w-full min-w-0 rounded-lg border border-line bg-surface-2 px-3 text-[13px] text-ink outline-none focus:border-primary placeholder:text-ink-faint";
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-3 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "New song" : `Edit ${song.title}`}
        className="flex h-[min(860px,96vh)] w-[min(1180px,98vw)] flex-col overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px]">
          {/* The words */}
          <div className="flex min-h-0 flex-col">
            <input ref={titleRef} value={title} onChange={(e) => edit({ t: e.target.value })} placeholder="Song title" aria-label="Song title"
              className="shrink-0 bg-transparent px-5 pb-1 pt-4 text-[24px] font-bold text-ink outline-none placeholder:text-ink-faint" />
            <div className="flex shrink-0 items-center gap-2 px-5 pb-2">
              <div className="flex rounded-lg bg-surface-4 p-0.5">
                {([["words", "Words"], ["translation", "Translation"], ["chords", "Chords"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] ${tab === k ? "bg-surface-2 font-semibold text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}>
                    {l}{((k === "translation" && translation.trim()) || (k === "chords" && chords.trim())) && <span className="size-1.5 rounded-full bg-primary" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowHelp((h) => !h)} title="How to write the words" aria-label="How to write the words" aria-expanded={showHelp} className={`grid size-8 place-items-center rounded-lg ${showHelp ? "bg-primary-soft text-primary-bright" : "text-ink-faint hover:bg-surface-4 hover:text-ink"}`}><HelpCircle className="size-4" /></button>
            </div>
            {showHelp && (
              <div className="mx-5 mb-2 shrink-0 rounded-xl bg-primary-soft/60 p-3 text-[13px] leading-relaxed text-ink">
                Put each part under a heading in square brackets, like <b>[Verse 1]</b>, <b>[Chorus]</b> or <b>[Bridge]</b>.
                Leave an empty line to start a new slide. To sing the chorus again, write <b>[Chorus]</b> again with nothing under it.
              </div>
            )}
            {tab === "chords" ? (
              <>
                <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-2 text-[13px] text-ink-muted">
                  <span className="flex-1">For the band. Only the stage display shows this.</span>
                  {!chords.trim() && <button onClick={() => editExtra(() => setChords(plainText(text)))} className="font-semibold text-primary-bright hover:underline">Start from the words</button>}
                </div>
                <textarea value={chords} onChange={(e) => editExtra(() => setChords(e.target.value))} spellCheck={false}
                  placeholder={"[Verse 1]\nG              D/F#\nAmazing grace, how sweet the sound"}
                  className="min-h-0 flex-1 resize-none bg-transparent px-5 py-3 text-[14px] leading-relaxed text-ink outline-none"
                  style={{ fontFamily: "Consolas, 'Courier New', monospace", userSelect: "text" }} />
              </>
            ) : tab === "words" ? (
              <LyricsEditor value={text} onChange={(w) => edit({ w })} onCaretLine={setCaretLine} placeholder={"[Verse 1]\nType or paste the words here…"} />
            ) : (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-5 py-1.5 text-[13px] text-ink-muted">
                  <span className="flex-1">Shown smaller under the words. Use the same headings.</span>
                  {!translation.trim() && (
                    <button onClick={() => editExtra(() => setTranslation(arrangement.sections.map((x) => `[${x.label}]\n`).join("\n")))} className="font-semibold text-primary-bright hover:underline">Copy the headings</button>
                  )}
                  <label className="flex items-center gap-1.5">Language
                    <input value={trName} onChange={(e) => editExtra(() => setTrName(e.target.value.slice(0, 20)))} className="h-8 w-24 rounded-md border border-line bg-surface-2 px-2 text-ink" />
                  </label>
                </div>
                <LyricsEditor value={translation} onChange={(w) => editExtra(() => setTranslation(w))} placeholder={"[Verse 1]\nType the translated words here…"} />
              </>
            )}
          </div>

          {/* On screen, order and details */}
          <div className="hidden min-h-0 flex-col gap-5 overflow-y-auto border-l border-line bg-surface p-4 lg:flex">
            <div className="flex items-center">
              <span className="flex-1 text-[13px] font-semibold text-ink">{current.total ? `${current.label ? `${current.label} · ` : ""}${current.n} of ${current.total}` : "On screen"}</span>
              <button onClick={close} aria-label="Close" title="Close (Esc)" className="-my-1 grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-4 hover:text-ink"><X className="size-5" /></button>
            </div>
            {current.slide ? <SlidePreview slide={current.slide} className="-mt-3 shrink-0" /> : <div className="-mt-3 grid aspect-video shrink-0 place-items-center rounded-lg bg-ink text-[13px] text-white/60">Type some words</div>}

            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink">Order sung</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {arrangement.order.map((id, i) => {
                  const sec = arrangement.sections.find((x) => x.id === id);
                  return (
                    <span key={i} draggable
                      onDragStart={() => setDragAt(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { if (dragAt === null || dragAt === i) return; const o = [...arrangement.order]; const [m] = o.splice(dragAt, 1); o.splice(i, 0, m); setDragAt(null); setOrder(o); }}
                      title="Drag to change the order"
                      className="group flex cursor-grab items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1 pl-2 pr-1.5 text-[12px] font-semibold text-ink">
                      <span className="size-2 rounded-full" style={{ background: partColor(sec?.label) ?? "var(--color-ink-faint)" }} />
                      {sec?.label ?? "?"}
                      <button onClick={() => setOrder(arrangement.order.filter((_, k) => k !== i))} title="Leave this part out here" aria-label={`Leave out ${sec?.label ?? "this part"}`} className="grid size-4 place-items-center rounded text-ink-faint hover:bg-danger hover:text-white">×</button>
                    </span>
                  );
                })}
                <select value="" onChange={(e) => { if (e.target.value) setOrder([...arrangement.order, e.target.value]); }} aria-label="Sing a part again"
                  className="h-7 rounded-lg border border-dashed border-line-bright bg-transparent px-1 text-[12px] text-ink-muted" title="Sing a part again">
                  <option value="">+ Add</option>
                  {arrangement.sections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <p className="text-[13px] font-semibold text-ink">Details</p>
              <input value={author} onChange={(e) => edit({ a: e.target.value })} placeholder="Written by" aria-label="Written by" className={field} />
              <div className="grid grid-cols-2 gap-2">
                <input value={keyName} onChange={(e) => edit({ k: e.target.value })} placeholder="Key" aria-label="Key" className={field} />
                <input value={ccli} onChange={(e) => editExtra(() => setCcli(e.target.value.replace(/[^0-9]/g, "").slice(0, 10)))} placeholder="CCLI number" aria-label="CCLI number" inputMode="numeric" className={field} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line px-5 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-muted" title="Save every change as you type">
            <input type="checkbox" checked={autoSave} onChange={(e) => { setAutoSave(e.target.checked); if (e.target.checked && dirty) save(); }} className="size-4 accent-[var(--color-primary)]" />
            Save automatically
          </label>
          <div className="ml-auto flex gap-2">
            {autoSave ? (
              <>
                <span className="self-center text-[13px] text-ink-faint">{dirty ? "Saving…" : "✓ Saved"}</span>
                <button onClick={close} className="h-10 rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-bright">Done</button>
              </>
            ) : (
              <>
                <button onClick={() => { window.clearTimeout(timer.current); onCancel(); }} className="h-10 rounded-lg px-4 text-[14px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink">Cancel</button>
                <button onClick={() => { save(); onCancel(); }} title="Ctrl+S" className="h-10 rounded-lg bg-primary px-6 text-[14px] font-bold text-white hover:bg-primary-bright">Save</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

