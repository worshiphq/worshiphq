"use client";

import { useState } from "react";
import { LogIn, Ban, CheckCircle2, Trash2, Search, Building2, Gift } from "lucide-react";
import type { ChurchRow } from "@/lib/data/admin";
import {
  impersonateChurch,
  setChurchSuspended,
  setChurchPlan,
  deleteChurch,
  grantSmsCredits,
  grantPlanBypass,
  approveSenderId,
  rejectSenderId,
} from "@/app/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFeedback } from "@/components/ui/feedback";

const PLANS = ["free", "starter", "pro", "max"];

export function ChurchTable({ churches }: { churches: ChurchRow[] }) {
  const [q, setQ] = useState("");
  const { run } = useFeedback();
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

      {/* Mobile card layout */}
      <div className="space-y-3 md:hidden">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
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
              {c.suspended ? (
                <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">Suspended</span>
              ) : (
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">Active</span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-slate-500">Members</div>
                <div className="font-medium text-slate-200">{c.members}</div>
              </div>
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-slate-500">Giving (mo)</div>
                <div className="font-medium text-slate-200">₵{c.givingThisMonth.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-slate-500">SMS credits</div>
                <div className="font-medium text-slate-200">{c.smsCredits.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-slate-500">Plan</div>
                <div className="font-medium capitalize text-slate-200">{c.plan}</div>
              </div>
            </div>

            {c.smsSenderId && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-slate-500">Sender ID:</span>
                <span className="font-medium text-slate-200">{c.smsSenderId}</span>
                <span className={c.smsSenderIdStatus === "approved" ? "text-emerald-400" : c.smsSenderIdStatus === "rejected" ? "text-red-400" : "text-amber-400"}>
                  {c.smsSenderIdStatus}
                </span>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
              {c.smsSenderId && c.smsSenderIdStatus === "pending" && (
                <>
                  <button
                    type="button"
                    onClick={() => run(() => approveSenderId(c.id), { pending: "Approving...", success: "Sender ID approved" })}
                    className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => rejectSenderId(c.id), { pending: "Rejecting...", success: "Sender ID rejected" })}
                    className="rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25"
                  >
                    Reject
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  const v = prompt(`Grant SMS credits to ${c.name}:`, "500");
                  const n = Number(v);
                  if (n > 0) run(() => grantSmsCredits(c.id, n), { pending: "Granting…", success: `Granted ${n} credits` });
                }}
                className="rounded-md bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
              >
                + SMS credits
              </button>
              <select
                defaultValue={c.plan}
                onChange={(e) => run(() => setChurchPlan(c.id, e.target.value), { pending: "Updating plan…", success: "Plan updated" })}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs capitalize text-slate-200 focus:outline-none"
              >
                {PLANS.map((p) => <option key={p} value={p} className="bg-slate-800">{p}</option>)}
              </select>
              <button
                type="button"
                title="Gift free plan upgrade"
                onClick={() => {
                  const plan = prompt(`Gift a free plan to ${c.name}.\nEnter plan (starter / pro / max):`, "max");
                  if (!plan || !["starter", "pro", "max"].includes(plan.trim().toLowerCase())) return;
                  run(
                    async () => {
                      const res = await grantPlanBypass(c.id, plan.trim().toLowerCase());
                      if (res && "error" in res) throw new Error(res.error);
                      if (res && "code" in res) alert(`Code: ${res.code}\n${res.phone ? `SMS sent to ${res.phone}` : "No phone on file — share code manually."}`);
                    },
                    { pending: "Sending bypass…", success: "Bypass granted" },
                  );
                }}
                className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-purple-500/10 hover:text-purple-300"
              >
                <Gift className="size-4" />
              </button>
              <form action={impersonateChurch.bind(null, c.id)}>
                <SubmitButton
                  size="sm"
                  pendingLabel="Entering…"
                  className="h-auto rounded-lg bg-teal-500/15 px-2.5 py-1.5 text-xs font-medium text-teal-300 shadow-none hover:bg-teal-500/25"
                >
                  <LogIn className="size-3.5" /> Enter
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={() => run(() => setChurchSuspended(c.id, !c.suspended), { pending: c.suspended ? "Reactivating…" : "Suspending…", success: c.suspended ? "Church reactivated" : "Church suspended" })}
                title={c.suspended ? "Reactivate" : "Suspend"}
                className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-amber-300"
              >
                {c.suspended ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
              </button>
              {!c.isDemo && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete ${c.name}? This permanently removes all their data.`))
                      run(() => deleteChurch(c.id), { pending: "Deleting…", success: "Church deleted" });
                  }}
                  title="Delete church"
                  className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-500">
            No churches match &ldquo;{q}&rdquo;.
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Church</th>
              <th className="px-4 py-3 font-medium">Sender ID</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">SMS</th>
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
                <td className="px-4 py-3">
                  {c.smsSenderId ? (
                    <div>
                      <div className="font-medium text-slate-200">
                        {c.smsSenderId}
                      </div>

                      <div
                        className={`text-xs ${c.smsSenderIdStatus === "approved"
                          ? "text-emerald-400"
                          : c.smsSenderIdStatus === "rejected"
                            ? "text-red-400"
                            : "text-amber-400"
                          }`}
                      >
                        {c.smsSenderIdStatus}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-300">{c.members}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    title="Grant SMS credits"
                    onClick={() => {
                      const v = prompt(`Grant SMS credits to ${c.name}:`, "500");
                      const n = Number(v);
                      if (n > 0) run(() => grantSmsCredits(c.id, n), { pending: "Granting…", success: `Granted ${n} credits` });
                    }}
                    className="rounded-md bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
                  >
                    {c.smsCredits.toLocaleString()} +
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-300">₵{c.givingThisMonth.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <select
                    defaultValue={c.plan}
                    onChange={(e) =>
                      run(() => setChurchPlan(c.id, e.target.value), {
                        pending: "Updating plan…",
                        success: "Plan updated",
                      })
                    }
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
                    {c.smsSenderId && c.smsSenderIdStatus === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            run(() => approveSenderId(c.id), {
                              pending: "Approving...",
                              success: "Sender ID approved",
                            })
                          }
                          className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25"
                        >
                          Approve
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            run(() => rejectSenderId(c.id), {
                              pending: "Rejecting...",
                              success: "Sender ID rejected",
                            })
                          }
                          className="rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      title="Gift free plan upgrade"
                      onClick={() => {
                        const plan = prompt(`Gift a free plan to ${c.name}.\nEnter plan (starter / pro / max):`, "max");
                        if (!plan || !["starter", "pro", "max"].includes(plan.trim().toLowerCase())) return;
                        run(
                          async () => {
                            const res = await grantPlanBypass(c.id, plan.trim().toLowerCase());
                            if (res && "error" in res) throw new Error(res.error);
                            if (res && "code" in res) alert(`Code: ${res.code}\n${res.phone ? `SMS sent to ${res.phone}` : "No phone on file — share code manually."}`);
                          },
                          { pending: "Sending bypass…", success: "Bypass granted" },
                        );
                      }}
                      className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-purple-500/10 hover:text-purple-300"
                    >
                      <Gift className="size-4" />
                    </button>
                    <form action={impersonateChurch.bind(null, c.id)}>
                      <SubmitButton
                        size="sm"
                        pendingLabel="Entering…"
                        className="h-auto rounded-lg bg-teal-500/15 px-2.5 py-1.5 text-xs font-medium text-teal-300 shadow-none hover:bg-teal-500/25"
                        title="Step into dashboard"
                      >
                        <LogIn className="size-3.5" /> Enter
                      </SubmitButton>
                    </form>
                    <button
                      type="button"
                      onClick={() =>
                        run(() => setChurchSuspended(c.id, !c.suspended), {
                          pending: c.suspended ? "Reactivating…" : "Suspending…",
                          success: c.suspended ? "Church reactivated" : "Church suspended",
                        })
                      }
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
                            run(() => deleteChurch(c.id), { pending: "Deleting…", success: "Church deleted" });
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
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
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
