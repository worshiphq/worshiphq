"use client";

import { useEffect, useState } from "react";
import {
  Clock, CheckCircle2, Phone, Mail, Calendar, MessageSquare,
  ChevronDown, ChevronUp, Building2, Loader2, Video, MapPin,
} from "lucide-react";
import {
  updatePaymentRequest, approveGivingSetup, setGivingFeeSettings,
  approveAccountChange, rejectAccountChange, revokeGivingAccess, restoreGivingAccess,
  deletePaymentAccount, adminEditPaymentAccount, adminGivingBanks, adminVerifyAccount,
} from "@/app/actions/admin";
import { AdminCard } from "./admin-shell";

type Fees = { platformPercent: number; donorBearsFee: boolean; paystackFeePercent: number };

function FeeSettings({ fees }: { fees: Fees }) {
  const [platformPercent, setPlatformPercent] = useState(String(fees.platformPercent));
  const [donorBearsFee, setDonorBearsFee] = useState(fees.donorBearsFee);
  const [paystackFeePercent, setPaystackFeePercent] = useState(String(fees.paystackFeePercent));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true); setSaved(false);
    await setGivingFeeSettings({ platformPercent: Number(platformPercent) || 0, donorBearsFee, paystackFeePercent: Number(paystackFeePercent) || 0 });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <AdminCard className="p-5">
      <h2 className="font-semibold text-slate-100">Giving fees</h2>
      <p className="mt-0.5 text-xs text-slate-400">Applies to every church&apos;s online giving. New subaccounts use the platform split below.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-xs text-slate-400">
          WorshipHQ split (%)
          <input value={platformPercent} onChange={(e) => setPlatformPercent(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
            className="mt-1 block h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100" />
          <span className="mt-1 block text-[11px] text-slate-500">0 = church keeps all (recommended)</span>
        </label>
        <label className="text-xs text-slate-400">
          Paystack fee (%) for gross-up
          <input value={paystackFeePercent} onChange={(e) => setPaystackFeePercent(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
            className="mt-1 block h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100" />
          <span className="mt-1 block text-[11px] text-slate-500">Ghana ≈ 1.95</span>
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Who bears Paystack&apos;s fee
          <button type="button" onClick={() => setDonorBearsFee((v) => !v)}
            className={`mt-1 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium ${donorBearsFee ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-800 text-slate-200"}`}>
            {donorBearsFee ? "Donor pays (church gets full gift)" : "Church bears it"}
          </button>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50">
          {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save fee settings"}
        </button>
        {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
      </div>
    </AdminCard>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  scheduled: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-purple-500/15 text-purple-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  declined: "bg-red-500/15 text-red-400",
  revoked: "bg-red-500/20 text-red-300",
  removed: "bg-slate-500/20 text-slate-400",
  cancelled: "bg-slate-500/20 text-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  scheduled: "Meeting Scheduled",
  in_progress: "In Progress",
  completed: "Approved",
  declined: "Declined",
  revoked: "Revoked",
  removed: "Removed by church",
  cancelled: "Withdrawn",
};

type Picked = { settlementType: "momo" | "bank"; bankCode: string; bankName: string; accountNumber: string; accountName: string };

/** SuperAdmin version of the provider + number + verify picker. */
function AdminPicker({ onChange }: { onChange: (v: Picked | null) => void }) {
  const [type, setType] = useState<"momo" | "bank">("momo");
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setBankCode(""); setName(""); setErr(""); onChange(null);
    adminGivingBanks(type).then((r) => { if (!cancelled) { setBanks(r.ok ? r.banks : []); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const bankName = banks.find((b) => b.code === bankCode)?.name ?? "";
  const reset = () => { setName(""); setErr(""); onChange(null); };
  const field = "h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100";

  async function verify() {
    setErr(""); setName(""); onChange(null);
    if (!bankCode || !number.trim()) { setErr("Choose a provider and enter the number."); return; }
    setVerifying(true);
    const r = await adminVerifyAccount(number.trim(), bankCode);
    setVerifying(false);
    if (r.ok) { setName(r.accountName); onChange({ settlementType: type, bankCode, bankName, accountNumber: number.trim().replace(/\s+/g, ""), accountName: r.accountName }); }
    else setErr(r.error);
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
      <div className="flex gap-2">
        {(["momo", "bank"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`h-8 flex-1 rounded-lg border text-xs font-medium ${type === t ? "border-teal-500/50 bg-teal-500/10 text-teal-300" : "border-slate-700 text-slate-400"}`}>
            {t === "momo" ? "Mobile Money" : "Bank"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={bankCode} disabled={loading} onChange={(e) => { setBankCode(e.target.value); reset(); }} className={field}>
          <option value="">{loading ? "Loading…" : "- Choose -"}</option>
          {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
        <input value={number} onChange={(e) => { setNumber(e.target.value); reset(); }} inputMode="numeric" placeholder="Number"
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} className={field} />
      </div>
      {name ? (
        <p className="text-sm text-emerald-400">✓ Name on account: <span className="font-semibold">{name}</span></p>
      ) : (
        <div className="flex items-center gap-3">
          <button type="button" onClick={verify} disabled={verifying || !bankCode || !number.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-40">
            {verifying ? <><Loader2 className="size-3.5 animate-spin" /> Checking…</> : "Verify account"}
          </button>
          {err && <span className="text-xs text-red-400">{err}</span>}
        </div>
      )}
    </div>
  );
}

function PayoutDetails({ type, bank, number, name }: { type: string | null; bank: string | null; number: string | null; name: string | null }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-sm text-slate-200">
      <div><span className="text-slate-500">Type</span><br />{type === "momo" ? "Mobile Money" : "Bank"}</div>
      <div><span className="text-slate-500">{type === "momo" ? "Provider" : "Bank"}</span><br />{bank || "-"}</div>
      <div><span className="text-slate-500">Number</span><br />{number || "-"}</div>
      <div><span className="text-slate-500">Name on account</span><br />{name || "-"}</div>
    </div>
  );
}

/** Everything SuperAdmin can do to a church's payout account, in one place. */
function PayoutPanel({ req }: { req: any }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);

  const hasAccount = !!(req.bankCode && req.accountNumber && req.accountName);
  const code: string | null = req.church?.paystackSubaccountCode ?? null;
  const blocked = !!req.church?.givingBlocked || req.status === "revoked";
  const terminal = ["removed", "cancelled"].includes(req.status);
  if (!hasAccount && !req.pendingAt) return null;

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; code?: string }>, okText: string, after?: () => void) {
    setBusy(key); setMsg(null);
    try {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.code ? `${okText} (${r.code})` : okText } : { ok: false, text: r.error ?? "Something went wrong." });
      if (r.ok) after?.();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Something went wrong." });
    }
    setBusy(null);
  }

  const btn = "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-semibold text-slate-300">Payout account (as the church entered it)</div>
        {code && !blocked && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">Live on Paystack</span>}
        {blocked && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-300">Giving blocked</span>}
        {!code && !terminal && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">No subaccount yet</span>}
      </div>

      {hasAccount && (
        <>
          <PayoutDetails type={req.settlementType} bank={req.bankName} number={req.accountNumber} name={req.accountName} />
          {code && <p className="text-[11px] text-slate-500">Paystack subaccount: {code}</p>}
        </>
      )}

      {req.pendingAt && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
          <div className="text-xs font-semibold text-amber-300">The church asked to change its account to:</div>
          <PayoutDetails type={req.pendingSettlementType} bank={req.pendingBankName} number={req.pendingAccountNumber} name={req.pendingAccountName} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} className={`${btn} bg-emerald-500 text-white hover:bg-emerald-400`}
              onClick={() => run("approveChange", () => approveAccountChange(req.id), "Change approved and updated on Paystack.")}>
              {busy === "approveChange" ? <><Loader2 className="size-4 animate-spin" /> Updating Paystack…</> : "Approve change"}
            </button>
            <button type="button" disabled={!!busy} className={`${btn} bg-white/10 text-white hover:bg-white/15`}
              onClick={() => { const note = window.prompt("Reason for declining (shown to the church):") ?? ""; run("rejectChange", () => rejectAccountChange(req.id, note), "Change declined."); }}>
              {busy === "rejectChange" ? <><Loader2 className="size-4 animate-spin" /> Declining…</> : "Decline change"}
            </button>
          </div>
        </div>
      )}

      {!terminal && hasAccount && (
        <div className="flex flex-wrap gap-2">
          {!code && (
            <button type="button" disabled={!!busy} className={`${btn} bg-emerald-500 text-white hover:bg-emerald-400`}
              onClick={() => run("approve", () => approveGivingSetup(req.id), "Subaccount created. Giving now pays this church")}>
              {busy === "approve" ? <><Loader2 className="size-4 animate-spin" /> Creating subaccount…</> : "Approve & create subaccount"}
            </button>
          )}
          <button type="button" disabled={!!busy} className={`${btn} bg-white/10 text-white hover:bg-white/15`} onClick={() => { setEditing((v) => !v); setPicked(null); }}>
            {editing ? "Close editor" : "Edit account"}
          </button>
          {code && !blocked && (
            <button type="button" disabled={!!busy} className={`${btn} bg-amber-500/15 text-amber-300 hover:bg-amber-500/25`}
              onClick={() => { const reason = window.prompt("Why are you revoking this church's giving? (kept in the notes)") ; if (reason === null) return; run("revoke", () => revokeGivingAccess(req.id, reason), "Revoked. The subaccount is switched off at Paystack and giving is blocked."); }}>
              {busy === "revoke" ? <><Loader2 className="size-4 animate-spin" /> Revoking…</> : "Revoke access"}
            </button>
          )}
          {blocked && (
            <button type="button" disabled={!!busy} className={`${btn} bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25`}
              onClick={() => run("restore", () => restoreGivingAccess(req.id), "Access restored. The subaccount is active again.")}>
              {busy === "restore" ? <><Loader2 className="size-4 animate-spin" /> Restoring…</> : "Restore access"}
            </button>
          )}
          <button type="button" disabled={!!busy} className={`${btn} bg-red-500/15 text-red-300 hover:bg-red-500/25`}
            onClick={() => { if (window.confirm("Delete this payout account? It is deactivated on Paystack first, then removed here. The church can set up again afterwards.")) run("delete", () => deletePaymentAccount(req.id), "Deleted. The subaccount was deactivated on Paystack."); }}>
            {busy === "delete" ? <><Loader2 className="size-4 animate-spin" /> Deleting…</> : "Delete"}
          </button>
        </div>
      )}

      {editing && (
        <div className="space-y-3">
          <AdminPicker onChange={setPicked} />
          <button type="button" disabled={!picked || !!busy} className={`${btn} bg-teal-500 text-white hover:bg-teal-400`}
            onClick={() => {
              const fd = new FormData();
              fd.set("settlementType", picked!.settlementType); fd.set("bankCode", picked!.bankCode); fd.set("bankName", picked!.bankName);
              fd.set("accountNumber", picked!.accountNumber); fd.set("accountName", picked!.accountName);
              run("edit", () => adminEditPaymentAccount(req.id, fd), code ? "Saved and updated on Paystack." : "Saved.", () => setEditing(false));
            }}>
            {busy === "edit" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save new account"}
          </button>
        </div>
      )}

      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}

const MEETING_TYPES = [
  { value: "call", label: "Phone Call", icon: Phone },
  { value: "video", label: "Video Call", icon: Video },
  { value: "in_person", label: "In Person", icon: MapPin },
];

export function PaymentRequestsManager({ requests, fees }: { requests: any[]; fees: Fees }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "pending");
  const active = requests.filter((r) => ["scheduled", "in_progress"].includes(r.status));
  const done = requests.filter((r) => ["completed", "declined", "revoked", "removed", "cancelled"].includes(r.status));

  return (
    <div className="space-y-8">
      <FeeSettings fees={fees} />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <AdminCard className="p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{pending.length}</div>
          <div className="text-xs text-slate-400">Pending</div>
        </AdminCard>
        <AdminCard className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{active.length}</div>
          <div className="text-xs text-slate-400">Active</div>
        </AdminCard>
        <AdminCard className="p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{done.filter((r) => r.status === "completed").length}</div>
          <div className="text-xs text-slate-400">Completed</div>
        </AdminCard>
        <AdminCard className="p-4 text-center">
          <div className="text-2xl font-bold text-slate-300">{requests.length}</div>
          <div className="text-xs text-slate-400">Total</div>
        </AdminCard>
      </div>

      {requests.length === 0 ? (
        <AdminCard className="py-12 text-center">
          <Building2 className="mx-auto size-8 text-slate-600" />
          <p className="mt-2 text-sm text-slate-400">No payment requests yet.</p>
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              expanded={expandedId === req.id}
              onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ request: req, expanded, onToggle }: {
  request: any; expanded: boolean; onToggle: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleUpdate(formData: FormData) {
    setSaving(true);
    await updatePaymentRequest(req.id, formData);
    setSaving(false);
  }

  return (
    <AdminCard className="overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-4 p-4 text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-teal-400 flex-shrink-0" />
            <span className="font-medium text-slate-100 truncate">{req.church?.name || "Unknown"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[req.status]}`}>
              {STATUS_LABELS[req.status]}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
            <span>{req.contactName}</span>
            {req.contactPhone && <span className="flex items-center gap-1"><Phone className="size-3" />{req.contactPhone}</span>}
            {req.contactEmail && <span className="flex items-center gap-1"><Mail className="size-3" />{req.contactEmail}</span>}
            <span className="flex items-center gap-1"><Clock className="size-3" />{new Date(req.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="size-4 text-slate-500" /> : <ChevronDown className="size-4 text-slate-500" />}
      </button>

      {expanded && (
        <>
        <div className="border-t border-slate-700/50 p-4 pb-0">
          <PayoutPanel req={req} />
        </div>
        <form action={handleUpdate} className="p-4 space-y-4">
          {req.needs && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Church&apos;s Needs</label>
              <p className="rounded-lg bg-slate-800/50 p-3 text-sm text-slate-200">{req.needs}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
              <select name="status" defaultValue={req.status} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
                <option value="pending">Pending</option>
                <option value="scheduled">Meeting Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="declined">Declined</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Meeting Type</label>
              <select name="meetingType" defaultValue={req.meetingType || ""} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
                <option value="">-</option>
                {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Meeting Date</label>
              <input
                type="datetime-local" name="meetingDate"
                defaultValue={req.meetingDate ? new Date(req.meetingDate).toISOString().slice(0, 16) : ""}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Paystack Sub-account ID</label>
              <input name="paystackSubId" defaultValue={req.paystackSubId || ""} placeholder="ACCT_xxx"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" />
              <p className="mt-1 text-[11px]">
                {req.church?.paystackSubaccountCode ? (
                  <span className="text-emerald-400">✓ Live - this church&apos;s giving currently splits to {req.church.paystackSubaccountCode}</span>
                ) : (
                  <span className="text-amber-400">Not live yet - giving still goes to the main WorshipHQ account. Save to activate.</span>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">USSD Code</label>
              <input name="ussdCode" defaultValue={req.ussdCode || ""} placeholder="*713*xxx#"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Payment Portal URL</label>
              <input name="portalUrl" defaultValue={req.portalUrl || ""} placeholder="https://paystack.com/pay/xxx"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Admin Notes</label>
            <textarea name="adminNotes" defaultValue={req.adminNotes || ""} rows={3} placeholder="Internal notes..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 resize-y" />
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Saving..." : "Update Request"}
            </button>
          </div>
        </form>
        </>
      )}
    </AdminCard>
  );
}
