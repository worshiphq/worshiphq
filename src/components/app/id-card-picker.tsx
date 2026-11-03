"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IdCard, Loader2, Printer, Search, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toastNow } from "@/components/ui/feedback";
import { issueMissingMemberIds } from "@/app/actions/people";

export type PickPerson = { id: string; name: string; memberId: string | null; departments: string[] };

/** More than this and the link to the print page gets too long to be safe; print in batches instead. */
const MAX_PER_PRINT = 200;

export function IdCardPicker({ people, departments, canWrite }: { people: PickPerson[]; departments: string[]; canWrite: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) => (!dept || p.departments.includes(dept)) && (!needle || p.name.toLowerCase().includes(needle) || (p.memberId ?? "").toLowerCase().includes(needle)));
  }, [people, q, dept]);

  const withId = shown.filter((p) => p.memberId);
  const missing = people.filter((p) => !p.memberId).length;
  const pickedWithId = [...picked].filter((id) => people.find((p) => p.id === id)?.memberId);

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownPicked = withId.length > 0 && withId.every((p) => picked.has(p.id));

  const href = (ids: string[]) => `/app/people/id-cards/print?ids=${ids.slice(0, MAX_PER_PRINT).join(",")}`;

  const issue = () =>
    start(async () => {
      try {
        const r = await issueMissingMemberIds();
        toastNow(r.issued ? `Gave ${r.issued} member${r.issued === 1 ? "" : "s"} an ID.` : "Everyone already has an ID.", "success");
        router.refresh();
      } catch (e) {
        toastNow((e as Error).message || "Could not issue IDs. Please try again.", "error");
      }
    });

  return (
    <div className="space-y-4">
      {missing > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warning/30 bg-warning/10 p-4 text-sm">
          <span><b>{missing}</b> {missing === 1 ? "member has" : "members have"} no member ID yet, so no card can be made for them.</span>
          {canWrite && (
            <Button size="sm" variant="secondary" onClick={issue} disabled={pending}>
              {pending ? <><Loader2 className="size-4 animate-spin" /> Giving IDs…</> : <><Wand2 className="size-4" /> Give them IDs</>}
            </Button>
          )}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or ID"
              className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm focus:border-primary/60 focus:outline-none"
            />
          </div>
          {departments.length > 0 && (
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={allShownPicked}
              onChange={() => setPicked((s) => { const n = new Set(s); withId.forEach((p) => (allShownPicked ? n.delete(p.id) : n.add(p.id))); return n; })}
            />
            Select everyone shown ({withId.length})
          </label>
          <div className="flex flex-wrap gap-2">
            <Link href={pickedWithId.length ? href(pickedWithId) : "#"} aria-disabled={!pickedWithId.length} onClick={(e) => { if (!pickedWithId.length) e.preventDefault(); }}>
              <Button size="sm" disabled={!pickedWithId.length}><Printer className="size-4" /> Print selected ({pickedWithId.length})</Button>
            </Link>
          </div>
        </div>
        {pickedWithId.length > MAX_PER_PRINT && (
          <p className="mt-2 text-xs text-warning">Only the first {MAX_PER_PRINT} are printed at a time. Print the rest as a second batch.</p>
        )}
      </Card>

      <Card className="divide-y divide-line-soft">
        {shown.length === 0 && <div className="p-8 text-center text-sm text-ink-muted">No members match.</div>}
        {shown.slice(0, 300).map((p) => (
          <label key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${p.memberId ? "cursor-pointer hover:bg-surface-2" : "opacity-50"}`}>
            <input type="checkbox" className="size-4 accent-[var(--color-primary)]" disabled={!p.memberId} checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
            <IdCard className="size-4 text-ink-faint" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
            <span className="font-mono text-xs text-ink-faint">{p.memberId ?? "no ID yet"}</span>
          </label>
        ))}
        {shown.length > 300 && <div className="p-3 text-center text-xs text-ink-faint">Showing the first 300. Search or pick a department to narrow it down.</div>}
      </Card>
    </div>
  );
}
