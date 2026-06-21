"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { Search, LayoutGrid, List, Phone, Mail, Briefcase } from "lucide-react";

type MemberRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  memberId: string | null;
  occupation: string | null;
  departments: string[];
};

type Dept = { id: string; name: string };

export function DirectoryClient({
  members,
  departments,
}: {
  members: MemberRow[];
  departments: Dept[];
}) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  const filtered = members.filter((m) => {
    if (deptFilter !== "all" && !m.departments.includes(deptFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.phone?.includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.occupation?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search by name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {departments.length > 0 && (
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        )}

        <div className="flex gap-1">
          <Button
            variant={layout === "grid" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setLayout("grid")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant={layout === "list" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setLayout("list")}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-ink-faint">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</p>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Search className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">No members match your search.</p>
        </Card>
      ) : layout === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((m) => (
            <Card key={m.id} className="p-4 text-center">
              <div className="mx-auto">
                <MemberAvatar name={m.name} photoUrl={m.photoUrl} size="lg" />
              </div>
              <h3 className="mt-3 text-sm font-semibold">{m.name}</h3>
              {m.memberId && <p className="text-[10px] text-ink-faint">{m.memberId}</p>}
              {m.occupation && (
                <p className="mt-1 flex items-center justify-center gap-1 text-xs text-ink-muted">
                  <Briefcase className="size-3" /> {m.occupation}
                </p>
              )}
              <div className="mt-2 flex flex-wrap justify-center gap-1">
                {m.departments.map((d) => (
                  <Badge key={d} variant="default" className="text-[10px]">{d}</Badge>
                ))}
              </div>
              <div className="mt-2 flex justify-center gap-3 text-xs text-ink-muted">
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="flex items-center gap-1 hover:text-brand">
                    <Phone className="size-3" /> {m.phone}
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2">
              <MemberAvatar name={m.name} photoUrl={m.photoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{m.name}</p>
                <div className="flex flex-wrap gap-x-3 text-xs text-ink-muted">
                  {m.memberId && <span>{m.memberId}</span>}
                  {m.occupation && <span className="flex items-center gap-1"><Briefcase className="size-3" /> {m.occupation}</span>}
                  {m.departments.length > 0 && <span>{m.departments.join(", ")}</span>}
                </div>
              </div>
              <div className="hidden shrink-0 gap-3 text-xs text-ink-muted sm:flex">
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="flex items-center gap-1 hover:text-brand">
                    <Phone className="size-3" /> {m.phone}
                  </a>
                )}
                {m.email && (
                  <a href={`mailto:${m.email}`} className="flex items-center gap-1 hover:text-brand">
                    <Mail className="size-3" /> {m.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
