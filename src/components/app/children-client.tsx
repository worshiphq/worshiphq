"use client";

import { useMemo, useState } from "react";
import {
  Search, Plus, Phone, X, Users, Pencil, Trash2,
  User, Grid3X3, List, ChevronRight, Baby, GraduationCap, School, Heart,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { OnFormComplete } from "@/components/ui/form-effects";
import { Badge } from "@/components/ui/badge";
import { ClickableAvatar } from "@/components/ui/photo-lightbox";
import { Label } from "@/components/ui/input";
import { createChild, updateChild, assignParent } from "@/app/actions/children";
import { deletePerson } from "@/app/actions/people";
import type { PersonRow } from "@/lib/data/people";
import { formatDate, cn } from "@/lib/utils";

const segments = [
  { key: "all", label: "All" },
  { key: "child", label: "Children" },
  { key: "teen", label: "Teens" },
] as const;

type Adult = { id: string; firstName: string; lastName: string };
type Stats = { total: number; children: number; teens: number };

export function ChildrenClient({
  people, stats, adults, canWrite,
}: {
  people: PersonRow[]; stats: Stats; adults: Adult[]; canWrite: boolean;
}) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<(typeof segments)[number]["key"]>("all");
  const [selected, setSelected] = useState<PersonRow | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");

  const filtered = useMemo(() => {
    return people.filter((p) => {
      if (segment !== "all" && p.ageGroup !== segment) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          p.fullName.toLowerCase().includes(q) ||
          (p.school ?? "").toLowerCase().includes(q) ||
          (p.guardianName ?? "").toLowerCase().includes(q) ||
          (p.parentName ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [people, query, segment]);

  return (
    <div>
      <PageHeader title="Children & Teens" description="Manage children and teens separately from adults. Assign parents and track school info.">
        <Button size="sm" onClick={() => setCreating(true)} disabled={!canWrite}>
          <Plus className="size-4" /> Add child
        </Button>
      </PageHeader>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: stats.total, icon: Users, color: "bg-primary/10 text-primary-bright" },
          { label: "Children", value: stats.children, icon: Baby, color: "bg-success/10 text-success" },
          { label: "Teens", value: stats.teens, icon: GraduationCap, color: "bg-gold/10 text-gold" },
        ].map((s) => (
          <div key={s.label} className="group rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-ink-muted">{s.label}</div>
              <span className={cn("grid size-8 place-items-center rounded-lg", s.color)}>
                <s.icon className="size-3.5" />
              </span>
            </div>
            <div className="mt-2 font-display text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {segments.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
                segment === s.key ? "bg-primary/10 text-primary-bright shadow-sm" : "text-ink-muted hover:bg-surface-2",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line">
            <button
              onClick={() => setView("list")}
              className={cn("grid size-9 place-items-center rounded-l-lg transition-colors", view === "list" ? "bg-primary/10 text-primary-bright" : "text-ink-faint hover:bg-surface-2")}
            >
              <List className="size-4" />
            </button>
            <button
              onClick={() => setView("grid")}
              className={cn("grid size-9 place-items-center rounded-r-lg border-l border-line transition-colors", view === "grid" ? "bg-primary/10 text-primary-bright" : "text-ink-faint hover:bg-surface-2")}
            >
              <Grid3X3 className="size-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search children..."
              className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-ink-faint focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 sm:w-64"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line py-20 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-line bg-surface text-ink-muted">
            <Baby className="size-6" />
          </div>
          <h3 className="font-display text-lg font-semibold">{people.length ? "No results" : "No children or teens yet"}</h3>
          <p className="mt-1 max-w-xs text-sm text-ink-muted">
            {query ? `No one matches "${query}".` : "Add children and teens to track them separately from adult members."}
          </p>
          {!people.length && canWrite && (
            <Button className="mt-5" onClick={() => setCreating(true)}><Plus className="size-4" /> Add child</Button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelected(p)}
              className="group cursor-pointer rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md"
            >
              <div className="flex flex-col items-center text-center">
                <ClickableAvatar name={p.fullName} photoUrl={p.photoUrl} gender={p.gender} size="lg" />
                <h3 className="mt-3 font-display text-sm font-semibold">{p.fullName}</h3>
                <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
                  <Badge variant={p.ageGroup === "teen" ? "gold" : "info"} className="text-[10px] capitalize">
                    {p.ageGroup}
                  </Badge>
                </div>
                {p.parentName && (
                  <p className="mt-2 text-xs text-ink-faint">Parent: {p.parentName}</p>
                )}
                {p.school && (
                  <p className="mt-1 text-xs text-ink-faint">{p.school}{p.grade ? ` · ${p.grade}` : ""}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2/50 text-left text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="p-4 font-medium">Name</th>
                <th className="hidden p-4 font-medium sm:table-cell">Age group</th>
                <th className="hidden p-4 font-medium md:table-cell">Parent / Guardian</th>
                <th className="hidden p-4 font-medium lg:table-cell">School</th>
                <th className="p-4 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="group cursor-pointer border-b border-line-soft transition-colors last:border-0 hover:bg-surface-2/50"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <ClickableAvatar name={p.fullName} photoUrl={p.photoUrl} gender={p.gender} size="sm" />
                      <div>
                        <div className="font-medium text-ink">{p.fullName}</div>
                        <div className="text-xs text-ink-faint">{p.memberId ?? "---"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden p-4 sm:table-cell">
                    <Badge variant={p.ageGroup === "teen" ? "gold" : "info"} className="capitalize">
                      {p.ageGroup}
                    </Badge>
                  </td>
                  <td className="hidden p-4 text-ink-muted md:table-cell">
                    {p.parentName ?? p.guardianName ?? "---"}
                  </td>
                  <td className="hidden p-4 text-ink-muted lg:table-cell">
                    {p.school ? `${p.school}${p.grade ? ` · ${p.grade}` : ""}` : "---"}
                  </td>
                  <td className="p-4">
                    <ChevronRight className="size-4 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ChildDrawer
          person={selected}
          adults={adults}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null); }}
        />
      )}
      {(creating || editing) && (
        <ChildForm
          person={editing}
          adults={adults}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ChildDrawer({
  person, adults, canWrite, onClose, onEdit,
}: {
  person: PersonRow; adults: Adult[]; canWrite: boolean; onClose: () => void; onEdit: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface shadow-2xl animate-fade-up">
        <div className="relative bg-gradient-to-br from-primary/8 via-surface to-surface px-6 pb-4 pt-6">
          <button onClick={onClose} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2">
            <X className="size-5" />
          </button>
          <div className="flex items-center gap-4">
            <ClickableAvatar name={person.fullName} photoUrl={person.photoUrl} gender={person.gender} size="lg" className="ring-4 ring-surface" />
            <div>
              <h2 className="font-display text-xl font-bold">{person.fullName}</h2>
              {person.memberId && <p className="mt-0.5 font-mono text-xs text-ink-faint">{person.memberId}</p>}
              <div className="mt-1.5 flex items-center gap-1.5">
                <Badge variant={person.ageGroup === "teen" ? "gold" : "info"} className="capitalize">{person.ageGroup}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="mt-4 space-y-1">
            {person.gender && <DetailRow icon={User} label="Gender" value={person.gender} />}
            {person.dateOfBirth && <DetailRow icon={Baby} label="Date of birth" value={formatDate(person.dateOfBirth)} />}
            {person.phone && <DetailRow icon={Phone} label="Phone" value={person.phone} />}
          </div>

          {/* Parent / Guardian */}
          <Section title="Parent / Guardian">
            {person.parentName ? (
              <div className="rounded-xl border border-line bg-surface-2/40 p-3">
                <div className="flex items-center gap-2">
                  <Heart className="size-4 text-primary-bright" />
                  <span className="text-sm font-medium">{person.parentName}</span>
                  <Badge variant="primary" className="text-[10px]">Linked member</Badge>
                </div>
              </div>
            ) : person.guardianName ? (
              <div className="rounded-xl border border-line bg-surface-2/40 p-3 text-sm">
                <div className="font-medium">{person.guardianName}</div>
                {person.guardianPhone && <div className="mt-1 text-ink-muted">{person.guardianPhone}</div>}
              </div>
            ) : (
              <p className="text-sm text-ink-faint">No parent assigned</p>
            )}

            {canWrite && (
              <form action={assignParent} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="childId" value={person.id} />
                <div className="flex-1">
                  <Label htmlFor="parentId" className="text-xs">Assign parent (member)</Label>
                  <select
                    id="parentId"
                    name="parentId"
                    defaultValue={person.parentId ?? ""}
                    className="flex h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none"
                  >
                    <option value="">No parent</option>
                    {adults.map((a) => (
                      <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                    ))}
                  </select>
                </div>
                <SubmitButton size="sm" pendingLabel="Saving…" successMessage="Parent assigned">Save</SubmitButton>
              </form>
            )}
          </Section>

          {/* School info */}
          {(person.school || person.grade) && (
            <Section title="School">
              <div className="space-y-1">
                {person.school && <DetailRow icon={School} label="School" value={person.school} />}
                {person.grade && <DetailRow icon={GraduationCap} label="Grade / Class" value={person.grade} />}
              </div>
            </Section>
          )}

          {canWrite && (
            <div className="mt-6 flex gap-2">
              <Button className="flex-1" onClick={onEdit}><Pencil className="size-4" /> Edit</Button>
              <form
                action={deletePerson.bind(null, person.id)}
                onSubmit={(e) => {
                  if (!confirm(`Remove ${person.fullName}? This cannot be undone.`)) e.preventDefault();
                }}
              >
                <SubmitButton variant="danger" pendingLabel="Removing…" successMessage="Removed"><Trash2 className="size-4" /></SubmitButton>
                <OnFormComplete onComplete={onClose} />
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ChildForm({
  person, adults, onClose,
}: {
  person: PersonRow | null; adults: Adult[]; onClose: () => void;
}) {
  const isEdit = !!person;
  const selectBase = "flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
  const inputBase = "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold">{isEdit ? "Edit" : "Add child / teen"}</h2>
            <p className="mt-0.5 text-xs text-ink-faint">Children and teens are tracked separately from adult members.</p>
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-5" /></button>
        </div>

        <form action={isEdit ? updateChild : createChild} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={person!.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">First name *</Label>
              <input id="firstName" name="firstName" required defaultValue={person?.firstName ?? ""} className={inputBase} />
            </div>
            <div>
              <Label htmlFor="lastName">Last name *</Label>
              <input id="lastName" name="lastName" required defaultValue={person?.lastName ?? ""} className={inputBase} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ageGroup">Age group *</Label>
              <select id="ageGroup" name="ageGroup" defaultValue={person?.ageGroup ?? "child"} className={selectBase}>
                <option value="child">Child (under 13)</option>
                <option value="teen">Teen (13–17)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="gender">Gender</Label>
              <select id="gender" name="gender" defaultValue={person?.gender ?? ""} className={selectBase}>
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={person?.dateOfBirth ?? ""} className={inputBase} />
            </div>
            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <input id="phone" name="phone" defaultValue={person?.phone ?? ""} placeholder="For teens" className={inputBase} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="school">School</Label>
              <input id="school" name="school" defaultValue={person?.school ?? ""} placeholder="e.g. Accra Academy" className={inputBase} />
            </div>
            <div>
              <Label htmlFor="grade">Grade / Class</Label>
              <input id="grade" name="grade" defaultValue={person?.grade ?? ""} placeholder="e.g. JHS 2" className={inputBase} />
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Parent / Guardian</h3>
            <div>
              <Label htmlFor="parentId">Assign parent (church member)</Label>
              <select id="parentId" name="parentId" defaultValue={person?.parentId ?? ""} className={selectBase}>
                <option value="">— Select a member —</option>
                {adults.map((a) => (
                  <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-faint">Links this child to an existing adult member record.</p>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="guardianName">Or guardian name</Label>
                <input id="guardianName" name="guardianName" defaultValue={person?.guardianName ?? ""} placeholder="Full name" className={inputBase} />
              </div>
              <div>
                <Label htmlFor="guardianPhone">Guardian phone</Label>
                <input id="guardianPhone" name="guardianPhone" defaultValue={person?.guardianPhone ?? ""} placeholder="e.g. 0244123456" className={inputBase} />
              </div>
            </div>
          </div>

          <div className="flex gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <SubmitButton className="flex-1" successMessage={isEdit ? "Changes saved" : "Child added"}>
              {isEdit ? "Save changes" : "Add child"}
            </SubmitButton>
          </div>
          <OnFormComplete onComplete={onClose} />
        </form>
      </div>
    </>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm transition-colors hover:bg-surface-2/50">
      <span className="grid size-8 place-items-center rounded-lg bg-surface-2/60">
        <Icon className="size-3.5 text-ink-faint" />
      </span>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
        <div className="text-ink-muted">{value}</div>
      </div>
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
