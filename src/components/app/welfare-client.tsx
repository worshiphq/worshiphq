"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, Heart, Trash2, Calendar, User, HandCoins, UtensilsCrossed, Stethoscope,
  Home, GraduationCap, HelpCircle, ArrowUpRight, ArrowDownRight, Scale,
} from "lucide-react";
import { deleteWelfareRecord } from "@/app/actions/welfare";
import { cn } from "@/lib/utils";

type WelfareRow = {
  id: string;
  kind: "dues" | "aid";
  recipientName: string;
  type: string;
  amount: number | null;
  description: string | null;
  date: string;
  personName: string | null;
};

const TYPE_META: Record<string, { icon: typeof Heart; label: string }> = {
  dues: { icon: HandCoins, label: "Dues" },
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
  collected,
  disbursed,
}: {
  records: WelfareRow[];
  collected: number;
  disbursed: number;
}) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "dues" | "aid">("all");
  const [pending, start] = useTransition();

  const balance = collected - disbursed;

  const filtered = records.filter((r) => {
    if (tab !== "all" && r.kind !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.recipientName.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q);
  });

  const handleDelete = (id: string) => {
    if (!confirm("Delete this welfare record? This cannot be undone.")) return;
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteWelfareRecord(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      {/* Summary: collected in, paid out, balance */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success/10">
            <ArrowUpRight className="size-5 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold text-success">{formatGHS(collected)}</p>
            <p className="text-xs text-ink-muted">Dues collected</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-danger/10">
            <ArrowDownRight className="size-5 text-danger" />
          </div>
          <div>
            <p className="text-2xl font-bold text-danger">{formatGHS(disbursed)}</p>
            <p className="text-xs text-ink-muted">Aid disbursed</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className={cn("flex size-10 items-center justify-center rounded-xl", balance >= 0 ? "bg-brand/10" : "bg-danger/10")}>
            <Scale className={cn("size-5", balance >= 0 ? "text-brand" : "text-danger")} />
          </div>
          <div>
            <p className={cn("text-2xl font-bold", balance >= 0 ? "text-ink" : "text-danger")}>{formatGHS(balance)}</p>
            <p className="text-xs text-ink-muted">Welfare balance</p>
          </div>
        </Card>
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          {(["all", "dues", "aid"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                tab === t ? "bg-brand text-white" : "text-ink-muted hover:bg-surface-2",
              )}
            >
              {t === "all" ? "All" : t === "dues" ? "Dues in" : "Aid out"}
            </button>
          ))}
        </div>
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input placeholder="Search welfare records..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Heart className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No records match your search." : "No welfare records yet. Record dues collected from members or aid given out."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const isDues = r.kind === "dues";
            const meta = TYPE_META[r.type] ?? TYPE_META.other;
            const TypeIcon = isDues ? HandCoins : meta.icon;

            return (
              <Card key={r.id} className={`p-4 ${pending ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", isDues ? "bg-success/10" : "bg-danger/10")}>
                    <TypeIcon className={cn("size-4", isDues ? "text-success" : "text-danger")} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.recipientName}</span>
                      <Badge variant={isDues ? "success" : "default"} className="text-[10px]">
                        {isDues ? "Dues" : meta.label}
                      </Badge>
                      {r.amount && r.amount > 0 && (
                        <span className={cn("text-sm font-bold", isDues ? "text-success" : "text-danger")}>
                          {isDues ? "+" : "−"}{formatGHS(r.amount)}
                        </span>
                      )}
                    </div>

                    {r.description && <p className="mt-1 text-xs text-ink-muted">{r.description}</p>}

                    <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {r.personName && <span className="flex items-center gap-1"><User className="size-3" /> {r.personName}</span>}
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
