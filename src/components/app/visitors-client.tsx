"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Link2, UserRoundPlus, Mail, Phone, Calendar } from "lucide-react";

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

export function VisitorsClient({
  visitors,
  visitUrl,
}: {
  visitors: VisitorRow[];
  visitUrl: string | null;
}) {
  const [search, setSearch] = useState("");

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
            <Card key={v.id} className="p-4 space-y-2">
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
    </div>
  );
}
