import { create } from "zustand";
import { persist } from "zustand/middleware";
import { usePassageStore } from "../lib/show-passage";
import { useProjectionStore } from "./projection-store";
import { useShowStore } from "./show-store";
import { aiNotes } from "../lib/ai";
import { addNote, bodyOf, docTitle, noteSlides, readDoc, type LineKind } from "../lib/note-doc";
import { localPoint, samePoint } from "../lib/sermon-points";

/**
 * The notes of one service: one open page of text. "said" is everything heard, kept for reading back (recent services
 * only); "written" is what was noted automatically, so a note you change or delete isn't written again.
 */
export interface ServiceNotes { id: string; title: string; date: string; startedAt: number; text: string; said: string; written: string[] }

interface NotesState {
  sessions: ServiceNotes[];
  /** The service being noted now (recording), if any. It goes on whatever page is open. */
  recordingId: string | null;
  thinking: boolean;
  /** "All points" is on the screen: new points are added to it as they come. */
  follow: boolean;
  setFollow: (v: boolean) => void;
  start: () => string;
  stop: () => void;
  resume: (id: string) => void;
  setDetails: (id: string, d: Partial<Pick<ServiceNotes, "title" | "date" | "text">>) => void;
  /** Writes a note by itself (not one already written, changed or deleted). */
  note: (id: string, kind: LineKind | "verse", text: string) => void;
  remove: (id: string) => void;
  heard: (text: string) => void;
  flush: () => Promise<void>;
}

const KEEP = 80;       // services kept
const KEEP_SAID = 12;  // …of which the full words are kept for the newest

/** Words heard since the AI last looked (not saved). */
let waiting = "";
let lastLook = 0;
/** "Point number two." on its own: the point is the next sentence. */
let expectPoint = false;

const today = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fresh = () => { waiting = ""; expectPoint = false; lastLook = Date.now(); };

/** What the screen is called while "all points" of a service is on it (so it can be followed). */
export const allPointsLabel = (n: ServiceNotes) => `Notes: ${docTitle(n.text) || n.title}`;

export const useNotesStore = create<NotesState>()(persist((set, get) => {
  const change = (id: string, f: (n: ServiceNotes) => ServiceNotes) => set((s) => ({ sessions: s.sessions.map((n) => (n.id === id ? f(n) : n)) }));

  /** The points on the screen grow with the notes (only what was written automatically: not half-typed lines). */
  function updateScreen(id: string) {
    const n = get().sessions.find((x) => x.id === id);
    const { live } = useShowStore.getState();
    const onAir = useProjectionStore.getState().currentSlide;
    if (!n || !get().follow || !live || !onAir || live.title !== allPointsLabel(n) || !live.slides.includes(onAir)) return;
    const slides = noteSlides(docTitle(n.text), bodyOf(readDoc(n.text).filter((l) => l.kind === "point")), allPointsLabel(n));
    if (!slides.length) return;
    const index = slides.length - 1;
    useShowStore.setState({ live: { ...live, slides, index } });
    useProjectionStore.getState().goLive(slides[index]);
  }

  return {
    sessions: [],
    recordingId: null,
    thinking: false,
    follow: true,
    setFollow: (follow) => set({ follow }),

    start: () => {
      const date = today();
      const title = useProjectionStore.getState().serviceName.trim() || "Service";
      fresh();
      // Carry on with today's notes for this service instead of starting a second set.
      const same = get().sessions.find((n) => n.date === date && n.title === title);
      if (same) { set({ recordingId: same.id }); return same.id; }
      const n: ServiceNotes = { id: crypto.randomUUID(), title, date, startedAt: Date.now(), text: "", said: "", written: [] };
      set((s) => ({ recordingId: n.id, sessions: [n, ...s.sessions].slice(0, KEEP).map((x, i) => (i < KEEP_SAID || !x.said ? x : { ...x, said: "" })) }));
      return n.id;
    },
    stop: () => { get().flush().finally(() => set({ recordingId: null })); },
    resume: (id) => { fresh(); set({ recordingId: id }); },
    setDetails: (id, d) => change(id, (n) => ({ ...n, ...d })),
    note: (id, kind, text) => {
      const t = text.replace(/\s+/g, " ").trim();
      const n = get().sessions.find((x) => x.id === id);
      if (!t || !n) return;
      if (n.written.some((w) => samePoint(w, t)) || readDoc(n.text).some((l) => samePoint(l.text, t))) return;
      if (kind === "title" && docTitle(n.text)) return;
      change(id, (x) => ({ ...x, text: addNote(x.text, kind, t), written: [...x.written, t].slice(-200) }));
      if (kind === "point" || kind === "title") updateScreen(id);
    },
    remove: (id) => set((s) => ({ sessions: s.sessions.filter((n) => n.id !== id), recordingId: s.recordingId === id ? null : s.recordingId })),

    heard: (text) => {
      const id = get().recordingId;
      if (!id) return;
      change(id, (n) => ({ ...n, said: `${n.said}${n.said ? " " : ""}${text}` }));
      // Titles and points announced in so many words are caught straight away, with or without internet.
      const p = localPoint(text, expectPoint);
      expectPoint = p.next;
      if (p.point) get().note(id, p.kind, p.point);
      waiting += (waiting ? " " : "") + text;
      const n = waiting.split(/\s+/).length;
      if (n >= 120 || (Date.now() - lastLook > 60_000 && n >= 40)) get().flush();
    },

    flush: async () => {
      const id = get().recordingId;
      const said = waiting;
      if (!id || get().thinking || said.split(/\s+/).length < 15) return;
      waiting = "";
      lastLook = Date.now();
      set({ thinking: true });
      try {
        const now = get().sessions.find((n) => n.id === id);
        const have = [...readDoc(now?.text ?? "").map((l) => l.text), ...(now?.written ?? []).slice(-12)];
        const notes = await aiNotes(said, [...new Set(have)], docTitle(now?.text ?? ""));
        // Not reachable: try again with the next stretch (at most about 5 minutes of words).
        if (notes === null) waiting = `${said} ${waiting}`.split(/\s+/).slice(-700).join(" ");
        else for (const x of notes) get().note(id, x.kind, x.text);
      } finally {
        set({ thinking: false });
      }
    },
  };
}, {
  name: "whq-media-notes",
  version: 3,
  // Never released in an earlier shape: anything else starts empty.
  migrate: (saved) => { const s = saved as { sessions?: ServiceNotes[] }; return { ...s, sessions: (s?.sessions ?? []).filter((n) => typeof n.text === "string") }; },
  partialize: (s) => ({ sessions: s.sessions, follow: s.follow }),
}));

export function notesAsText(n: ServiceNotes): string {
  const d = new Date(`${n.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${n.title}\n${d}\n\n${n.text.trim()}${n.said ? `\n\n--- Everything heard ---\n${n.said}` : ""}\n`;
}

/** Listens for what is heard and for verses shown, on every page. */
export function startNotes(): () => void {
  const onHeard = (e: Event) => useNotesStore.getState().heard(String((e as CustomEvent).detail));
  window.addEventListener("whq-heard", onHeard);
  const off = usePassageStore.subscribe((s, before) => {
    const { recordingId, note } = useNotesStore.getState();
    if (recordingId && s.passage && s.passage.label !== before.passage?.label) note(recordingId, "verse", s.passage.label);
  });
  return () => { window.removeEventListener("whq-heard", onHeard); off(); };
}
