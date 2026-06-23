import { useState, useEffect } from "react";
import {
  Search, Music, BookOpen, Image, Plus, Play,
  ChevronRight, Filter, ArrowLeft, Loader2,
  Globe, Presentation, Mic, Settings,
  Monitor, Key, Cloud, HardDrive,
} from "lucide-react";
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
  if (section === "presentations") return <PresentationsAssets />;
  if (section === "audio") return <AudioSettings />;
  if (section === "settings") return <AppSettings />;
  return <WebAssets />;
}

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{title}</h3>
      {action}
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value?: string; onChange?: (v: string) => void; placeholder: string }) {
  return (
    <div className="px-3 py-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="input pl-8"
        />
      </div>
    </div>
  );
}

function SongsAssets({ onAddToService, onGoLive }: { onAddToService: (item: ServiceItem) => void; onGoLive: (slide: Slide) => void }) {
  const { filteredSongs, searchQuery, loadSongs, search } = useSongStore();

  useEffect(() => { loadSongs(); }, [loadSongs]);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Songs"
        action={
          <button className="btn-ghost grid size-6 place-items-center !rounded-lg">
            <Plus className="size-3.5" />
          </button>
        }
      />

      <SearchBar value={searchQuery} onChange={search} placeholder="Search songs..." />

      <div className="flex items-center gap-1.5 border-b border-line px-3 pb-2">
        <button className="btn-ghost flex items-center gap-1 px-2 py-1 text-[10px]">
          <Filter className="size-2.5" />
          Filter
        </button>
        <span className="text-[10px] text-ink-faint">{filteredSongs.length} songs</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {filteredSongs.map((song) => (
          <div
            key={song.id}
            className="group flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all hover:bg-surface-4"
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
            <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-rose/10">
              <Music className="size-4 text-rose" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-ink">{song.title}</div>
              <div className="truncate text-[10px] text-ink-faint">{song.author}</div>
            </div>
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
              className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-bright opacity-0 transition-all hover:bg-primary/20 group-hover:opacity-100"
            >
              <Play className="size-3" />
            </button>
          </div>
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
      <PanelHeader
        title="Scriptures"
        action={
          <span className="rounded-full bg-surface-4 px-2 py-0.5 text-[9px] font-bold text-ink-faint">
            {currentPack?.abbreviation ?? "KJV"}
          </span>
        }
      />

      <SearchBar placeholder="Search scriptures..." />

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {selectedBook === null ? (
          BIBLE_BOOKS.map((book, i) => (
            <button
              key={book}
              onClick={() => selectBook(i)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-all hover:bg-surface-4"
            >
              <BookOpen className="size-3.5 text-cyan" />
              <span className="flex-1 text-[11px] text-ink">{book}</span>
              <span className="text-[9px] text-ink-faint">{i + 1}</span>
              <ChevronRight className="size-3 text-ink-faint" />
            </button>
          ))
        ) : selectedChapter === null ? (
          <>
            <button
              onClick={() => selectBook(null)}
              className="mb-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-primary-bright transition-colors hover:bg-primary/10"
            >
              <ArrowLeft className="size-3.5" />
              {BIBLE_BOOKS[selectedBook]}
            </button>
            <div className="grid grid-cols-5 gap-1.5 px-1">
              {Array.from({ length: chapterCount || 10 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => selectChapter(i + 1)}
                  className="grid h-8 place-items-center rounded-xl border border-line text-[11px] font-medium text-ink transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary-bright"
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
              className="mb-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-primary-bright transition-colors hover:bg-primary/10"
            >
              <ArrowLeft className="size-3.5" />
              {BIBLE_BOOKS[selectedBook]} {selectedChapter}
            </button>
            {versesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 whq-spin text-primary-bright" />
              </div>
            ) : (
              verses.map((v) => {
                const ref = `${BIBLE_BOOKS[selectedBook]} ${selectedChapter}:${v.verse}`;
                return (
                  <div
                    key={v.verse}
                    className="group flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all hover:bg-surface-4"
                    onDoubleClick={() => {
                      onAddToService({
                        id: crypto.randomUUID(), type: "scripture", title: ref,
                        subtitle: currentPack?.abbreviation, order: 0,
                        data: { book: selectedBook, chapter: selectedChapter, verseStart: v.verse, translation: currentPack?.abbreviation },
                      });
                    }}
                  >
                    <span className="mt-0.5 w-5 shrink-0 text-right text-[10px] font-bold text-cyan">{v.verse}</span>
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
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-bright opacity-0 transition-all hover:bg-primary/20 group-hover:opacity-100"
                    >
                      <Play className="size-3" />
                    </button>
                  </div>
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
    { id: "1", name: "Worship Motion 012", type: "Video", color: "text-amber" },
    { id: "2", name: "Church Logo", type: "Image", color: "text-teal" },
    { id: "3", name: "Welcome Slide", type: "Image", color: "text-teal" },
    { id: "4", name: "Offering Time", type: "Image", color: "text-teal" },
    { id: "5", name: "Announcements BG", type: "Video", color: "text-amber" },
  ];

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Media Library"
        action={
          <button className="btn-ghost grid size-6 place-items-center !rounded-lg">
            <Plus className="size-3.5" />
          </button>
        }
      />
      <SearchBar placeholder="Search media..." />
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {items.map((item) => (
          <button
            key={item.id}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all hover:bg-surface-4"
            onDoubleClick={() => {
              onAddToService({ id: crypto.randomUUID(), type: "media", title: item.name, order: 0 });
            }}
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-success/10">
              <Image className="size-4 text-success" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-ink">{item.name}</div>
              <div className="text-[10px] text-ink-faint">{item.type}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PresentationsAssets() {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Presentations" />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber/10">
            <Presentation className="size-6 text-amber" />
          </div>
          <p className="mt-3 text-[11px] font-medium text-ink-muted">PowerPoint & Slides</p>
          <p className="mt-1 text-[10px] text-ink-faint">Import .pptx presentations</p>
          <button className="btn-primary mt-3 px-4 py-1.5 text-[11px]">
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

function AudioSettings() {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Audio Settings" />
      <div className="space-y-3 p-3">
        <SettingCard label="Audio Input Device">
          <select className="input mt-1.5">
            <option>Default Microphone</option>
            <option>USB Audio Device</option>
            <option>Line In</option>
          </select>
        </SettingCard>

        <SettingCard label="AI Transcription Language">
          <select className="input mt-1.5">
            <option>English</option>
            <option>Twi</option>
            <option>French</option>
          </select>
        </SettingCard>

        <ToggleRow label="AI Live Transcription" defaultOn />
        <ToggleRow label="Auto Bible Detection" defaultOn={false} />
        <ToggleRow label="Audio Level Display" defaultOn />
      </div>
    </div>
  );
}

function AppSettings() {
  const settingsItems = [
    { icon: Monitor, label: "Display Output", desc: "Configure projection display", color: "text-primary-bright" },
    { icon: HardDrive, label: "Bible Packs", desc: "Manage Bible translations", color: "text-cyan" },
    { icon: Key, label: "License", desc: "Activate or manage license key", color: "text-gold" },
    { icon: Cloud, label: "Cloud Sync", desc: "Sync songs and settings", color: "text-success" },
    { icon: Settings, label: "General", desc: "App preferences", color: "text-ink-muted" },
  ];

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Settings" />
      <div className="space-y-1.5 p-3">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className="card card-lift flex w-full items-center gap-3 rounded-xl p-3 text-left"
            >
              <div className={`grid size-8 place-items-center rounded-xl bg-surface-5 ${item.color}`}>
                <Icon className="size-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-ink">{item.label}</div>
                <div className="text-[10px] text-ink-faint">{item.desc}</div>
              </div>
              <ChevronRight className="ml-auto size-3.5 text-ink-faint" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WebAssets() {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Web" />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10">
            <Globe className="size-6 text-primary-bright" />
          </div>
          <p className="mt-3 text-[11px] font-medium text-ink-muted">Web Content & Streaming</p>
          <p className="mt-1 text-[10px] text-ink-faint">Coming soon</p>
        </div>
      </div>
    </div>
  );
}

function SettingCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, defaultOn }: { label: string; defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-surface-3 px-3 py-2.5">
      <span className="text-[11px] text-ink-muted">{label}</span>
      <button
        onClick={() => setOn(!on)}
        className={`h-5 w-9 rounded-full p-0.5 transition-colors ${on ? "bg-primary" : "bg-surface-5"}`}
      >
        <div className={`size-4 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}
