"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, ShieldAlert, Loader2, Pencil, Trash2, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { phoneValidityMessage } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  submitPaymentRequest, getPaymentRequestStatus, getGivingBanks, verifyGivingAccount,
  requestAccountChange, cancelAccountChange, cancelPaymentRequest, removePaymentAccount,
} from "@/app/actions/payment-request";

type Status = Awaited<ReturnType<typeof getPaymentRequestStatus>>;
type Settlement = { settlementType: "momo" | "bank"; bankCode: string; bankName: string; accountNumber: string; accountName: string };

/** The exact details the church typed in. The Paystack subaccount code is never shown. */
function Details({ type, bank, number, name }: { type: string | null; bank: string | null; number: string | null; name: string | null }) {
  const rows: [string, string | null][] = [
    ["Pays into", type === "momo" ? "Mobile Money" : "Bank account"],
    [type === "momo" ? "Provider" : "Bank", bank],
    [type === "momo" ? "Mobile Money number" : "Account number", number],
    ["Name on account", name],
  ];
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-ink-faint">{k}</dt>
          <dd className="font-medium text-ink">{v || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pick Mobile Money or a bank, choose the provider, enter the number, and verify the name. */
function SettlementPicker({ onChange }: { onChange: (v: Settlement | null) => void }) {
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
    getGivingBanks(type).then((res) => {
      if (cancelled) return;
      setBanks(res.ok ? res.banks : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const bankName = banks.find((b) => b.code === bankCode)?.name ?? "";
  const reset = () => { setName(""); setErr(""); onChange(null); };

  async function verify() {
    setErr(""); setName(""); onChange(null);
    if (!bankCode || !number.trim()) { setErr("Choose a provider and enter the number."); return; }
    setVerifying(true);
    const res = await verifyGivingAccount(number.trim(), bankCode);
    setVerifying(false);
    if (res.ok) {
      setName(res.accountName || "");
      onChange({ settlementType: type, bankCode, bankName, accountNumber: number.trim().replace(/\s+/g, ""), accountName: res.accountName || "" });
    } else setErr(res.error || "Could not verify that account.");
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-sm font-semibold">Where should giving pay into?</div>
      <p className="mt-0.5 text-xs text-ink-muted">Choose the account your members&rsquo; gifts are paid to. We check the name on it before it is approved.</p>

      <div className="mt-3 flex gap-2">
        {(["momo", "bank"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={cn("h-10 flex-1 rounded-xl border text-sm font-medium transition-colors",
              type === t ? "border-primary bg-primary/10 text-primary-bright" : "border-line text-ink-muted hover:bg-surface-2")}>
            {t === "momo" ? "Mobile Money" : "Bank account"}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{type === "momo" ? "Provider" : "Bank"}</Label>
          <select value={bankCode} disabled={loading} onChange={(e) => { setBankCode(e.target.value); reset(); }}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-primary/50 disabled:opacity-60">
            <option value="">{loading ? "Loading…" : type === "momo" ? "- Choose provider -" : "- Choose bank -"}</option>
            {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <Label>{type === "momo" ? "Mobile Money number" : "Account number"}</Label>
          <Input value={number} onChange={(e) => { setNumber(e.target.value); reset(); }} inputMode="numeric"
            placeholder={type === "momo" ? "024 000 0000" : "Account number"} />
        </div>
      </div>

      {name ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" /> Name on account: <span className="font-semibold">{name}</span>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={verify} disabled={verifying || !bankCode || !number.trim()}>
            {verifying ? <><Loader2 className="size-4 animate-spin" /> Checking the name…</> : "Verify account"}
          </Button>
          {err && <span className="text-xs text-danger">{err}</span>}
        </div>
      )}
    </div>
  );
}

function Banner({ tone, icon, title, children }: { tone: "success" | "warning" | "danger"; icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  const cls = {
    success: "border-success/30 bg-success/10",
    warning: "border-warning/30 bg-warning/10",
    danger: "border-danger/30 bg-danger/10",
  }[tone];
  const text = { success: "text-success", warning: "text-warning", danger: "text-danger" }[tone];
  return (
    <div className={cn("rounded-2xl border p-5", cls)}>
      <div className={cn("flex items-center gap-2 font-semibold", text)}>{icon}{title}</div>
      {children}
    </div>
  );
}

export function OnlinePaymentsTab({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<Settlement | null>(null);
  const [justSent, setJustSent] = useState(false);

  const load = () => getPaymentRequestStatus().then((s) => setStatus(s)).catch(() => setStatus(null));
  useEffect(() => { load(); }, []);

  async function act(key: string, fn: () => Promise<object | undefined>, after?: () => void) {
    setBusy(key); setError("");
    try {
      const res = (await fn()) as { error?: string } | undefined;
      if (res?.error) setError(res.error);
      else { after?.(); await load(); }
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    }
    setBusy(null);
  }

  function formFrom(fd: FormData, s: Settlement) {
    fd.set("settlementType", s.settlementType); fd.set("bankCode", s.bankCode); fd.set("bankName", s.bankName);
    fd.set("accountNumber", s.accountNumber); fd.set("accountName", s.accountName);
    return fd;
  }

  if (status === undefined) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Loading your payment settings…</div>
      </Card>
    );
  }

  const st = status?.status;
  const inReview = st === "pending" || st === "scheduled" || st === "in_progress";
  const approved = st === "completed";
  const suspended = st === "revoked" || status?.givingBlocked;
  const showForm = !status || st === "declined";

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-bright"><Wallet className="size-5" /></div>
        <div>
          <h3 className="font-display text-lg font-semibold">Online giving</h3>
          <p className="mt-0.5 text-sm text-ink-muted">Members give by Mobile Money or card, and every gift is paid straight into the account you choose here.</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {/* SUSPENDED */}
      {suspended && (
        <Banner tone="danger" icon={<ShieldAlert className="size-5" />} title="Online giving is suspended">
          <p className="mt-1.5 text-sm text-ink-muted">Giving to your church is paused. Please contact WorshipHQ support to find out why and to have it restored.</p>
          {status && <Details type={status.settlementType} bank={status.bankName} number={status.accountNumber} name={status.accountName} />}
        </Banner>
      )}

      {/* IN REVIEW */}
      {!suspended && inReview && status && (
        <Banner tone="warning" icon={<Clock className="size-5" />} title="In review">
          <p className="mt-1.5 text-sm text-ink-muted">
            We have received your request and will confirm it shortly. Giving starts as soon as it is approved.
            {st === "scheduled" && status.meetingDate && ` Meeting: ${new Date(status.meetingDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`}
          </p>
          <Details type={status.settlementType} bank={status.bankName} number={status.accountNumber} name={status.accountName} />
          {status.adminNotes && <p className="mt-3 text-sm text-ink-muted">{status.adminNotes}</p>}
          {canManage && (
            <Button className="mt-4" variant="secondary" size="sm" disabled={busy === "cancel"}
              onClick={() => { if (confirm("Withdraw this request? You can submit a new one right after.")) act("cancel", cancelPaymentRequest); }}>
              {busy === "cancel" ? <><Loader2 className="size-4 animate-spin" /> Withdrawing…</> : "Withdraw and edit"}
            </Button>
          )}
        </Banner>
      )}

      {/* APPROVED */}
      {!suspended && approved && status && (
        <Banner tone="success" icon={<CheckCircle2 className="size-5" />} title="Approved - online giving is on">
          <p className="mt-1.5 text-sm text-ink-muted">Gifts your members give online are paid into this account.</p>
          <Details type={status.settlementType} bank={status.bankName} number={status.accountNumber} name={status.accountName} />

          {status.pendingAt && (
            <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-warning"><Clock className="size-4" /> Change in review</div>
              <p className="mt-1 text-xs text-ink-muted">Your current account keeps working until the new one is approved.</p>
              <Details type={status.pendingSettlementType} bank={status.pendingBankName} number={status.pendingAccountNumber} name={status.pendingAccountName} />
              {canManage && (
                <Button className="mt-3" variant="secondary" size="sm" disabled={busy === "cancelchange"}
                  onClick={() => act("cancelchange", cancelAccountChange)}>
                  {busy === "cancelchange" ? <><Loader2 className="size-4 animate-spin" /> Cancelling…</> : "Cancel change"}
                </Button>
              )}
            </div>
          )}

          {canManage && !editing && !status.pendingAt && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setEditing(true); setPicked(null); setError(""); }}>
                <Pencil className="size-4" /> Edit account
              </Button>
              <Button variant="ghost" size="sm" disabled={busy === "remove"}
                onClick={() => { if (confirm("Remove this payment account? Online giving will stop paying into it.")) act("remove", removePaymentAccount); }}>
                {busy === "remove" ? <><Loader2 className="size-4 animate-spin" /> Removing…</> : <><Trash2 className="size-4" /> Remove</>}
              </Button>
            </div>
          )}

          {editing && canManage && (
            <div className="mt-4 space-y-3">
              <SettlementPicker onChange={setPicked} />
              <p className="text-xs text-ink-faint">For your protection, a new account is checked by WorshipHQ before it is used. Your current account keeps working until then.</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={!picked || busy === "change"}
                  onClick={() => act("change", () => requestAccountChange(formFrom(new FormData(), picked!)), () => setEditing(false))}>
                  {busy === "change" ? <><Loader2 className="size-4 animate-spin" /> Submitting…</> : "Submit change for approval"}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === "change"} onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </Banner>
      )}

      {!canManage && (
        <p className="text-xs text-ink-faint">Only an Owner or Admin can set up or change where giving is paid.</p>
      )}

      {/* SET UP */}
      {!suspended && showForm && canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!picked) return;
            const fd = formFrom(new FormData(e.currentTarget), picked);
            act("submit", () => submitPaymentRequest(fd), () => setJustSent(true));
          }}
          className="space-y-4"
        >
          {st === "declined" && (
            <Banner tone="danger" icon={<ShieldAlert className="size-5" />} title="Your last request was not approved">
              {status?.adminNotes && <p className="mt-1.5 text-sm text-ink-muted">{status.adminNotes}</p>}
            </Banner>
          )}
          <SettlementPicker onChange={setPicked} />
          <div>
            <Label>Contact name *</Label>
            <Input name="contactName" required placeholder="Who should we reach out to?" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Phone</Label>
              <Input name="contactPhone" type="tel" placeholder="+233..." onChange={(e) => e.target.setCustomValidity("")} onBlur={(e) => e.target.setCustomValidity(phoneValidityMessage(e.target.value))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="contactEmail" type="email" placeholder="you@church.org" />
            </div>
          </div>
          <div>
            <Label>Anything else? (optional)</Label>
            <textarea name="needs" rows={2} placeholder="USSD code, QR codes, or anything specific you'd like."
              className="flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <Button type="submit" disabled={busy === "submit" || !picked}>
            {busy === "submit" ? <><Loader2 className="size-4 animate-spin" /> Submitting…</> : "Submit for approval"}
          </Button>
          {!picked && <p className="text-xs text-ink-faint">Verify the account above to submit.</p>}
          {justSent && <p className="text-sm text-success">Submitted. You will see its progress here.</p>}
        </form>
      )}
    </Card>
  );
}
