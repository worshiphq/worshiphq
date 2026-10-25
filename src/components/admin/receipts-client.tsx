"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Download, Mail, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, Send, Eye, Building2, Settings2, Sparkles, PenLine, Upload } from "lucide-react";
import { AdminCard } from "@/components/admin/admin-shell";
import { useFeedback } from "@/components/ui/feedback";
import {
  createManualReceipt, payReceiptBalance, saveReceiptDetails, sendReceiptEmail,
  type ReceiptsPageData, type ReceiptRow,
} from "@/app/actions/admin-receipts";
import { CURRENCIES, PAYMENT_METHODS, SIGNATURE_MAX_CHARS, money, round2, type ReceiptBrand, type ReceiptSettings, type ReceiptSheet } from "@/lib/receipts/types";
import { cn } from "@/lib/utils";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${btn} bg-teal-500 text-slate-950 hover:bg-teal-400`;
const ghost = `${btn} border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10`;
const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/60 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-slate-400";

type FormItem = { description: string; detail: string; qty: string; unit: string };
type Form = {
  brand: ReceiptBrand; sheet: ReceiptSheet; churchId: string;
  toName: string; toOrg: string; toEmail: string; toPhone: string; toAddress: string;
  currency: "GHS" | "USD" | "EUR" | "GBP"; items: FormItem[]; discountMode: "pct" | "amount" | "price"; discountVal: string; paidFull: boolean; paid: string;
  method: string; reference: string; notes: string; signatureLines: boolean; issuedOn: string; sendTo: string;
};

const todayYmd = () => new Date().toISOString().slice(0, 10);
const blankItem = (): FormItem => ({ description: "", detail: "", qty: "1", unit: "" });
const blankForm = (): Form => ({
  brand: "worshiphq", sheet: "a4", churchId: "", toName: "", toOrg: "", toEmail: "", toPhone: "", toAddress: "",
  currency: "GHS", items: [blankItem()], discountMode: "amount", discountVal: "", paidFull: true, paid: "", method: "Mobile Money", reference: "", notes: "",
  signatureLines: false, issuedOn: todayYmd(), sendTo: "",
});
const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const dateShort = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });
const KIND: Record<string, string> = { manual: "By hand", registration: "Free welcome", upgrade: "Upgrade", gift: "Gift" };

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[]; label: string }) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={cn("rounded-lg border px-3 py-2 text-left text-sm transition-colors", value === o.value ? "border-teal-500/70 bg-teal-500/15 text-teal-200" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10")}
          >
            <div className="font-medium">{o.label}</div>
            {o.hint && <div className="text-[11px] opacity-70">{o.hint}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReceiptsClient({ data }: { data: ReceiptsPageData }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [form, setForm] = useState<Form>(blankForm);
  const [busy, setBusy] = useState<"create" | null>(null);
  const [created, setCreated] = useState<{ id: string; number: string; email: string; emailError?: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [resend, setResend] = useState<{ id: string; to: string } | null>(null);
  const [resending, setResending] = useState(false);
  const urlRef = useRef<string | null>(null);
  const [pay, setPay] = useState<{ id: string; amount: string; method: string; reference: string; sendTo: string } | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i: number, patch: Partial<FormItem>) => setForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));

  const totals = useMemo(() => {
    const subtotal = round2(form.items.reduce((t, i) => t + round2(num(i.qty) * num(i.unit)), 0));
    // The discount can be typed as a percentage, an amount, or the price they will pay. Whichever was typed last is the source; the others follow.
    const wanted = form.discountMode === "pct" ? (subtotal * Math.min(num(form.discountVal), 100)) / 100 : form.discountMode === "price" ? (form.discountVal.trim() === "" ? 0 : subtotal - num(form.discountVal)) : num(form.discountVal);
    const discount = round2(Math.min(Math.max(wanted, 0), subtotal));
    const total = round2(subtotal - discount);
    const paid = form.paidFull ? total : round2(num(form.paid));
    return { subtotal, discount, total, paid, balance: round2(Math.max(total - paid, 0)) };
  }, [form.items, form.discountMode, form.discountVal, form.paidFull, form.paid]);
  const pctOff = totals.subtotal > 0 ? round2((totals.discount / totals.subtotal) * 100) : 0;
  const shown = {
    pct: form.discountMode === "pct" ? form.discountVal : totals.discount > 0 ? String(pctOff) : "",
    amount: form.discountMode === "amount" ? form.discountVal : totals.discount > 0 ? String(totals.discount) : "",
    price: form.discountMode === "price" ? form.discountVal : totals.discount > 0 ? String(round2(totals.subtotal - totals.discount)) : "",
  };
  const setDiscount = (mode: Form["discountMode"], v: string) => setForm((f) => ({ ...f, discountMode: mode, discountVal: v }));

  const payload = useMemo(() => ({
    brand: form.brand, sheet: form.sheet, churchId: form.churchId || null,
    toName: form.toName, toOrg: form.toOrg, toEmail: form.toEmail, toPhone: form.toPhone, toAddress: form.toAddress,
    currency: form.currency,
    items: form.items.filter((i) => i.description.trim()).map((i) => ({ description: i.description, detail: i.detail, qty: num(i.qty) || 1, unit: num(i.unit) })),
    discount: totals.discount, paid: totals.paid, method: form.method, reference: form.reference, notes: form.notes,
    signatureLines: form.signatureLines, issuedOn: form.issuedOn || undefined,
  }), [form, totals.discount, totals.paid]);
  const payloadKey = JSON.stringify(payload);

  // Live preview: redraw a moment after the last keystroke.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await fetch("/api/admin/receipts/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: payloadKey, signal: ctrl.signal });
        if (res.ok) {
          const url = URL.createObjectURL(await res.blob());
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = url;
          setPreviewUrl(url);
          setPreviewError("");
        } else {
          const j = await res.json().catch(() => ({}));
          setPreviewError(j.error ?? "Could not draw the preview.");
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setPreviewError("Could not draw the preview.");
      } finally {
        if (!ctrl.signal.aborted) setPreviewing(false);
      }
    }, 600);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [payloadKey]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  function pickChurch(id: string) {
    const c = data.churches.find((x) => x.id === id);
    setForm((f) => c ? { ...f, churchId: id, toName: c.contact || c.name, toOrg: c.name, toEmail: c.email, toPhone: c.phone, sendTo: c.email || f.sendTo } : { ...f, churchId: "" });
  }

  async function create() {
    setFormError("");
    if (!form.toName.trim()) return setFormError("Who is the receipt for? Add a name.");
    if (!payload.items.length) return setFormError("Add at least one line with a description.");
    if (totals.total > 0 && totals.paid <= 0) return setFormError("Enter the amount paid.");
    setBusy("create");
    try {
      const res = await createManualReceipt(payload, form.sendTo.trim() || undefined);
      if (!res.ok) { setFormError(res.error); return; }
      setCreated({ id: res.id, number: res.number, email: res.email, emailError: res.emailError });
      toast(res.email === "failed" ? `Receipt ${res.number} saved, but the email failed.` : res.email === "none" ? `Receipt ${res.number} created.` : `Receipt ${res.number} emailed.`, res.email === "failed" ? "error" : "success");
      router.refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function sendAgain() {
    if (!resend) return;
    setResending(true);
    const res = await sendReceiptEmail(resend.id, resend.to).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setResending(false);
    if (res.ok) { toast("Receipt sent.", "success"); setResend(null); router.refresh(); }
    else toast(res.error, "error");
  }

  async function submitPay() {
    if (!pay) return;
    setPayError("");
    setPaying(true);
    const res = await payReceiptBalance({ id: pay.id, amount: Number(pay.amount), method: pay.method, reference: pay.reference, sendTo: pay.sendTo.trim() || undefined }).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setPaying(false);
    if (!res.ok) { setPayError(res.error); return; }
    toast(res.email === "failed" ? `Receipt ${res.number} saved, but the email failed.` : res.email === "none" ? `Receipt ${res.number} created.` : `Receipt ${res.number} emailed.`, res.email === "failed" ? "error" : "success");
    setPay(null);
    router.refresh();
    window.open(`/api/admin/receipts/${res.id}/pdf`, "_blank");
  }

  const emailing = !!form.sendTo.trim();

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight"><Receipt className="size-5 text-teal-400" /> Receipts</h1>
        <p className="mt-1 text-sm text-slate-400">Make a PDF receipt for anything WODONA or WorshipHQ is paid for, and email it. Receipts for church sign-ups and upgrades are sent automatically.</p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <AdminCard className="p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-200"><Sparkles className="size-4 text-teal-400" /> Automatic</div>
          <p className="mt-1 text-slate-400">A free-forever welcome receipt goes with the welcome email, and a payment receipt with every upgrade. Always full A4.</p>
        </AdminCard>
        <AdminCard className="p-4 text-sm">
          <div className="font-semibold text-slate-200">Sent so far</div>
          <p className="mt-1 text-slate-400">
            <b className="text-slate-200">{data.counts.registration}</b> free welcome · <b className="text-slate-200">{data.counts.upgrade}</b> upgrade · <b className="text-slate-200">{data.counts.manual}</b> by hand
          </p>
        </AdminCard>
        <AdminCard className={cn("p-4 text-sm", !data.emailLive && "border-amber-500/30 bg-amber-500/5")}>
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            {data.emailLive ? <CheckCircle2 className="size-4 text-teal-400" /> : <AlertTriangle className="size-4 text-amber-400" />} Email
          </div>
          <p className="mt-1 text-slate-400">{data.emailLive ? "Live. Receipts are emailed for real." : "Test mode on this computer: emails are not really sent. On the live site they are."}</p>
        </AdminCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        {/* ── the form ── */}
        <AdminCard className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Segmented label="Issued by" value={form.brand} onChange={(v) => set("brand", v)} options={[
              { value: "worshiphq", label: "WorshipHQ", hint: "a WODONA product" },
              { value: "wodona", label: "WODONA", hint: "only the company" },
            ]} />
            <Segmented label="Sheet size" value={form.sheet} onChange={(v) => set("sheet", v)} options={[
              { value: "a4", label: "Full A4", hint: "one whole page" },
              { value: "half", label: "Half A4", hint: "fits half a page" },
            ]} />
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-slate-200">Received from</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="rc-church">A church on WorshipHQ? Pick it to fill the details</label>
                <select id="rc-church" className={input} value={form.churchId} onChange={(e) => pickChurch(e.target.value)}>
                  <option value="">Not on WorshipHQ (type the details)</option>
                  {data.churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className={labelCls} htmlFor="rc-name">Name *</label><input id="rc-name" className={input} value={form.toName} onChange={(e) => set("toName", e.target.value)} placeholder="Full name" /></div>
              <div><label className={labelCls} htmlFor="rc-org">Church or company</label><input id="rc-org" className={input} value={form.toOrg} onChange={(e) => set("toOrg", e.target.value)} placeholder="Church or company name" /></div>
              <div><label className={labelCls} htmlFor="rc-email">Their email</label><input id="rc-email" type="email" className={input} value={form.toEmail} onChange={(e) => set("toEmail", e.target.value)} placeholder="name@church.org" /></div>
              <div><label className={labelCls} htmlFor="rc-phone">Phone</label><input id="rc-phone" className={input} value={form.toPhone} onChange={(e) => set("toPhone", e.target.value)} placeholder="024 000 0000" /></div>
              <div className="sm:col-span-2"><label className={labelCls} htmlFor="rc-addr">Address (optional)</label><input id="rc-addr" className={input} value={form.toAddress} onChange={(e) => set("toAddress", e.target.value)} placeholder="Town or street address" /></div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">What was paid for</div>
              <div className="w-28">
                <label className="sr-only" htmlFor="rc-cur">Currency</label>
                <select id="rc-cur" className={input} value={form.currency} onChange={(e) => set("currency", e.target.value as Form["currency"])}>
                  {Object.entries(CURRENCIES).filter(([k]) => ["GHS", "USD", "EUR", "GBP"].includes(k)).map(([k, sym]) => <option key={k} value={k}>{k} ({sym})</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2.5">
              {form.items.map((it, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_70px_120px_auto]">
                    <input aria-label={`Line ${i + 1} description`} className={input} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="e.g. Laptop, 15.6 inch, 16GB RAM" />
                    <input aria-label={`Line ${i + 1} quantity`} className={input} type="number" inputMode="decimal" min="0" step="any" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} placeholder="Qty" />
                    <input aria-label={`Line ${i + 1} price of one`} className={input} type="number" inputMode="decimal" min="0" step="0.01" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} placeholder="Price of one" />
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <span className="whitespace-nowrap text-sm font-medium text-slate-200">{money(round2(num(it.qty) * num(it.unit)), form.currency)}</span>
                      <button type="button" aria-label={`Remove line ${i + 1}`} disabled={form.items.length === 1} onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))} className="rounded-md p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"><Trash2 className="size-4" /></button>
                    </div>
                  </div>
                  <input aria-label={`Line ${i + 1} details`} className={`${input} mt-2 text-xs`} value={it.detail} onChange={(e) => setItem(i, { detail: e.target.value })} placeholder="Serial number, warranty or notes (optional, shown in small print)" />
                </div>
              ))}
            </div>
            <button type="button" className={`${ghost} mt-2.5`} onClick={() => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }))} disabled={form.items.length >= 30}><Plus className="size-4" /> Add a line</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className={labelCls}>Discount (optional). Fill in any one, the others work themselves out</span>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="mb-1 block text-[11px] text-slate-500" htmlFor="rc-dpct">Percent off (%)</label><input id="rc-dpct" className={input} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={shown.pct} onChange={(e) => setDiscount("pct", e.target.value)} placeholder="0" /></div>
                <div><label className="mb-1 block text-[11px] text-slate-500" htmlFor="rc-disc">Amount off ({CURRENCIES[form.currency] ?? form.currency})</label><input id="rc-disc" className={input} type="number" inputMode="decimal" min="0" step="0.01" value={shown.amount} onChange={(e) => setDiscount("amount", e.target.value)} placeholder="0.00" /></div>
                <div><label className="mb-1 block text-[11px] text-slate-500" htmlFor="rc-dprice">Price they pay ({CURRENCIES[form.currency] ?? form.currency})</label><input id="rc-dprice" className={input} type="number" inputMode="decimal" min="0" step="0.01" value={shown.price} onChange={(e) => setDiscount("price", e.target.value)} placeholder={totals.subtotal > 0 ? String(totals.subtotal) : "0.00"} /></div>
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="rc-paid">Amount paid</label>
              <input id="rc-paid" className={input} type="number" inputMode="decimal" min="0" step="0.01" disabled={form.paidFull} value={form.paidFull ? String(totals.total) : form.paid} onChange={(e) => set("paid", e.target.value)} />
              <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={form.paidFull} onChange={(e) => set("paidFull", e.target.checked)} /> Paid in full</label>
            </div>
            <div className="sm:col-span-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
                <span className="text-slate-400">Total <b className="text-slate-100">{money(totals.total, form.currency)}</b>{totals.discount > 0 && <span className="text-slate-500"> (after {money(totals.discount, form.currency)} off, {pctOff}%)</span>}</span>
                <span className="text-slate-400">Paid <b className="text-slate-100">{money(totals.paid, form.currency)}</b></span>
                <span className={totals.balance > 0 ? "text-amber-300" : "text-teal-300"}>{totals.balance > 0 ? <>Balance <b>{money(totals.balance, form.currency)}</b></> : "Fully paid"}</span>
              </div>
              {totals.balance > 0 && <p className="mt-1.5 text-xs text-slate-500">When they pay the rest, press <b>Record balance payment</b> beside this receipt in the list below. It makes a second receipt that shows what was paid before and says paid in full.</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="rc-method">Paid by</label>
              <select id="rc-method" className={input} value={form.method} onChange={(e) => set("method", e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </div>
            <div><label className={labelCls} htmlFor="rc-ref">Reference (optional)</label><input id="rc-ref" className={input} value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="MoMo transaction ID, cheque number..." /></div>
            <div><label className={labelCls} htmlFor="rc-date">Date</label><input id="rc-date" type="date" suppressHydrationWarning className={input} value={form.issuedOn} onChange={(e) => set("issuedOn", e.target.value)} /></div>
            <div className="sm:col-span-2"><label className={labelCls} htmlFor="rc-notes">Note on the receipt (optional)</label><textarea id="rc-notes" rows={2} className={input} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Includes 1 year warranty. Thank you for your support." /></div>
          </div>

          <div className="rounded-xl border border-teal-500/25 bg-teal-500/5 p-4">
            <label className={labelCls} htmlFor="rc-send">Email the PDF to (leave empty to only download it)</label>
            <input id="rc-send" type="email" className={input} value={form.sendTo} onChange={(e) => set("sendTo", e.target.value)} placeholder="name@church.org" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className={primary} onClick={create} disabled={busy === "create"}>
                {busy === "create" ? <><Loader2 className="size-4 animate-spin" /> {emailing ? "Creating and emailing…" : "Creating…"}</> : emailing ? <><Send className="size-4" /> Create and email</> : <><Receipt className="size-4" /> Create receipt</>}
              </button>
              <span className="text-xs text-slate-400">Total {money(totals.total, form.currency)}{totals.balance > 0 ? ` · balance ${money(totals.balance, form.currency)}` : ""}</span>
            </div>
            {formError && <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-red-300"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {formError}</p>}
            {created && (
              <div className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/10 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-teal-200"><CheckCircle2 className="size-4" /> Receipt {created.number} is ready.</div>
                <p className="mt-1 text-xs text-slate-300">
                  {created.email === "sent" && "Emailed as a PDF."}
                  {created.email === "stubbed" && "Saved. Email is in test mode on this computer, so it was not really sent."}
                  {created.email === "failed" && `Saved, but the email failed: ${created.emailError ?? "the provider refused it"}. You can send it again from the list below.`}
                  {created.email === "none" && "Saved. Download it below."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className={ghost} href={`/api/admin/receipts/${created.id}/pdf?download=1`}><Download className="size-4" /> Download PDF</a>
                  <button type="button" className={ghost} onClick={() => { setForm(blankForm()); setCreated(null); setFormError(""); }}><Plus className="size-4" /> New receipt</button>
                </div>
              </div>
            )}
          </div>
        </AdminCard>

        {/* ── the live preview ── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <AdminCard className="overflow-hidden p-3">
            <div className="mb-2 flex items-center justify-between px-1 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><Eye className="size-3.5" /> Live preview ({form.sheet === "a4" ? "Full A4" : "Half A4"})</span>
              {previewing && <span className="flex items-center gap-1.5 text-teal-300"><Loader2 className="size-3.5 animate-spin" /> Updating…</span>}
            </div>
            <div className={cn("relative w-full overflow-hidden rounded-lg bg-white", form.sheet === "a4" ? "aspect-[595/842]" : "aspect-[595/421]")}>
              {previewUrl && !previewError && <iframe title="Receipt preview" src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`} className="absolute inset-0 size-full border-0" />}
              {!previewUrl && !previewError && <div className="absolute inset-0 grid place-items-center text-sm text-slate-500"><Loader2 className="size-5 animate-spin" /></div>}
              {previewError && <div className="absolute inset-0 grid place-items-center bg-slate-950 p-6 text-center text-sm text-amber-300"><span className="flex max-w-xs flex-col items-center gap-2"><AlertTriangle className="size-5" />{previewError}</span></div>}
            </div>
            {previewUrl && !previewError && <a href={previewUrl} target="_blank" rel="noreferrer" className="mt-2 block px-1 text-xs text-teal-300 hover:underline">Preview not showing? Open it in a new tab</a>}
          </AdminCard>
        </div>
      </div>

      {/* ── company details ── */}
      <DetailsCard settings={data.settings} />

      {/* ── the latest receipts ── */}
      <AdminCard className="mt-6 overflow-hidden">
        <div className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-slate-200">Latest receipts</div>
        {data.receipts.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No receipts yet. The first one you make, or the next church that signs up, will show here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-2.5 font-medium">Number</th><th className="px-3 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">For</th><th className="px-3 py-2.5 font-medium">Type</th><th className="px-3 py-2.5 text-right font-medium">Paid / balance</th><th className="px-3 py-2.5 font-medium">Email</th><th className="px-5 py-2.5 text-right font-medium">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.receipts.map((r: ReceiptRow) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-3 font-mono text-xs text-slate-200">{r.number}{r.follows && <div className="mt-0.5 font-sans text-[11px] text-slate-500">balance payment on {r.follows}</div>}</td>
                    <td className="px-3 py-3 text-slate-400">{dateShort(r.issuedAt)}</td>
                    <td className="px-3 py-3"><div className="text-slate-200">{r.toOrg || r.toName}</div>{r.toOrg && <div className="text-xs text-slate-500">{r.toName}</div>}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">{KIND[r.kind] ?? r.kind}<div className="text-slate-500">{r.brand === "wodona" ? "WODONA" : "WorshipHQ"} · {r.sheet === "half" ? "half A4" : "A4"}</div></td>
                    <td className="px-3 py-3 text-right text-slate-200">
                      {r.kind === "registration" ? "Free" : money(r.kind === "manual" && r.paidBefore > 0 ? r.paid - r.paidBefore : r.paid, r.currency)}
                      {r.kind === "manual" && r.paidBefore > 0 && <div className="text-[11px] text-slate-500">{money(r.paid, r.currency)} of {money(r.total, r.currency)} so far</div>}
                      {r.canPay ? <div className="text-[11px] text-amber-300">Balance {money(r.balance, r.currency)}</div> : r.kind === "manual" && r.paidBefore > 0 && r.paid >= r.total - 0.005 ? <div className="text-[11px] text-teal-300">Paid in full</div> : null}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {r.emailStatus === "sent" && <span className="text-teal-300">Sent{r.emailedAt ? ` ${dateShort(r.emailedAt)}` : ""}</span>}
                      {r.emailStatus === "stubbed" && <span className="text-amber-300">Test only</span>}
                      {r.emailStatus === "failed" && <span className="text-red-300" title={r.emailError ?? ""}>Failed</span>}
                      {!r.emailStatus && <span className="text-slate-500">Not emailed</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <a className={`${ghost} px-2 py-1 text-xs`} href={`/api/admin/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer"><Eye className="size-3.5" /> View</a>
                        <a className={`${ghost} px-2 py-1 text-xs`} href={`/api/admin/receipts/${r.id}/pdf?download=1`}><Download className="size-3.5" /> PDF</a>
                        <button type="button" className={`${ghost} px-2 py-1 text-xs`} onClick={() => setResend({ id: r.id, to: r.toEmail ?? "" })}><Mail className="size-3.5" /> Email</button>
                        {r.canPay && <button type="button" className={`${primary} px-2 py-1 text-xs`} onClick={() => { setPayError(""); setPay({ id: r.id, amount: String(r.balance), method: "Mobile Money", reference: "", sendTo: r.toEmail ?? "" }); }}><Receipt className="size-3.5" /> Record balance payment</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {pay && (() => {
                  const target = data.receipts.find((x) => x.id === pay.id);
                  if (!target) return null;
                  return (
                    <tr className="bg-amber-500/5">
                      <td colSpan={7} className="px-5 py-3">
                        <div className="mb-2 text-sm text-slate-200">Payment on {target.number} for {target.toOrg || target.toName}. Balance owed: <b>{money(target.balance, target.currency)}</b></div>
                        <div className="grid gap-2 sm:grid-cols-4">
                          <div><label className={labelCls} htmlFor="rc-pay-amt">Amount paid now</label><input id="rc-pay-amt" type="number" inputMode="decimal" min="0" step="0.01" className={input} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
                          <div><label className={labelCls} htmlFor="rc-pay-method">Paid by</label><select id="rc-pay-method" className={input} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
                          <div><label className={labelCls} htmlFor="rc-pay-ref">Reference (optional)</label><input id="rc-pay-ref" className={input} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></div>
                          <div><label className={labelCls} htmlFor="rc-pay-to">Email the PDF to (optional)</label><input id="rc-pay-to" type="email" className={input} value={pay.sendTo} onChange={(e) => setPay({ ...pay, sendTo: e.target.value })} placeholder="name@church.org" /></div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button type="button" className={primary} onClick={submitPay} disabled={paying || !num(pay.amount)}>{paying ? <><Loader2 className="size-4 animate-spin" /> Making the receipt…</> : <><Receipt className="size-4" /> {pay.sendTo.trim() ? "Create and email receipt" : "Create receipt"}</>}</button>
                          <button type="button" className={ghost} onClick={() => setPay(null)} disabled={paying}>Cancel</button>
                          {payError && <span role="alert" className="flex items-center gap-1.5 text-sm text-red-300"><AlertTriangle className="size-4" /> {payError}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })()}
                {resend && (
                  <tr className="bg-teal-500/5">
                    <td colSpan={7} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm text-slate-300" htmlFor="rc-resend">Send {data.receipts.find((x) => x.id === resend.id)?.number} to</label>
                        <input id="rc-resend" type="email" autoFocus className={`${input} max-w-xs`} value={resend.to} onChange={(e) => setResend({ ...resend, to: e.target.value })} placeholder="name@church.org" />
                        <button type="button" className={primary} onClick={sendAgain} disabled={resending || !resend.to.trim()}>{resending ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Send PDF</>}</button>
                        <button type="button" className={ghost} onClick={() => setResend(null)} disabled={resending}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}

/* ── WODONA's details printed at the bottom of every receipt ── */

const FIELDS: { key: Exclude<keyof ReceiptSettings, "signature">; label: string; placeholder: string; wide?: boolean }[] = [
  { key: "companyName", label: "Company name", placeholder: "WODONA" },
  { key: "tagline", label: "Tagline (optional, WODONA-only receipts)", placeholder: "" },
  { key: "address", label: "Address", placeholder: "Street, town, Ghana", wide: true },
  { key: "phone", label: "Phone", placeholder: "024 000 0000" },
  { key: "email", label: "Email (replies come here)", placeholder: "hello@wodona.com" },
  { key: "website", label: "Website", placeholder: "wodona.com" },
  { key: "registration", label: "Registration or tax number (optional)", placeholder: "" },
  { key: "whqEmail", label: "WorshipHQ email on its receipts (empty = same as above)", placeholder: "sales@worshiphq.org" },
  { key: "whqWebsite", label: "WorshipHQ website", placeholder: "worshiphq.app" },
  { key: "issuedBy", label: "Your name under the signature", placeholder: "Worship Odoi" },
];

/** Turns a photo or scan of a signature (dark ink on light paper) into a small transparent PNG, cropped to the ink. */
async function signatureToPng(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const maxW = 700;
  const k = Math.min(1, maxW / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const lum = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
      // Paper (light, or already transparent) disappears; the ink stays, softly, in a deep blue-black.
      const ink = d[o + 3] < 20 ? 0 : lum >= 225 ? 0 : Math.min(255, ((225 - lum) * 255) / 140);
      d[o] = 12; d[o + 1] = 20; d[o + 2] = 48; d[o + 3] = ink;
      if (ink > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  if (maxX < 0) throw new Error("no ink");
  ctx.putImageData(img, 0, 0);
  const pad = 6;
  const cw = Math.min(w, maxX - minX + 1 + pad * 2);
  const ch = Math.min(h, maxY - minY + 1 + pad * 2);
  const out = document.createElement("canvas");
  out.width = cw; out.height = ch;
  out.getContext("2d")!.drawImage(c, Math.max(0, minX - pad), Math.max(0, minY - pad), cw, ch, 0, 0, cw, ch);
  return out.toDataURL("image/png");
}

function DetailsCard({ settings }: { settings: ReceiptSettings }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [s, setS] = useState<ReceiptSettings>(settings);
  const [saving, setSaving] = useState(false);
  const missing = !s.address || !s.phone || !s.signature;
  const [sigBusy, setSigBusy] = useState(false);
  async function pickSignature(file: File | undefined) {
    if (!file) return;
    setSigBusy(true);
    try {
      const png = await signatureToPng(file);
      if (png.length > SIGNATURE_MAX_CHARS) throw new Error("big");
      setS((cur) => ({ ...cur, signature: png }));
      toast("Signature ready. Press Save details to keep it.", "success");
    } catch {
      toast("Could not read that picture. Use a clear photo or scan of the signature on white paper.", "error");
    }
    setSigBusy(false);
  }
  async function save() {
    setSaving(true);
    const res = await saveReceiptDetails(s).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setSaving(false);
    if (res.ok) { setS(res.settings); toast("Receipt details saved.", "success"); router.refresh(); }
    else toast(res.error, "error");
  }
  return (
    <AdminCard className="mt-6">
      <details open={missing}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Building2 className="size-4 text-teal-400" /> Company details on receipts</span>
          <span className={cn("flex items-center gap-1.5 text-xs", missing ? "text-amber-300" : "text-slate-500")}>
            {missing ? <><AlertTriangle className="size-3.5" /> Add your signature, address and phone so they print on receipts</> : <><Settings2 className="size-3.5" /> Edit</>}
          </span>
        </summary>
        <div className="grid gap-3 border-t border-white/10 p-5 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
              <label className={labelCls} htmlFor={`rs-${f.key}`}>{f.label}</label>
              <input id={`rs-${f.key}`} className={input} value={s[f.key]} placeholder={f.placeholder} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} maxLength={200} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <span className={labelCls}>Your signature (printed on every receipt, with your name and the date)</span>
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid h-20 w-56 place-items-center rounded-lg bg-white">
                {s.signature
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.signature} alt="Your signature" className="max-h-16 max-w-[13rem] object-contain" />
                  : <span className="flex items-center gap-1.5 text-xs text-slate-500"><PenLine className="size-4" /> No signature yet</span>}
              </div>
              <label className={cn(ghost, "cursor-pointer", sigBusy && "pointer-events-none opacity-50")}>
                {sigBusy ? <><Loader2 className="size-4 animate-spin" /> Reading…</> : <><Upload className="size-4" /> {s.signature ? "Change signature" : "Upload signature"}</>}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void pickSignature(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {s.signature && <button type="button" className={ghost} onClick={() => setS({ ...s, signature: "" })}><Trash2 className="size-4" /> Remove</button>}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">A photo or scan of your signature on white paper works. The background is removed for you.</p>
          </div>
          <div className="sm:col-span-2">
            <button type="button" className={primary} onClick={save} disabled={saving}>{saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save details"}</button>
          </div>
        </div>
      </details>
    </AdminCard>
  );
}
