import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarPlus, Circle, Copy, Download, Loader2, NotebookPen, Square, Trash2 } from "lucide-react";
import { allPointsLabel, notesAsText, useNotesStore, type ServiceNotes } from "../stores/notes-store";
import { bodyOf, docTitle, lineAt, noteSlides, pointAt, readDoc } from "../lib/note-doc";
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
        <NotebookPen className="size-5 text-primary-bright" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold text-ink">Notes</h2>
          <p className="text-[13px] text-ink-muted">
            {rec ? <>Taking notes{voiceOn ? "" : ", but the microphone is off"}. Type whenever you like; it carries on.{thinking && " Looking for points…"}</> : "Writes the message down while you do other things. You can type in it at the same time."}
          </p>
        </div>
        {rec && !voiceOn && <button onClick={listen} className="h-10 rounded-lg border border-line-bright px-3 text-[13px] font-semibold text-ink hover:bg-surface-4">Start listening</button>}
        {rec ? (
          <button onClick={stop} className="flex h-10 items-center gap-2 rounded-lg bg-danger px-4 text-[14px] font-bold text-white hover:bg-danger/90"><Square className="size-4" /> Stop taking notes</button>
        ) : (
          <button onClick={() => { setOpenId(start()); listen(); }} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright"><Circle className="size-4 fill-current" /> Take notes today</button>
        )}
      </div>

      {!current ? (
        <div className="grid flex-1 place-items-center p-8 text-center text-[14px] text-ink-muted">No notes yet. Press “Take notes today” when the message starts.</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
          <div className="overflow-y-auto border-r border-line p-2">
            {sessions.map((n) => (
              <button key={n.id} onClick={() => setOpenId(n.id)} className={`mb-1 block w-full rounded-lg px-3 py-2 text-left ${n.id === current.id ? "bg-primary-soft" : "hover:bg-surface-4"}`}>
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">{n.id === recordingId && <span className="live-dot size-2 shrink-0 rounded-full bg-danger" />}<span className="truncate">{n.title}</span></span>
                <span className="block truncate text-[12px] text-ink-muted">{day(n.date)}{docTitle(n.text) && ` · ${docTitle(n.text)}`}</span>
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
  const { setDetails, remove, follow, setFollow } = useNotesStore();
  const box = useRef<HTMLTextAreaElement>(null);
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [withTitle, setWithTitle] = useState(true);
  const [showSaid, setShowSaid] = useState(false);
  const [msg, setMsg] = useState("");

  // New notes are written in while you type: keep the cursor (and the place you are reading) where it was.
  const keep = useRef({ text: n.text, start: 0, end: 0, scroll: 0 });
  useLayoutEffect(() => {
    const b = box.current, k = keep.current;
    if (!b || k.text === n.text) return;
    // Written at the top (the title): what you were on moved down by that much. Written at the end: nothing moved.
    const old = k.text.replace(/^\n+/, "");
    const body = old.replace(/\n+$/, "");
    const found = body ? n.text.indexOf(body) : -1;
    const shift = found >= 0 ? found - (k.text.length - old.length) : 0;
    if (document.activeElement === b) b.setSelectionRange(Math.max(0, k.start + shift), Math.max(0, k.end + shift));
    b.scrollTop = k.scroll;
    const next: [number, number] = [Math.max(0, k.start + shift), Math.max(0, k.end + shift)];
    keep.current = { text: n.text, start: next[0], end: next[1], scroll: b.scrollTop };
    if (shift) setSel(next);
  }, [n.text]);
  const remember = () => {
    const b = box.current;
    if (!b) return;
    keep.current = { text: b.value, start: b.selectionStart, end: b.selectionEnd, scroll: b.scrollTop };
    setSel([b.selectionStart, b.selectionEnd]);
  };

  // Any move of the cursor counts, however it was made.
  useEffect(() => {
    const on = () => { if (document.activeElement === box.current && box.current?.value === keep.current.text) remember(); };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);

  const lines = readDoc(n.text);
  const title = docTitle(n.text);
  const points = lines.filter((l) => l.kind === "point");
  const head = withTitle ? title : "";
  const chosen = n.text.slice(sel[0], sel[1]).trim();
  const here = pointAt(n.text, sel[0]);
  const line = lineAt(n.text, sel[0]);

  const put = (label: string, slides: Slide[], live: boolean) => {
    if (!slides.length) return;
    useShowStore.getState().setPreview(label, slides, 0);
    if (live) useShowStore.getState().sendPreviewLive(0);
  };
  const withoutTitle = (t: string) => t.split("\n").filter((x) => x.trim() !== title || !head);
  const options: { name: string; hint: string; off: boolean; label: string; slides: () => Slide[] }[] = [
    { name: "Selected", hint: "Only the words you have highlighted", off: !chosen, label: "Note", slides: () => (chosen === title ? noteSlides(title, [], "Title") : noteSlides(head, withoutTitle(chosen), "Note")) },
    { name: here.length ? `Point ${here[0].no}` : "This line", hint: "The point (or line) the cursor is on", off: !here.length && !line, label: "Note", slides: () => (here.length ? noteSlides(head, bodyOf(here), "Note") : line!.kind === "title" ? noteSlides(title, [], "Title") : noteSlides(head, [line!.text], "Note")) },
    { name: "Points up to here", hint: "Every point down to the cursor", off: !points.some((p) => p.at <= sel[0]), label: "Note", slides: () => noteSlides(head, bodyOf(points.filter((p) => p.at <= sel[0])), "Note") },
    { name: "All points", hint: "Every point so far", off: !points.length, label: allPointsLabel(n), slides: () => noteSlides(head, bodyOf(points), allPointsLabel(n)) },
    { name: "Title", hint: "Only the title", off: !title, label: "Title", slides: () => noteSlides(title, [], "Title") },
    { name: "Whole page", hint: "Everything written here", off: !lines.length, label: "Note", slides: () => noteSlides(head, withTitle ? bodyOf(lines) : [title, ...bodyOf(lines)].filter(Boolean), "Note") },
  ];

  async function save() {
    if (!isDesktopApp()) return;
    const { save: pick } = await import("@tauri-apps/plugin-dialog");
    const path = await pick({ title: "Save the notes", defaultPath: `${`${n.title} ${n.date}`.replace(/[\\/:*?"<>|]+/g, " ").trim()}.txt`, filters: [{ name: "Text", extensions: ["txt"] }] });
    if (!path) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_text_file", { path, text: notesAsText(n) }).then(() => setMsg("Saved"), (e) => setMsg(String(e)));
  }

  const small = "grid size-8 place-items-center rounded-lg border border-line-bright text-ink hover:bg-surface-4";
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <input value={n.title} onChange={(e) => setDetails(n.id, { title: e.target.value })} aria-label="Service" className="min-w-[150px] flex-1 rounded-md bg-transparent px-1 text-[15px] font-bold text-ink hover:bg-surface-4 focus:bg-surface-4" />
        <input type="date" value={n.date} onChange={(e) => e.target.value && setDetails(n.id, { date: e.target.value })} aria-label="Date" className="h-8 rounded-lg border border-line-bright bg-surface-2 px-2 text-[13px] text-ink" />
        {!recording && onResume && <button onClick={onResume} className="h-8 rounded-lg border border-line-bright px-3 text-[13px] font-semibold text-ink hover:bg-surface-4">Carry on with these</button>}
        {msg && <span className="text-[12px] font-semibold text-success">{msg}</span>}
        <button title="Add to the schedule" className={small} onClick={() => { const slides = noteSlides(head, bodyOf(points.length ? points : lines), "Note"); if (slides.length) { useProjectionStore.getState().addToService({ id: crypto.randomUUID(), type: "custom", title: title || n.title, subtitle: "Notes", order: 0, slides }); setMsg("In the schedule"); } }}><CalendarPlus className="size-4" /></button>
        <button title="Copy" className={small} onClick={() => navigator.clipboard.writeText(notesAsText(n)).then(() => setMsg("Copied"))}><Copy className="size-4" /></button>
        <button title="Save as a text file" className={small} onClick={save}><Download className="size-4" /></button>
        <button title="Delete these notes" className="grid size-8 place-items-center rounded-lg text-ink-faint hover:text-danger" onClick={() => { if (window.confirm(`Delete the notes of “${n.title}”, ${day(n.date)}?`)) remove(n.id); }}><Trash2 className="size-4" /></button>
      </div>

      {/* What to project: click = Preview, double-click = live. The notepad keeps its cursor. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-surface-2 px-3 py-2">
        <span className="mr-1 text-[12px] font-semibold text-ink-muted">Show</span>
        {options.map((o) => (
          <button key={o.name} disabled={o.off} title={`${o.hint}. Click for Preview, double-click to show.`}
            onMouseDown={(e) => e.preventDefault()} onClick={() => put(o.label, o.slides(), false)} onDoubleClick={() => put(o.label, o.slides(), true)}
            className="h-8 rounded-lg bg-primary-soft px-3 text-[13px] font-bold text-primary-bright hover:bg-primary hover:text-white disabled:opacity-40 disabled:hover:bg-primary-soft disabled:hover:text-primary-bright">{o.name}</button>
        ))}
        <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-[13px] text-ink"><input type="checkbox" checked={withTitle} onChange={(e) => setWithTitle(e.target.checked)} className="size-4 accent-[var(--color-primary)]" /> with the title</label>
        <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[13px] text-ink" title="While “All points” is on the screen, each new point noted is added to it"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="size-4 accent-[var(--color-primary)]" /> add new points on screen</label>
      </div>

      <textarea ref={box} value={n.text} spellCheck
        onChange={(e) => { remember(); setDetails(n.id, { text: e.target.value }); }}
        onSelect={remember} onScroll={remember}
        onKeyDown={(e) => {
          const b = e.currentTarget;
          if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || b.selectionStart !== b.selectionEnd) return;
          // Enter after "1. …" starts "2. "; after "- …" another "- "; on an empty one it stops the list.
          const at = b.selectionStart, start = n.text.lastIndexOf("\n", at - 1) + 1, l = n.text.slice(start, at);
          const m = l.match(/^(\s*)(?:(\d{1,2})([.)])|([-•–*]))\s+(.*)$/);
          if (!m || /\S/.test(n.text.slice(at).split("\n")[0])) return;
          e.preventDefault();
          const empty = !m[5].trim();
          const add = empty ? "" : `\n${m[1]}${m[2] ? `${+m[2] + 1}${m[3]}` : m[4]} `;
          const next = (empty ? n.text.slice(0, start) : n.text.slice(0, at)) + add + n.text.slice(at);
          const pos = (empty ? start : at) + add.length;
          keep.current = { text: next, start: pos, end: pos, scroll: b.scrollTop };
          setDetails(n.id, { text: next });
          requestAnimationFrame(() => { b.setSelectionRange(pos, pos); setSel([pos, pos]); });
        }}
        placeholder={"How to hear from God\n\n1. First point\n2. Second point\n   - something under it\n\nThe first line is the title. Type freely: whatever is heard is added below."}
        className="min-h-[90px] flex-1 resize-none bg-surface px-6 py-4 text-[17px] leading-[1.7] text-ink outline-none placeholder:text-ink-faint" />

      {n.said && (
        <div className="max-h-[35%] shrink-0 overflow-y-auto border-t border-line px-4 py-2">
          <button onClick={() => setShowSaid(!showSaid)} className="text-[13px] font-semibold text-primary-bright hover:underline">{showSaid ? "Hide" : "Show"} everything heard</button>
          {showSaid && <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">{n.said}</p>}
        </div>
      )}
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
