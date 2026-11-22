import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, BookOpen, CalendarDays, Cast, CheckCircle2, CircleDashed, GripVertical,
  Image as ImageIcon, ListMusic, Megaphone, Minus, Music, Plus, RefreshCw, StickyNote, Trash2, Type, X,
} from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import { useBibleStore } from "../stores/bible-store";
import { buildTextItem, itemMinutes, type TextSlideKind } from "../lib/text-slides";
import type { ServiceItem } from "../types";
import { SongLibrary } from "./LiveView";

const isDesktopApp = () => typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

/** How each kind of item looks in the plan and on the time bar. */
const KINDS: Record<ServiceItem["type"], { label: string; Icon: typeof Music; bar: string; pill: string }> = {
  song: { label: "Song", Icon: Music, bar: "bg-primary", pill: "bg-primary-soft text-primary-bright" },
  scripture: { label: "Bible", Icon: BookOpen, bar: "bg-cyan", pill: "bg-cyan/10 text-cyan" },
  announcement: { label: "Announcement", Icon: Megaphone, bar: "bg-gold", pill: "bg-gold/10 text-gold-dim" },
  media: { label: "Picture / video", Icon: ImageIcon, bar: "bg-rose", pill: "bg-rose/10 text-rose" },
  custom: { label: "Title slide", Icon: Type, bar: "bg-ink-faint", pill: "bg-surface-4 text-ink-muted" },
};

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h || 0, m || 0);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function ServiceView({ onGoLive, onOpenBible, onOpenMedia }: { onGoLive: () => void; onOpenBible: () => void; onOpenMedia: () => void }) {
  const {
    serviceItems, serviceName, serviceDate, startTime, setServiceDetails, newService,
    updateServiceItem, removeFromService, reorderService, setActiveItem,
  } = useProjectionStore();

  const [dialog, setDialog] = useState<null | "song" | TextSlideKind>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const minutes = serviceItems.map(itemMinutes);
  const total = minutes.reduce((a, b) => a + b, 0);
  const slideCount = serviceItems.reduce((n, i) => n + (i.slides?.length ?? 0), 0);
  const starts = minutes.reduce<number[]>((acc, m, i) => [...acc, i === 0 ? 0 : acc[i - 1] + minutes[i - 1]], []);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto p-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:overflow-hidden">
      <div className="flex min-h-0 flex-col gap-3 max-xl:min-h-[640px]">
        {/* ─── Service details ─── */}
        <section className="shrink-0 rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft">
              <CalendarDays className="size-6 text-primary-bright" />
            </div>
            <div className="min-w-[260px] flex-1">
              <input
                value={serviceName}
                onChange={(e) => setServiceDetails({ serviceName: e.target.value })}
                aria-label="Service name"
                placeholder="Name this service"
                className="w-full rounded-md bg-transparent px-1 text-[22px] font-bold text-ink outline-none hover:bg-surface-4 focus:bg-surface-4"
              />
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[14px] text-ink-muted">
                <label className="flex items-center gap-1.5">
                  Date
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(e) => setServiceDetails({ serviceDate: e.target.value })}
                    className="rounded-md border border-line-bright bg-surface-2 px-2 py-1 text-[14px] text-ink outline-none focus:border-primary"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  Starts at
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setServiceDetails({ startTime: e.target.value })}
                    className="rounded-md border border-line-bright bg-surface-2 px-2 py-1 text-[14px] text-ink outline-none focus:border-primary"
                  />
                </label>
                {serviceItems.length > 0 && (
                  <span>
                    About <b className="text-ink">{formatDuration(total)}</b> · ends around{" "}
                    <b className="text-ink">{addMinutes(startTime, total)}</b> · {serviceItems.length} items · {slideCount} slides
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {confirmNew ? (
                <div className="flex items-center gap-2 rounded-lg bg-gold/10 px-3 py-1.5 text-[13px] text-ink">
                  Clear this plan and start a new one?
                  <button onClick={() => { newService(); setConfirmNew(false); }} className="rounded-md bg-danger px-2.5 py-1 font-semibold text-white">Yes, clear it</button>
                  <button onClick={() => setConfirmNew(false)} className="rounded-md px-2 py-1 font-semibold text-ink-muted hover:bg-surface-4">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmNew(true)} disabled={!serviceItems.length} className="h-10 rounded-lg border border-line-bright px-3 text-[14px] font-semibold text-ink hover:bg-surface-4 disabled:text-ink-faint">
                  New service
                </button>
              )}
              <button
                onClick={onGoLive}
                className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright"
              >
                <Cast className="size-4" /> Go to Live
              </button>
            </div>
          </div>

          {serviceItems.length > 0 && <TimeBar items={serviceItems} minutes={minutes} total={total} />}
        </section>

        {/* ─── Order of service ─── */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface-2 shadow-sm">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-[16px] font-semibold text-ink">Order of service</h3>
            <span className="text-[13px] text-ink-muted">Changes save automatically</span>
          </div>
          {serviceItems.length === 0 ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <ListMusic className="mx-auto size-10 text-ink-faint" />
                <p className="mt-3 text-[16px] font-semibold text-ink">Your service is empty</p>
                <p className="mt-1 text-[14px] text-ink-muted">Use the buttons below to add songs, Bible readings and announcements.</p>
              </div>
            </div>
          ) : (
            <PlanTable
              items={serviceItems}
              minutes={minutes}
              starts={starts}
              startTime={startTime}
              onMove={reorderService}
              onRemove={removeFromService}
              onChange={updateServiceItem}
              onOpen={(i) => { setActiveItem(i); onGoLive(); }}
            />
          )}
        </section>

        {/* ─── Add things ─── */}
        <section className="shrink-0 rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
          <h3 className="mb-2.5 text-[15px] font-semibold text-ink">Add to the service</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-5">
            <AddTile Icon={Music} title="Song" hint="From your song list" onClick={() => setDialog("song")} />
            <AddTile Icon={BookOpen} title="Bible passage" hint="Opens the Bible" onClick={onOpenBible} />
            <AddTile Icon={Megaphone} title="Announcement" hint="Heading and message" onClick={() => setDialog("announcement")} />
            <AddTile Icon={ImageIcon} title="Picture or video" hint="From your library" onClick={onOpenMedia} />
            <AddTile Icon={Type} title="Title slide" hint="e.g. the sermon title" onClick={() => setDialog("title")} />
          </div>
        </section>
      </div>

      {/* ─── Right: checklist ─── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <ReadyChecks onOpenBible={onOpenBible} />
      </div>

      {dialog === "song" && (
        <Dialog title="Add a song" onClose={() => setDialog(null)}>
          <SongLibrary title="Choose songs" className="h-[60vh] border-0 p-0 shadow-none" />
          <div className="mt-3 flex justify-end">
            <button onClick={() => setDialog(null)} className="h-10 rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-bright">Done</button>
          </div>
        </Dialog>
      )}
      {(dialog === "announcement" || dialog === "title") && (
        <TextSlideDialog kind={dialog} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

/* ─────────────────────────── Time bar ─────────────────────────── */

function TimeBar({ items, minutes, total }: { items: ServiceItem[]; minutes: number[]; total: number }) {
  const byKind = useMemo(() => {
    const m = new Map<ServiceItem["type"], number>();
    items.forEach((it, i) => m.set(it.type, (m.get(it.type) ?? 0) + minutes[i]));
    return [...m.entries()];
  }, [items, minutes]);

  return (
    <div className="mt-4">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-4">
        {items.map((it, i) => (
          <div
            key={it.id}
            className={`${KINDS[it.type]?.bar ?? "bg-ink-faint"} h-full first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${(minutes[i] / Math.max(total, 1)) * 100}%` }}
            title={`${it.title}: ${minutes[i]} min`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
        {byKind.map(([kind, min]) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${KINDS[kind]?.bar ?? "bg-ink-faint"}`} />
            {KINDS[kind]?.label ?? kind}{kind === "song" || kind === "announcement" ? "s" : ""} · {formatDuration(min)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Plan table ─────────────────────────── */

function PlanTable({
  items, minutes, starts, startTime, onMove, onRemove, onChange, onOpen,
}: {
  items: ServiceItem[];
  minutes: number[];
  starts: number[];
  startTime: string;
  onMove: (from: number, to: number) => void;
  onRemove: (i: number) => void;
  onChange: (i: number, changes: Partial<ServiceItem>) => void;
  onOpen: (i: number) => void;
}) {
  const [armed, setArmed] = useState<number | null>(null);   // row whose handle was grabbed
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-surface-4 text-[12px] font-semibold text-ink-muted">
          <tr>
            <th className="w-8" />
            <th className="w-8 py-2">#</th>
            <th className="w-24 py-2">Starts</th>
            <th className="py-2">Item</th>
            <th className="w-36 py-2">Type</th>
            <th className="w-32 py-2">Length</th>
            <th className="w-20 py-2">Slides</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const kind = KINDS[item.type] ?? KINDS.custom;
            const editingNote = noteFor === item.id;
            return (
              <tr
                key={item.id}
                draggable={armed === i}
                onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { if (dragging !== null) { e.preventDefault(); setOver(i); } }}
                onDragLeave={() => setOver((o) => (o === i ? null : o))}
                onDrop={(e) => { e.preventDefault(); if (dragging !== null && dragging !== i) onMove(dragging, i); setDragging(null); setOver(null); setArmed(null); }}
                onDragEnd={() => { setDragging(null); setOver(null); setArmed(null); }}
                className={`group border-b border-line-soft align-middle transition-colors ${
                  dragging === i ? "opacity-40" : over === i ? "bg-primary-soft" : "hover:bg-surface-4/60"
                }`}
              >
                <td className="pl-2">
                  <span
                    onMouseDown={() => setArmed(i)}
                    onMouseUp={() => setArmed(null)}
                    title="Drag to move"
                    className="grid size-7 cursor-grab place-items-center rounded text-ink-faint hover:bg-surface-5 hover:text-ink active:cursor-grabbing"
                  >
                    <GripVertical className="size-4" />
                  </span>
                </td>
                <td className="py-2.5 text-[13px] font-semibold text-ink-faint">{i + 1}</td>
                <td className="py-2.5 font-mono text-[13px] font-medium text-primary-bright">{addMinutes(startTime, starts[i])}</td>
                <td className="py-2.5 pr-3">
                  <button onClick={() => onOpen(i)} className="flex items-center gap-2.5 text-left" title="Open in Live">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-4 text-ink-muted">
                      <kind.Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-ink hover:text-primary-bright">{item.title}</span>
                      {item.subtitle && <span className="block truncate text-[13px] text-ink-muted">{item.subtitle}</span>}
                    </span>
                  </button>
                  {editingNote ? (
                    <input
                      autoFocus
                      defaultValue={item.note ?? ""}
                      placeholder="Note for the team (not shown on screen)"
                      onBlur={(e) => { onChange(i, { note: e.target.value.trim() || undefined }); setNoteFor(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                      className="ml-[42px] mt-1 w-[calc(100%-42px)] rounded-md border border-line-bright px-2 py-1 text-[13px] text-ink outline-none focus:border-primary"
                    />
                  ) : item.note ? (
                    <button onClick={() => setNoteFor(item.id)} className="ml-[42px] mt-1 flex items-center gap-1 text-left text-[13px] italic text-gold-dim hover:underline">
                      <StickyNote className="size-3.5 shrink-0" /> {item.note}
                    </button>
                  ) : (
                    <button onClick={() => setNoteFor(item.id)} className="ml-[42px] mt-0.5 hidden items-center gap-1 text-[12px] font-medium text-ink-faint hover:text-primary-bright group-hover:flex">
                      <Plus className="size-3" /> Add a note
                    </button>
                  )}
                </td>
                <td className="py-2.5">
                  <span className={`rounded-md px-2 py-1 text-[12px] font-semibold ${kind.pill}`}>{kind.label}</span>
                </td>
                <td className="py-2.5">
                  <div className="flex w-fit items-center rounded-lg border border-line-bright">
                    <button onClick={() => onChange(i, { minutes: Math.max(1, minutes[i] - 1) })} aria-label="Shorter" className="grid size-7 place-items-center text-ink-muted hover:bg-surface-4">
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-14 text-center text-[13px] font-medium text-ink">{minutes[i]} min</span>
                    <button onClick={() => onChange(i, { minutes: minutes[i] + 1 })} aria-label="Longer" className="grid size-7 place-items-center text-ink-muted hover:bg-surface-4">
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </td>
                <td className="py-2.5 text-[13px] text-ink-muted">{item.slides?.length ?? 0}</td>
                <td className="pr-2">
                  <button
                    onClick={() => onRemove(i)}
                    aria-label={`Remove ${item.title}`}
                    title="Remove from the service"
                    className="grid size-8 place-items-center rounded-md text-ink-faint opacity-0 hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-3 text-[13px] text-ink-faint">
        Drag the <GripVertical className="inline size-3.5" /> handle to change the order. Click an item to open it in Live.
      </p>
    </div>
  );
}

/* ─────────────────────────── Checklist ─────────────────────────── */

type CheckState = "ok" | "warn" | "unknown";

function ReadyChecks({ onOpenBible }: { onOpenBible: () => void }) {
  const { serviceItems, displays, projectionOpen, openProjection, setDisplays } = useProjectionStore();
  const { packs, loadPacks } = useBibleStore();
  const [checking, setChecking] = useState(false);

  useEffect(() => { if (!packs.length) loadPacks(); }, [packs.length, loadPacks]);

  async function checkScreens() {
    if (!isDesktopApp()) return;
    setChecking(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const list = await invoke<{ id: number; name: string; width: number; height: number; is_primary: boolean }[]>("list_displays");
      setDisplays(list.map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height, isPrimary: d.is_primary })));
    } catch { /* leave as is */ }
    setChecking(false);
  }
  useEffect(() => { checkScreens(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = serviceItems.filter((i) => !i.slides?.length);
  const desktop = isDesktopApp();

  const checks: { state: CheckState; title: string; detail: string; action?: ReactNode }[] = [
    serviceItems.length
      ? { state: "ok", title: "Service is planned", detail: `${serviceItems.length} items ready` }
      : { state: "warn", title: "Nothing planned yet", detail: "Add songs, Bible readings or announcements." },
    empty.length
      ? { state: "warn", title: "Some items have no slides", detail: empty.map((i) => i.title).join(", ") }
      : { state: serviceItems.length ? "ok" : "unknown", title: "Every item has slides", detail: serviceItems.length ? "Nothing will show up blank" : "Checked once you add items" },
    !desktop
      ? { state: "unknown", title: "Projector connected", detail: "Checked in the desktop app" }
      : displays.length >= 2
        ? { state: "ok", title: "Projector connected", detail: `${displays.length} screens found` }
        : {
            state: "warn", title: "Only one screen found",
            detail: "Plug in the projector or TV, then check again.",
            action: <SmallAction onClick={checkScreens}><RefreshCw className={`size-3.5 ${checking ? "whq-spin" : ""}`} /> Check again</SmallAction>,
          },
    !desktop
      ? { state: "unknown", title: "Projector window", detail: "Opens in the desktop app" }
      : projectionOpen
        ? { state: "ok", title: "Projector window is open", detail: "People will see what you show" }
        : { state: "warn", title: "Projector window is closed", detail: "Open it before the service starts.", action: <SmallAction onClick={() => openProjection()}>Open it</SmallAction> },
    packs.length
      ? { state: "ok", title: "Bibles installed", detail: packs.map((p) => p.abbreviation).join(", ") }
      : { state: "warn", title: "No Bible installed", detail: "Scripture can't be shown.", action: <SmallAction onClick={onOpenBible}>Open Bible</SmallAction> },
  ];

  const problems = checks.filter((c) => c.state === "warn").length;

  return (
    <section className="rounded-xl border border-line bg-surface-2 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">Before the service</h3>
        <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${problems ? "bg-gold/10 text-gold-dim" : "bg-success/10 text-success"}`}>
          {problems ? `${problems} to check` : "All good"}
        </span>
      </div>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.title} className={`flex gap-2.5 rounded-lg p-2.5 ${c.state === "warn" ? "bg-gold/10" : "bg-surface-4/70"}`}>
            {c.state === "ok" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              : c.state === "warn" ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-gold" />
              : <CircleDashed className="mt-0.5 size-5 shrink-0 text-ink-faint" />}
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-ink">{c.title}</div>
              <div className="text-[13px] text-ink-muted">{c.detail}</div>
              {c.action && <div className="mt-1.5">{c.action}</div>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────── Dialogs & small pieces ─────────────────────────── */

function TextSlideDialog({ kind, onClose }: { kind: TextSlideKind; onClose: () => void }) {
  const addToService = useProjectionStore((s) => s.addToService);
  const [heading, setHeading] = useState("");
  const [message, setMessage] = useState("");
  const isTitle = kind === "title";
  const ready = (heading + message).trim().length > 0;

  return (
    <Dialog title={isTitle ? "Add a title slide" : "Add an announcement"} onClose={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (!ready) return; addToService(buildTextItem(kind, heading, message)); onClose(); }}
        className="space-y-3"
      >
        <label className="block">
          <span className="mb-1 block text-[14px] font-medium text-ink">{isTitle ? "Title" : "Heading"}</span>
          <input
            autoFocus
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder={isTitle ? "Walking in Faith" : "Youth camp registration"}
            className="h-11 w-full rounded-lg border border-line-bright px-3 text-[15px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-glow"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[14px] font-medium text-ink">{isTitle ? "Smaller line underneath (optional)" : "Message"}</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={isTitle ? 2 : 4}
            placeholder={isTitle ? "Pastor Kwame Mensah · Part 3" : "Register at the welcome desk before Sunday. Ages 12–18."}
            className="w-full resize-none rounded-lg border border-line-bright px-3 py-2 text-[15px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-glow"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-[14px] font-semibold text-ink-muted hover:bg-surface-4">Cancel</button>
          <button type="submit" disabled={!ready} className="h-10 rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-bright disabled:bg-surface-5 disabled:text-ink-faint">
            Add to service
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="fade-in flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-line-bright bg-surface-2 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.18)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-4 hover:text-ink">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddTile({ Icon, title, hint, onClick }: { Icon: typeof Music; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface-4/60 p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/50"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-bright">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[12px] text-ink-muted">{hint}</span>
      </span>
    </button>
  );
}

function SmallAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 text-[13px] font-semibold text-primary-bright shadow-sm hover:bg-primary-soft">
      {children}
    </button>
  );
}
