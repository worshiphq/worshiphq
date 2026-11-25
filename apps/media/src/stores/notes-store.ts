import { create } from "zustand";
import { persist } from "zustand/middleware";
import { usePassageStore } from "../lib/show-passage";
import { useProjectionStore } from "./projection-store";
import { useShowStore } from "./show-store";
import { aiNotes } from "../lib/ai";
import { hasFormatting, plainText } from "../lib/rich-text";
import { NOTE_LOOK, addNote, changeLine, noteSlides, readDoc, type LineKind, type NoteLook } from "../lib/note-doc";
import { localPoint, samePoint } from "../lib/sermon-points";

/**
 * The notes of one service: one open page of text. "said" is everything heard, kept for reading back (recent services
 * only); "written" is what was noted automatically, so a note you change or delete isn't written again.
 */
export interface ServiceNotes { id: string; title: string; date: string; startedAt: number; heading: string; text: string; said: string; written: string[] }

interface NotesState {
  sessions: ServiceNotes[];
  /** The service being noted now (recording), if any. It goes on whatever page is open. */
  recordingId: string | null;
  thinking: boolean;
  /** "All points" is on the screen: new points are added to it as they come. */
  follow: boolean;
  setFollow: (v: boolean) => void;
  /** How notes sit on the screen. */
  look: NoteLook;
  setLook: (v: Partial<NoteLook>) => void;
  start: () => string;
  stop: () => void;
  resume: (id: string) => void;
  setDetails: (id: string, d: Partial<Pick<ServiceNotes, "title" | "date" | "heading" | "text">>) => void;
  /** Writes a note by itself (not one already written, changed or deleted). */
  note: (id: string, kind: LineKind | "verse", text: string, under?: string) => void;
  /** A page not tied to a service (typed, or a song moved here). */
  addPage: (title: string, text: string) => string;
  remove: (id: string) => void;
  /** Writes the page from everything heard, piece by piece. False = the AI couldn't be reached. */
  fromHeard: (id: string, progress: (percent: number) => void) => Promise<boolean>;
  heard: (text: string) => void;
  flush: () => Promise<void>;
}

const KEEP = 80;       // services kept
const KEEP_SAID = 12;  // …of which the full words are kept for the newest

/** Words heard since the AI last looked (not saved). */
let waiting = "";
/** …and the words before those, already looked at. */
let before = "";
let lastLook = 0;
/** "Point number two." on its own: the point is the next sentence. */
let expectPoint = false;

const today = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const fresh = () => { waiting = ""; before = ""; expectPoint = false; lastLook = Date.now(); };

/** What the screen is called while "all points" of a service is on it (so it can be followed). */
export const allPointsLabel = (n: ServiceNotes) => `Notes: ${n.heading || n.title}`;

export const useNotesStore = create<NotesState>()(persist((set, get) => {
  const change = (id: string, f: (n: ServiceNotes) => ServiceNotes) => set((s) => ({ sessions: s.sessions.map((n) => (n.id === id ? f(n) : n)) }));

  /** The points on the screen grow with the notes (only what was written automatically: not half-typed lines). */
  function updateScreen(id: string) {
    const n = get().sessions.find((x) => x.id === id);
    const { live } = useShowStore.getState();
    const onAir = useProjectionStore.getState().currentSlide;
    if (!n || !get().follow || !live || !onAir || live.title !== allPointsLabel(n) || !live.slides.includes(onAir)) return;
    const slides = noteSlides(n.heading, readDoc(n.text).filter((l) => l.kind === "point").map((l) => l.raw), allPointsLabel(n), get().look);
    if (!slides.length) return;
    const index = slides.length - 1;
    useShowStore.setState({ live: { ...live, slides, index } });
    useProjectionStore.getState().goLive(slides[index]);
  }

  /** Puts what the AI made of some words on the page. False = not reached. */
  async function look(id: string, said: string, earlier: string): Promise<boolean> {
    const now = get().sessions.find((n) => n.id === id);
    if (!now) return true;
    // Lines it wrote and nobody has touched may be improved; everything you typed or changed is left alone.
    const page = readDoc(now.text).map((l) => ({ text: l.text, yours: now.written.includes(l.text) && !hasFormatting(l.raw) }));
    const out = await aiNotes(said, earlier, page, now.heading);
    if (!out) return false;
    if (out.heading && !get().sessions.find((n) => n.id === id)?.heading.trim()) get().setDetails(id, { heading: out.heading });
    for (const c of out.changes) {
      if (c.do === "add") { get().note(id, c.kind, c.text, c.under); continue; }
      change(id, (n) => {
        if (!n.written.includes(c.was)) return n;
        return c.do === "fix"
          ? { ...n, text: changeLine(n.text, c.was, c.text), written: [...n.written, c.text] }
          : { ...n, text: changeLine(n.text, c.was, null) };
      });
    }
    if (out.changes.length) updateScreen(id);
    return true;
  }

  return {
    sessions: [],
    recordingId: null,
    thinking: false,
    follow: true,
    setFollow: (follow) => set({ follow }),
    look: NOTE_LOOK,
    setLook: (v) => set((s) => ({ look: { ...s.look, ...v } })),
    addPage: (title, text) => {
      const n: ServiceNotes = { id: crypto.randomUUID(), title, date: today(), startedAt: Date.now(), heading: "", text, said: "", written: [] };
      set((s) => ({ sessions: [n, ...s.sessions].slice(0, KEEP) }));
      return n.id;
    },

    start: () => {
      const date = today();
      const title = useProjectionStore.getState().serviceName.trim() || "Service";
      fresh();
      // Carry on with today's notes for this service instead of starting a second set.
      const same = get().sessions.find((n) => n.date === date && n.title === title);
      if (same) { set({ recordingId: same.id }); return same.id; }
      const n: ServiceNotes = { id: crypto.randomUUID(), title, date, startedAt: Date.now(), heading: "", text: "", said: "", written: [] };
      set((s) => ({ recordingId: n.id, sessions: [n, ...s.sessions].slice(0, KEEP).map((x, i) => (i < KEEP_SAID || !x.said ? x : { ...x, said: "" })) }));
      return n.id;
    },
    stop: () => { get().flush().finally(() => set({ recordingId: null })); },
    resume: (id) => { fresh(); set({ recordingId: id }); },
    setDetails: (id, d) => change(id, (n) => ({ ...n, ...d })),
    note: (id, kind, text, under) => {
      const t = text.replace(/\s+/g, " ").trim();
      const n = get().sessions.find((x) => x.id === id);
      if (!t || !n) return;
      if (n.written.some((w) => samePoint(w, t)) || readDoc(n.text).some((l) => samePoint(l.text, t))) return;
      change(id, (x) => ({ ...x, text: addNote(x.text, kind, t, under), written: [...x.written, t].slice(-200) }));
      if (kind === "point") updateScreen(id);
    },
    remove: (id) => set((s) => ({ sessions: s.sessions.filter((n) => n.id !== id), recordingId: s.recordingId === id ? null : s.recordingId })),

    fromHeard: async (id, progress) => {
      const n = get().sessions.find((x) => x.id === id);
      const words = (n?.said ?? "").split(/\s+/).filter(Boolean);
      const STEP = 260;
      for (let i = 0; i < words.length; i += STEP) {
        progress(Math.round((i / words.length) * 100));
        const said = words.slice(i, i + STEP).join(" "), earlier = words.slice(Math.max(0, i - 400), i).join(" ");
        let ok = false;
        // The AI may be busy: wait a little and try again.
        for (let t = 0; t < 4 && !ok; t++) {
          if (t) await new Promise((r) => setTimeout(r, 15_000));
          ok = await look(id, said, earlier);
        }
        if (!ok) return false;
      }
      return true;
    },

    heard: (text) => {
      const id = get().recordingId;
      if (!id) return;
      change(id, (n) => ({ ...n, said: `${n.said}${n.said ? " " : ""}${text}` }));
      // Titles and points announced in so many words are caught straight away, with or without internet.
      const p = localPoint(text, expectPoint);
      expectPoint = p.next;
      if (p.point && p.kind === "title") { if (!get().sessions.find((n) => n.id === id)?.heading.trim()) get().setDetails(id, { heading: p.point }); }
      else if (p.point) get().note(id, "point", p.point);
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
        // Not reachable: try again with the next stretch (at most about 5 minutes of words).
        if (!(await look(id, said, before))) { waiting = `${said} ${waiting}`.split(/\s+/).slice(-700).join(" "); return; }
        before = `${before} ${said}`.slice(-2500);
      } finally {
        set({ thinking: false });
      }
    },
  };
}, {
  name: "whq-media-notes",
  version: 4,
  // Never released in an earlier shape: anything else starts empty.
  migrate: (saved) => { const s = saved as { sessions?: ServiceNotes[] }; return { ...s, sessions: (s?.sessions ?? []).filter((n) => typeof n.text === "string").map((n) => ({ ...n, heading: n.heading ?? "" })) }; },
  partialize: (s) => ({ sessions: s.sessions, follow: s.follow, look: s.look }),
  merge: (saved, now) => { const s = saved as Partial<NotesState> | undefined; return { ...now, ...s, look: { ...NOTE_LOOK, ...s?.look } }; },
}));

export function notesAsText(n: ServiceNotes): string {
  const d = new Date(`${n.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${n.title}\n${d}\n\n${n.heading ? `${n.heading}\n\n` : ""}${plainText(n.text).trim()}${n.said ? `\n\n--- Everything heard ---\n${n.said}` : ""}\n`;
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
