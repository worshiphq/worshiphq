import { useState, useEffect } from "react";
import { Search, Music, BookOpen, Image, Plus, Play, ChevronRight, FolderOpen, Filter, ArrowLeft, Loader2, Globe } from "lucide-react";
import type { NavSection } from "./IconNav";
import { useSongStore } from "../stores/song-store";
import { useBibleStore } from "../stores/bible-store";
import { BIBLE_BOOKS } from "../types";
import type { ServiceItem, Slide } from "../types";

export function AssetsPanel({
  section,
  onAddToService,
  onGoLive,
}: {
  section: NavSection;
  onAddToService: (item: ServiceItem) => void;
  onGoLive: (slide: Slide) => void;
}) {
  if (section === "songs") return <SongsAssets onAddToService={onAddToService} onGoLive={onGoLive} />;
  if (section === "scriptures") return <ScripturesAssets onAddToService={onAddToService} onGoLive={onGoLive} />;
  if (section === "media") return <MediaAssets onAddToService={onAddToService} />;
  if (section === "audio") return <AudioSettings />;
  if (section === "settings") return <AppSettings />;
  return <WebAssets />;
}

function SongsAssets({ onAddToService, onGoLive }: { onAddToService: (item: ServiceItem) => void; onGoLive: (slide: Slide) => void }) {
  const { filteredSongs, searchQuery, loadSongs, search } = useSongStore();

  useEffect(() => { loadSongs(); }, [loadSongs]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Assets & Media</h3>
        <button className="grid size-5 place-items-center rounded text-ink-faint hover:bg-surface-4 hover:text-ink-muted">
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-line px-2 py-1.5">
        {["Songs", "Scriptures"].map((tab) => (
          <button key={tab} className={`rounded-md px-2.5 py-1 text-[10px] font-medium ${tab === "Songs" ? "bg-primary/15 text-primary-bright" : "text-ink-faint hover:text-ink-muted"}`}>
            {tab}
          </button>
        ))}
      </div>

      <div className="px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => search(e.target.value)}
            placeholder="Search Media..."
            className="h-7 w-full rounded border border-line bg-surface-3 pl-7 pr-2 text-[11px] text-ink placeholder:text-ink-faint focus:border-primary/40 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-line px-3 pb-2">
        <button className="flex items-center gap-1 rounded bg-surface-4 px-2 py-0.5 text-[10px] text-ink-faint">
          <Filter className="size-2.5" />
          Advanced Filtering
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1">
        <div className="mb-1 flex items-center gap-1.5 px-2 py-1">
          <ChevronRight className="size-3 text-ink-faint" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Organized</span>
        </div>

        {filteredSongs.map((song) => (
          <button
            key={song.id}
            className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-4"
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
                    content: { primaryText: sec?.lyrics ?? "", secondaryText: `${song.title} — ${sec?.label ?? ""}` },
                    template: { background: "#000", textLayout: "center" },
                  };
                }),
              });
            }}
          >
            <div className="grid size-7 shrink-0 place-items-center rounded bg-rose/10">
              <Music className="size-3.5 text-rose" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-ink">{song.title}</div>
              <div className="truncate text-[10px] text-ink-faint">{song.author}</div>
            </div>
            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const sec = song.sections[0];
                  onGoLive({
                    type: "song",
                    content: { primaryText: sec?.lyrics ?? song.title, secondaryText: `${song.title} — ${sec?.label ?? ""}` },
                    template: { background: "#000", textLayout: "center" },
                  });
                }}
                className="grid size-5 place-items-center rounded bg-primary/15 text-primary-bright hover:bg-primary/25"
              >
                <Play className="size-2.5" />
              </button>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ScripturesAssets({ onAddToService, onGoLive }: { onAddToService: (item: ServiceItem) => void; onGoLive: (slide: Slide) => void }) {
  const { packs, activePack, selectedBook, selectedChapter, chapterCount, verses, versesLoading, loadPacks, selectBook, selectChapter } = useBibleStore();

  useEffect(() => { loadPacks(); }, [loadPacks]);

  const currentPack = packs.find((p) => p.id === activePack);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Scriptures</h3>
        <span className="rounded bg-surface-4 px-1.5 py-0.5 text-[9px] font-bold text-ink-faint">
          {currentPack?.abbreviation ?? "KJV"}
        </span>
      </div>

      <div className="px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Search scriptures..."
            className="h-7 w-full rounded border border-line bg-surface-3 pl-7 pr-2 text-[11px] text-ink placeholder:text-ink-faint focus:border-primary/40 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1">
        {selectedBook === null ? (
          BIBLE_BOOKS.map((book, i) => (
            <button
              key={book}
              onClick={() => selectBook(i)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors hover:bg-surface-4"
            >
              <BookOpen className="size-3 text-cyan" />
              <span className="text-ink">{book}</span>
              <span className="ml-auto text-[9px] text-ink-faint">{i + 1}</span>
            </button>
          ))
        ) : selectedChapter === null ? (
          <>
            <button onClick={() => selectBook(null)} className="mb-2 flex items-center gap-1 px-2 text-[11px] text-primary-bright hover:underline">
              <ArrowLeft className="size-3" />
              {BIBLE_BOOKS[selectedBook]}
            </button>
            <div className="grid grid-cols-5 gap-1 px-1">
              {Array.from({ length: chapterCount || 10 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => selectChapter(i + 1)}
                  className="grid h-7 place-items-center rounded border border-line text-[11px] text-ink transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary-bright"
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => selectChapter(null)} className="mb-2 flex items-center gap-1 px-2 text-[11px] text-primary-bright hover:underline">
              <ArrowLeft className="size-3" />
              {BIBLE_BOOKS[selectedBook]} {selectedChapter}
            </button>
            {versesLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="size-4 animate-spin text-primary-bright" /></div>
            ) : (
              verses.map((v) => {
                const ref = `${BIBLE_BOOKS[selectedBook]} ${selectedChapter}:${v.verse}`;
                return (
                  <button
                    key={v.verse}
                    className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-4"
                    onDoubleClick={() => {
                      onAddToService({
                        id: crypto.randomUUID(), type: "scripture", title: ref,
                        subtitle: currentPack?.abbreviation, order: 0,
                        data: { book: selectedBook, chapter: selectedChapter, verseStart: v.verse, translation: currentPack?.abbreviation },
                      });
                    }}
                  >
                    <span className="mt-0.5 w-4 shrink-0 text-right text-[10px] font-bold text-cyan">{v.verse}</span>
                    <p className="flex-1 text-[11px] leading-relaxed text-ink-muted">{v.text}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onGoLive({
                          type: "scripture",
                          content: { primaryText: v.text, secondaryText: ref, metadata: currentPack?.abbreviation ?? "KJV" },
                          template: { background: "#000", textLayout: "bottom" },
                        });
                      }}
                      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded bg-primary/15 text-primary-bright opacity-0 transition-opacity hover:bg-primary/25 group-hover:opacity-100"
                    >
                      <Play className="size-2.5" />
                    </button>
                  </button>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MediaAssets({ onAddToService }: { onAddToService: (item: ServiceItem) => void }) {
  const items = [
    { id: "1", name: "Worship Motion 012", type: "All Video" },
    { id: "2", name: "Church Logo", type: "Image" },
    { id: "3", name: "Welcome Slide", type: "Image" },
    { id: "4", name: "Offering Time", type: "Image" },
    { id: "5", name: "Announcements BG", type: "Video" },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Media Library</h3>
        <button className="grid size-5 place-items-center rounded text-ink-faint hover:bg-surface-4 hover:text-ink-muted">
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-ink-faint" />
          <input type="text" placeholder="Search media..." className="h-7 w-full rounded border border-line bg-surface-3 pl-7 pr-2 text-[11px] text-ink placeholder:text-ink-faint focus:border-primary/40 focus:outline-none" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {items.map((item) => (
          <button
            key={item.id}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-4"
            onDoubleClick={() => {
              onAddToService({ id: crypto.randomUUID(), type: "media", title: item.name, order: 0 });
            }}
          >
            <div className="grid size-7 shrink-0 place-items-center rounded bg-success/10">
              <Image className="size-3.5 text-success" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-ink">{item.name}</div>
              <div className="text-[10px] text-ink-faint">{item.type}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function AudioSettings() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Audio Settings</h3>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <label className="text-[10px] font-medium text-ink-faint">Audio Input Device</label>
          <select className="mt-1 h-7 w-full rounded border border-line bg-surface-3 px-2 text-[11px] text-ink focus:border-primary/40 focus:outline-none">
            <option>Default Microphone</option>
            <option>USB Audio Device</option>
            <option>Line In</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-faint">AI Transcription Language</label>
          <select className="mt-1 h-7 w-full rounded border border-line bg-surface-3 px-2 text-[11px] text-ink focus:border-primary/40 focus:outline-none">
            <option>English</option>
            <option>Twi</option>
            <option>French</option>
          </select>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-3 px-3 py-2">
          <span className="text-[11px] text-ink-muted">AI Live Transcription</span>
          <div className="h-4 w-7 rounded-full bg-primary/30 p-0.5">
            <div className="size-3 translate-x-3 rounded-full bg-primary-bright transition-transform" />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-3 px-3 py-2">
          <span className="text-[11px] text-ink-muted">Auto Bible Detection</span>
          <div className="h-4 w-7 rounded-full bg-surface-5 p-0.5">
            <div className="size-3 rounded-full bg-ink-faint transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AppSettings() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Settings</h3>
      </div>
      <div className="space-y-3 p-3">
        <div className="rounded-lg border border-line bg-surface-3 p-3">
          <div className="text-[11px] font-medium text-ink">Display Output</div>
          <div className="mt-1 text-[10px] text-ink-faint">Configure projection display</div>
        </div>
        <div className="rounded-lg border border-line bg-surface-3 p-3">
          <div className="text-[11px] font-medium text-ink">Bible Packs</div>
          <div className="mt-1 text-[10px] text-ink-faint">Manage Bible translations</div>
        </div>
        <div className="rounded-lg border border-line bg-surface-3 p-3">
          <div className="text-[11px] font-medium text-ink">License</div>
          <div className="mt-1 text-[10px] text-ink-faint">Activate or manage license key</div>
        </div>
        <div className="rounded-lg border border-line bg-surface-3 p-3">
          <div className="text-[11px] font-medium text-ink">Cloud Sync</div>
          <div className="mt-1 text-[10px] text-ink-faint">Sync songs and settings across devices</div>
        </div>
      </div>
    </div>
  );
}

function WebAssets() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Web</h3>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center">
          <Globe className="mx-auto size-6 text-ink-faint/30" />
          <p className="mt-2 text-[11px] text-ink-faint">Web content & streaming</p>
          <p className="mt-0.5 text-[10px] text-ink-faint/60">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
