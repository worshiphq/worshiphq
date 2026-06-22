import { useState } from "react";
import { Book, Music, Image, Search, Plus, Play } from "lucide-react";
import { BIBLE_BOOKS } from "../types";
import type { ServiceItem, Slide } from "../types";

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
      {/* Tab bar */}
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

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "bible" && (
          <BibleTab onAddToService={onAddToService} onGoLive={onGoLive} />
        )}
        {activeTab === "songs" && (
          <SongsTab onAddToService={onAddToService} onGoLive={onGoLive} />
        )}
        {activeTab === "media" && (
          <MediaTab onAddToService={onAddToService} />
        )}
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
  const [search, setSearch] = useState("");
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  const filteredBooks = search
    ? BIBLE_BOOKS.filter((b) => b.toLowerCase().includes(search.toLowerCase()))
    : BIBLE_BOOKS;

  const quickRef = parseScriptureRef(search);

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search (e.g. John 3:16)"
          className="h-8 w-full rounded-lg border border-line bg-surface-3 pl-8 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {quickRef && (
        <button
          onClick={() => {
            const ref = `${quickRef.book} ${quickRef.chapter}:${quickRef.verse}`;
            const slide: Slide = {
              type: "scripture",
              content: {
                primaryText: `"For God so loved the world..."`,
                secondaryText: ref,
                metadata: "KJV",
              },
              template: { background: "#000", textLayout: "bottom" },
            };
            onGoLive(slide);
          }}
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-left transition-colors hover:bg-primary/10"
        >
          <Play className="size-3.5 text-primary-bright" />
          <div>
            <div className="text-xs font-medium text-ink">
              {quickRef.book} {quickRef.chapter}:{quickRef.verse}
            </div>
            <div className="text-[10px] text-ink-faint">Quick project</div>
          </div>
        </button>
      )}

      {selectedBook === null ? (
        <div className="space-y-0.5">
          {filteredBooks.map((book, i) => (
            <button
              key={book}
              onClick={() => setSelectedBook(i)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-3"
            >
              <span className="w-5 text-right text-[10px] text-ink-faint">{i + 1}</span>
              <span className="text-ink">{book}</span>
            </button>
          ))}
        </div>
      ) : selectedChapter === null ? (
        <div>
          <button
            onClick={() => setSelectedBook(null)}
            className="mb-2 text-xs text-primary-bright hover:underline"
          >
            &larr; {BIBLE_BOOKS[selectedBook]}
          </button>
          <div className="grid grid-cols-5 gap-1">
            {Array.from({ length: getChapterCount(selectedBook) }, (_, i) => (
              <button
                key={i}
                onClick={() => setSelectedChapter(i + 1)}
                className="grid h-8 place-items-center rounded-md border border-line text-xs text-ink transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary-bright"
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setSelectedChapter(null)}
            className="mb-2 text-xs text-primary-bright hover:underline"
          >
            &larr; {BIBLE_BOOKS[selectedBook]} {selectedChapter}
          </button>
          <div className="space-y-2">
            {Array.from({ length: 20 }, (_, i) => {
              const verseNum = i + 1;
              const ref = `${BIBLE_BOOKS[selectedBook]} ${selectedChapter}:${verseNum}`;
              return (
                <div
                  key={verseNum}
                  className="group flex items-start gap-2 rounded-md p-1.5 transition-colors hover:bg-surface-3"
                >
                  <span className="mt-0.5 w-5 shrink-0 text-right text-[10px] font-bold text-primary-bright">
                    {verseNum}
                  </span>
                  <p className="flex-1 text-xs leading-relaxed text-ink-muted">
                    Verse text will appear here when Bible packs are loaded...
                  </p>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        const slide: Slide = {
                          type: "scripture",
                          content: { primaryText: "...", secondaryText: ref, metadata: "KJV" },
                          template: { background: "#000", textLayout: "bottom" },
                        };
                        onGoLive(slide);
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
                          type: "scripture",
                          title: ref,
                          subtitle: "KJV",
                          order: 0,
                          data: { book: selectedBook, chapter: selectedChapter, verseStart: verseNum, translation: "KJV" },
                        });
                      }}
                      className="grid size-5 place-items-center rounded bg-surface-4 text-ink-faint hover:text-ink"
                      title="Add to service"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  const [search, setSearch] = useState("");

  const demoSongs = [
    { id: "1", title: "How Great Is Our God", author: "Chris Tomlin", key: "C" },
    { id: "2", title: "Amazing Grace", author: "John Newton", key: "G" },
    { id: "3", title: "10,000 Reasons", author: "Matt Redman", key: "G" },
    { id: "4", title: "What A Beautiful Name", author: "Hillsong Worship", key: "D" },
    { id: "5", title: "Goodness of God", author: "Bethel Music", key: "A" },
    { id: "6", title: "Great Are You Lord", author: "All Sons & Daughters", key: "G" },
    { id: "7", title: "Way Maker", author: "Sinach", key: "E" },
    { id: "8", title: "Blessed Assurance", author: "Fanny Crosby", key: "D" },
  ];

  const filtered = search
    ? demoSongs.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.author.toLowerCase().includes(search.toLowerCase()),
      )
    : demoSongs;

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search songs..."
          className="h-8 w-full rounded-lg border border-line bg-surface-3 pl-8 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      <div className="space-y-0.5">
        {filtered.map((song) => (
          <div
            key={song.id}
            className="group flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-surface-3"
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-gold/10">
              <Music className="size-3.5 text-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-ink">{song.title}</div>
              <div className="truncate text-[10px] text-ink-faint">
                {song.author} &middot; Key of {song.key}
              </div>
            </div>
            <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => {
                  const slide: Slide = {
                    type: "song",
                    content: { primaryText: song.title, secondaryText: "Verse 1" },
                    template: { background: "#000", textLayout: "center" },
                  };
                  onGoLive(slide);
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
