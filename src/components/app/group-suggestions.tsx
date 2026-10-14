"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Lightbulb, Loader2, Plus, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { createSuggestedGroups } from "@/app/actions/groups";
import { suggestionsFor, type SuggestionContext } from "@/lib/groups/suggestions";
import { cn } from "@/lib/utils";

/**
 * Smart suggestions for groups. With no groups yet it is a "start here" panel, so a new church can set up in a minute.
 * Later it becomes a quiet strip of ideas the church does not have yet.
 */
export function GroupSuggestions({ existing, ctx, canWrite, hasZones }: { existing: string[]; ctx: SuggestionContext; canWrite: boolean; hasZones: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const sets = useMemo(() => suggestionsFor(existing, ctx), [existing, ctx]);
  const empty = existing.length === 0;
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (sets.length === 0 || (!empty && dismissed)) return null;

  const key = (type: string, name: string) => `${type}|${name}`;
  const chosen = sets.flatMap((s) => s.names.filter((n) => picked[key(s.type, n)]).map((n) => ({ name: n, type: s.type })));

  async function create(items: { name: string; type: string }[]) {
    setBusy(true);
    const r = await createSuggestedGroups(items);
    setBusy(false);
    if (r.ok) {
      toast(`${r.created} group${r.created === 1 ? "" : "s"} created.`, "success");
      setPicked({});
      router.refresh();
    } else toast(r.error, "error");
  }

  if (!empty) {
    // A slim strip of ideas.
    const ideas = sets.flatMap((s) => s.names.slice(0, 2).map((n) => ({ name: n, type: s.type }))).slice(0, 8);
    return (
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-sm font-medium text-ink-muted"><Lightbulb className="size-4 text-gold" /> Ideas for your church</span>
          {ideas.map((i) => (
            <button
              key={key(i.type, i.name)}
              type="button"
              disabled={!canWrite || busy}
              onClick={() => create([i])}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary disabled:opacity-50"
            >
              <Plus className="size-3" /> {i.name}
            </button>
          ))}
          {hasZones && <Link href="/app/settings" className="text-xs font-medium text-primary hover:underline">Turn your zones into groups</Link>}
          <button type="button" onClick={() => setDismissed(true)} className="ml-auto text-xs text-ink-faint hover:text-ink">Hide</button>
        </div>
      </Card>
    );
  }

  const label = chosen.length === 0 ? "Create groups" : `Create ${chosen.length} group${chosen.length === 1 ? "" : "s"}`;
  return (
    <Card className="mb-4 p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" /></div>
        <div>
          <h3 className="font-display text-lg font-semibold">Start with the groups most churches use</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">Tap the ones you want and we will create them for you. You can rename them, add leaders and meeting times, and add people afterwards.</p>
        </div>
      </div>
      <div className="mt-5 space-y-5">
        {sets.map((s) => (
          <div key={s.id}>
            <div className="flex items-baseline gap-2"><h4 className="text-sm font-semibold">{s.title}</h4><span className="text-xs text-ink-faint">{s.why}</span></div>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.names.map((n) => {
                const on = !!picked[key(s.type, n)];
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((p) => ({ ...p, [key(s.type, n)]: !p[key(s.type, n)] }))}
                    className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", on ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-muted hover:bg-surface-2")}
                  >
                    {on && <Check className="size-3.5" />} {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={() => create(chosen)} disabled={!canWrite || busy || chosen.length === 0}>
          {busy ? <><Loader2 className="size-4 animate-spin" /> Creating…</> : label}
        </Button>
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => setPicked(Object.fromEntries(sets.flatMap((s) => s.names.map((n) => [key(s.type, n), true]))))}>Tick everything</button>
        {hasZones && <Link href="/app/settings" className="text-sm text-ink-muted hover:underline">Already use zones or fellowships? Turn them into groups</Link>}
      </div>
    </Card>
  );
}
