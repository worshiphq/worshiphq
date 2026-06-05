"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Upload,
  QrCode,
  Phone,
  Mail,
  MapPin,
  X,
  Filter,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { people, fullName, ministries, type Person } from "@/lib/demo/data";
import { formatDate, cn } from "@/lib/utils";

const segments = [
  { key: "all", label: "All people" },
  { key: "active", label: "Active" },
  { key: "visitor", label: "Visitors" },
  { key: "inactive", label: "Inactive" },
] as const;

const engagementStyle: Record<Person["engagement"], { label: string; variant: "success" | "primary" | "warning" | "info" }> = {
  thriving: { label: "Thriving", variant: "success" },
  steady: { label: "Steady", variant: "primary" },
  "at-risk": { label: "At risk", variant: "warning" },
  new: { label: "New", variant: "info" },
};

export default function PeoplePage() {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<(typeof segments)[number]["key"]>("all");
  const [selected, setSelected] = useState<Person | null>(null);

  const filtered = useMemo(() => {
    return people.filter((p) => {
      if (segment !== "all" && p.status !== segment) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          fullName(p).toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.ministries.some((m) => m.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [query, segment]);

  return (
    <div>
      <PageHeader title="People" description="Your whole congregation — members, families and visitors.">
        <Button variant="secondary" size="sm">
          <Upload /> Import CSV
        </Button>
        <Button variant="secondary" size="sm">
          <QrCode /> QR check-in
        </Button>
        <Button size="sm">
          <Plus /> Add member
        </Button>
      </PageHeader>

      {/* Stat strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total people", value: people.length },
          { label: "Active members", value: people.filter((p) => p.status === "active").length },
          { label: "Visitors", value: people.filter((p) => p.status === "visitor").length },
          { label: "Ministries", value: ministries.length },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface/40 p-4">
            <div className="text-xs text-ink-muted">{s.label}</div>
            <div className="mt-1 font-display text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {segments.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                segment === s.key ? "bg-primary/15 text-primary-bright" : "text-ink-muted hover:bg-surface-2",
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

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface/60 text-left text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="p-4 font-medium">Name</th>
                <th className="hidden p-4 font-medium md:table-cell">Ministries</th>
                <th className="hidden p-4 font-medium lg:table-cell">Branch</th>
                <th className="p-4 font-medium">Engagement</th>
                <th className="hidden p-4 font-medium sm:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 40).map((p) => {
                const eng = engagementStyle[p.engagement];
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="cursor-pointer border-b border-line-soft transition-colors last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={fullName(p)} size="sm" />
                        <div>
                          <div className="font-medium text-ink">{fullName(p)}</div>
                          <div className="text-xs text-ink-faint">{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden p-4 md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.ministries.length ? (
                          p.ministries.slice(0, 2).map((m) => (
                            <Badge key={m} variant="default" className="text-[10px]">
                              {m}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-ink-faint">—</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden p-4 text-ink-muted lg:table-cell">{p.branch}</td>
                    <td className="p-4">
                      <Badge variant={eng.variant}>{eng.label}</Badge>
                    </td>
                    <td className="hidden p-4 text-ink-muted sm:table-cell">{formatDate(p.joined)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      <PersonDrawer person={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line py-20 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-line bg-surface text-ink-muted">
        <Users className="size-6" />
      </div>
      <h3 className="font-display text-lg font-semibold">No people found</h3>
      <p className="mt-1 max-w-xs text-sm text-ink-muted">
        {query ? `No one matches "${query}".` : "Add your first member or import from a spreadsheet to get started."}
      </p>
    </div>
  );
}

function PersonDrawer({ person, onClose }: { person: Person | null; onClose: () => void }) {
  if (!person) return null;
  const eng = engagementStyle[person.engagement];
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface p-6 shadow-2xl animate-fade-up">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={fullName(person)} size="lg" />
            <div>
              <h2 className="font-display text-xl font-bold">{fullName(person)}</h2>
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
          <DetailRow icon={Phone} value={person.phone} />
          <DetailRow icon={Mail} value={person.email} />
          <DetailRow icon={MapPin} value={person.location} />
        </div>

        <Section title="Household">
          <p className="text-sm text-ink-muted">{person.household}</p>
        </Section>

        <Section title="Ministry involvement">
          {person.ministries.length ? (
            <div className="flex flex-wrap gap-1.5">
              {person.ministries.map((m) => (
                <Badge key={m} variant="primary">{m}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-faint">Not yet in a ministry — a great connection opportunity.</p>
          )}
        </Section>

        <Section title="Key dates">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="text-xs text-ink-faint">Birthday</div>
              <div className="text-sm font-medium">{person.birthday}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="text-xs text-ink-faint">Joined</div>
              <div className="text-sm font-medium">{formatDate(person.joined)}</div>
            </div>
          </div>
        </Section>

        <div className="mt-6 flex gap-2">
          <Button className="flex-1"><Mail className="size-4" /> Message</Button>
          <Button variant="secondary" className="flex-1"><Filter className="size-4" /> Edit profile</Button>
        </div>
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
