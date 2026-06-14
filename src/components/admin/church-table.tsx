"use client";

import { useState } from "react";
import { LogIn, Ban, CheckCircle2, Trash2, Search, Building2 } from "lucide-react";
import type { ChurchRow } from "@/lib/data/admin";
import {
  impersonateChurch,
  setChurchSuspended,
  setChurchPlan,
  deleteChurch,
} from "@/app/actions/admin";

const PLANS = ["free", "starter", "growth", "unlimited"];

export function ChurchTable({ churches }: { churches: ChurchRow[] }) {
  const [q, setQ] = useState("");
  const filtered = churches.filter(
    (c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.country ?? "").toLowerCase().includes(q.toLowerCase()) ||
      (c.city ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-200">
          Churches <span className="text-slate-500">({churches.length})</span>
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search churches…"
            className="h-9 w-56 rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Church</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Giving (mo)</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-500/10 text-teal-400">
                      <Building2 className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-100">
                        {c.name}
                        {c.isDemo && <span className="ml-2 text-xs text-amber-400">demo</span>}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[c.city, c.country].filter(Boolean).join(", ") || "—"} · /{c.slug}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300">{c.members}</td>
                <td className="px-4 py-3 text-slate-300">₵{c.givingThisMonth.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <select
                    defaultValue={c.plan}
                    onChange={(e) => setChurchPlan(c.id, e.target.value)}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs capitalize text-slate-200 focus:outline-none"
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p} className="bg-slate-800">{p}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {c.suspended ? (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">Suspended</span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">Active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <form action={impersonateChurch.bind(null, c.id)}>
                      <button
                        type="submit"
                        title="Step into dashboard"
                        className="flex items-center gap-1.5 rounded-lg bg-teal-500/15 px-2.5 py-1.5 text-xs font-medium text-teal-300 transition-colors hover:bg-teal-500/25"
                      >
                        <LogIn className="size-3.5" /> Enter
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => setChurchSuspended(c.id, !c.suspended)}
                      title={c.suspended ? "Reactivate" : "Suspend"}
                      className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-amber-300"
                    >
                      {c.suspended ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
                    </button>
                    {!c.isDemo && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete ${c.name}? This permanently removes all their data.`)) {
                            deleteChurch(c.id);
                          }
                        }}
                        title="Delete church"
                        className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  No churches match “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
