import { useState, useEffect } from "react";
import { ChevronRight, ArrowLeft, Loader2 } from "lucide-react";
import { useSongStore } from "../stores/song-store";
import { useBibleStore } from "../stores/bible-store";
import { BIBLE_BOOKS } from "../types";
import type { ServiceItem, Slide } from "../types";

type ResourceTab = "songs" | "scriptures" | "media" | "online";

export function ResourcesPanel({
  onAddToService,
  onGoLive,
}: {
  onAddToService: (item: ServiceItem) => void;
  onGoLive: (slide: Slide) => void;
}) {
  const [tab, setTab] = useState<ResourceTab>("songs");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-line bg-surface-2">
        {(["songs", "scriptures", "media", "online"] as ResourceTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2.5 py-1.5 text-[9px] font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-primary-bright text-primary-bright"
                : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            {t === "scriptures" ? "Scriptures" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "songs" && <SongsTab onAddToService={onAddToService} onGoLive={onGoLive} />}
      {tab === "scriptures" && <ScripturesTab onAddToService={onAddToService} onGoLive={onGoLive} />}
      {tab === "media" && <MediaTab onAddToService={onAddToService} />}
      {tab === "online" && <OnlineTab />}
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
  const { filteredSongs, searchQuery, loadSongs, search } = useSongStore();

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-1">
        <span className="text-[9px] text-ink-faint">Title</span>
        <div className="flex-1" />
        <button className="rounded border border-line bg-surface-4 px-2 py-0.5 text-[8px] text-ink-faint hover:bg-surface-5">
          Favorites
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-0.5">
        {filteredSongs.map((song) => (
          <div
            key={song.id}
            className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1 text-[10px] text-ink transition-colors hover:bg-surface-4"
            onDoubleClick={() => {
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
                    content: {
                      primaryText: sec?.lyrics ?? "",
                      secondaryText: `${song.title} — ${sec?.label ?? ""}`,
                    },
                    template: { background: "#000", textLayout: "center" },
                  };
                }),
              });
            }}
          >
            <span className="truncate">{song.title}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-2.5 py-1.5">
        <span className="text-[9px] text-ink-faint">Search:</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => search(e.target.value)}
          className="flex-1 rounded border border-line bg-surface-4 px-2 py-0.5 text-[10px] text-ink outline-none focus:border-primary"
          placeholder=""
        />
      </div>
    </div>
  );
}

function ScripturesTab({
  onAddToService,
  onGoLive,
}: {
  onAddToService: (item: ServiceItem) => void;
  onGoLive: (slide: Slide) => void;
}) {
  const {
    packs, activePack, selectedBook, selectedChapter,
    chapterCount, verses, versesLoading, searchResults, searchQuery,
    loadPacks, setActivePack, selectBook, selectChapter, searchBible,
  } = useBibleStore();

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  const currentPack = packs.find((p) => p.id === activePack);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-1">
        <select
          value={activePack ?? ""}
          onChange={(e) => setActivePack(e.target.value)}
          className="rounded border border-line bg-surface-4 px-1.5 py-0.5 text-[9px] font-medium text-ink outline-none focus:border-primary"
        >
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.abbreviation} — {p.name}
            </option>
          ))}
        </select>
        {currentPack?.language && currentPack.language !== "English" && (
          <span className="rounded bg-cyan/10 px-1.5 py-0.5 text-[8px] font-medium text-cyan">
            {currentPack.language}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-0.5">
        {selectedBook === null ? (
          BIBLE_BOOKS.map((book, i) => (
            <button
              key={book}
              onClick={() => selectBook(i)}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1 text-left text-[10px] text-ink transition-colors hover:bg-surface-4"
            >
              <span className="flex-1">{book}</span>
              <ChevronRight className="size-3 text-ink-faint" />
            </button>
          ))
        ) : selectedChapter === null ? (
          <>
            <button
              onClick={() => selectBook(null)}
              className="mb-1 flex items-center gap-1 px-2 py-0.5 text-[10px] text-primary-bright hover:underline"
            >
              <ArrowLeft className="size-3" />
              {BIBLE_BOOKS[selectedBook]}
            </button>
            <div className="grid grid-cols-5 gap-1 px-1">
              {Array.from({ length: chapterCount || 10 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => selectChapter(i + 1)}
                  className="grid h-7 place-items-center rounded border border-line text-[10px] text-ink transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => selectChapter(null)}
              className="mb-1 flex items-center gap-1 px-2 py-0.5 text-[10px] text-primary-bright hover:underline"
            >
              <ArrowLeft className="size-3" />
              {BIBLE_BOOKS[selectedBook]} {selectedChapter}
            </button>
            {versesLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-4 whq-spin text-primary-bright" />
              </div>
            ) : (
              verses.map((v) => {
                const ref = `${BIBLE_BOOKS[selectedBook]} ${selectedChapter}:${v.verse}`;
                return (
                  <div
                    key={v.verse}
                    className="flex cursor-pointer items-start gap-2 rounded px-2.5 py-1 text-left transition-colors hover:bg-surface-4"
                    onDoubleClick={() => {
                      onAddToService({
                        id: crypto.randomUUID(),
                        type: "scripture",
                        title: ref,
                        subtitle: currentPack?.abbreviation,
                        order: 0,
                        data: {
                          book: selectedBook,
                          chapter: selectedChapter,
                          verseStart: v.verse,
                          translation: currentPack?.abbreviation,
                        },
                      });
                    }}
                  >
                    <span className="mt-0.5 w-4 shrink-0 text-right text-[9px] font-bold text-cyan">
                      {v.verse}
                    </span>
                    <p className="flex-1 text-[10px] leading-relaxed text-ink-muted">{v.text}</p>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-2.5 py-1.5">
        <span className="text-[9px] text-ink-faint">Search:</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => searchBible(e.target.value)}
          className="flex-1 rounded border border-line bg-surface-4 px-2 py-0.5 text-[10px] text-ink outline-none focus:border-primary"
          placeholder="Search verses..."
        />
      </div>
      {searchQuery && searchResults.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-t border-line bg-surface-2 px-1 py-0.5">
          <div className="px-2 py-0.5 text-[8px] font-bold text-ink-faint">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
          </div>
          {searchResults.map((v, i) => {
            const bookName = BIBLE_BOOKS[v.book - 1] ?? `Book ${v.book}`;
            const vRef = `${bookName} ${v.chapter}:${v.verse}`;
            return (
              <div
                key={i}
                className="cursor-pointer rounded px-2.5 py-1 transition-colors hover:bg-surface-4"
                onDoubleClick={() => {
                  onAddToService({
                    id: crypto.randomUUID(),
                    type: "scripture",
                    title: vRef,
                    subtitle: currentPack?.abbreviation,
                    order: 0,
                    data: {
                      book: v.book - 1,
                      chapter: v.chapter,
                      verseStart: v.verse,
                      translation: currentPack?.abbreviation,
                    },
                  });
                }}
              >
                <span className="text-[9px] font-bold text-cyan">{vRef}</span>
                <p className="text-[9px] leading-relaxed text-ink-muted line-clamp-2">{v.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MediaTab({ onAddToService }: { onAddToService: (item: ServiceItem) => void }) {
  const items = [
    { id: "1", name: "Worship Motion 012", type: "Video" },
    { id: "2", name: "Church Logo", type: "Image" },
    { id: "3", name: "Welcome Slide", type: "Image" },
    { id: "4", name: "Offering Time", type: "Image" },
    { id: "5", name: "Announcements BG", type: "Video" },
  ];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-1 py-0.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-[10px] text-ink transition-colors hover:bg-surface-4"
            onDoubleClick={() => {
              onAddToService({
                id: crypto.randomUUID(),
                type: "media",
                title: item.name,
                order: 0,
              });
            }}
          >
            <span className="flex-1 truncate">{item.name}</span>
            <span className="text-[8px] text-ink-faint">{item.type}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-2.5 py-1.5">
        <span className="text-[9px] text-ink-faint">Search:</span>
        <input
          type="text"
          className="flex-1 rounded border border-line bg-surface-4 px-2 py-0.5 text-[10px] text-ink outline-none focus:border-primary"
          placeholder=""
        />
      </div>
    </div>
  );
}

function OnlineTab() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <p className="text-[10px] text-ink-faint">Web content — coming soon</p>
    </div>
  );
}
