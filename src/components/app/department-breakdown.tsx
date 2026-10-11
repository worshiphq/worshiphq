"use client";

import { useState } from "react";
import { ChevronDown, Search, Copy, Check, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; photoUrl: string | null; gender: string | null };
export type BreakdownRow = {
  id: string;
  name: string;
  present: (Person & { category: string })[];
  absent: Person[];
  byCategory: { adult: number; teen: number; child: number; visitor: number };
};
export type BreakdownGrouping = { key: string; label: string; rows: BreakdownRow[]; notInAny: number };

type Sort = "present" | "turnout" | "name";

const CATS = [
  { key: "adult", label: "Adults" },
  { key: "teen", label: "Teens" },
  { key: "child", label: "Children" },
  { key: "visitor", label: "Visitors" },
] as const;

const turnout = (r: BreakdownRow) => {
  const total = r.present.length + r.absent.length;
  return total > 0 ? Math.round((r.present.length / total) * 100) : 0;
};

/**
 * Per-department (and per zone, fellowship, ...) attendance for one service:
 * sortable, with who came and who didn't. A tab per grouping when the church
 * has set up member categories.
 */
export function DepartmentBreakdown({
  groupings, namedCount, guests, headcountOnly, serviceLabel,
}: {
  groupings: BreakdownGrouping[];
  namedCount: number;
  guests: number;
  headcountOnly: boolean;
  serviceLabel: string;
}) {
  const [activeKey, setActiveKey] = useState(groupings[0]?.key ?? "departments");
  const [sort, setSort] = useState<Sort>("present");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const active = groupings.find((g) => g.key === activeKey) ?? groupings[0];
  const rows = active?.rows ?? [];
  const noun = active?.key === "departments" ? "department" : (active?.label ?? "group").toLowerCase();

  const sorted = rows
    .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "turnout"
          ? turnout(b) - turnout(a) || b.present.length - a.present.length
          : b.present.length - a.present.length || a.name.localeCompare(b.name),
    );

  function copySummary() {
    const lines = [...rows]
      .sort((a, b) => b.present.length - a.present.length || a.name.localeCompare(b.name))
      .map((r) => `${r.name}: ${r.present.length} of ${r.present.length + r.absent.length}`);
    const text = [
      `${serviceLabel} - attendance by ${noun}`,
      ...lines,
      active?.notInAny ? `Not in a ${noun}: ${active.notInAny}` : "",
      guests ? `Guests: ${guests}` : "",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const title = groupings.length > 1 ? "By group" : "By department";

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
        <div>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <p className="text-sm text-ink-muted">How many from each {groupings.length > 1 ? "group" : "department"} came. Someone in two counts in both.</p>
        </div>
        {rows.length > 0 && namedCount > 0 && (
          <Button variant="secondary" size="sm" onClick={copySummary}>
            {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy summary</>}
          </Button>
        )}
      </div>

      {groupings.length > 1 && !headcountOnly && (
        <div className="flex flex-wrap gap-1 border-b border-line px-5 py-3" role="tablist" aria-label="Break down by">
          {groupings.map((g) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={g.key === active?.key}
              onClick={() => { setActiveKey(g.key); setOpen(null); setQ(""); }}
              className={cn(
                "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
                g.key === active?.key ? "bg-primary/10 text-primary" : "text-ink-muted hover:bg-surface-2",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {headcountOnly ? (
        <p className="p-5 text-sm text-ink-muted">
          This service was recorded as a headcount, so there are no names to break down. Use <strong>Start check-in</strong> for services where you want this breakdown.
        </p>
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-ink-muted">
          {active?.key === "departments"
            ? "You have no departments yet. Add them in Settings to see this breakdown."
            : `No ${active?.label} options yet. Add them in Settings, Zones & fellowships.`}
        </p>
      ) : (
        <div className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Find a ${noun}…`}
                className="h-9 w-full rounded-lg border border-line bg-base pl-9 pr-3 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex gap-1" role="group" aria-label="Sort">
              {([
                ["present", "Most present"],
                ["turnout", "Best turnout"],
                ["name", "A to Z"],
              ] as const).map(([key, label]) => (
                <Button key={key} size="sm" variant={sort === key ? "primary" : "secondary"} onClick={() => setSort(key)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <ul className="space-y-2">
            {sorted.map((r) => {
              const total = r.present.length + r.absent.length;
              const pct = turnout(r);
              const expanded = open === r.id;
              return (
                <li key={r.id} className="rounded-xl border border-line bg-base">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : r.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    aria-expanded={expanded}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-bright">
                      <Building2 className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="truncate font-medium">{r.name}</span>
                        <span className="text-xs text-ink-muted">
                          <strong className="text-ink">{r.present.length}</strong> of {total} came · {pct}%
                        </span>
                      </span>
                      <span className="mt-1.5 block h-1.5 rounded-full bg-surface-2">
                        <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                      {r.present.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {CATS.filter((c) => r.byCategory[c.key] > 0).map((c) => (
                            <span key={c.key} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted">
                              {c.label} {r.byCategory[c.key]}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <ChevronDown className={cn("size-4 shrink-0 text-ink-faint transition-transform", expanded && "rotate-180")} />
                  </button>

                  {expanded && (
                    <div className="grid gap-4 border-t border-line px-4 py-3 sm:grid-cols-2">
                      <PeopleList title="Came" people={r.present} empty={`Nobody from this ${noun} checked in.`} />
                      <PeopleList title="Didn't check in" people={r.absent} empty="Everyone came." />
                    </div>
                  )}
                </li>
              );
            })}
            {sorted.length === 0 && <li className="py-6 text-center text-sm text-ink-muted">Nothing matches &ldquo;{q}&rdquo;.</li>}
          </ul>

          {((active?.notInAny ?? 0) > 0 || guests > 0) && (
            <p className="mt-4 text-xs text-ink-faint">
              {(active?.notInAny ?? 0) > 0 && <>{active!.notInAny} checked-in member{active!.notInAny === 1 ? " is" : "s are"} not in any {noun}. </>}
              {guests > 0 && <>{guests} guest{guests === 1 ? "" : "s"} checked in without a member record.</>}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function PeopleList({ title, people, empty }: { title: string; people: (Person & { category?: string })[]; empty: string }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {title} <span className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted">{people.length}</span>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <MemberAvatar name={p.name} photoUrl={p.photoUrl} gender={p.gender} size="sm" />
              <span className="truncate">{p.name}</span>
              {p.category && p.category !== "adult" && (
                <span className="ml-auto shrink-0 text-[11px] capitalize text-ink-faint">{p.category}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
