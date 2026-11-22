import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { usePassageStore } from "../lib/show-passage";
import {
  BookOpen, Check, ChevronLeft, ChevronRight, Copy, CornerDownLeft, Loader2,
  MonitorOff, MonitorPlay, Plus, Search, TextSearch, X,
} from "lucide-react";
import { useBibleStore } from "../stores/bible-store";
import { useProjectionStore } from "../stores/projection-store";
import { BIBLE_BOOKS } from "../types";
import type { BibleVerse, Slide } from "../types";
import {
  CHAPTER_COUNTS, OLD_TESTAMENT_COUNT, SHORT_BOOKS, formatReference, matchBooks, parseReference, parseReferenceWithNames,
} from "../lib/scripture-ref";
import {
  DEFAULT_SCRIPTURE_STYLE, SCRIPTURE_BACKGROUNDS, buildScriptureSlides,
  type ScriptureStyle, type TextSize,
} from "../lib/scripture-slides";
import { DEFAULT_TEMPLATES } from "../lib/slide-templates";
import { SlidePreview } from "./SlidePreview";
import { useContextMenu } from "./ContextMenu";

const EXAMPLES = ["John 3:16", "Psalm 23", "Romans 8:28", "1 Corinthians 13:4-7", "Philippians 4:6-7"];

const isDesktopApp = () => typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

interface Selection { start: number; end: number }

export function ScriptureView({ onOpenLooks }: { onOpenLooks: () => void }) {
  const {
    packs, activePack, selectedBook, selectedChapter, chapterCount,
    verses, versesLoading, searchResults,
    loadPacks, setActivePack, selectBook, goTo, searchBible,
  } = useBibleStore();
  const { currentSlide, isLive, isBlack, projectionOpen, goLive, goClear, openProjection, addToService } =
    useProjectionStore();

  const [selection, setSelection] = useState<Selection | null>(null);
  /** Verses the search box asked for, applied once that chapter has finished loading. */
  const [pendingSelection, setPendingSelection] = useState<(Selection & { book: number; chapter: number }) | null>(null);
  const [showingWords, setShowingWords] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [style, setStyle] = useState<ScriptureStyle>(DEFAULT_SCRIPTURE_STYLE);
  /** Slides last sent to the screen from here, so Back / Next part can work. */
  const [liveParts, setLiveParts] = useState<Slide[]>([]);

  useEffect(() => { if (!packs.length) loadPacks(); }, [packs.length, loadPacks]);

  useEffect(() => {
    if (versesLoading || !pendingSelection) return;
    const first = verses[0];
    if (!first || first.book !== pendingSelection.book + 1 || first.chapter !== pendingSelection.chapter) return;
    const max = verses[verses.length - 1].verse;
    const start = Math.min(pendingSelection.start, max);
    setSelection({ start, end: Math.min(Math.max(pendingSelection.end, start), max) });
    setPendingSelection(null);
  }, [versesLoading, verses, pendingSelection]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const pack = packs.find((p) => p.id === activePack);
  const ownNames = pack?.book_names?.length === 66 && pack.book_names.every(Boolean) ? pack.book_names : undefined;
  const bookName = (b: number) => ownNames?.[b] ?? BIBLE_BOOKS[b];
  const [bookFilter, setBookFilter] = useState("");
  const [verseFilter, setVerseFilter] = useState("");
  // Optional second version on screen (remembered on this computer).
  const [secondId, setSecondIdRaw] = useState<string>(() => { try { return localStorage.getItem("whq-second-version") ?? ""; } catch { return ""; } });
  const setSecondId = (id: string) => { setSecondIdRaw(id); try { localStorage.setItem("whq-second-version", id); } catch { /* ignore */ } };
  const secondPack = packs.find((p) => p.id === secondId && p.id !== activePack);
  const [secondVerses, setSecondVerses] = useState<BibleVerse[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!secondPack || selectedBook === null || selectedChapter === null) { setSecondVerses([]); return; }
    (async () => {
      let v: BibleVerse[] = [];
      try {
        if ((window as any).__TAURI_INTERNALS__) {
          const { invoke } = await import("@tauri-apps/api/core");
          v = await invoke<BibleVerse[]>("bible_get_chapter", { packId: secondPack.id, book: selectedBook + 1, chapter: selectedChapter });
        } else {
          const { demoChapter } = await import("../lib/demo-bible");
          v = demoChapter(selectedBook + 1, selectedChapter);
        }
      } catch { v = []; }
      if (!cancelled) setSecondVerses(v);
    })();
    return () => { cancelled = true; };
  }, [secondPack, selectedBook, selectedChapter]);
  const chosen: BibleVerse[] = useMemo(
    () => (selection ? verses.filter((v) => v.verse >= selection.start && v.verse <= selection.end) : []),
    [selection, verses],
  );
  const reference =
    selectedBook !== null && selectedChapter !== null && selection
      ? formatReference({ book: selectedBook, chapter: selectedChapter, verseStart: selection.start, verseEnd: selection.end }, ownNames)
      : null;
  const slides = useMemo(
    () => (reference && chosen.length
      ? buildScriptureSlides(chosen, reference, pack?.abbreviation, style, secondPack && secondVerses.length ? { verses: secondVerses, abbreviation: secondPack.abbreviation } : undefined)
      : []),
    [chosen, reference, pack?.abbreviation, style, secondPack, secondVerses],
  );
  const wordCount = chosen.reduce((n, v) => n + v.text.split(/\s+/).length, 0);

  const livePartIndex = currentSlide ? liveParts.findIndex((s) => s.content.primaryText === currentSlide.content.primaryText) : -1;
  const thisPassageIsLive = isLive && !isBlack && !!slides.length && slides.some((s) => s.content.primaryText === currentSlide?.content.primaryText);

  function openReference(book: number, chapter: number, start?: number, end?: number) {
    setShowingWords(false);
    setSelection(null);
    setPendingSelection(start ? { book, chapter, start, end: end ?? start } : null);
    goTo(book, chapter);
  }

  function changeChapter(delta: number) {
    if (selectedBook === null || selectedChapter === null) return;
    let book = selectedBook;
    let chapter = selectedChapter + delta;
    if (chapter < 1) {
      if (book === 0) return;
      book -= 1;
      chapter = CHAPTER_COUNTS[book];
    } else if (chapter > (chapterCount || CHAPTER_COUNTS[book])) {
      if (book === BIBLE_BOOKS.length - 1) return;
      book += 1;
      chapter = 1;
    }
    openReference(book, chapter);
  }

  const menu = useContextMenu();
  // Menu actions run after the right-clicked verse has been selected, so they read the latest functions.
  const actions = useRef({ showOnScreen: () => {}, addPassageToService: () => {}, copyText: async () => {} });
  const verseMenu = (verse: number) => menu.open(() => {
    if (!selection || verse < selection.start || verse > selection.end) setSelection({ start: verse, end: verse });
    return [
      { label: "Show on screen", icon: <MonitorPlay className="size-4" />, onClick: () => actions.current.showOnScreen() },
      { label: "Add to service", icon: <Plus className="size-4" />, onClick: () => actions.current.addPassageToService() },
      { label: "Copy the words", icon: <Copy className="size-4" />, onClick: () => actions.current.copyText() },
    ];
  });

  // The first verse clicked; Ctrl+click on a second verse chooses everything between the two.
  const anchor = useRef<number | null>(null);
  function clickVerse(verse: number, extend: boolean) {
    if (extend && anchor.current !== null) {
      const a = anchor.current;
      setSelection({ start: Math.min(a, verse), end: Math.max(a, verse) });
      return;
    }
    anchor.current = verse;
    setSelection({ start: verse, end: verse });
  }

  function showOnScreen() {
    if (!slides.length) return;
    if (isDesktopApp() && !projectionOpen) openProjection();
    setLiveParts(slides);
    goLive(slides[0]);
    // So "next verse" / "verse 5" (voice) know where we are.
    if (selectedBook !== null && selectedChapter !== null && selection && reference) {
      usePassageStore.getState().set({
        book: selectedBook, chapter: selectedChapter, start: selection.start, end: selection.end,
        versesInChapter: verses[verses.length - 1]?.verse ?? selection.end, label: reference, slides, index: 0,
      });
    }
  }

  function addPassageToService() {
    if (!slides.length || !reference || selectedBook === null || selectedChapter === null || !selection) return;
    addToService({
      id: crypto.randomUUID(),
      type: "scripture",
      title: reference,
      subtitle: pack?.abbreviation,
      order: 0,
      slides,
      data: {
        book: selectedBook,
        chapter: selectedChapter,
        verseStart: selection.start,
        verseEnd: selection.end,
        translation: pack?.abbreviation,
      },
    });
    setToast(`${reference} added to the service`);
  }

  async function copyText() {
    if (!chosen.length || !reference) return;
    const text = `${chosen.map((v) => v.text).join(" ")}\n${reference}${pack ? ` (${pack.abbreviation})` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setToast("Verse text copied");
    } catch {
      setToast("Couldn't copy the text");
    }
  }

  actions.current = { showOnScreen, addPassageToService, copyText };

  const testamentOf = (b: number | null) => (b !== null && b < OLD_TESTAMENT_COUNT ? "old" : "new");

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3">
      {menu.element}
      {/* ─── Search and versions ─── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 p-2 shadow-sm">
        <div className="min-w-[260px] flex-1">
          <ReferenceSearch
            bookNames={ownNames}
            onOpen={openReference}
            onPickBook={(b) => { setShowingWords(false); selectBook(b); }}
            onSearchWords={(q) => { setShowingWords(true); searchBible(q); }}
          />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          Version
          <select value={activePack ?? ""} onChange={(e) => setActivePack(e.target.value)} className="h-10 max-w-[220px] rounded-lg border border-line-bright bg-surface-2 px-2 text-[14px] font-semibold text-ink outline-none focus:border-primary">
            {packs.map((p) => <option key={p.id} value={p.id}>{p.abbreviation} · {p.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          + Second
          <select value={secondPack ? secondId : ""} onChange={(e) => setSecondId(e.target.value)} className="h-10 max-w-[200px] rounded-lg border border-line-bright bg-surface-2 px-2 text-[14px] text-ink outline-none focus:border-primary">
            <option value="">None</option>
            {packs.filter((p) => p.id !== activePack).map((p) => <option key={p.id} value={p.id}>{p.abbreviation} · {p.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 max-xl:overflow-y-auto xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* ─── Book › Chapter › Verse lists (like EasyWorship) ─── */}
        <section className="grid min-h-0 grid-cols-[minmax(150px,210px)_74px_minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-surface-2 shadow-sm max-xl:h-[560px]">
          {/* Books */}
          <div className="flex min-h-0 flex-col border-r border-line">
            <div className="shrink-0 border-b border-line p-2">
              <input value={bookFilter} onChange={(e) => setBookFilter(e.target.value)} placeholder="Find a book" aria-label="Find a book"
                className="h-9 w-full rounded-lg border border-line-bright px-2.5 text-[14px] text-ink outline-none focus:border-primary" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-label="Books">
              {BIBLE_BOOKS.map((_, i) => i).filter((i) => {
                const f = bookFilter.trim().toLowerCase();
                if (!f) return true;
                return bookName(i).toLowerCase().includes(f) || BIBLE_BOOKS[i].toLowerCase().startsWith(f) || SHORT_BOOKS[i].toLowerCase().startsWith(f);
              }).map((i) => (
                <div key={i}>
                  {!bookFilter && (i === 0 || i === OLD_TESTAMENT_COUNT) && (
                    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{i === 0 ? "Old Testament" : "New Testament"}</div>
                  )}
                  <button
                    role="option"
                    aria-selected={i === selectedBook}
                    ref={(el) => { if (el && i === selectedBook) el.scrollIntoView({ block: "nearest" }); }}
                    onClick={() => { setShowingWords(false); setSelection(null); setVerseFilter(""); openReference(i, 1); }}
                    className={`block w-full truncate px-3 py-1.5 text-left text-[14px] ${i === selectedBook ? "bg-primary font-semibold text-white" : "text-ink hover:bg-surface-4"}`}
                    title={ownNames ? `${bookName(i)} (${BIBLE_BOOKS[i]})` : undefined}
                  >
                    {bookName(i)}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Chapters */}
          <div className="flex min-h-0 flex-col border-r border-line">
            <div className="shrink-0 border-b border-line px-2 py-[14px] text-center text-[12px] font-semibold text-ink-muted">Chapter</div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-label="Chapters">
              {selectedBook !== null && Array.from({ length: chapterCount || CHAPTER_COUNTS[selectedBook] }, (_, i) => i + 1).map((c) => (
                <button
                  key={c}
                  role="option"
                  aria-selected={c === selectedChapter}
                  ref={(el) => { if (el && c === selectedChapter) el.scrollIntoView({ block: "nearest" }); }}
                  onClick={() => { setVerseFilter(""); openReference(selectedBook, c); }}
                  className={`block w-full py-1.5 text-center text-[14px] font-semibold ${c === selectedChapter ? "bg-primary text-white" : "text-ink hover:bg-surface-4"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Verses */}
          <div className="flex min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-line p-2">
              <IconButton label="Previous chapter" onClick={() => changeChapter(-1)}><ChevronLeft className="size-4" /></IconButton>
              <span className="min-w-0 shrink truncate text-[15px] font-bold text-ink">
                {selectedBook !== null && selectedChapter !== null ? formatReference({ book: selectedBook, chapter: selectedChapter }, ownNames) : "Choose a book"}
              </span>
              <IconButton label="Next chapter" onClick={() => changeChapter(1)}><ChevronRight className="size-4" /></IconButton>
              <input value={verseFilter} onChange={(e) => setVerseFilter(e.target.value)} placeholder="Find in this chapter" aria-label="Find in this chapter"
                className="ml-auto h-9 w-44 min-w-0 rounded-lg border border-line-bright px-2.5 text-[13px] text-ink outline-none focus:border-primary" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Verses" aria-multiselectable="true">
              {showingWords ? (
                <WordResults results={searchResults} onOpen={(v) => openReference(v.book - 1, v.chapter, v.verse)} onClose={() => setShowingWords(false)} />
              ) : selectedBook === null || selectedChapter === null ? (
                <EmptyReader onExample={(text) => {
                  const ref = parseReference(text);
                  if (ref) openReference(ref.book, ref.chapter, ref.verseStart, ref.verseEnd);
                }} />
              ) : versesLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="size-6 whq-spin text-primary" /></div>
              ) : verses.length === 0 ? (
                <p className="py-16 text-center text-[15px] text-ink-muted">This chapter isn't in the {pack?.abbreviation ?? "selected"} Bible. Try another version.</p>
              ) : (
                verses.filter((v) => !verseFilter.trim() || v.text.toLowerCase().includes(verseFilter.trim().toLowerCase()) || String(v.verse) === verseFilter.trim()).map((v) => {
                  const on = !!selection && v.verse >= selection.start && v.verse <= selection.end;
                  const edge = !!selection && (v.verse === selection.start || v.verse === selection.end);
                  return (
                    <button
                      key={v.verse}
                      role="option"
                      aria-selected={on}
                      ref={(el) => { if (el && selection && v.verse === selection.start && !verseFilter) el.scrollIntoView({ block: "nearest" }); }}
                      onClick={(e) => clickVerse(v.verse, e.ctrlKey || e.shiftKey)}
                      onDoubleClick={() => { setSelection({ start: v.verse, end: v.verse }); anchor.current = v.verse; setTimeout(() => actions.current.showOnScreen(), 0); }}
                      onContextMenu={verseMenu(v.verse)}
                      className={`flex w-full items-start gap-2.5 border-b border-line-soft px-3 py-2 text-left ${on ? (edge ? "bg-primary text-white" : "bg-primary-soft text-ink") : "text-ink hover:bg-surface-4"}`}
                    >
                      <span className={`w-7 shrink-0 text-right text-[13px] font-bold ${on && edge ? "text-white" : on ? "text-primary-bright" : "text-ink-faint"}`}>{v.verse}</span>
                      <span className="flex-1 text-[15px] leading-snug">{v.text}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-[13px] text-ink-muted">
              {selection ? (
                <>
                  <Check className="size-4 text-primary-bright" />
                  <b className="text-primary-bright">{reference}</b>
                  <span>· {wordCount} words</span>
                  <button onClick={copyText} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-ink hover:bg-surface-4"><Copy className="size-3.5" /> Copy</button>
                  <button onClick={() => { setSelection(null); anchor.current = null; }} className="rounded-md px-2 py-1 font-semibold text-ink hover:bg-surface-4">Clear</button>
                </>
              ) : (
                <span>Click a verse. <Kbd>Ctrl</Kbd> + click another to choose the verses in between. Double-click shows it straight away.</span>
              )}
            </div>
          </div>
        </section>

        {/* ─── Right: preview, look, send ─── */}
        <div className="flex min-h-0 flex-col gap-3 pl-0.5 max-xl:grid max-xl:grid-cols-2 xl:overflow-y-auto">
          <Card
            title="Screen preview"
            aside={
              thisPassageIsLive
                ? <span className="font-semibold text-danger">● On screen</span>
                : slides.length ? "Ready to show" : undefined
            }
          >
            <SlidePreview
              slide={slides[0] ?? null}
              highlight={thisPassageIsLive ? "live" : slides.length ? "ready" : undefined}
              placeholder="Choose a verse. It will appear here exactly as people will see it."
            />
            {slides.length > 1 && (
              <p className="mt-2 text-[13px] text-ink-muted">
                This passage is long, so it will show in <b className="text-ink">{slides.length} parts</b>.
              </p>
            )}

            <div className="mt-4 space-y-3">
              <button onClick={onOpenLooks} className="flex w-full items-center justify-center gap-2 rounded-lg bg-surface-4 py-2 text-[13px] font-semibold text-ink hover:bg-surface-5">
                Change font, size, colours &amp; background
              </button>
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={style.showTranslation}
                  onChange={(e) => setStyle((s) => ({ ...s, showTranslation: e.target.checked }))}
                  className="size-4 accent-[var(--color-primary)]"
                />
                Show the version ({pack?.abbreviation ?? "KJV"}) under the verse
              </label>
            </div>
          </Card>

          <div className="flex flex-col gap-2">
            <button
              onClick={showOnScreen}
              disabled={!slides.length}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[16px] font-bold text-white shadow-sm transition-colors hover:bg-primary-bright disabled:cursor-not-allowed disabled:bg-surface-5 disabled:text-ink-faint"
            >
              <MonitorPlay className="size-5" /> Show on screen
            </button>
            <button
              onClick={addPassageToService}
              disabled={!slides.length}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line-bright bg-surface-2 text-[15px] font-semibold text-ink transition-colors hover:bg-surface-4 disabled:cursor-not-allowed disabled:text-ink-faint"
            >
              <Plus className="size-5" /> Add to service
            </button>
            {toast && (
              <p role="status" className="fade-in flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[13px] font-medium text-success">
                <Check className="size-4" /> {toast}
              </p>
            )}
            {isDesktopApp() && !projectionOpen && (
              <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2.5 text-[13px] text-ink">
                The projector screen is closed. It will open when you press <b>Show on screen</b>.
              </div>
            )}
          </div>

          {(isLive || isBlack) && (
            <Card
              title="On screen now"
              aside={<span className={`font-semibold ${isBlack ? "text-ink" : "text-danger"}`}>{isBlack ? "Black" : "● Live"}</span>}
            >
              <SlidePreview slide={isBlack ? null : currentSlide} placeholder="The screen is black." highlight={isBlack ? undefined : "live"} />
              {livePartIndex >= 0 && liveParts.length > 1 && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => goLive(liveParts[livePartIndex - 1])}
                    disabled={livePartIndex === 0}
                    className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-surface-4 text-[14px] font-semibold text-ink hover:bg-surface-5 disabled:text-ink-faint"
                  >
                    <ChevronLeft className="size-4" /> Back
                  </button>
                  <span className="text-[13px] text-ink-muted">Part {livePartIndex + 1} of {liveParts.length}</span>
                  <button
                    onClick={() => goLive(liveParts[livePartIndex + 1])}
                    disabled={livePartIndex === liveParts.length - 1}
                    className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-surface-4 text-[14px] font-semibold text-ink hover:bg-surface-5 disabled:text-ink-faint"
                  >
                    Next <ChevronRight className="size-4" />
                  </button>
                </div>
              )}
              <button
                onClick={goClear}
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink"
              >
                <MonitorOff className="size-4" /> Take it off the screen
              </button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Search box ─────────────────────────── */

function ReferenceSearch({
  onOpen, onPickBook, onSearchWords, bookNames,
}: {
  bookNames?: string[];
  onOpen: (book: number, chapter: number, start?: number, end?: number) => void;
  onPickBook: (book: number) => void;
  onSearchWords: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" or Ctrl+K jumps to the search box from anywhere on this screen.
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const parsed = q.trim() ? parseReferenceWithNames(q, bookNames) : null;
  const books = q.trim() && !/\d\s*$/.test(q.trim()) && !parsed ? matchBooks(q) : [];

  type Option = { key: string; label: ReactNode; hint?: string; run: () => void };
  const options: Option[] = [];
  if (parsed) {
    options.push({
      key: "ref",
      label: <>Go to <b>{formatReference(parsed, bookNames)}</b></>,
      run: () => onOpen(parsed.book, parsed.chapter, parsed.verseStart, parsed.verseEnd),
    });
  }
  for (const b of books) {
    options.push({ key: `b${b}`, label: <>{BIBLE_BOOKS[b]}</>, hint: "Pick a chapter", run: () => { onPickBook(b); setQ(`${BIBLE_BOOKS[b]} `); inputRef.current?.focus(); } });
  }
  if (q.trim().length >= 3 && !parsed) {
    options.push({ key: "words", label: <>Find verses that say “{q.trim()}”</>, run: () => onSearchWords(q.trim()) });
  }

  function choose(i: number) {
    const opt = options[i];
    if (!opt) return;
    opt.run();
    if (opt.key === "ref" && parsed) setQ(formatReference(parsed, bookNames));
    setOpen(opt.key.startsWith("b"));
    setActive(0);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-primary" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); choose(active); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        placeholder="Type a verse, like John 3:16 or Psalm 23, then press Enter"
        aria-label="Find a Bible passage"
        className="h-11 w-full rounded-lg bg-transparent pl-11 pr-24 text-[16px] text-ink outline-none placeholder:text-ink-faint"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {q ? (
          <button onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Clear search" className="grid size-7 place-items-center rounded-md text-ink-faint hover:bg-surface-4 hover:text-ink">
            <X className="size-4" />
          </button>
        ) : (
          <Kbd>Ctrl K</Kbd>
        )}
      </div>
      {open && options.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-line-bright bg-surface-2 py-1 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12)]">
          {options.map((o, i) => (
            <li key={o.key}>
              <button
                onMouseDown={(e) => { e.preventDefault(); choose(i); }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] ${i === active ? "bg-primary-soft text-ink" : "text-ink-muted"}`}
              >
                {o.key === "words" ? <TextSearch className="size-4" /> : <BookOpen className="size-4" />}
                <span className="flex-1">{o.label}</span>
                {o.hint && <span className="text-[12px] text-ink-faint">{o.hint}</span>}
                {i === active && <CornerDownLeft className="size-4 text-ink-faint" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────────── Book grid ─────────────────────────── */

function BookCard({
  initialTestament, selectedBook, onPick,
}: { initialTestament: "old" | "new"; selectedBook: number | null; onPick: (b: number) => void }) {
  const [testament, setTestament] = useState(initialTestament);
  const start = testament === "old" ? 0 : OLD_TESTAMENT_COUNT;
  const end = testament === "old" ? OLD_TESTAMENT_COUNT : BIBLE_BOOKS.length;

  return (
    <Card title="Book">
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-surface-4 p-1">
        {(["old", "new"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTestament(t)}
            aria-pressed={testament === t}
            className={`rounded-md py-1.5 text-[13px] font-medium transition-colors ${
              testament === t ? "bg-surface-2 font-semibold text-primary-bright shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t === "old" ? "Old Testament" : "New Testament"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {SHORT_BOOKS.slice(start, end).map((short, i) => {
          const b = start + i;
          const on = b === selectedBook;
          return (
            <button
              key={short}
              onClick={() => onPick(b)}
              title={BIBLE_BOOKS[b]}
              className={`truncate rounded-md px-1 py-2 text-[13px] font-medium transition-colors ${
                on ? "bg-primary text-white" : "bg-surface-4 text-ink hover:bg-surface-5"
              }`}
            >
              {short}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ─────────────────────────── Small pieces ─────────────────────────── */

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {aside && <span className="truncate text-[12px] text-ink-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-[13px] font-medium text-ink-muted">{children}</div>;
}

function NumberButton({
  on, onClick, onContextMenu, children,
}: { on: boolean; onClick: (e: ReactMouseEvent) => void; onContextMenu?: (e: ReactMouseEvent) => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-pressed={on}
      className={`grid h-9 place-items-center rounded-md text-[13px] font-semibold transition-colors ${
        on ? "bg-primary text-white" : "bg-surface-4 text-ink hover:bg-surface-5"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid size-9 place-items-center rounded-lg bg-surface-4 text-ink-muted hover:bg-surface-5 hover:text-ink">
      {children}
    </button>
  );
}

function EmptyReader({ onExample }: { onExample: (ref: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-primary-soft">
        <BookOpen className="size-7 text-primary-bright" />
      </div>
      <div>
        <h2 className="text-[20px] font-bold text-ink">Find a Bible passage</h2>
        <p className="mt-1 max-w-sm text-[15px] text-ink-muted">
          Type a verse in the box above, or pick a book on the left. Or try one of these:
        </p>
      </div>
      <div className="flex max-w-md flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => onExample(ex)} className="rounded-full border border-line-bright bg-surface-2 px-4 py-2 text-[14px] font-medium text-ink hover:border-primary hover:text-primary-bright">
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function WordResults({
  results, onOpen, onClose,
}: { results: BibleVerse[]; onOpen: (v: BibleVerse) => void; onClose: () => void }) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="flex-1 text-[18px] font-bold text-ink">
          {results.length ? `${results.length} verse${results.length === 1 ? "" : "s"} found` : "No verses found"}
        </h2>
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-primary-bright hover:bg-primary-soft">
          Back to reading
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!results.length && (
          <p className="py-16 text-center text-[15px] text-ink-muted">
            Try fewer or different words, or type a verse like John 3:16.
          </p>
        )}
        {results.map((v, i) => (
          <button key={i} onClick={() => onOpen(v)} className="mb-1 w-full rounded-lg px-3 py-2.5 text-left hover:bg-surface-4">
            <span className="text-[14px] font-bold text-primary-bright">
              {BIBLE_BOOKS[v.book - 1]} {v.chapter}:{v.verse}
            </span>
            <p className="mt-0.5 line-clamp-2 text-[15px] text-ink">{v.text}</p>
          </button>
        ))}
      </div>
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-bright bg-surface-4 px-1.5 py-px font-sans text-[12px] font-medium text-ink-muted">{children}</kbd>;
}
