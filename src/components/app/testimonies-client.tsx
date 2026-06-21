"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Trash2, Star, Eye, EyeOff, Sparkles, Heart, HandHeart, Shield, BookOpen, Award } from "lucide-react";
import { deleteTestimony, toggleTestimonyStatus } from "@/app/actions/testimonies";
import { useFeedback } from "@/components/ui/feedback";
import { formatDate } from "@/lib/utils";

interface Testimony {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  anonymous: boolean;
  memberName: string | null;
  date: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Sparkles; color: string }> = {
  praise: { label: "Praise", icon: Sparkles, color: "text-gold" },
  healing: { label: "Healing", icon: Heart, color: "text-success" },
  provision: { label: "Provision", icon: HandHeart, color: "text-brand" },
  deliverance: { label: "Deliverance", icon: Shield, color: "text-primary-bright" },
  salvation: { label: "Salvation", icon: BookOpen, color: "text-success" },
  other: { label: "Other", icon: Award, color: "text-ink-muted" },
};

export function TestimoniesClient({ testimonies }: { testimonies: Testimony[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [pending, start] = useTransition();
  const { toast } = useFeedback();

  const filtered = useMemo(() => {
    let list = testimonies;
    if (filter !== "all") list = list.filter((t) => t.category === filter);
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q.toLowerCase()) || t.body.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [testimonies, q, filter]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search testimonies..." className="h-10 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold">{testimonies.length}</div>
          <div className="text-xs text-ink-muted">Total</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-success">{testimonies.filter((t) => t.status === "featured").length}</div>
          <div className="text-xs text-ink-muted">Featured</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-gold">{testimonies.filter((t) => t.category === "praise").length}</div>
          <div className="text-xs text-ink-muted">Praise reports</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-brand">{testimonies.filter((t) => t.category === "healing").length}</div>
          <div className="text-xs text-ink-muted">Healings</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-faint">
          No testimonies found. Add praise reports and testimonies above.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((t) => {
            const cfg = CATEGORY_CONFIG[t.category] ?? CATEGORY_CONFIG.other;
            const Icon = cfg.icon;
            return (
              <div key={t.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`size-4 ${cfg.color}`} />
                    <span className="text-xs font-medium text-ink-muted">{cfg.label}</span>
                    {t.status === "featured" && <Star className="size-3.5 fill-gold text-gold" />}
                  </div>
                  <div className="flex gap-1">
                    <form action={(fd) => start(async () => { fd.set("id", t.id); fd.set("status", t.status === "featured" ? "approved" : "featured"); await toggleTestimonyStatus(fd); toast(t.status === "featured" ? "Unfeatured" : "Featured!", "success"); })}>
                      <button type="submit" disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-gold/10 hover:text-gold">
                        {t.status === "featured" ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </form>
                    <form action={(fd) => start(async () => { fd.set("id", t.id); await deleteTestimony(fd); toast("Testimony deleted", "info"); })}>
                      <button type="submit" disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </div>
                </div>
                <h3 className="mt-2 font-semibold">{t.title}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-ink-muted">{t.body}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-faint">
                  <span>{t.anonymous ? "Anonymous" : t.memberName ?? "—"}</span>
                  <span>{formatDate(t.date)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
