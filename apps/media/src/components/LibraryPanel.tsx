import { useState, useEffect } from "react";
import { Book, Music, Image, Search, Plus, Play, ChevronDown, Loader2, Upload, Trash2, ArrowLeft } from "lucide-react";
import { BIBLE_BOOKS } from "../types";
import { useBibleStore } from "../stores/bible-store";
import { useSongStore } from "../stores/song-store";
import type { ServiceItem, Slide, BibleVerse } from "../types";

type Tab = "bible" | "songs" | "media";

const TABS: { id: Tab; label: string; icon: typeof Book }[] = [
  { id: "bible", label: "Bible", icon: Book },
  { id: "songs", label: "Songs", icon: Music },
  { id: "media", label: "Media", icon: Image },
];

export function LibraryPanel({
  activeTab,
  onTabChange,
  onAddToService,
  onGoLive,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onAddToService: (item: ServiceItem) => void;
  onGoLive: (slide: Slide) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-line">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                isActive
                  ? "border-b-2 border-primary-bright text-primary-bright"
                  : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "bible" && <BibleTab onAddToService={onAddToService} onGoLive={onGoLive} />}
        {activeTab === "songs" && <SongsTab onAddToService={onAddToService} onGoLive={onGoLive} />}
        {activeTab === "media" && <MediaTab onAddToService={onAddToService} />}
      </div>
    </div>
  );
}

function BibleTab({
  onAddToService,
  onGoLive,
}: {
  onAddToService: (item: ServiceItem) => void;
  onGoLive: (slide: Slide) => void;
}) {
  const {
    packs, activePack, loading,
    selectedBook, selectedChapter, chapterCount, verses, versesLoading,
    searchResults, searchQuery,
    loadPacks, setActivePack, selectBook, selectChapter, searchBible,
  } = useBibleStore();

  const [localSearch, setLocalSearch] = useState("");
  const [showPackManager, setShowPackManager] = useState(false);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  const currentPack = packs.find((p) => p.id === activePack);

  const filteredBooks = localSearch && !searchQuery
    ? BIBLE_BOOKS.filter((b) => b.toLowerCase().includes(localSearch.toLowerCase()))
    : BIBLE_BOOKS;

  function handleSearch(value: string) {
    setLocalSearch(value);
    const ref = parseScriptureRef(value);
    if (!ref && value.length >= 3) {
      searchBible(value);
    } else if (!value) {
      searchBible("");
    }
  }

  function makeScriptureSlide(verse: BibleVerse): Slide {
    const bookName = BIBLE_BOOKS[verse.book - 1] ?? `Book ${verse.book}`;
    const ref = `${bookName} ${verse.chapter}:${verse.verse}`;
    return {
      type: "scripture",
      content: {
        primaryText: verse.text,
        secondaryText: ref,
        metadata: currentPack?.abbreviation ?? "KJV",
      },
      template: { background: "#000", textLayout: "bottom" },
    };
  }

  if (showPackManager) {
    return <BiblePackManager onBack={() => setShowPackManager(false)} />;
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Translation selector */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setShowPackManager(true)}
          className="flex flex-1 items-center justify-between rounded-lg border border-line bg-surface-3 px-2.5 py-1.5 text-xs transition-colors hover:bg-surface-4"
        >
          <span className="font-medium text-ink">
            {loading ? "Loading..." : currentPack?.abbreviation ?? "No Bible loaded"}
          </span>
          <ChevronDown className="size-3 text-ink-faint" />
        </button>
        {packs.length > 1 && (
          <div className="flex gap-0.5">
            {packs.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePack(p.id)}
                className={`rounded-md px-2 py-1.5 text-[10px] font-bold transition-colors ${
                  p.id === activePack
                    ? "bg-primary/15 text-primary-bright"
                    : "bg-surface-3 text-ink-faint hover:text-ink-muted"
                }`}
              >
                {p.abbreviation}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search (e.g. John 3:16 or keyword)"
          className="h-8 w-full rounded-lg border border-line bg-surface-3 pl-8 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Search results */}
      {searchQuery && searchResults.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            {searchResults.length} results
          </div>
          {searchResults.map((v, i) => {
            const bookName = BIBLE_BOOKS[v.book - 1] ?? `Book ${v.book}`;
            const ref = `${bookName} ${v.chapter}:${v.verse}`;
            return (
              <div key={i} className="group flex items-start gap-2 rounded-md p-1.5 transition-colors hover:bg-surface-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold text-primary-bright">{ref}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{v.text}</p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => onGoLive(makeScriptureSlide(v))} className="grid size-5 place-items-center rounded bg-primary/10 text-primary-bright hover:bg-primary/20" title="Go live">
                    <Play className="size-3" />
                  </button>
                  <button onClick={() => onAddToService({ id: crypto.randomUUID(), type: "scripture", title: ref, subtitle: currentPack?.abbreviation, order: 0, data: { book: v.book - 1, chapter: v.chapter, verseStart: v.verse, translation: currentPack?.abbreviation } })} className="grid size-5 place-items-center rounded bg-surface-4 text-ink-faint hover:text-ink" title="Add to service">
                    <Plus className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Book/chapter/verse browser */}
      {!searchQuery && (
        <>
          {selectedBook === null ? (
            <div className="space-y-0.5">
              {filteredBooks.map((book, i) => (
                <button
                  key={book}
                  onClick={() => selectBook(i)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-3"
                >
                  <span className="w-5 text-right text-[10px] text-ink-faint">{i + 1}</span>
                  <span className="text-ink">{book}</span>
                </button>
              ))}
            </div>
          ) : selectedChapter === null ? (
            <div>
              <button onClick={() => selectBook(null)} className="mb-2 flex items-center gap-1 text-xs text-primary-bright hover:underline">
                <ArrowLeft className="size-3" />
                {BIBLE_BOOKS[selectedBook]}
              </button>
              <div className="grid grid-cols-5 gap-1">
                {Array.from({ length: chapterCount || getChapterCount(selectedBook) }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => selectChapter(i + 1)}
                    className="grid h-8 place-items-center rounded-md border border-line text-xs text-ink transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary-bright"
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <button onClick={() => selectChapter(null)} className="mb-2 flex items-center gap-1 text-xs text-primary-bright hover:underline">
                <ArrowLeft className="size-3" />
                {BIBLE_BOOKS[selectedBook]} {selectedChapter}
              </button>

              {versesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-primary-bright" />
                </div>
              ) : verses.length > 0 ? (
                <div className="space-y-2">
                  {verses.map((v) => {
                    const ref = `${BIBLE_BOOKS[selectedBook]} ${selectedChapter}:${v.verse}`;
                    return (
                      <div key={v.verse} className="group flex items-start gap-2 rounded-md p-1.5 transition-colors hover:bg-surface-3">
                        <span className="mt-0.5 w-5 shrink-0 text-right text-[10px] font-bold text-primary-bright">{v.verse}</span>
                        <p className="flex-1 text-xs leading-relaxed text-ink-muted">{v.text}</p>
                        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={() => onGoLive(makeScriptureSlide(v))} className="grid size-5 place-items-center rounded bg-primary/10 text-primary-bright hover:bg-primary/20" title="Go live">
                            <Play className="size-3" />
                          </button>
                          <button
                            onClick={() => onAddToService({ id: crypto.randomUUID(), type: "scripture", title: ref, subtitle: currentPack?.abbreviation, order: 0, data: { book: selectedBook, chapter: selectedChapter, verseStart: v.verse, translation: currentPack?.abbreviation } })}
                            className="grid size-5 place-items-center rounded bg-surface-4 text-ink-faint hover:text-ink" title="Add to service"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-ink-faint">
                  No verses found for this chapter.
                  <br />
                  <span className="text-[10px]">Import a full Bible pack for complete coverage.</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BiblePackManager({ onBack }: { onBack: () => void }) {
  const { packs, activePack, loadPacks, setActivePack, importPack, deletePack } = useBibleStore();
  const [importing, setImporting] = useState(false);

  async function handleImport() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        title: "Import Bible Pack",
        filters: [
          { name: "Bible Pack", extensions: ["db", "sqlite", "whqbible"] },
        ],
      });
      if (!path) return;

      setImporting(true);
      const filePath = String(path);
      const fileName = filePath.split(/[\\/]/).pop()?.replace(/\.(db|sqlite|whqbible)$/, "") ?? "imported";
      const packId = fileName.toLowerCase().replace(/[^a-z0-9]/g, "-");
      await importPack(filePath, packId);
    } catch (e) {
      console.error("Import error:", e);
    } finally {
      setImporting(false);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-primary-bright hover:underline">
          <ArrowLeft className="size-3" />
          Back
        </button>
        <h3 className="text-xs font-semibold text-ink">Bible Packs</h3>
      </div>

      <button
        onClick={handleImport}
        disabled={importing}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-4 text-xs text-ink-faint transition-colors hover:border-primary/40 hover:text-primary-bright disabled:opacity-50"
      >
        {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {importing ? "Importing..." : "Import Bible pack (.db / .whqbible)"}
      </button>

      <div className="space-y-1.5">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
              pack.id === activePack ? "border-primary/40 bg-primary/5" : "border-line hover:bg-surface-3"
            }`}
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10">
              <Book className="size-4 text-primary-bright" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-ink">{pack.name}</span>
                <span className="rounded bg-surface-3 px-1 py-0.5 text-[9px] font-bold text-ink-faint">{pack.abbreviation}</span>
              </div>
              <div className="text-[10px] text-ink-faint">
                {pack.verse_count.toLocaleString()} verses &middot; {formatSize(pack.file_size)} &middot; {pack.language}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              {pack.id !== activePack && (
                <button
                  onClick={() => setActivePack(pack.id)}
                  className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary-bright hover:bg-primary/20"
                >
                  Use
                </button>
              )}
              {pack.id !== "kjv" && (
                <button
                  onClick={() => deletePack(pack.id)}
                  className="grid size-6 place-items-center rounded-md text-ink-faint hover:bg-danger/10 hover:text-danger"
                  title="Remove pack"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {packs.length === 0 && (
        <div className="py-6 text-center text-xs text-ink-faint">
          No Bible packs installed.
          <br />
          Import a pack to get started.
        </div>
      )}

      <div className="rounded-lg bg-surface-3 p-2.5 text-[10px] leading-relaxed text-ink-faint">
        <strong className="text-ink-muted">Bible pack format:</strong> SQLite database with a <code className="rounded bg-surface-4 px-1">verses</code> table
        (book, chapter, verse, text columns) and optional <code className="rounded bg-surface-4 px-1">metadata</code> table.
        Pack files use .db, .sqlite, or .whqbible extensions.
      </div>
    </div>
  );
}

function SongsTab({
  onAddToService,
  onGoLive,
}: {
  onAddToService: (item: ServiceItem) => void;
  onGoLive: (slide: Slide) => void;
}) {
  const { filteredSongs, searchQuery, activeSong, loadSongs, search, setActiveSong } = useSongStore();

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  if (activeSong) {
    return <SongDetail song={activeSong} onBack={() => setActiveSong(null)} onAddToService={onAddToService} onGoLive={onGoLive} />;
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => search(e.target.value)}
          placeholder="Search songs, artists, or lyrics..."
          className="h-8 w-full rounded-lg border border-line bg-surface-3 pl-8 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      <div className="space-y-0.5">
        {filteredSongs.map((song) => (
          <div
            key={song.id}
            className="group flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-surface-3"
          >
            <button onClick={() => setActiveSong(song)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-gold/10">
                <Music className="size-3.5 text-gold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-ink">{song.title}</div>
                <div className="truncate text-[10px] text-ink-faint">
                  {song.author} &middot; Key of {song.key}
                </div>
              </div>
            </button>
            <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => {
                  const firstSection = song.sections[0];
                  onGoLive({
                    type: "song",
                    content: { primaryText: firstSection?.lyrics.split("\n").slice(0, 4).join("\n") ?? song.title, secondaryText: `${song.title} — ${firstSection?.label ?? ""}` },
                    template: { background: "#000", textLayout: "center" },
                  });
                }}
                className="grid size-5 place-items-center rounded bg-primary/10 text-primary-bright hover:bg-primary/20"
                title="Go live"
              >
                <Play className="size-3" />
              </button>
              <button
                onClick={() => {
                  onAddToService({
                    id: crypto.randomUUID(),
                    type: "song",
                    title: song.title,
                    subtitle: song.author,
                    order: 0,
                    data: { songId: song.id },
                    slides: song.order.map((sectionId) => {
                      const sec = song.sections.find((s) => s.id === sectionId);
                      return {
                        type: "song" as const,
                        content: { primaryText: sec?.lyrics ?? "", secondaryText: `${song.title} — ${sec?.label ?? ""}` },
                        template: { background: "#000", textLayout: "center" },
                      };
                    }),
                  });
                }}
                className="grid size-5 place-items-center rounded bg-surface-4 text-ink-faint hover:text-ink"
                title="Add to service"
              >
                <Plus className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-4 text-xs text-ink-faint transition-colors hover:border-primary/40 hover:text-primary-bright">
        <Plus className="size-3.5" />
        Add new song
      </button>
    </div>
  );
}

function SongDetail({
  song,
  onBack,
  onAddToService,
  onGoLive,
}: {
  song: { id: string; title: string; author?: string; key?: string; sections: { id: string; label: string; lyrics: string; order: number }[]; order: string[]; tags: string[] };
  onBack: () => void;
  onAddToService: (item: ServiceItem) => void;
  onGoLive: (slide: Slide) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-primary-bright hover:underline">
        <ArrowLeft className="size-3" />
        Back to songs
      </button>

      <div className="flex items-start gap-2.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold/10">
          <Music className="size-5 text-gold" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">{song.title}</h3>
          <p className="text-[11px] text-ink-faint">{song.author} &middot; Key of {song.key}</p>
          <div className="mt-1 flex gap-1">
            {song.tags.map((tag) => (
              <span key={tag} className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-medium text-ink-faint">{tag}</span>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          onAddToService({
            id: crypto.randomUUID(),
            type: "song",
            title: song.title,
            subtitle: song.author,
            order: 0,
            data: { songId: song.id },
            slides: song.order.map((sectionId) => {
              const sec = song.sections.find((s) => s.id === sectionId);
              return {
                type: "song" as const,
                content: { primaryText: sec?.lyrics ?? "", secondaryText: `${song.title} — ${sec?.label ?? ""}` },
                template: { background: "#000", textLayout: "center" },
              };
            }),
          });
        }}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary-bright"
      >
        <Plus className="size-3.5" />
        Add all to service
      </button>

      {/* Section flow order */}
      <div className="flex flex-wrap gap-1">
        {song.order.map((sectionId, i) => {
          const sec = song.sections.find((s) => s.id === sectionId);
          return (
            <span key={i} className="rounded-full bg-surface-3 px-2 py-0.5 text-[9px] font-medium text-ink-faint">
              {sec?.label ?? sectionId}
            </span>
          );
        })}
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {song.sections.map((section) => (
          <div key={section.id} className="group rounded-lg border border-line p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gold">{section.label}</span>
              <button
                onClick={() => {
                  onGoLive({
                    type: "song",
                    content: { primaryText: section.lyrics, secondaryText: `${song.title} — ${section.label}` },
                    template: { background: "#000", textLayout: "center" },
                  });
                }}
                className="grid size-5 place-items-center rounded bg-primary/10 text-primary-bright opacity-0 transition-opacity hover:bg-primary/20 group-hover:opacity-100"
                title="Go live"
              >
                <Play className="size-3" />
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-muted">
              {section.lyrics}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaTab({ onAddToService }: { onAddToService: (item: ServiceItem) => void }) {
  const mediaItems = [
    { id: "1", name: "Church Logo", type: "logo" },
    { id: "2", name: "Welcome Slide", type: "image" },
    { id: "3", name: "Offering Time", type: "image" },
    { id: "4", name: "Announcements", type: "image" },
  ];

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          placeholder="Search media..."
          className="h-8 w-full rounded-lg border border-line bg-surface-3 pl-8 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {mediaItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onAddToService({
                id: crypto.randomUUID(),
                type: "media" as const,
                title: item.name,
                order: 0,
              });
            }}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-surface-3 p-3 transition-colors hover:border-primary/30 hover:bg-surface-4"
          >
            <div className="grid size-12 place-items-center rounded-md bg-surface-4">
              <Image className="size-5 text-ink-faint" />
            </div>
            <span className="text-[10px] font-medium text-ink-muted">{item.name}</span>
          </button>
        ))}
      </div>

      <button className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-6 text-xs text-ink-faint transition-colors hover:border-primary/40 hover:text-primary-bright">
        <Plus className="size-3.5" />
        Import media
      </button>
    </div>
  );
}

function parseScriptureRef(input: string): { book: string; chapter: number; verse: number } | null {
  const match = input.match(/^(\d?\s*\w+)\s+(\d+):(\d+)/);
  if (!match) return null;
  return { book: match[1].trim(), chapter: parseInt(match[2]), verse: parseInt(match[3]) };
}

function getChapterCount(bookIndex: number): number {
  const counts = [
    50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31,
    12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,
    28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5,
    5, 3, 5, 1, 1, 1, 22,
  ];
  return counts[bookIndex] ?? 10;
}
