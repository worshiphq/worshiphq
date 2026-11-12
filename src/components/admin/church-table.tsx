"use client";

import { useState } from "react";
import { Pager } from "@/components/admin/pager";
import { Ban, CheckCircle2, Trash2, Building2, Gift } from "lucide-react";
import type { ChurchRow } from "@/lib/data/admin";
import { SENDER_ID_UPDATE_OPTIONS, SENDER_ID_STATUS_LABEL } from "@/config/sender-id";
import {
  setChurchSuspended,
  setChurchPlan,
  deleteChurch,
  grantSmsCredits,
  removeSmsCredits,
  grantPlanBypass,
  approveSenderId,
  setChurchSmsCarrier,
  setSenderIdCarrier,
  sendSenderIdTest,
  type SenderIdNotice,
  sendSenderIdUpdate,
  rejectSenderId,
  setChurchSmsTier,
} from "@/app/actions/admin";
import { useFeedback } from "@/components/ui/feedback";
import { SupportAccessButton } from "@/components/admin/support-access-dialog";
import { LiveSearch, UrlSortTh, UrlFilter } from "@/components/admin/list-tools";

const PLANS = ["free", "starter", "pro", "max"];
const SMS_TIERS = ["B", "C", "D"];

/** Compact SMS-tier picker (Default = inherit site-wide). */
const CARRIER_LABEL: Record<string, string> = { hubtel: "Hubtel", nalo: "Nalo" };

/** Try a church's sender name on a carrier before approving it. Separate buttons for each person it can go to. */
function SenderIdTest({ church, run }: { church: ChurchRow; run: ReturnType<typeof useFeedback>["run"] }) {
  const [carrier, setCarrier] = useState(church.smsSenderIdProvider ?? "nalo");
  const send = (target: "church" | "me") => {
    if (target === "church" && !confirm(`Text ${church.name}'s Main Admin a test from ${church.smsSenderId}?`)) return;
    run(async () => {
      const res = await sendSenderIdTest(church.id, carrier, target);
      if (!res.ok) throw new Error(res.error);
    }, { pending: "Sending test...", success: target === "me" ? "Test sent to you. Check your phone" : "Test sent to the Main Admin" });
  };
  const btn = "rounded-md bg-sky-500/15 px-2 py-1 text-xs text-sky-300 hover:bg-sky-500/25";
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <label className="flex items-center gap-1">
        Test {church.smsSenderId} on
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          <option value="nalo" className="bg-slate-800">Nalo</option>
          <option value="hubtel" className="bg-slate-800">Hubtel</option>
        </select>
      </label>
      <button type="button" onClick={() => send("me")} className={btn}>Test to me</button>
      <button type="button" onClick={() => send("church")} className={btn}>Test to church admin</button>
    </div>
  );
}

/** What the approval or rejection text did, said plainly, so nobody has to wonder whether the church was told. */
function noticeMessage(what: string, n: SenderIdNotice): { text: string; type: "success" | "error" } {
  if (n.status === "sent") return { text: `${what}. Text sent to the church (${n.to}).`, type: "success" };
  if (n.status === "no-phone") return { text: `${what}, but nobody at the church has a verified phone, so NO text was sent. Tell them another way.`, type: "error" };
  if (n.status === "not-connected") return { text: `${what}. No text was sent: SMS is not connected where this is running.`, type: "error" };
  return { text: `${what}, but the text to the church (${n.to}) did NOT go: ${n.error}. Tell them another way.`, type: "error" };
}

function SmsTierSelect({ church, run }: { church: ChurchRow; run: ReturnType<typeof useFeedback>["run"] }) {
  return (
    <select
      defaultValue={church.smsTier ?? ""}
      onChange={(e) =>
        run(() => setChurchSmsTier(church.id, e.target.value), {
          pending: "Setting SMS tier…",
          success: e.target.value ? `SMS tier ${e.target.value}` : "SMS tier: site default",
        })
      }
      title="SMS pricing tier for this church"
      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
    >
      <option value="" className="bg-slate-800">SMS: Default</option>
      {SMS_TIERS.map((t) => <option key={t} value={t} className="bg-slate-800">SMS: {t}</option>)}
    </select>
  );
}

export function ChurchTable({ churches, q, total, page, pages, size, params = {} }: { churches: ChurchRow[]; q: string; total: number; page: number; pages: number; size: number; params?: Record<string, string | undefined> }) {
  const { run, toast } = useFeedback();
  // The server already searched every church and sent just this page, so there is nothing left to filter here.
  const filtered = churches;

  // Granting and taking back credits are defined once here and used by BOTH layouts below. They were
  // written inline in the mobile cards first, which meant the "take back" button did not exist at all
  // on a desktop screen - the kind of thing a shared handler makes impossible to repeat.
  /** Which carrier a church sends through, which approved its sender name, and a warning when those two differ. */
  const carrierControls = (c: ChurchRow) => {
    const carrier = c.smsProvider ?? "hubtel";
    const approved = !!c.smsSenderId && c.smsSenderIdStatus === "approved";
    const senderCarrier = c.smsSenderIdProvider ?? "hubtel";
    const sel = "rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400";
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <label className="flex items-center gap-1">
          Sends via
          <select
            value={carrier}
            aria-label={`Carrier for ${c.name}`}
            onChange={(e) => {
              const next = e.target.value;
              run(() => setChurchSmsCarrier(c.id, next), { pending: "Changing carrier...", success: `${c.name} now sends via ${CARRIER_LABEL[next]}` });
            }}
            className={sel}
          >
            <option value="hubtel" className="bg-slate-800">Hubtel</option>
            <option value="nalo" className="bg-slate-800">Nalo</option>
          </select>
        </label>
        {approved && (
          <label className="flex items-center gap-1">
            Sender approved on
            <select
              value={senderCarrier}
              aria-label={`Carrier that approved the sender name for ${c.name}`}
              onChange={(e) => {
                const next = e.target.value;
                run(() => setSenderIdCarrier(c.id, next), { pending: "Saving...", success: `Sender name marked as approved on ${CARRIER_LABEL[next]}` });
              }}
              className={sel}
            >
              <option value="hubtel" className="bg-slate-800">Hubtel</option>
              <option value="nalo" className="bg-slate-800">Nalo</option>
            </select>
          </label>
        )}
        {approved && senderCarrier !== carrier && (
          <span className="text-amber-300">
            {c.smsSenderId} is not approved on {CARRIER_LABEL[carrier]}, so texts go out under the WorshipHQ sender with the church name on top.
          </span>
        )}
      </div>
    );
  };

  const approve = (c: ChurchRow, carrier: "hubtel" | "nalo") =>
    run(async () => {
      const m = noticeMessage(`Sender ID approved on ${CARRIER_LABEL[carrier]}`, await approveSenderId(c.id, carrier));
      toast(m.text, m.type);
    }, { pending: "Approving and texting the church..." });
  /** Move a request to "in process": records it and texts the church in one step, so the two can never disagree. */
  const markInProcess = (c: ChurchRow) =>
    run(async () => {
      const r = await sendSenderIdUpdate(c.id, "submitted");
      if (!r.ok) throw new Error(`Not changed, and no text was sent: ${r.error}`);
      toast(`${c.name}'s sender name is now in process, and the church was texted.`, "success");
    }, { pending: "Marking in process and texting the church..." });
  const reject = (c: ChurchRow) =>
    run(async () => {
      const m = noticeMessage("Sender ID rejected", await rejectSenderId(c.id));
      toast(m.text, m.type);
    }, { pending: "Rejecting and texting the church..." });

  const grant = (c: ChurchRow) => {
    const v = prompt(`Grant SMS credits to ${c.name}:`, "500");
    const n = Number(v);
    if (n > 0) run(() => grantSmsCredits(c.id, n), { pending: "Granting…", success: `Granted ${n} credits` });
  };

  const take = (c: ChurchRow) => {
    const v = prompt(`Remove SMS credits from ${c.name} (they have ${(c.smsCredits ?? 0).toLocaleString()}):`, "500");
    const n = Number(v);
    if (!(n > 0)) return;
    // Your record, not theirs: the church's history only says credits were removed.
    const why = prompt("Why? (only you see this, in SMS records)", "Did not pay") ?? undefined;
    run(async () => {
      const res = await removeSmsCredits(c.id, n, why);
      if (!res.ok) throw new Error(res.error);
      if (res.clamped) toast(`Only ${res.taken} were left to remove. Balance is now ${res.balance}.`, "info");
    }, { pending: "Removing…", success: `Removed ${n} credits` });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-200">
          Churches <span className="text-slate-500">({total.toLocaleString()}{q ? ` matching` : ""})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <UrlFilter param="plan" label="Plan" options={[{ value: "", label: "All plans" }, { value: "free", label: "Free" }, { value: "starter", label: "Starter" }, { value: "pro", label: "Pro" }, { value: "max", label: "Max" }]} />
          <UrlFilter param="status" label="Status" options={[{ value: "", label: "Any status" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }]} />
          <UrlFilter param="sort" label="Sort" options={[{ value: "", label: "Newest first" }, { value: "members", label: "Most members" }, { value: "team", label: "Biggest team" }, { value: "sms", label: "Most SMS credits" }, { value: "name", label: "Name A-Z" }]} />
          <LiveSearch placeholder="Church, city, owner email or phone" />
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
                    {[c.city, c.country].filter(Boolean).join(", ") || "-"} · /{c.slug}
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
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">Sender ID:</span>
                <span className="font-medium text-slate-200">{c.smsSenderId}</span>
                <span className={c.smsSenderIdStatus === "approved" ? "text-emerald-400" : c.smsSenderIdStatus === "rejected" ? "text-red-400" : c.smsSenderIdStatus === "submitted" ? "text-sky-400" : "text-amber-400"}>
                  {SENDER_ID_STATUS_LABEL[c.smsSenderIdStatus] ?? c.smsSenderIdStatus}
                </span>
                {/* Tell them where it has got to. Between requesting and being approved the church
                    used to hear nothing, which is what makes people chase. */}
                {c.smsSenderIdStatus !== "approved" && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const key = e.target.value;
                      const pick = SENDER_ID_UPDATE_OPTIONS.find((u) => u.key === key);
                      e.target.value = "";
                      if (!pick) return;
                      if (!confirm(`Text ${c.name} "${pick.label}"?`)) return;
                      run(async () => {
                        const res = await sendSenderIdUpdate(c.id, key);
                        if (!res.ok) throw new Error(res.error);
                      }, { pending: "Texting the church…", success: "Update sent" });
                    }}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
                  >
                    <option value="" className="bg-slate-800">Send an update…</option>
                    {SENDER_ID_UPDATE_OPTIONS.map((u) => (
                      <option key={u.key} value={u.key} className="bg-slate-800">{u.label}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="mt-2">{carrierControls(c)}</div>
            {c.smsSenderId && <SenderIdTest church={c} run={run} />}

            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
              {c.smsSenderId && c.smsSenderIdStatus === "pending" && (
                <>
                  <button type="button" onClick={() => markInProcess(c)} className="rounded-md bg-sky-500/15 px-2 py-1 text-xs text-sky-300 hover:bg-sky-500/25">
                    Mark in process
                  </button>
                  {(["hubtel", "nalo"] as const).map((carrier) => (
                    <button
                      key={carrier}
                      type="button"
                      onClick={() => approve(c, carrier)}
                      className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25"
                    >
                      Approve on {CARRIER_LABEL[carrier]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => reject(c)}
                    className="rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25"
                  >
                    Reject
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => grant(c)}
                className="rounded-md bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
              >
                + SMS credits
              </button>
              <button
                type="button"
                onClick={() => take(c)}
                className="rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
              >
                - SMS credits
              </button>
              <select
                defaultValue={c.plan}
                onChange={(e) => run(() => setChurchPlan(c.id, e.target.value), { pending: "Updating plan…", success: "Plan updated" })}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs capitalize text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
              >
                {PLANS.map((p) => <option key={p} value={p} className="bg-slate-800">{p}</option>)}
              </select>
              <SmsTierSelect church={c} run={run} />
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
                      if (res && "code" in res) alert(`Code: ${res.code}\n${res.phone ? `SMS sent to ${res.phone}` : "No phone on file - share code manually."}`);
                    },
                    { pending: "Sending bypass…", success: "Bypass granted" },
                  );
                }}
                className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-purple-500/10 hover:text-purple-300"
              >
                <Gift className="size-4" />
              </button>
              <SupportAccessButton churchId={c.id} churchName={c.name} />
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
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-slate-500">
              <UrlSortTh label="Church" k="name" className="px-4 font-medium" />
              <th className="px-4 py-3 font-medium">Sender ID</th>
              <UrlSortTh label="Members" k="members" numeric className="px-4 font-medium" />
              <UrlSortTh label="SMS" k="sms" numeric className="px-4 font-medium" />
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
                        {[c.city, c.country].filter(Boolean).join(", ") || "-"} · /{c.slug}
                      </div>
                      {c.heardFrom && <div className="truncate text-xs text-teal-300/80">Heard via {c.heardFrom}</div>}
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
                    <span className="text-slate-500">-</span>
                  )}
                  <div className="mt-1.5">{carrierControls(c)}</div>
                  {c.smsSenderId && <SenderIdTest church={c} run={run} />}
                </td>
                <td className="px-4 py-3 text-slate-300">{c.members}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="tabular-nums text-slate-300">{c.smsCredits.toLocaleString()}</span>
                    <button
                      type="button"
                      title={`Grant SMS credits to ${c.name}`}
                      onClick={() => grant(c)}
                      className="grid size-6 place-items-center rounded-md bg-white/5 text-sm leading-none text-slate-200 hover:bg-white/10"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      title={`Take SMS credits back from ${c.name}`}
                      onClick={() => take(c)}
                      className="grid size-6 place-items-center rounded-md bg-rose-500/10 text-sm leading-none text-rose-300 hover:bg-rose-500/20"
                    >
                      -
                    </button>
                  </div>
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
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs capitalize text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p} className="bg-slate-800">{p}</option>
                    ))}
                  </select>
                  <div className="mt-1"><SmsTierSelect church={c} run={run} /></div>
                </td>
                <td className="px-4 py-3">
                  {c.suspended ? (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">Suspended</span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">Active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {c.smsSenderId && c.smsSenderIdStatus === "pending" && (
                      <>
                        <button type="button" onClick={() => markInProcess(c)} className="rounded-md bg-sky-500/15 px-2 py-1 text-xs text-sky-300 hover:bg-sky-500/25">
                          Mark in process
                        </button>
                        {(["hubtel", "nalo"] as const).map((carrier) => (
                          <button
                            key={carrier}
                            type="button"
                            onClick={() => approve(c, carrier)}
                            className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25"
                          >
                            Approve on {CARRIER_LABEL[carrier]}
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() => reject(c)}
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
                            if (res && "code" in res) alert(`Code: ${res.code}\n${res.phone ? `SMS sent to ${res.phone}` : "No phone on file - share code manually."}`);
                          },
                          { pending: "Sending bypass…", success: "Bypass granted" },
                        );
                      }}
                      className="grid size-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-purple-500/10 hover:text-purple-300"
                    >
                      <Gift className="size-4" />
                    </button>
                    <SupportAccessButton churchId={c.id} churchName={c.name} />
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

      <Pager page={page} pages={pages} total={total} size={size} path="/admin" params={{ q: q || undefined, ...params }} />
    </div>
  );
}
