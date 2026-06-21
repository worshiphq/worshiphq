"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, Heart, Trash2, Calendar, User, HandCoins, UtensilsCrossed, Stethoscope, Home, GraduationCap, HelpCircle,
} from "lucide-react";
import { deleteWelfareRecord } from "@/app/actions/welfare";

type WelfareRow = {
  id: string;
  recipientName: string;
  type: string;
  amount: number | null;
  description: string | null;
  date: string;
  personName: string | null;
};

const TYPE_META: Record<string, { icon: typeof Heart; label: string }> = {
  financial: { icon: HandCoins, label: "Financial" },
  food: { icon: UtensilsCrossed, label: "Food" },
  medical: { icon: Stethoscope, label: "Medical" },
  housing: { icon: Home, label: "Housing" },
  education: { icon: GraduationCap, label: "Education" },
  other: { icon: HelpCircle, label: "Other" },
};

function formatGHS(n: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
}

export function WelfareClient({
  records,
  totalAmount,
  totalCount,
}: {
  records: WelfareRow[];
  totalAmount: number;
  totalCount: number;
}) {
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.recipientName.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q);
  });

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteWelfareRecord(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10">
            <Heart className="size-5 text-brand" />
          </div>
          <div>
            <p className="text-2xl font-bold">{totalCount}</p>
            <p className="text-xs text-ink-muted">Aid records</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success/10">
            <HandCoins className="size-5 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatGHS(totalAmount)}</p>
            <p className="text-xs text-ink-muted">Total disbursed</p>
          </div>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="Search welfare records..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Heart className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No records match your search." : "No welfare records yet. Record aid given to track your church's benevolence."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const meta = TYPE_META[r.type] ?? TYPE_META.other;
            const TypeIcon = meta.icon;

            return (
              <Card key={r.id} className={`p-4 ${pending ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                    <TypeIcon className="size-4 text-brand" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.recipientName}</span>
                      <Badge variant="default" className="text-[10px]">{meta.label}</Badge>
                      {r.amount && r.amount > 0 && (
                        <span className="text-sm font-bold text-brand">{formatGHS(r.amount)}</span>
                      )}
                    </div>

                    {r.description && (
                      <p className="mt-1 text-xs text-ink-muted">{r.description}</p>
                    )}

                    <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {r.personName && (
                        <span className="flex items-center gap-1">
                          <User className="size-3" /> {r.personName}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(r.id)}
                    className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
