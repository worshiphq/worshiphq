"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Upload, QrCode, Phone, Mail, MapPin, X, Users, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input, Label } from "@/components/ui/input";
import { createPerson, updatePerson, deletePerson } from "@/app/actions/people";
import type { PersonRow } from "@/lib/data/people";
import { formatDate, cn } from "@/lib/utils";

const segments = [
  { key: "all", label: "All people" },
  { key: "active", label: "Active" },
  { key: "visitor", label: "Visitors" },
  { key: "inactive", label: "Inactive" },
] as const;

const engagementStyle: Record<PersonRow["engagement"], { label: string; variant: "success" | "primary" | "warning" | "info" }> = {
  thriving: { label: "Thriving", variant: "success" },
  steady: { label: "Steady", variant: "primary" },
  "at-risk": { label: "At risk", variant: "warning" },
  new: { label: "New", variant: "info" },
};

type Stats = { total: number; active: number; visitors: number; ministries: number };

export function PeopleClient({ people, stats, canWrite }: { people: PersonRow[]; stats: Stats; canWrite: boolean }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<(typeof segments)[number]["key"]>("all");
  const [selected, setSelected] = useState<PersonRow | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    return people.filter((p) => {
      if (segment !== "all" && p.status !== segment) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          p.fullName.toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q) ||
          p.ministries.some((m) => m.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [people, query, segment]);

  return (
    <div>
      <PageHeader title="People" description="Your whole congregation — members, families and visitors.">
        <Button variant="secondary" size="sm" disabled={!canWrite}>
          <Upload /> Import CSV
        </Button>
        <Button variant="secondary" size="sm">
          <QrCode /> QR check-in
        </Button>
        <Button size="sm" onClick={() => setCreating(true)} disabled={!canWrite}>
          <Plus /> Add member
        </Button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total people", value: stats.total },
          { label: "Active members", value: stats.active },
          { label: "Visitors", value: stats.visitors },
          { label: "Ministries", value: stats.ministries },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="text-xs text-ink-muted">{s.label}</div>
            <div className="mt-1 font-display text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {segments.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                segment === s.key ? "bg-primary/10 text-primary-bright" : "text-ink-muted hover:bg-surface-2",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-ink-faint focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 sm:w-64"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState query={query} hasAny={people.length > 0} canWrite={canWrite} onAdd={() => setCreating(true)} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2/50 text-left text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="p-4 font-medium">Name</th>
                <th className="hidden p-4 font-medium md:table-cell">Ministries</th>
                <th className="hidden p-4 font-medium lg:table-cell">Branch</th>
                <th className="p-4 font-medium">Status</th>
                <th className="hidden p-4 font-medium sm:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const eng = engagementStyle[p.engagement];
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="cursor-pointer border-b border-line-soft transition-colors last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.fullName} size="sm" />
                        <div>
                          <div className="font-medium text-ink">{p.fullName}</div>
                          <div className="text-xs text-ink-faint">{p.email ?? p.phone ?? "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden p-4 md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.ministries.length ? (
                          p.ministries.slice(0, 2).map((m) => (
                            <Badge key={m} variant="default" className="text-[10px]">{m}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-ink-faint">—</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden p-4 text-ink-muted lg:table-cell">{p.branch ?? "—"}</td>
                    <td className="p-4"><Badge variant={eng.variant}>{eng.label}</Badge></td>
                    <td className="hidden p-4 text-ink-muted sm:table-cell">{formatDate(p.joined)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <PersonDrawer
          person={selected}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null); }}
        />
      )}
      {(creating || editing) && (
        <PersonForm person={editing} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}

function EmptyState({ query, hasAny, canWrite, onAdd }: { query: string; hasAny: boolean; canWrite: boolean; onAdd: () => void }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line py-20 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-line bg-surface text-ink-muted">
        <Users className="size-6" />
      </div>
      <h3 className="font-display text-lg font-semibold">{hasAny ? "No people found" : "Add your first member"}</h3>
      <p className="mt-1 max-w-xs text-sm text-ink-muted">
        {query ? `No one matches "${query}".` : "Build your directory by adding members or importing from a spreadsheet."}
      </p>
      {!hasAny && canWrite && (
        <Button className="mt-5" onClick={onAdd}><Plus /> Add member</Button>
      )}
    </div>
  );
}

function PersonDrawer({ person, canWrite, onClose, onEdit }: { person: PersonRow; canWrite: boolean; onClose: () => void; onEdit: () => void }) {
  const eng = engagementStyle[person.engagement];
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface p-6 shadow-2xl animate-fade-up">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={person.fullName} size="lg" />
            <div>
              <h2 className="font-display text-xl font-bold">{person.fullName}</h2>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={eng.variant}>{eng.label}</Badge>
                <Badge variant="default" className="capitalize">{person.status}</Badge>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-6 space-y-1">
          <DetailRow icon={Phone} value={person.phone ?? "No phone"} />
          <DetailRow icon={Mail} value={person.email ?? "No email"} />
          <DetailRow icon={MapPin} value={person.location ?? "No location"} />
        </div>

        <Section title="Household"><p className="text-sm text-ink-muted">{person.household ?? "—"}</p></Section>
        <Section title="Ministry involvement">
          {person.ministries.length ? (
            <div className="flex flex-wrap gap-1.5">{person.ministries.map((m) => <Badge key={m} variant="primary">{m}</Badge>)}</div>
          ) : (
            <p className="text-sm text-ink-faint">Not yet in a ministry — a great connection opportunity.</p>
          )}
        </Section>
        <Section title="Key dates">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="text-xs text-ink-faint">Birthday</div>
              <div className="text-sm font-medium">{person.birthday ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="text-xs text-ink-faint">Joined</div>
              <div className="text-sm font-medium">{formatDate(person.joined)}</div>
            </div>
          </div>
        </Section>

        {canWrite && (
          <div className="mt-6 flex gap-2">
            <Button className="flex-1" onClick={onEdit}><Pencil className="size-4" /> Edit profile</Button>
            <form
              action={deletePerson.bind(null, person.id)}
              onSubmit={(e) => {
                if (!confirm(`Remove ${person.fullName} from your members? This cannot be undone.`)) {
                  e.preventDefault();
                } else {
                  // Defer closing so the drawer doesn't unmount before the action dispatches.
                  setTimeout(onClose, 0);
                }
              }}
            >
              <Button type="submit" variant="danger"><Trash2 className="size-4" /> Delete</Button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

function PersonForm({ person, onClose }: { person: PersonRow | null; onClose: () => void }) {
  const isEdit = !!person;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{isEdit ? "Edit member" : "Add member"}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <form action={isEdit ? updatePerson : createPerson} onSubmit={() => setTimeout(onClose, 0)} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={person!.id} />}
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="firstName">First name</Label><Input id="firstName" name="firstName" required defaultValue={person?.firstName} /></div>
            <div><Label htmlFor="lastName">Last name</Label><Input id="lastName" name="lastName" required defaultValue={person?.lastName} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" defaultValue={person?.email ?? ""} /></div>
            <div><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" placeholder="+233 …" defaultValue={person?.phone ?? ""} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="birthday">Birthday (MM-DD)</Label><Input id="birthday" name="birthday" placeholder="06-05" defaultValue={person?.birthday ?? ""} /></div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select id="status" name="status" defaultValue={person?.status ?? "active"} className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                <option value="active">Active member</option>
                <option value="visitor">Visitor</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div><Label htmlFor="location">Location</Label><Input id="location" name="location" placeholder="Osu, Accra" defaultValue={person?.location ?? ""} /></div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1">{isEdit ? "Save changes" : "Add member"}</Button>
          </div>
        </form>
      </div>
    </>
  );
}

function DetailRow({ icon: Icon, value }: { icon: typeof Phone; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm">
      <Icon className="size-4 text-ink-faint" />
      <span className="text-ink-muted">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      {children}
    </div>
  );
}
