"use client";

import { useMemo, useState } from "react";
import {
  Search, Plus, Phone, Mail, MapPin, X, Users, Pencil, Trash2,
  Briefcase, Heart, Shield, User, Grid3X3, List, ChevronRight, Download, MessageSquare, QrCode as QrIcon,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { ImportModal } from "@/components/app/import-modal";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { OnFormComplete } from "@/components/ui/form-effects";
import { Badge } from "@/components/ui/badge";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { Label, Textarea } from "@/components/ui/input";
import { createPerson, updatePerson, deletePerson } from "@/app/actions/people";
import { sendSmsToPerson } from "@/app/actions/communications";
import { MemberFormFields, type MemberDefaults } from "@/components/app/member-form-fields";
import type { PersonRow } from "@/lib/data/people";
import type { FormField } from "@/lib/forms/registration";
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
type Dept = { id: string; name: string };

export function PeopleClient({
  people, stats, canWrite, departments, formFields,
}: {
  people: PersonRow[]; stats: Stats; canWrite: boolean; departments: Dept[]; formFields: FormField[];
}) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<(typeof segments)[number]["key"]>("all");
  const [selected, setSelected] = useState<PersonRow | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");

  const filtered = useMemo(() => {
    return people.filter((p) => {
      if (segment !== "all" && p.status !== segment) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          p.fullName.toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q) ||
          (p.memberId ?? "").toLowerCase().includes(q) ||
          p.departments.some((d) => d.toLowerCase().includes(q)) ||
          p.ministries.some((m) => m.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [people, query, segment]);

  return (
    <div>
      <PageHeader title="People" description="Your whole congregation — members, families and visitors.">
        {canWrite && <ImportModal />}
        <a href="/api/export/people">
          <Button size="sm" variant="secondary"><Download className="size-4" /> Export CSV</Button>
        </a>
        <Button size="sm" onClick={() => setCreating(true)} disabled={!canWrite}>
          <Plus className="size-4" /> Add member
        </Button>
      </PageHeader>

      {/* ── Stat cards ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total people", value: stats.total, icon: Users, color: "bg-primary/10 text-primary-bright" },
          { label: "Active members", value: stats.active, icon: User, color: "bg-success/10 text-success" },
          { label: "Visitors", value: stats.visitors, icon: Heart, color: "bg-gold/10 text-gold" },
          { label: "Departments", value: stats.ministries, icon: Grid3X3, color: "bg-info/10 text-info" },
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

      {/* ── Filters bar ── */}
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
              placeholder="Search people..."
              className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-ink-faint focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 sm:w-64"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState query={query} hasAny={people.length > 0} canWrite={canWrite} onAdd={() => setCreating(true)} />
      ) : view === "grid" ? (
        /* ── Grid view ── */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p, i) => {
            const eng = engagementStyle[p.engagement];
            return (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                className="group cursor-pointer rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex flex-col items-center text-center">
                  <MemberAvatar name={p.fullName} photoUrl={p.photoUrl} gender={p.gender} size="lg" />
                  <h3 className="mt-3 font-display text-sm font-semibold">{p.fullName}</h3>
                  <p className="mt-0.5 text-xs text-ink-faint">{p.memberId ?? p.email ?? p.phone ?? "---"}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    <Badge variant={eng.variant} className="text-[10px]">{eng.label}</Badge>
                    {p.departments[0] && <Badge variant="default" className="text-[10px]">{p.departments[0]}</Badge>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List/table view ── */
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2/50 text-left text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="p-4 font-medium">Name</th>
                <th className="hidden p-4 font-medium md:table-cell">Department</th>
                <th className="hidden p-4 font-medium lg:table-cell">Branch</th>
                <th className="p-4 font-medium">Status</th>
                <th className="hidden p-4 font-medium sm:table-cell">Joined</th>
                <th className="p-4 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const eng = engagementStyle[p.engagement];
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="group cursor-pointer border-b border-line-soft transition-colors last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <MemberAvatar name={p.fullName} photoUrl={p.photoUrl} gender={p.gender} size="sm" />
                        <div>
                          <div className="font-medium text-ink">{p.fullName}</div>
                          <div className="text-xs text-ink-faint">{p.memberId ?? p.email ?? p.phone ?? "---"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden p-4 md:table-cell">
                      {p.departments.length ? (
                        <div className="flex flex-wrap gap-1">
                          {p.departments.slice(0, 2).map((d) => <Badge key={d} variant="default" className="text-[10px]">{d}</Badge>)}
                          {p.departments.length > 2 && <span className="text-xs text-ink-faint">+{p.departments.length - 2}</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-ink-faint">---</span>
                      )}
                    </td>
                    <td className="hidden p-4 text-ink-muted lg:table-cell">{p.branch ?? "---"}</td>
                    <td className="p-4"><Badge variant={eng.variant}>{eng.label}</Badge></td>
                    <td className="hidden p-4 text-ink-muted sm:table-cell">{formatDate(p.joined)}</td>
                    <td className="p-4">
                      <ChevronRight className="size-4 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                    </td>
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
        <PersonForm
          person={editing}
          departments={departments}
          formFields={formFields}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
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
        <Button className="mt-5" onClick={onAdd}><Plus className="size-4" /> Add member</Button>
      )}
    </div>
  );
}

function PersonDrawer({ person, canWrite, onClose, onEdit }: { person: PersonRow; canWrite: boolean; onClose: () => void; onEdit: () => void }) {
  const eng = engagementStyle[person.engagement];
  const [smsOpen, setSmsOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface shadow-2xl animate-fade-up">
        {/* Header with gradient accent */}
        <div className="relative bg-gradient-to-br from-primary/8 via-surface to-surface px-6 pb-4 pt-6">
          <button onClick={onClose} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2">
            <X className="size-5" />
          </button>
          <div className="flex items-center gap-4">
            <MemberAvatar name={person.fullName} photoUrl={person.photoUrl} gender={person.gender} size="lg" className="ring-4 ring-surface" />
            <div>
              <h2 className="font-display text-xl font-bold">
                {person.title ? `${person.title} ` : ""}{person.fullName}
              </h2>
              {person.memberId && (
                <button onClick={() => setQrOpen(true)} className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-ink-faint hover:text-primary-bright">
                  {person.memberId} <QrIcon className="size-3" />
                </button>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={eng.variant}>{eng.label}</Badge>
                <Badge variant="default" className="capitalize">{person.status}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="mt-4 space-y-1">
            <DetailRow icon={Phone} value={person.phone ?? "No phone"} />
            <DetailRow icon={Mail} value={person.email ?? "No email"} />
            <DetailRow icon={MapPin} value={person.location ?? person.town ?? "No location"} />
            {person.occupation && <DetailRow icon={Briefcase} value={person.occupation} />}
            {person.gender && <DetailRow icon={User} value={person.gender} />}
            {person.maritalStatus && <DetailRow icon={Heart} value={person.maritalStatus} />}
            {person.nationality && <DetailRow icon={Shield} value={person.nationality} />}
          </div>

          <Section title="Household"><p className="text-sm text-ink-muted">{person.household ?? "---"}</p></Section>

          {person.departments.length > 0 && (
            <Section title="Departments">
              <div className="flex flex-wrap gap-1.5">
                {person.departments.map((d) => <Badge key={d} variant="primary">{d}</Badge>)}
              </div>
            </Section>
          )}

          <Section title="Ministry involvement">
            {person.ministries.length ? (
              <div className="flex flex-wrap gap-1.5">{person.ministries.map((m) => <Badge key={m} variant="primary">{m}</Badge>)}</div>
            ) : (
              <p className="text-sm text-ink-faint">Not yet in a ministry.</p>
            )}
          </Section>

          <Section title="Key dates">
            <div className="grid grid-cols-2 gap-3">
              <DateBox label="Birthday" value={person.dateOfBirth ? formatDate(person.dateOfBirth) : person.birthday ?? "---"} />
              <DateBox label="Joined" value={formatDate(person.joined)} />
            </div>
          </Section>

          {(person.emergencyName || person.emergencyPhone) && (
            <Section title="Emergency contact">
              <div className="rounded-xl border border-line bg-surface-2/40 p-3 text-sm">
                {person.emergencyName && <div className="font-medium">{person.emergencyName}</div>}
                {person.emergencyRelation && <div className="text-xs text-ink-faint">{person.emergencyRelation}</div>}
                {person.emergencyPhone && <div className="mt-1 text-ink-muted">{person.emergencyPhone}</div>}
              </div>
            </Section>
          )}

          {canWrite && (
            <div className="mt-6 flex gap-2">
              <Button className="flex-1" onClick={onEdit}><Pencil className="size-4" /> Edit profile</Button>
              {person.phone && (
                <Button variant="secondary" onClick={() => setSmsOpen(true)}><MessageSquare className="size-4" /> SMS</Button>
              )}
              <form
                action={deletePerson.bind(null, person.id)}
                onSubmit={(e) => {
                  if (!confirm(`Remove ${person.fullName} from your members? This cannot be undone.`)) {
                    e.preventDefault();
                  }
                }}
              >
                <SubmitButton variant="danger" pendingLabel="Removing…" successMessage="Member removed"><Trash2 className="size-4" /></SubmitButton>
                <OnFormComplete onComplete={onClose} />
              </form>
            </div>
          )}
        </div>
      </div>
      {smsOpen && <SmsModal person={person} onClose={() => setSmsOpen(false)} />}
      {qrOpen && person.memberId && <MemberQrModal person={person} onClose={() => setQrOpen(false)} />}
    </>
  );
}

function MemberQrModal({ person, onClose }: { person: PersonRow; onClose: () => void }) {
  function download() {
    const canvas = document.getElementById("member-qr-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${person.memberId}-${person.fullName.replace(/\s+/g, "-")}.png`;
    a.click();
  }
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[60] w-full max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 text-center shadow-2xl animate-fade-up">
        <button onClick={onClose} className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-4" /></button>
        <h2 className="font-display text-lg font-bold">{person.fullName}</h2>
        <p className="font-mono text-xs text-ink-faint">{person.memberId}</p>
        <div className="mt-4 inline-block rounded-2xl bg-white p-3 ring-1 ring-line">
          <QRCodeCanvas id="member-qr-canvas" value={person.memberId ?? ""} size={200} level="M" fgColor="#0d7377" />
        </div>
        <p className="mt-3 text-xs text-ink-muted">Scan at check-in to mark {person.firstName} present.</p>
        <Button className="mt-4 w-full" variant="secondary" onClick={download}><Download className="size-4" /> Download QR</Button>
      </div>
    </>
  );
}

function SmsModal({ person, onClose }: { person: PersonRow; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[60] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-fade-up">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Send SMS</h2>
            <p className="text-xs text-ink-faint">To {person.fullName} · {person.phone}</p>
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <form action={sendSmsToPerson} className="space-y-3">
          <input type="hidden" name="personId" value={person.id} />
          <Textarea name="message" required placeholder={`Hi ${person.firstName}, …`} className="min-h-28" />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <SubmitButton className="flex-1" pendingLabel="Sending…" successMessage="SMS sent">Send SMS</SubmitButton>
          </div>
          <OnFormComplete onComplete={onClose} />
          <p className="text-center text-xs text-ink-faint">Billed to your SMS credits · sender shows your church name.</p>
        </form>
      </div>
    </>
  );
}

function buildDefaults(fields: FormField[], person: PersonRow): MemberDefaults {
  const scalars: Record<string, string> = {};
  for (const f of fields) {
    if (f.id === "department" || f.type === "image") continue;
    if (f.system) {
      const v = (person as unknown as Record<string, unknown>)[f.id];
      if (f.id === "baptized") scalars[f.id] = v === true ? "Yes" : v === false ? "No" : "";
      else if (v != null) scalars[f.id] = String(v);
    } else {
      const cv = person.customFields[f.label];
      if (cv) scalars[f.id] = cv;
    }
  }
  return { scalars, departments: person.departments, photoUrl: person.photoUrl ?? "" };
}

function PersonForm({
  person, departments, formFields, onClose,
}: {
  person: PersonRow | null; departments: Dept[]; formFields: FormField[]; onClose: () => void;
}) {
  const isEdit = !!person;
  const defaults = person ? buildDefaults(formFields, person) : undefined;
  const selectBase =
    "flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold">{isEdit ? "Edit member" : "Add member"}</h2>
            {isEdit && person?.memberId && (
              <p className="mt-0.5 text-xs text-ink-faint">
                <span className="font-mono">{person.memberId}</span> · Joined {formatDate(person.joined)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <form action={isEdit ? updatePerson : createPerson} className="space-y-5">
          {isEdit && <input type="hidden" name="id" value={person!.id} />}

          {/* Same fields as the public join form, configured in Settings → Join link */}
          <MemberFormFields fields={formFields} departments={departments} defaults={defaults} />

          {isEdit && (
            <div>
              <Label htmlFor="memberId">Member ID</Label>
              <input
                id="memberId"
                name="memberId"
                defaultValue={person?.memberId ?? ""}
                placeholder="e.g. GBC-0001"
                className="flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 font-mono text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              />
              <p className="mt-1 text-xs text-ink-faint">Must be unique. Leave as-is unless you need to renumber.</p>
            </div>
          )}

          <div>
            <Label htmlFor="status">Membership status</Label>
            <select id="status" name="status" defaultValue={person?.status ?? "active"} className={selectBase}>
              <option value="active">Active member</option>
              <option value="visitor">Visitor</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <SubmitButton className="flex-1" successMessage={isEdit ? "Changes saved" : "Member added"}>
              {isEdit ? "Save changes" : "Add member"}
            </SubmitButton>
          </div>
          <OnFormComplete onComplete={onClose} />
        </form>
      </div>
    </>
  );
}

function DetailRow({ icon: Icon, value }: { icon: typeof Phone; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm transition-colors hover:bg-surface-2/50">
      <span className="grid size-8 place-items-center rounded-lg bg-surface-2/60">
        <Icon className="size-3.5 text-ink-faint" />
      </span>
      <span className="text-ink-muted">{value}</span>
    </div>
  );
}

function DateBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="text-sm font-medium">{value}</div>
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
