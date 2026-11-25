import { ask } from "./Dialogs";
import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useDeckStore, type Deck } from "../stores/deck-store";
import { useShowStore } from "../stores/show-store";
import { useProjectionStore } from "../stores/projection-store";
import { ScaledSlide } from "./SlideCanvas";
import { SlideEditor } from "./SlideEditor";

/** Media › My slides: slides you design (click = Preview, double-click = live). */
export function DeckLibrary() {
  const { decks, addDeck, saveDeck, deleteDeck } = useDeckStore();
  const [editing, setEditing] = useState<Deck | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  // Menu bar: Media › Design a slide…
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === "deck:new") setEditing(addDeck()); };
    window.addEventListener("whq-menu", on);
    return () => window.removeEventListener("whq-menu", on);
  }, [addDeck]);

  const preview = (d: Deck, live = false) => {
    useShowStore.getState().setPreview(d.title, d.slides, 0);
    if (live) useShowStore.getState().sendPreviewLive(0);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex-1 text-[14px] text-ink">Design your own slides: announcements, sermon titles, giving details, welcome screens.</span>
        {toast && <span className="rounded-lg bg-success/10 px-2.5 py-1 text-[12px] font-medium text-success">{toast}</span>}
        <button onClick={() => setEditing(addDeck())} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-bold text-white hover:bg-primary-bright"><Plus className="size-4" /> Design new slides</button>
      </div>
      {decks.length === 0 ? (
        <button onClick={() => setEditing(addDeck())} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-bright p-10 text-center hover:border-primary">
          <Plus className="size-8 text-ink-faint" />
          <span className="text-[16px] font-semibold text-ink">Design your first slides</span>
          <span className="text-[13px] text-ink-muted">Text, pictures and shapes, anywhere on the screen.</span>
        </button>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {decks.map((d) => (
            <div key={d.id} className="group rounded-lg p-1.5 hover:bg-surface-4">
              <button onClick={() => preview(d)} onDoubleClick={() => preview(d, true)} className="block w-full text-left" title="Click for Preview, double-click to show">
                <div className="relative aspect-video overflow-hidden rounded-md ring-1 ring-line">{d.slides[0] && <ScaledSlide slide={d.slides[0]} />}</div>
                <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{d.title}</span>
                  <span className="text-[12px] text-ink-muted">{d.slides.length}</span>
                </div>
              </button>
              <div className="mt-1 flex gap-1 px-0.5">
                <button onClick={() => setEditing(d)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold text-primary-bright hover:bg-primary-soft"><Pencil className="size-3.5" /> Edit</button>
                <button onClick={() => { useProjectionStore.getState().addToService({ id: crypto.randomUUID(), type: "custom", title: d.title, subtitle: "Designed slides", order: 0, slides: d.slides }); setToast(`${d.title} added to the schedule`); }}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold text-ink hover:bg-surface-5"><Plus className="size-3.5" /> Schedule</button>
                <button onClick={async () => { if (await ask(`Delete “${d.title}”?`, "Delete", { danger: true })) deleteDeck(d.id); }} className="ml-auto rounded p-0.5 text-ink-faint hover:text-danger"><Trash2 className="size-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <SlideEditor deck={editing} onSave={(d) => { saveDeck(d); setToast("Saved"); }} onClose={() => setEditing(null)} />}
    </div>
  );
}
