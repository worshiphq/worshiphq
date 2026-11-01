"use client";

import { PhoneInput } from "@/components/ui/phone-input";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, ShieldAlert, Loader2, Pencil, Trash2, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  submitPaymentRequest, getPaymentRequestStatus, getGivingBanks, verifyGivingAccount,
  requestAccountChange, cancelAccountChange, cancelPaymentRequest, removePaymentAccount,
  getGivingFeeInfo, setGivingFeeChoice,
} from "@/app/actions/payment-request";
import { splitGift, type FeeMode } from "@/lib/giving/fees";
import { GIVING_CLOSED_MESSAGE, GIVING_PAUSED_INREVIEW_MESSAGE } from "@/lib/giving/availability";

type Status = Awaited<ReturnType<typeof getPaymentRequestStatus>>;
type FeeInfo = Awaited<ReturnType<typeof getGivingFeeInfo>>;
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


const cedis = (n: number) => `₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Live examples, worked out from this church's real fees, for both ways of paying so the church can compare. */
function FeeExamples({ info, mode }: { info: FeeInfo | null; mode: FeeMode }) {
  const [custom, setCustom] = useState("");
  const paystack = info?.paystackPercent ?? 1.95;
  const platform = info?.platformPercent ?? 0;
  const cap = info?.platformCap ?? 0;
  const amounts = [500, 3000, ...(Number(custom) > 0 ? [Number(custom)] : [])];
  const calc = (amount: number, m: FeeMode) => splitGift({ amount, mode: m, feePercent: paystack, platformPercent: platform, platformCap: cap });
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        {info?.planName ? <>Your plan is <b className="text-ink">{info.planName}</b>. </> : null}
        Paystack charges <b className="text-ink">{paystack}%</b>
        {platform > 0 ? <> and WorshipHQ charges <b className="text-ink">{platform}%</b>{info?.customPercent ? " (a fee set for your church)" : ""}{cap > 0 ? <>, never more than <b className="text-ink">{cedis(cap)}</b> on one gift</> : null}, about <b className="text-ink">{(paystack + platform).toFixed(2)}%</b> of each gift together</> : <>, and WorshipHQ adds no fee of its own</>}.
        Here is what that means for a gift:
      </p>
      <div className="overflow-hidden rounded-xl border border-line bg-surface text-sm">
        <div className="hidden grid-cols-[6rem_1fr_1fr] gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-ink-muted sm:grid">
          <div>A gift of</div>
          <div className={cn(mode === "giver" && "text-primary")}>If your givers pay the fee{mode === "giver" ? " (your choice)" : ""}</div>
          <div className={cn(mode === "church" && "text-primary")}>If your church pays the fee{mode === "church" ? " (your choice)" : ""}</div>
        </div>
        {amounts.map((a) => {
          const g = calc(a, "giver");
          const c = calc(a, "church");
          return (
            <div key={a} className="grid gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[6rem_1fr_1fr]">
              <div className="font-semibold text-ink">{cedis(a)}</div>
              <div className={cn("text-ink-muted", mode === "giver" && "text-ink")}>
                <span className="font-medium sm:hidden">Givers pay it: </span>
                The giver pays <b>{cedis(g.charge)}</b> ({cedis(a)} + {cedis(g.addedToGiver)} fee: Paystack {cedis(g.paystackFee)}{g.platformCut > 0 ? <>, WorshipHQ {cedis(g.platformCut)}</> : null}). Your church receives <b>{cedis(g.churchGets)}</b>.
              </div>
              <div className={cn("text-ink-muted", mode === "church" && "text-ink")}>
                <span className="font-medium sm:hidden">Church pays it: </span>
                The giver pays <b>{cedis(c.charge)}</b>. A fee of {cedis(c.transactionCharge)} (Paystack {cedis(c.paystackFee)}{c.platformCut > 0 ? <>, WorshipHQ {cedis(c.platformCut)}</> : null}) is taken off. Your church receives <b>{cedis(c.churchGets)}</b>.
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <label htmlFor="fee-try">Try your own amount: ₵</label>
        <input id="fee-try" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, "").slice(0, 9))} inputMode="decimal" placeholder="e.g. 1200"
          className="h-9 w-32 rounded-lg border border-line bg-surface px-3 text-sm text-ink" />
      </div>
      <p className="text-xs text-ink-faint">These are estimates worked out from the current fees. Paystack&apos;s own fee can differ by a pesewa. The giver always sees the exact total before paying.</p>
    </div>
  );
}

/** Plain words about fees and payouts, so a church knows what it is agreeing to before it submits. */
function FeeExplainer({ info, mode }: { info: FeeInfo | null; mode: FeeMode }) {
  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface-2 p-4 text-sm text-ink-muted">
      <div className="font-semibold text-ink">Before you submit: how online giving works</div>
      <FeeExamples info={info} mode={mode} />
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Whichever way you choose, the fee is <b className="text-ink">taken automatically</b> before the money is paid to you. You never have to pay it separately.</li>
        <li>Paystack pays out to the account you give us, <b className="text-ink">normally the next working day</b>. We confirm the details with you when we approve.</li>
        <li>You can change who pays the fee at any time in this tab. A change applies to gifts from then on.</li>
        <li>Before we approve, WorshipHQ checks that the account belongs to your church, and may call or video call you to confirm. Approval is not automatic, and we may ask for proof that you represent the church.</li>
        <li>Gifts are paid to the account you submitted, so check it carefully. If you want it changed later, WorshipHQ checks the new account first.</li>
        <li>Refunds and disputes on a gift are handled through Paystack, and the amount can be taken from your next payout.</li>
        <li>WorshipHQ may pause online giving for a church while it looks into a problem, such as a suspected fraud or a dispute.</li>
      </ul>
    </div>
  );
}

/** Who pays the payment fee: the giver (a little extra on top) or the church (taken out of the gift). */
function FeeChoice({ value, onChange, disabled }: { value: FeeMode; onChange: (m: FeeMode) => void; disabled?: boolean }) {
  const opt = (m: FeeMode, title: string, text: string) => (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm transition-colors", value === m ? "border-primary bg-primary/10" : "border-line bg-surface hover:bg-surface-2", disabled && "cursor-not-allowed opacity-60")}>
      <input type="radio" name="feeMode" value={m} checked={value === m} onChange={() => onChange(m)} disabled={disabled} className="mt-1 accent-[var(--color-primary)]" />
      <span><span className="font-semibold text-ink">{title}</span><span className="mt-0.5 block text-ink-muted">{text}</span></span>
    </label>
  );
  return (
    <div className="space-y-2">
      <Label>Who pays the payment fee? *</Label>
      {opt("giver", "Our givers pay it", "The giver pays a small processing fee on top, and your church receives the full gift. Givers see the exact total before they pay.")}
      {opt("church", "Our church pays it", "The giver pays exactly what they typed, and the fee comes out of the gift, so your church receives a little less.")}
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
  const [feeInfo, setFeeInfo] = useState<FeeInfo | null>(null);
  const [feeMode, setFeeMode] = useState<FeeMode>("giver");

  const load = () => {
    getGivingFeeInfo().then((f) => { setFeeInfo(f); setFeeMode(f.mode); }).catch(() => {});
    return getPaymentRequestStatus().then((s) => setStatus(s)).catch(() => setStatus(null));
  };
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
  // Applications (new sign-ups and account changes) can be paused platform-wide, e.g. while the payment
  // system is being upgraded. Existing approved giving keeps working. Unknown (feeInfo still loading) = open.
  const givingOpen = feeInfo?.applicationsOpen !== false;

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
            {givingOpen ? (
              <>
                We have received your request and will confirm it shortly. Giving starts as soon as it is approved.
                {st === "scheduled" && status.meetingDate && ` Meeting: ${new Date(status.meetingDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`}
              </>
            ) : (
              GIVING_PAUSED_INREVIEW_MESSAGE
            )}
          </p>
          <Details type={status.settlementType} bank={status.bankName} number={status.accountNumber} name={status.accountName} />
          {status.adminNotes && <p className="mt-3 text-sm text-ink-muted">{status.adminNotes}</p>}
          <details className="mt-4 rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">See the fees and how online giving works again</summary>
            <div className="mt-3"><FeeExplainer info={feeInfo} mode={feeMode} /></div>
          </details>
          {/* While approvals are paused, hide "Withdraw and edit": withdrawing would drop them to the apply form,
              which is closed, stranding them. They keep their place in the queue instead. */}
          {canManage && givingOpen && (
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

          {canManage && (
            <div className="mt-4 space-y-2 rounded-xl border border-line bg-surface p-4">
              <FeeChoice value={feeMode} onChange={(m) => { setFeeMode(m); act("fee", () => setGivingFeeChoice(m)); }} disabled={busy === "fee"} />
              <p className="text-xs text-ink-faint">{busy === "fee" ? "Saving…" : "A change applies to gifts from now on."}</p>
              <div className="pt-2"><FeeExamples info={feeInfo} mode={feeMode} /></div>
            </div>
          )}

          {canManage && !editing && !status.pendingAt && (
            <div className="mt-4 flex flex-wrap gap-2">
              {givingOpen && (
                <Button variant="secondary" size="sm" onClick={() => { setEditing(true); setPicked(null); setError(""); }}>
                  <Pencil className="size-4" /> Edit account
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={busy === "remove"}
                onClick={() => { if (confirm("Remove this payment account? Online giving will stop paying into it.")) act("remove", removePaymentAccount); }}>
                {busy === "remove" ? <><Loader2 className="size-4 animate-spin" /> Removing…</> : <><Trash2 className="size-4" /> Remove</>}
              </Button>
            </div>
          )}
          {canManage && !editing && !status.pendingAt && !givingOpen && (
            <p className="mt-3 text-xs text-ink-faint">Changing your payout account is paused for now while we upgrade our payment system. Your current account keeps working as normal.</p>
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
        <p className="text-xs text-ink-faint">Only the Main Admin or an Admin can set up or change where giving is paid.</p>
      )}

      {/* APPLICATIONS PAUSED (new sign-ups) */}
      {!suspended && showForm && canManage && !givingOpen && (
        <Banner tone="warning" icon={<Clock className="size-5" />} title="Online-giving applications are paused">
          <p className="mt-1.5 text-sm text-ink-muted">{GIVING_CLOSED_MESSAGE}</p>
        </Banner>
      )}

      {/* SET UP */}
      {!suspended && showForm && canManage && givingOpen && (
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
          <FeeExplainer info={feeInfo} mode={feeMode} />
          <SettlementPicker onChange={setPicked} />
          <FeeChoice value={feeMode} onChange={setFeeMode} />
          <div>
            <Label>Contact name *</Label>
            <Input name="contactName" required placeholder="Who should we reach out to?" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Phone</Label>
              <PhoneInput name="contactPhone" />
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
          <label className="flex items-start gap-2.5 text-sm text-ink-muted">
            <input type="checkbox" name="agree" required className="mt-1 size-4 accent-[var(--color-primary)]" />
            <span>I have read how online giving works, including the fees, who pays them and when payouts arrive, and I agree to the <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">WorshipHQ terms</a> for online giving on behalf of this church.</span>
          </label>
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
