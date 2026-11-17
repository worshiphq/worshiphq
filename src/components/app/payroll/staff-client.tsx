"use client";

import { useState } from "react";
import { Search, Plus, BriefcaseBusiness, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerList, type ServerPage } from "@/components/ui/use-server-list";
import { searchStaff } from "@/app/actions/staff";
import type { StaffRow, StaffFilters } from "@/lib/data/staff";
import { EMPLOYMENT_TYPES } from "@/lib/payroll/defaults";
import { StaffFormModal } from "./staff-form";
import { RowLink, Initials, field, fmtDay } from "./ui";
import { cn } from "@/lib/utils";

const TYPE_LABEL = Object.fromEntries(EMPLOYMENT_TYPES.map((t) => [t.value, t.label]));
const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  suspended: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  left: "bg-surface-2 text-ink-faint",
};

export function StaffClient({ initial, counts, departments, team, canEdit }: {
  initial: ServerPage<StaffRow>;
  counts: { active: number; suspended: number; left: number };
  departments: { id: string; name: string }[];
  team: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<StaffFilters>({});
  const [adding, setAdding] = useState(false);
  const list = useServerList({ initial, query: q, filters, fetchPage: searchStaff, pageSize: 24 });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {([["Active", counts.active, "text-emerald-600 dark:text-emerald-400"], ["Suspended", counts.suspended, "text-amber-600 dark:text-amber-400"], ["Left", counts.left, "text-ink-faint"]] as const).map(([l, n, c]) => (
          <div key={l} className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{l}</div>
            <div className={cn("mt-1 font-display text-2xl font-bold tabular-nums", c)}>{n}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, staff number or job" aria-label="Search staff" className={cn(field, "pl-9")} />
          {list.spinner}
        </div>
        <div className="grid grid-cols-3 gap-2 md:flex">
          <select aria-label="Department" className={cn(field, "md:w-44")} value={filters.departmentId ?? ""} onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value || undefined }))}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Employment type" className={cn(field, "md:w-36")} value={filters.type ?? ""} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value || undefined }))}>
            <option value="">All types</option>
            {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select aria-label="Status" className={cn(field, "md:w-36")} value={filters.status ?? ""} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}>
            <option value="">Current staff</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="left">Left</option>
          </select>
        </div>
        {canEdit && <Button onClick={() => setAdding(true)}><Plus className="size-4" /> Add staff</Button>}
      </div>

      {list.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><BriefcaseBusiness className="size-5" /></div>
          <h3 className="mt-3 font-display text-lg font-semibold">{q || Object.values(filters).some(Boolean) ? "Nobody matches" : "No staff yet"}</h3>
          <p className="mt-1 text-sm text-ink-muted">Add the pastors, administrators, cleaners and anyone else the church pays or employs.</p>
          {canEdit && !q && <Button className="mt-4" onClick={() => setAdding(true)}><Plus className="size-4" /> Add staff</Button>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.rows.map((s) => (
            <RowLink key={s.id} href={`/app/staff/${s.id}`} className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-2/40">
              <Initials name={s.name} photoUrl={s.photoUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate font-semibold">{s.name}{s.hasLogin && <KeyRound className="size-3.5 text-primary" aria-label="Has a login" />}</div>
                <div className="truncate text-sm text-ink-muted">{s.jobTitle ?? TYPE_LABEL[s.employmentType] ?? "Staff"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {s.department && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{s.department}</span>}
                  <span className={cn("rounded-md px-1.5 py-0.5 font-semibold capitalize", STATUS_CLS[s.status])}>{s.status}</span>
                  {s.staffNo && <span className="text-ink-faint">{s.staffNo}</span>}
                  {s.startDate && <span className="text-ink-faint">Started {fmtDay(s.startDate, { month: "short", year: "numeric" })}</span>}
                </div>
              </div>
            </RowLink>
          ))}
        </div>
      )}
      {list.pager}

      {adding && <StaffFormModal open onClose={() => setAdding(false)} departments={departments} team={team} />}
    </div>
  );
}
