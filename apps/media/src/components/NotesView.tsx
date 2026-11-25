import { ask, askText, tell } from "./Dialogs";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, CalendarPlus, Circle, FilePlus2, FileText, MonitorPlay, MoreHorizontal, Music, Undo2, Wand2, Copy, Download, Loader2, Square, Trash2 } from "lucide-react";
import { allPointsLabel, notesAsText, useNotesStore, type ServiceNotes } from "../stores/notes-store";
import { keepLooks, noteSlides, partAt, readDoc, shown } from "../lib/note-doc";
import { cssFont, listSystemFonts, plainText } from "../lib/rich-text";
import { FONTS } from "../lib/themes";
import { LyricsEditor, type EditorHandle, type EditorSelection } from "./LyricsEditor";
import { useContextMenu } from "./ContextMenu";
import { SlidePreview } from "./SlidePreview";
import { aiStatus, aiTidy } from "../lib/ai";
import { useSongStore } from "../stores/song-store";
import { makeSong } from "../lib/song-import";
import { useProjectionStore } from "../stores/projection-store";
import { useShowStore } from "../stores/show-store";
import { useVoiceStore } from "../stores/voice-store";
import { isDesktopApp } from "../lib/media-src";
import type { Slide } from "../types";

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** Library › Notes: an open page for each message. It is written in by itself while you type in it too. */
export function NotesView() {
  const { sessions, recordingId, thinking, start, stop, resume } = useNotesStore();
  const voiceOn = useVoiceStore((v) => v.status === "listening" || v.status === "starting");
  const [openId, setOpenId] = useState<string | null>(null);
  const current = sessions.find((n) => n.id === (openId ?? recordingId)) ?? sessions[0] ?? null;
  const rec = !!recordingId;
  const listen = () => { if (!voiceOn && isDesktopApp()) useVoiceStore.getState().start(); };

  const takeButton = (
    <>
      {rec ? (
        <button onClick={stop} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-danger px-3 text-[14px] font-bold text-white hover:bg-danger/90"><Square className="size-4" /> Stop taking notes</button>
      ) : (
        <button onClick={() => { setOpenId(start()); listen(); }} title="Writes the message down while you do other things. You can type in it at the same time." className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-[14px] font-bold text-white hover:bg-primary-bright"><Circle className="size-4 fill-current" /> Take notes today</button>
      )}
      {rec && !voiceOn && <button onClick={listen} className="mt-1.5 h-9 w-full rounded-lg border border-line-bright px-3 text-[13px] font-semibold text-ink hover:bg-surface-4">Microphone off: start listening</button>}
      {rec && thinking && <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-muted"><Loader2 className="size-3.5 whq-spin" /> Looking for points…</p>}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!current ? (
        <div className="grid flex-1 place-items-center p-8 text-center text-[14px] text-ink-muted"><div><div className="mx-auto mb-4 w-56">{takeButton}</div>No notes yet. Press “Take notes today” when the message starts.<br /><button onClick={() => setOpenId(useNotesStore.getState().addPage("New page", ""))} className="mt-3 font-semibold text-primary-bright hover:underline">Or start an empty page</button></div></div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[180px_minmax(0,1fr)]">
          <div className="overflow-y-auto border-r border-line p-2">
            <div className="mb-2">{takeButton}</div>
            <button onClick={() => setOpenId(useNotesStore.getState().addPage("New page", ""))} className="mb-2 flex h-8 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink"><FilePlus2 className="size-4" /> New page</button>
            {sessions.map((n) => (
              <button key={n.id} onClick={() => setOpenId(n.id)} className={`mb-1 block w-full rounded-lg px-3 py-2 text-left ${n.id === current.id ? "bg-primary-soft" : "hover:bg-surface-4"}`}>
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">{n.id === recordingId && <span className="live-dot size-2 shrink-0 rounded-full bg-danger" />}<span className="truncate">{n.title}</span></span>
                <span className="block truncate text-[12px] text-ink-muted">{day(n.date)}{n.heading && ` · ${n.heading}`}</span>
              </button>
            ))}
          </div>
          <Notepad key={current.id} n={current} recording={current.id === recordingId} onResume={rec ? undefined : () => { resume(current.id); listen(); }} />
        </div>
      )}
    </div>
  );
}

function Notepad({ n, recording, onResume }: { n: ServiceNotes; recording: boolean; onResume?: () => void }) {
  const { setDetails, remove, follow, setFollow, look, setLook } = useNotesStore();
  const [busy, setBusy] = useState(false);
  /** What the page was before it was tidied. */
  const [undo, setUndo] = useState<{ heading: string; text: string } | null>(null);
  const menu = useContextMenu();
  const editor = useRef<EditorHandle>(null);
  const [sel, setSel] = useState<EditorSelection>({ from: 0, to: 0, words: "" });
  const [styling, setStyling] = useState(false);
  const [withTitle, setWithTitle] = useState(true);
  const [showSaid, setShowSaid] = useState(false);
  const [msg, setMsg] = useState("");

  const lines = readDoc(n.text);
  const title = n.heading.trim();
  const points = lines.filter((l) => l.kind === "point");
  const head = withTitle ? title : "";
  const chosen = plainText(sel.words).trim() ? sel.words : "";
  const here = partAt(n.text, sel.from);
  const all = n.text.split("\n");
  const show = (h: string, ls: string[], label: string) => noteSlides(h, shown(ls), label, look);

  const put = (label: string, slides: Slide[], live: boolean) => {
    if (!slides.length) return;
    useShowStore.getState().setPreview(label, slides, 0);
    if (live) useShowStore.getState().sendPreviewLive(0);
  };
  const options: { name: string; hint: string; off: boolean; label: string; slides: () => Slide[] }[] = [
    { name: "Selected", hint: "Only the words you have highlighted", off: !chosen, label: "Note", slides: () => show(head, chosen.split("\n"), "Note") },
    { name: here?.no ? `Point ${here.no}` : "This part", hint: "The point, or the lines, the cursor is in", off: !here, label: "Note", slides: () => show(head, here!.lines, "Note") },
    { name: "Points up to here", hint: "Every point down to the cursor", off: !points.some((p) => p.line <= sel.from), label: "Note", slides: () => show(head, points.filter((p) => p.line <= sel.from).map((p) => p.raw), "Note") },
    { name: "All points", hint: "Every point so far", off: !points.length, label: allPointsLabel(n), slides: () => show(head, points.map((p) => p.raw), allPointsLabel(n)) },
    { name: "Heading", hint: "Only the heading", off: !title, label: "Heading", slides: () => show(title, [], "Heading") },
    { name: "Whole page", hint: "Everything written here, just as it is", off: !lines.length, label: "Note", slides: () => show(head, all, "Note") },
  ];
  // What the cursor is in, as it will look (the whole page when the cursor is on an empty line).
  const onScreen = useMemo(() => noteSlides(head, shown(chosen ? chosen.split("\n") : here?.lines ?? n.text.split("\n")), "Note", look)[0] ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [head, chosen, n.text, sel.from, look]);

  async function tidy() {
    setBusy(true);
    setMsg("");
    const was = { heading: n.heading, text: n.text };
    if (!n.text.trim()) {
      const ok = await useNotesStore.getState().fromHeard(n.id, (p) => setMsg(`Writing… ${p}%`));
      setMsg("");
      setBusy(false);
      setUndo(was);
      if (!ok) await tell(aiStatus === "unlicensed" ? "Sign in first (Help › WorshipHQ account)." : "The AI stopped answering, so the notes may not be complete.");
      return;
    }
    const out = await aiTidy(n.heading, plainText(n.text));
    setBusy(false);
    const now = useNotesStore.getState().sessions.find((x) => x.id === n.id);
    if (!out) { await tell(aiStatus === "unlicensed" ? "Sign in first (Help › WorshipHQ account)." : "The AI couldn't be reached. Nothing was changed."); return; }
    if (!now || now.text !== was.text) { await tell("The page changed while it was being tidied, so nothing was replaced. Press Tidy up again."); return; }
    setUndo(was);
    // Its own lines stay its own (the AI may still improve them).
    const mine = new Set(now.written);
    const fresh = readDoc(out.page).map((l) => l.text).filter((t) => mine.has(t));
    useNotesStore.setState((s) => ({ sessions: s.sessions.map((x) => (x.id === n.id ? { ...x, written: [...x.written, ...fresh] } : x)) }));
    setDetails(n.id, { heading: n.heading || out.heading, text: keepLooks(was.text, out.page) });
  }

  /** The highlighted words (or the whole page) become a song. */
  async function toSongs() {
    const words = chosen || n.text.trim();
    const part = !!chosen;
    if (!words) return;
    const name = await askText(chosen ? "The words you highlighted go to Songs." : "The whole page goes to Songs.", chosen ? "" : n.heading || n.title, { title: "Move to Songs", placeholder: "Song title", yes: "Move" });
    if (!name) return;
    useSongStore.getState().addSong(makeSong(name, "", words));
    const now = useNotesStore.getState().sessions.find((x) => x.id === n.id)!;
    setUndo({ heading: now.heading, text: now.text });
    if (part) editor.current?.deleteSelection(); else setDetails(n.id, { text: "" });
    setMsg("In Songs");
  }

  async function save() {
    if (!isDesktopApp()) return;
    const { save: pick } = await import("@tauri-apps/plugin-dialog");
    const path = await pick({ title: "Save the notes", defaultPath: `${`${n.title} ${n.date}`.replace(/[\\/:*?"<>|]+/g, " ").trim()}.txt`, filters: [{ name: "Text", extensions: ["txt"] }] });
    if (!path) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_text_file", { path, text: notesAsText(n) }).then(() => setMsg("Saved"), (e) => setMsg(String(e)));
  }

  const more = menu.open(() => [
    ...(!recording && onResume ? [{ label: "Carry on noting on this page", icon: <Circle className="size-4" />, onClick: onResume }] : []),
    { label: "Add to the schedule", icon: <CalendarPlus className="size-4" />, onClick: () => {
      const slides = points.length ? show(head, points.map((p) => p.raw), "Note") : show(head, all, "Note");
      if (!slides.length) return;
      useProjectionStore.getState().addToService({ id: crypto.randomUUID(), type: "custom", title: title || n.title, subtitle: "Notes", order: 0, slides });
      setMsg("In the schedule");
    } },
    { label: chosen ? "Move the highlighted words to Songs" : "Move this page to Songs", icon: <Music className="size-4" />, onClick: toSongs },
    { label: "Copy", icon: <Copy className="size-4" />, onClick: () => { navigator.clipboard.writeText(notesAsText(n)).then(() => setMsg("Copied")); } },
    { label: "Save as a text file", icon: <Download className="size-4" />, onClick: save },
    ...(n.said ? [{ label: showSaid ? "Hide everything heard" : "Show everything heard", icon: <FileText className="size-4" />, onClick: () => setShowSaid(!showSaid) }] : []),
    { divider: true },
    { label: "Delete this page", icon: <Trash2 className="size-4" />, danger: true, onClick: async () => { if (await ask(`Delete the notes of “${n.title}”, ${day(n.date)}?`, "Delete", { danger: true })) remove(n.id); } },
  ]);
  const quiet = "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink disabled:opacity-40";

  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_230px] overflow-hidden">
      {menu.element}
      <div className="flex min-h-0 flex-col overflow-y-auto bg-surface-2">
        <div className="flex shrink-0 items-center gap-1 px-4 pt-2">
          <input value={n.title} onChange={(e) => setDetails(n.id, { title: e.target.value })} aria-label="Service" className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-[13px] font-semibold text-ink-muted hover:bg-surface-4 focus:bg-surface-4" />
          {msg && <span className="text-[12px] font-semibold text-success">{msg}</span>}
          <input type="date" value={n.date} onChange={(e) => e.target.value && setDetails(n.id, { date: e.target.value })} aria-label="Date" className="h-8 rounded-md bg-transparent px-1 text-[12px] text-ink-muted hover:bg-surface-4" />
          {undo && <button onClick={() => { setDetails(n.id, undo); setUndo(null); setMsg(""); }} className={quiet}><Undo2 className="size-4" /> Undo</button>}
          <button onClick={tidy} disabled={busy || (!n.text.trim() && !n.said.trim())} title={n.text.trim() ? "Put the page in order: points together, spelling fixed, nothing lost" : "Write the notes from everything heard"} className={quiet}>{busy ? <Loader2 className="size-4 whq-spin" /> : <Wand2 className="size-4" />} {n.text.trim() || !n.said.trim() ? "Tidy up" : "Write from what was heard"}</button>
          <button onClick={more} title="More" aria-label="More" className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-4 hover:text-ink"><MoreHorizontal className="size-5" /></button>
        </div>
        <input value={n.heading} onChange={(e) => setDetails(n.id, { heading: e.target.value })} placeholder="Heading" title="Filled in when it is announced, or type it" aria-label="Heading"
          style={{ fontFamily: look.headFont ? cssFont(look.headFont) : undefined }}
          className="shrink-0 bg-transparent px-5 py-1.5 text-[22px] font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink-faint" />
        <div className="flex min-h-[220px] flex-1 flex-col">
          <LyricsEditor ref={editor} notes value={n.text} onChange={(text) => setDetails(n.id, { text })} onSelection={setSel}
            className="text-[16px] leading-[1.35]" style={{ fontFamily: look.font ? cssFont(look.font) : undefined }}
            placeholder="Type freely…" />
        </div>
        {n.said && showSaid && <p className="max-h-[35%] shrink-0 overflow-y-auto whitespace-pre-wrap border-t border-line px-5 py-3 text-[13px] leading-relaxed text-ink-muted">{n.said}</p>}
      </div>

      <div className="flex min-h-0 flex-col overflow-y-auto border-l border-line p-3">
        <SlidePreview slide={onScreen} placeholder="Nothing written yet" />
        <div className="mb-3 mt-3 grid grid-cols-2 rounded-lg bg-surface-4 p-0.5 text-[13px] font-semibold" role="tablist">
          {([[false, "Show"], [true, "Look"]] as const).map(([v, t]) => (
            <button key={t} role="tab" aria-selected={styling === v} onMouseDown={(e) => e.preventDefault()} onClick={() => setStyling(v)} className={`h-7 rounded-md ${styling === v ? "bg-surface-2 text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}>{t}</button>
          ))}
        </div>
        {styling ? <NoteLookPanel /> : (
          <>
            {/* Click = Preview, double-click = live. The page keeps its cursor. */}
            <div className="grid gap-0.5">
              {options.filter((o) => !o.off).map((o) => (
                <button key={o.name} title={`${o.hint}. Click for Preview, double-click to show.`}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => put(o.label, o.slides(), false)} onDoubleClick={() => put(o.label, o.slides(), true)}
                  className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-left text-[14px] font-medium text-ink hover:bg-primary-soft hover:text-primary-bright"><MonitorPlay className="size-4 text-ink-faint" /> {o.name}</button>
              ))}
            </div>
            <div className="mt-3 grid gap-1.5 border-t border-line pt-3 text-[13px] text-ink-muted">
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={withTitle} onChange={(e) => setWithTitle(e.target.checked)} className="size-4 accent-[var(--color-primary)]" /> With the heading</label>
              <label className="flex cursor-pointer items-center gap-2" title="While “All points” is on the screen, each new point noted is added to it"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="size-4 accent-[var(--color-primary)]" /> Add new points on screen</label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** How notes look on the projector. Words given their own colour, font or size keep it. */
function NoteLookPanel() {
  const { look, setLook } = useNotesStore();
  const [fonts, setFonts] = useState<string[]>([]);
  useEffect(() => { listSystemFonts().then(setFonts); }, []);
  const names = useMemo(() => [...new Set([...FONTS.map((f) => f.value.split(",")[0].replace(/'/g, "").trim()), ...fonts])], [fonts]);
  const field = "h-8 min-w-0 rounded-md border border-line bg-surface-2 px-1.5 text-[13px] text-ink";
  const part = (head: boolean) => {
    const f = head ? "headFont" : "font", s = head ? "headSize" : "size", c = head ? "headColor" : "color", al = head ? "headAlign" : "align";
    return (
      <div className="grid gap-1.5">
        <p className="text-[13px] font-semibold text-ink">{head ? "Heading" : "Words"}</p>
        <select value={look[f]} onChange={(e) => setLook({ [f]: e.target.value })} aria-label="Font" className={field}>
          <option value="">Segoe UI</option>
          {names.filter((x) => x !== "Segoe UI").map((x) => <option key={x} value={x} style={{ fontFamily: cssFont(x) }}>{x}</option>)}
        </select>
        <div className="flex gap-1.5">
          <select value={look[s]} onChange={(e) => setLook({ [s]: +e.target.value })} aria-label="Size" className={`${field} flex-1`}>
            <option value={0}>Auto size</option>
            {[40, 48, 56, 64, 72, 80, 90, 100, 112, 128, 150, 180].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <input type="color" value={look[c]} onChange={(e) => setLook({ [c]: e.target.value })} aria-label="Colour" title="Colour" className="h-8 w-9 cursor-pointer rounded-md border border-line bg-transparent p-0.5" />
        </div>
        <div className="grid grid-cols-3 rounded-lg bg-surface-4 p-0.5">
          {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([v, Icon]) => (
            <button key={v} aria-label={v} aria-pressed={look[al] === v} onClick={() => setLook({ [al]: v })} className={`grid h-7 place-items-center rounded-md ${look[al] === v ? "bg-surface-2 text-primary-bright shadow-sm" : "text-ink-muted hover:text-ink"}`}><Icon className="size-4" /></button>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="grid gap-4">
      {part(false)}
      <label className="grid gap-1 text-[13px] text-ink-muted"><span className="flex justify-between">Line spacing <span>{look.spacing.toFixed(2)}</span></span>
        <input type="range" min={0.9} max={2} step={0.05} value={look.spacing} onChange={(e) => setLook({ spacing: +e.target.value })} className="accent-[var(--color-primary)]" />
      </label>
      <div className="flex gap-4 text-[13px] text-ink-muted">
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={look.bold} onChange={(e) => setLook({ bold: e.target.checked })} className="size-4 accent-[var(--color-primary)]" /> Bold</label>
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={look.shadow} onChange={(e) => setLook({ shadow: e.target.checked })} className="size-4 accent-[var(--color-primary)]" /> Shadow</label>
      </div>
      {part(true)}
    </div>
  );
}

/** Shown in the top bar while notes are being taken. */
export function NotesPill({ onOpen }: { onOpen: () => void }) {
  const rec = useNotesStore((s) => s.recordingId);
  const count = useNotesStore((s) => { const t = s.sessions.find((x) => x.id === s.recordingId)?.text; return t ? readDoc(t).filter((l) => l.kind === "point").length : 0; });
  const thinking = useNotesStore((s) => s.thinking);
  if (!rec) return null;
  return (
    <button onClick={onOpen} title="Taking notes. Click to see them." className="flex h-9 items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-2.5 text-[13px] font-semibold text-ink">
      {thinking ? <Loader2 className="size-4 whq-spin" /> : <span className="live-dot size-2 rounded-full bg-danger" />} Notes {count > 0 && count}
    </button>
  );
}
