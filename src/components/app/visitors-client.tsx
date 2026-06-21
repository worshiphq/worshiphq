"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { OnFormComplete } from "@/components/ui/form-effects";
import { Search, Link2, UserRoundPlus, Mail, Phone, Calendar, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { updateVisitor, deleteVisitor, convertVisitorToMember } from "@/app/actions/visit";

type VisitorRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  purpose: string | null;
  notes: string | null;
  visitDate: string;
};

const PURPOSES = ["Sunday Service", "Midweek Service", "Special Event", "Counselling", "Other"];

export function VisitorsClient({
  visitors,
  visitUrl,
  canWrite,
}: {
  visitors: VisitorRow[];
  visitUrl: string | null;
  canWrite: boolean;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<VisitorRow | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = visitors.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.firstName.toLowerCase().includes(q) ||
      v.lastName.toLowerCase().includes(q) ||
      v.phone?.toLowerCase().includes(q) ||
      v.email?.toLowerCase().includes(q) ||
      v.purpose?.toLowerCase().includes(q)
    );
  });

  function handleDelete(v: VisitorRow) {
    if (!confirm(`Delete visitor ${v.firstName} ${v.lastName}?`)) return;
    startTransition(async () => {
      await deleteVisitor(v.id);
    });
  }

  function handleConvert(v: VisitorRow) {
    if (!confirm(`Convert ${v.firstName} ${v.lastName} to a church member? They will be removed from visitors and added to the People directory.`)) return;
    startTransition(async () => {
      await convertVisitorToMember(v.id);
      setEditing(null);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Visitors</h1>
          <p className="text-sm text-ink-muted">
            {visitors.length} visitor{visitors.length !== 1 ? "s" : ""} recorded
          </p>
        </div>

        {visitUrl && (
          <Button
            variant="secondary"
            onClick={() => {
              const url = `${window.location.origin}${visitUrl}`;
              navigator.clipboard.writeText(url);
              alert("Visitor form link copied!");
            }}
          >
            <Link2 className="size-4" /> Copy visitor link
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="Search visitors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <UserRoundPlus className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No visitors match your search." : "No visitors yet. Share your visitor form link to start collecting visitor info."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <Card
              key={v.id}
              className="group cursor-pointer p-4 space-y-2 transition-colors hover:border-primary/30"
              onClick={() => setEditing(v)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                    {v.firstName[0]}{v.lastName[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{v.firstName} {v.lastName}</p>
                    {v.purpose && (
                      <Badge variant="default" className="mt-0.5 text-[10px]">{v.purpose}</Badge>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(v); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1 text-xs text-ink-muted">
                {v.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="size-3" /> {v.phone}
                  </div>
                )}
                {v.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3" /> {v.email}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3" />
                  {new Date(v.visitDate).toLocaleDateString("en-GB", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </div>
              </div>

              {v.notes && (
                <p className="text-xs text-ink-muted italic border-t border-line-soft pt-2">
                  &ldquo;{v.notes}&rdquo;
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Edit visitor drawer */}
      {editing && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
              <h2 className="font-display text-lg font-semibold">Edit visitor</h2>
              <button onClick={() => setEditing(null)} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>

            <form action={updateVisitor} className="space-y-4 p-5">
              <OnFormComplete onComplete={() => setEditing(null)} />
              <input type="hidden" name="id" value={editing.id} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First name</Label>
                  <Input name="firstName" defaultValue={editing.firstName} required />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input name="lastName" defaultValue={editing.lastName} required />
                </div>
              </div>

              <div>
                <Label>Phone</Label>
                <Input name="phone" type="tel" defaultValue={editing.phone ?? ""} />
              </div>

              <div>
                <Label>Email</Label>
                <Input name="email" type="email" defaultValue={editing.email ?? ""} />
              </div>

              <div>
                <Label>Purpose of visit</Label>
                <select
                  name="purpose"
                  defaultValue={editing.purpose ?? ""}
                  className="h-10 w-full rounded-xl border border-line bg-base px-3 text-sm"
                >
                  <option value="">— Select —</option>
                  {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <Label>Notes / prayer request</Label>
                <textarea
                  name="notes"
                  defaultValue={editing.notes ?? ""}
                  rows={3}
                  className="w-full rounded-xl border border-line bg-base px-3 py-2 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>

              <div className="flex gap-2">
                <SubmitButton className="flex-1">Save changes</SubmitButton>
              </div>
            </form>

            {canWrite && (
              <div className="border-t border-line p-5 space-y-3">
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  disabled={pending}
                  onClick={() => handleConvert(editing)}
                >
                  <UserPlus className="size-4" /> Convert to member
                </Button>
                <Button
                  variant="ghost"
                  className="w-full gap-2 text-danger hover:bg-danger/10"
                  disabled={pending}
                  onClick={() => { handleDelete(editing); setEditing(null); }}
                >
                  <Trash2 className="size-4" /> Delete visitor
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
