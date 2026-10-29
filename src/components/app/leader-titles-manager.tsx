"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ListOrdered, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { saveLeaderTitles, resetLeaderTitles } from "@/app/actions/leaders";
import { cleanLeaderTitle, MAX_LEADER_TITLES, MAX_LEADER_TITLE_LENGTH } from "@/lib/leader-titles";

type Row = { id: number; original: string | null; text: string };

/**
 * The church's own list of leadership titles: the choices in the "Leadership label" box when a member is added or edited.
 * Add your own, change the wording, take off the ones you do not use, and put the most senior first.
 */
export function LeaderTitlesManager({ initial, usage }: { initial: string[]; usage: Record<string, number> }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, startSave] = useTransition();
  const [resetting, startReset] = useTransition();
  const nextId = useRef(1);

  function openIt() {
    nextId.current = 1;
    setRows(initial.map((t) => ({ id: nextId.current++, original: t, text: t })));
    setDraft("");
    setOpen(true);
  }

  const addDraft = () => {
    const t = cleanLeaderTitle(draft);
    if (!t) return;
    if (rows.some((r) => cleanLeaderTitle(r.text).toLowerCase() === t.toLowerCase())) { toast("That title is already on the list", "info"); return; }
    if (rows.length >= MAX_LEADER_TITLES) { toast(`You can have up to ${MAX_LEADER_TITLES} titles`, "info"); return; }
    setRows((r) => [...r, { id: nextId.current++, original: null, text: t }]);
    setDraft("");
  };

  const move = (i: number, by: number) =>
    setRows((r) => {
      const j = i + by;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  function save() {
    const renames = rows
      .filter((r) => r.original && cleanLeaderTitle(r.text) && cleanLeaderTitle(r.text) !== r.original)
      .map((r) => ({ from: r.original as string, to: cleanLeaderTitle(r.text) }));
    startSave(async () => {
      const res = await saveLeaderTitles({ titles: rows.map((r) => r.text), renames });
      if (!res.ok) { toast(res.error, "error"); return; }
      toast("Leadership titles saved", "success");
      setOpen(false);
      router.refresh();
    });
  }

  function reset() {
    if (!confirm("Go back to the standard list of titles? People keep the titles they already have.")) return;
    startReset(async () => {
      const res = await resetLeaderTitles();
      if (!res.ok) { toast(res.error, "error"); return; }
      toast("Back to the standard titles", "success");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={openIt}>
        <ListOrdered /> Leadership titles
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6" onClick={() => !saving && setOpen(false)} role="dialog" aria-modal="true" aria-label="Leadership titles">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h3 className="font-display text-lg font-semibold">Leadership titles</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  These are the choices in the Leadership label when you add or edit a member. Put the most senior first: leaders are shown in this order.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-2" aria-label="Close" disabled={saving}><X className="size-5" /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {rows.map((r, i) => {
                const count = r.original ? usage[r.original] ?? 0 : 0;
                return (
                  <div key={r.id} className="flex items-center gap-1.5">
                    <div className="flex flex-col">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-ink-faint hover:bg-surface-2 disabled:opacity-30" aria-label={`Move ${r.text} up`}><ArrowUp className="size-3.5" /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="rounded p-0.5 text-ink-faint hover:bg-surface-2 disabled:opacity-30" aria-label={`Move ${r.text} down`}><ArrowDown className="size-3.5" /></button>
                    </div>
                    <Input
                      value={r.text}
                      maxLength={MAX_LEADER_TITLE_LENGTH}
                      aria-label={`Title ${i + 1}`}
                      onChange={(e) => setRows((all) => all.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)))}
                    />
                    {count > 0 && <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-2 px-2 py-1 text-[11px] text-ink-muted" title="People who have this title">{count} {count === 1 ? "person" : "people"}</span>}
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${r.text}`} onClick={() => setRows((all) => all.filter((x) => x.id !== r.id))}><Trash2 /></Button>
                  </div>
                );
              })}
              {rows.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">No titles yet. Add one below.</p>}

              <div className="flex gap-2 pt-3">
                <Input
                  value={draft}
                  maxLength={MAX_LEADER_TITLE_LENGTH}
                  placeholder="Add a title, for example Women's Ministry Director"
                  aria-label="New title"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraft(); } }}
                />
                <Button type="button" variant="secondary" onClick={addDraft}><Plus /> Add</Button>
              </div>
              <p className="text-xs text-ink-faint">Taking a title off the list does not change the people who already have it. Changing its wording updates them too.</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3.5">
              <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={saving || resetting}>
                {resetting ? <><Loader2 className="animate-spin" /> Resetting…</> : <><RotateCcw /> Use the standard list</>}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                <Button type="button" onClick={save} disabled={saving || rows.length === 0}>
                  {saving ? <><Loader2 className="animate-spin" /> Saving…</> : "Save titles"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
