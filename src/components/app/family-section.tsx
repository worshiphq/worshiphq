"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Heart, Users, X, Search, Plus, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import {
  getFamilyOf, createFamily, updateFamily, addFamilyMember, setFamilyRole, removeFamilyMember, searchFamilyCandidates,
  type Family, type FamilyRole,
} from "@/app/actions/households";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<FamilyRole, string> = { head: "Head of family", spouse: "Spouse or partner", child: "Child", other: "Other relative" };
const input = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20";

function prettyDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
function yearsSince(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`), n = new Date();
  let y = n.getUTCFullYear() - d.getUTCFullYear();
  if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) y--;
  return y;
}

/**
 * Quietly group people into a family or couple, with an optional wedding date.
 * Nothing is asked of anyone: a member only appears in a family when staff put them there.
 * The wedding date goes onto both partners, so each gets the anniversary wish and shows on the Birthdays page.
 */
export function FamilySection({ personId, lastName, canWrite }: { personId: string; lastName: string; canWrite: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [family, setFamily] = useState<Family | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "create" | "edit">("view");
  const [name, setName] = useState(`${lastName} family`);
  const [kind, setKind] = useState<"family" | "couple">("family");
  const [date, setDate] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; phone: string | null; family: string | null }[]>([]);
  const [role, setRole] = useState<FamilyRole>("spouse");
  const seq = useRef(0);

  const load = async () => setFamily(await getFamilyOf(personId));
  useEffect(() => {
    let live = true;
    void getFamilyOf(personId).then((f) => { if (live) setFamily(f); });
    return () => { live = false; };
  }, [personId]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const mine = ++seq.current;
      if (q.trim().length < 2 || !family) { setFound([]); return; }
      const r = await searchFamilyCandidates(q, family.id);
      if (mine === seq.current) setFound(r);
    }, 250);
    return () => clearTimeout(t);
  }, [q, family]);

  async function run(key: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string, after?: () => void) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) { toast(r.error, "error"); return; }
      if (done) toast(done, "success");
      after?.();
      await load();
      router.refresh();
    } catch (e) {
      toast((e as Error).message || "Something went wrong.", "error");
    } finally {
      setBusy(null);
    }
  }

  if (family === undefined) return <p className="flex items-center gap-2 text-sm text-ink-faint"><Loader2 className="size-3.5 animate-spin" /> Loading…</p>;

  // No family yet: a quiet prompt, not a form.
  if (!family && mode !== "create") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">Not grouped with a family or spouse.</p>
        {canWrite && <Button size="sm" variant="secondary" onClick={() => { setMode("create"); setName(`${lastName} family`); setKind("family"); setDate(""); }}><Users /> Group with a family or spouse</Button>}
      </div>
    );
  }

  if (!family) {
    return (
      <div className="space-y-3 rounded-xl border border-line p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-ink-muted">Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={cn(input, "mt-1")} placeholder="The Mensah family" />
          </label>
          <label className="text-xs font-medium text-ink-muted">This is a
            <select value={kind} onChange={(e) => setKind(e.target.value as "family" | "couple")} className={cn(input, "mt-1")}>
              <option value="family">Family (parents, children, relatives)</option>
              <option value="couple">Married couple</option>
            </select>
          </label>
        </div>
        <label className="block text-xs font-medium text-ink-muted">Wedding date <span className="font-normal text-ink-faint">(optional, used for anniversary wishes)</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(input, "mt-1 sm:w-56")} />
        </label>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy !== null} onClick={() => run("create", () => createFamily({ personId, name, kind, weddingDate: date || null }), "Family created", () => setMode("view"))}>
            {busy === "create" ? <><Loader2 className="animate-spin" /> Saving…</> : <><Check /> Create</>}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("view")} disabled={busy !== null}>Cancel</Button>
        </div>
      </div>
    );
  }

  const editing = mode === "edit";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {family.name}
            <Badge variant="primary">{family.kind === "couple" ? "Couple" : "Family"}</Badge>
          </div>
          {family.weddingDate ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
              <Heart className="size-3.5 text-primary" /> Married {prettyDate(family.weddingDate)} · {yearsSince(family.weddingDate)} year{yearsSince(family.weddingDate) === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-faint">No wedding date recorded.</p>
          )}
        </div>
        {canWrite && !editing && (
          <Button size="sm" variant="ghost" onClick={() => { setMode("edit"); setName(family.name); setKind(family.kind); setDate(family.weddingDate ?? ""); }}><Pencil /> Edit</Button>
        )}
      </div>

      {editing && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-ink-muted">Name
              <input value={name} onChange={(e) => setName(e.target.value)} className={cn(input, "mt-1")} />
            </label>
            <label className="text-xs font-medium text-ink-muted">This is a
              <select value={kind} onChange={(e) => setKind(e.target.value as "family" | "couple")} className={cn(input, "mt-1")}>
                <option value="family">Family</option>
                <option value="couple">Married couple</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-medium text-ink-muted">Wedding date <span className="font-normal text-ink-faint">(clear it to remove)</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(input, "mt-1 sm:w-56")} />
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy !== null} onClick={() => run("save", () => updateFamily({ householdId: family.id, name, kind, weddingDate: date || null }), "Saved", () => setMode("view"))}>
              {busy === "save" ? <><Loader2 className="animate-spin" /> Saving…</> : <><Check /> Save</>}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")} disabled={busy !== null}>Cancel</Button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-line-soft rounded-xl border border-line">
        {family.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className={cn("min-w-0 flex-1 truncate", m.id === personId && "font-semibold")}>{m.name}{m.id === personId && <span className="ml-1 text-xs font-normal text-ink-faint">(this member)</span>}</span>
            {canWrite ? (
              <select
                value={m.role}
                disabled={busy !== null}
                onChange={(e) => run(`role-${m.id}`, () => setFamilyRole({ personId: m.id, role: e.target.value as FamilyRole }))}
                className="h-8 rounded-lg border border-line bg-surface px-2 text-xs"
              >
                {(Object.keys(ROLE_LABEL) as FamilyRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            ) : <span className="text-xs text-ink-faint">{ROLE_LABEL[m.role]}</span>}
            {canWrite && (
              <button
                type="button"
                title="Take out of this family"
                disabled={busy !== null}
                onClick={() => run(`rm-${m.id}`, () => removeFamilyMember(m.id), "Removed")}
                className="rounded-md p-1 text-ink-faint hover:bg-danger/10 hover:text-danger"
              >
                {busy === `rm-${m.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
              </button>
            )}
          </li>
        ))}
      </ul>

      {canWrite && (
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="mb-2 text-xs font-semibold text-ink-muted">Add someone</div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone" className={cn(input, "pl-9")} />
            </div>
            <select value={role} onChange={(e) => setRole(e.target.value as FamilyRole)} className="h-10 rounded-xl border border-line bg-surface px-2 text-sm">
              {(Object.keys(ROLE_LABEL) as FamilyRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          {found.length > 0 && (
            <ul className="mt-2 divide-y divide-line-soft rounded-xl border border-line bg-surface">
              {found.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{f.name}{f.phone && <span className="ml-2 text-xs text-ink-faint">{f.phone}</span>}{f.family && <span className="ml-2 text-xs text-warning">in {f.family}</span>}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null || !!f.family}
                    onClick={() => run(`add-${f.id}`, () => addFamilyMember({ householdId: family.id, personId: f.id, role }), `${f.name} added`, () => { setQ(""); setFound([]); })}
                  >
                    {busy === `add-${f.id}` ? <Loader2 className="animate-spin" /> : <Plus />} Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && found.length === 0 && <p className="mt-2 text-xs text-ink-faint">No matching members.</p>}
        </div>
      )}
    </div>
  );
}
