import { useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import type { Song } from "../types";
import { songToText, textToSections } from "../lib/song-text";
import { buildSongSlides } from "../lib/song-slides";
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
  const [dirty, setDirty] = useState(isNew);
  const [showHelp, setShowHelp] = useState(false);
  const [autoSave, setAutoSaveRaw] = useState(() => { try { return localStorage.getItem("whq-songs-autosave") === "1"; } catch { return false; } });
  const setAutoSave = (v: boolean) => { setAutoSaveRaw(v); try { localStorage.setItem("whq-songs-autosave", v ? "1" : "0"); } catch { /* ignore */ } };
  const titleRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { if (isNew) setTimeout(() => { titleRef.current?.focus(); titleRef.current?.select(); }, 60); }, [isNew]);

  const changes = (t = title, a = author, k = keyName, words = text): Partial<Song> => ({ title: t.trim() || "Untitled song", author: a, key: k, ...textToSections(words) });
  const preview = useMemo(() => buildSongSlides({ ...song, ...changes() } as Song), [title, author, keyName, text]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function close() {
    if (dirty && !autoSave && !isNew) {
      if (!window.confirm(`Close without saving your changes to “${title || "this song"}”?`)) return;
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

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-3 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "New song" : `Edit ${song.title}`}
        className="flex h-[min(860px,96vh)] w-[min(1180px,98vw)] flex-col overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-line px-5 py-4">
          <label className="min-w-[240px] flex-1">
            <span className="mb-1 block text-[12px] font-medium text-ink-muted">{isNew ? "New song" : "Song title"}</span>
            <input ref={titleRef} value={title} onChange={(e) => edit({ t: e.target.value })} placeholder="Song title"
              className="h-10 w-full rounded-lg border border-line-bright px-3 text-[18px] font-bold text-ink outline-none focus:border-primary" />
          </label>
          <label className="w-56">
            <span className="mb-1 block text-[12px] font-medium text-ink-muted">Written by</span>
            <input value={author} onChange={(e) => edit({ a: e.target.value })} placeholder="e.g. Chris Tomlin"
              className="h-10 w-full rounded-lg border border-line-bright px-3 text-[14px] text-ink outline-none focus:border-primary" />
          </label>
          <label className="w-20">
            <span className="mb-1 block text-[12px] font-medium text-ink-muted">Key</span>
            <input value={keyName} onChange={(e) => edit({ k: e.target.value })} placeholder="G"
              className="h-10 w-full rounded-lg border border-line-bright px-3 text-[14px] text-ink outline-none focus:border-primary" />
          </label>
          <button onClick={close} aria-label="Close" className="mb-1 ml-auto grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-4 hover:text-ink">
            <X className="size-5" />
          </button>
        </div>

        {/* Words + slides */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[14px] font-semibold text-ink">Words</span>
              <button onClick={() => setShowHelp((h) => !h)} className="flex items-center gap-1 text-[13px] font-medium text-primary-bright hover:underline">
                <HelpCircle className="size-4" /> How to write the words
              </button>
            </div>
            {showHelp && (
              <div className="mb-2 rounded-lg bg-primary-soft/60 p-3 text-[13px] leading-relaxed text-ink">
                Put each part under a heading in square brackets, like <b>[Verse 1]</b>, <b>[Chorus]</b> or <b>[Bridge]</b>.
                Leave an empty line to start a new slide. To sing the chorus again, write <b>[Chorus]</b> again with nothing under it.
                Select words and click a colour or pick a font, or pick one first and keep typing.
              </div>
            )}
            <LyricsEditor value={text} onChange={(w) => edit({ w })} placeholder={"[Verse 1]\nType or paste the words here…"} />
          </div>
          <div className="hidden min-h-0 flex-col lg:flex">
            <span className="mb-2 text-[14px] font-semibold text-ink">Slides <span className="font-normal text-ink-muted">({preview.length})</span></span>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {preview.map((s, i) => (
                <div key={i}>
                  <SlidePreview slide={s} />
                  <div className="mt-1 text-[12px] font-semibold text-ink-muted">{i + 1}. {s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line bg-surface-4/40 px-5 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-muted" title="Save every change as you type">
            <input type="checkbox" checked={autoSave} onChange={(e) => { setAutoSave(e.target.checked); if (e.target.checked && dirty) save(); }} className="size-4 accent-[var(--color-primary)]" />
            Save automatically
          </label>
          <span className="text-[12px] text-ink-faint">Ctrl+S saves · Esc closes</span>
          <div className="ml-auto flex gap-2">
            {autoSave ? (
              <>
                <span className="self-center text-[13px] text-ink-faint">{dirty ? "Saving…" : "✓ Saved"}</span>
                <button onClick={close} className="h-10 rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-bright">Done</button>
              </>
            ) : (
              <>
                <button onClick={() => { window.clearTimeout(timer.current); onCancel(); }} className="h-10 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4">Cancel</button>
                <button onClick={() => { save(); onCancel(); }} className="h-10 rounded-lg bg-primary px-6 text-[14px] font-bold text-white hover:bg-primary-bright">Save</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
