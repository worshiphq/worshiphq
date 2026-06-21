"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, Package, Trash2, MapPin, Hash, Music, Monitor, Truck, Utensils, Armchair, Cpu, HelpCircle,
} from "lucide-react";
import { deleteAsset } from "@/app/actions/assets";

type AssetRow = {
  id: string;
  name: string;
  category: string;
  condition: string;
  location: string | null;
  serialNo: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
};

const CAT_META: Record<string, { icon: typeof Package; label: string }> = {
  general: { icon: Package, label: "General" },
  "audio-visual": { icon: Monitor, label: "Audio/Visual" },
  musical: { icon: Music, label: "Musical" },
  furniture: { icon: Armchair, label: "Furniture" },
  vehicle: { icon: Truck, label: "Vehicle" },
  IT: { icon: Cpu, label: "IT" },
  kitchen: { icon: Utensils, label: "Kitchen" },
  other: { icon: HelpCircle, label: "Other" },
};

const CONDITION_COLOR: Record<string, string> = {
  new: "bg-emerald-100 text-emerald-700",
  good: "bg-blue-100 text-blue-700",
  fair: "bg-amber-100 text-amber-700",
  poor: "bg-red-100 text-red-700",
  decommissioned: "bg-gray-200 text-gray-600",
};

function formatGHS(n: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
}

export function AssetsClient({
  assets,
  totalValue,
  totalCount,
}: {
  assets: AssetRow[];
  totalValue: number;
  totalCount: number;
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [pending, start] = useTransition();

  const filtered = assets.filter((a) => {
    if (catFilter && a.category !== catFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.location?.toLowerCase().includes(q) || a.serialNo?.toLowerCase().includes(q);
  });

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteAsset(fd));
  };

  const categories = [...new Set(assets.map((a) => a.category))].sort();

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10">
            <Package className="size-5 text-brand" />
          </div>
          <div>
            <p className="text-2xl font-bold">{totalCount}</p>
            <p className="text-xs text-ink-muted">Total assets</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success/10">
            <Package className="size-5 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatGHS(totalValue)}</p>
            <p className="text-xs text-ink-muted">Total value</p>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{CAT_META[c]?.label ?? c}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search || catFilter ? "No assets match your filter." : "No assets registered yet. Add equipment to start tracking church property."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const meta = CAT_META[a.category] ?? CAT_META.other;
            const CatIcon = meta.icon;

            return (
              <Card key={a.id} className={`p-4 ${pending ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                    <CatIcon className="size-4 text-brand" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{a.name}</span>
                      <Badge variant="default" className="text-[10px]">{meta.label}</Badge>
                      <Badge variant="default" className={`text-[10px] ${CONDITION_COLOR[a.condition] ?? ""}`}>{a.condition}</Badge>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                      {a.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" /> {a.location}
                        </span>
                      )}
                      {a.serialNo && (
                        <span className="flex items-center gap-1">
                          <Hash className="size-3" /> {a.serialNo}
                        </span>
                      )}
                      {a.purchasePrice && a.purchasePrice > 0 && (
                        <span className="font-medium text-brand">{formatGHS(a.purchasePrice)}</span>
                      )}
                    </div>

                    {a.notes && <p className="mt-1 text-xs text-ink-muted">{a.notes}</p>}
                  </div>

                  <button
                    onClick={() => handleDelete(a.id)}
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
