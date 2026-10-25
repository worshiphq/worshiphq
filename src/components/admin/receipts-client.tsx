"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Download, Mail, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, Send, Eye, Building2, Settings2, Sparkles, PenLine, Upload, Pencil, History, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { AdminCard } from "@/components/admin/admin-shell";
import { useFeedback } from "@/components/ui/feedback";
import {
  createManualReceipt, editReceipt, getReceiptHistory, listReceipts, payReceiptBalance, saveReceiptDetails, sendReceiptEmail,
  type ReceiptsPageData, type ReceiptRow, type ReceiptList, type ReceiptRevisionView,
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
type EditForm = {
  id: string; number: string; kind: string; editable: "full" | "basic" | "none"; currency: string;
  toName: string; toOrg: string; toEmail: string; toPhone: string; toAddress: string;
  issuedOn: string; method: string; reference: string; notes: string; sheet: "a4" | "half";
  items: FormItem[]; discount: string; paid: string;
};
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
  const [list, setList] = useState<ReceiptList>(data.list);
  const [filter, setFilter] = useState<{ preset: string; from: string; to: string; q: string; page: number }>({ preset: "all", from: "", to: "", q: "", page: 1 });
  const [listing, setListing] = useState(false);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [history, setHistory] = useState<{ id: string; revisions: ReceiptRevisionView[] | null } | null>(null);
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

  function pickPerson(i: string) {
    const c = data.churches.find((x) => x.id === form.churchId);
    const p = c?.people[Number(i)];
    if (p) setForm((f) => ({ ...f, toName: p.name || f.toName, toEmail: p.email, toPhone: p.phone, sendTo: p.email || f.sendTo }));
  }

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
      void reload();
      router.refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  /** Fetch the list again for the current filter (after a change, a new filter or another page). */
  async function reload(next = filter) {
    setListing(true);
    const res = await listReceipts({ from: next.from || undefined, to: next.to || undefined, q: next.q || undefined, page: next.page }).catch(() => null);
    setListing(false);
    if (res) { setList(res); if (res.page !== next.page) setFilter({ ...next, page: res.page }); }
    else toast("Could not load the receipts.", "error");
  }
  function applyFilter(patch: Partial<typeof filter>) {
    const next = { ...filter, page: 1, ...patch };
    setFilter(next);
    void reload(next);
  }
  function preset(name: string) {
    const now = new Date();
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (name === "all") return applyFilter({ preset: name, from: "", to: "" });
    if (name === "month") return applyFilter({ preset: name, from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) });
    if (name === "last") return applyFilter({ preset: name, from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) });
    if (name === "year") return applyFilter({ preset: name, from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` });
    return applyFilter({ preset: "custom" });
  }

  function startEdit(r: ReceiptRow) {
    setEditError(""); setHistory(null); setPay(null); setResend(null);
    setEdit({
      id: r.id, number: r.number, kind: r.kind, editable: r.editable, currency: r.currency,
      toName: r.toName, toOrg: r.toOrg ?? "", toEmail: r.toEmail ?? "", toPhone: r.toPhone ?? "", toAddress: r.toAddress ?? "",
      issuedOn: r.issuedAt.slice(0, 10), method: r.method ?? "", reference: r.reference ?? "", notes: r.notes ?? "", sheet: r.sheet === "half" ? "half" : "a4",
      items: r.items.map((i) => ({ description: i.description, detail: i.detail ?? "", qty: String(i.qty), unit: String(i.unit) })),
      discount: r.discount ? String(r.discount) : "", paid: String(r.paid),
    });
  }
  async function submitEdit() {
    if (!edit) return;
    setEditError("");
    setEditing(true);
    const res = await editReceipt(edit.id, {
      toName: edit.toName, toOrg: edit.toOrg, toEmail: edit.toEmail, toPhone: edit.toPhone, toAddress: edit.toAddress,
      issuedOn: edit.issuedOn, method: edit.method, reference: edit.reference, notes: edit.notes, sheet: edit.sheet,
      ...(edit.editable === "full" ? { items: edit.items.filter((i) => i.description.trim()).map((i) => ({ description: i.description, detail: i.detail, qty: num(i.qty) || 1, unit: num(i.unit) })), discount: num(edit.discount), paid: num(edit.paid) } : {}),
    }).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setEditing(false);
    if (!res.ok) { setEditError(res.error); return; }
    toast(`Receipt ${res.number} updated. Download or email it again. The earlier version is kept in its history.`, "success");
    setEdit(null);
    void reload();
    router.refresh();
  }
  async function openHistory(id: string) {
    setEdit(null); setPay(null); setResend(null);
    setHistory({ id, revisions: null });
    const revisions = await getReceiptHistory(id).catch(() => []);
    setHistory({ id, revisions });
  }

  async function sendAgain() {
    if (!resend) return;
    setResending(true);
    const res = await sendReceiptEmail(resend.id, resend.to).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setResending(false);
    if (res.ok) { toast("Receipt sent.", "success"); setResend(null); void reload(); router.refresh(); }
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
    void reload();
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
              {(() => {
                const team = data.churches.find((x) => x.id === form.churchId)?.people ?? [];
                return team.length > 1 ? (
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="rc-person">Who paid? Pick a team member, or type any name below</label>
                    <select id="rc-person" className={input} defaultValue="0" key={form.churchId} onChange={(e) => pickPerson(e.target.value)}>
                      {team.map((p, i) => <option key={`${p.email}-${i}`} value={String(i)}>{p.name || p.email} ({p.role})</option>)}
                    </select>
                  </div>
                ) : null;
              })()}
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="text-sm font-semibold text-slate-200">Receipts</div>
          <div className="text-xs text-slate-400">
            <b className="text-slate-200">{list.total}</b> {list.total === 1 ? "receipt" : "receipts"}
            {list.receivedGhs > 0 && <> · <b className="text-teal-300">{money(list.receivedGhs, "GHS")}</b> received{filter.preset === "all" ? "" : " in this range"}</>}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-b border-white/10 px-5 py-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date range">
            {([["all", "All time"], ["month", "This month"], ["last", "Last month"], ["year", "This year"], ["custom", "Pick dates"]] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter.preset === k} onClick={() => preset(k)}
                className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors", filter.preset === k ? "border-teal-500/70 bg-teal-500/15 text-teal-200" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10")}>{label}</button>
            ))}
          </div>
          {filter.preset === "custom" && (
            <div className="flex flex-wrap items-end gap-2">
              <div><label className="mb-1 block text-[11px] text-slate-500" htmlFor="rc-from">From</label><input id="rc-from" type="date" className={`${input} w-40 py-1.5`} value={filter.from} onChange={(e) => applyFilter({ preset: "custom", from: e.target.value })} /></div>
              <div><label className="mb-1 block text-[11px] text-slate-500" htmlFor="rc-to">To</label><input id="rc-to" type="date" className={`${input} w-40 py-1.5`} value={filter.to} onChange={(e) => applyFilter({ preset: "custom", to: e.target.value })} /></div>
            </div>
          )}
          <form className="ml-auto flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); applyFilter({}); }}>
            <div><label className="mb-1 block text-[11px] text-slate-500" htmlFor="rc-q">Name, number or reference</label><input id="rc-q" className={`${input} w-56 py-1.5`} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="e.g. Theophany or WHQ-2026-0001" /></div>
            <button type="submit" className={`${ghost} py-1.5`} aria-label="Search receipts"><Search className="size-4" /></button>
          </form>
          {listing && <Loader2 className="mb-2 size-4 animate-spin text-teal-300" aria-label="Loading" />}
        </div>
        {list.rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{filter.preset === "all" && !filter.q ? "No receipts yet. The first one you make, or the next church that signs up, will show here." : "No receipts match these dates or this search."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-2.5 font-medium">Number</th><th className="px-3 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">For</th><th className="px-3 py-2.5 font-medium">Type</th><th className="px-3 py-2.5 text-right font-medium">Paid / balance</th><th className="px-3 py-2.5 font-medium">Email</th><th className="px-5 py-2.5 text-right font-medium">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {list.rows.map((r: ReceiptRow) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-3 font-mono text-xs text-slate-200">{r.number}{r.follows && <div className="mt-0.5 font-sans text-[11px] text-slate-500">balance payment on {r.follows}</div>}</td>
                    <td className="px-3 py-3 text-slate-400">{dateShort(r.issuedAt)}{r.editCount > 0 && <div className="text-[11px] text-amber-300">Edited {r.editCount}x</div>}</td>
                    <td className="px-3 py-3"><div className="text-slate-200">{r.toOrg || r.toName}</div>{r.toOrg && <div className="text-xs text-slate-500">{r.toName}</div>}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">{KIND[r.kind] ?? r.kind}<div className="text-slate-500">{r.brand === "wodona" ? "WODONA" : "WorshipHQ"} · {r.sheet === "half" ? "half A4" : "A4"}</div></td>
                    <td className="px-3 py-3 text-right text-slate-200">
                      {r.kind === "registration" ? "Free" : money(r.kind === "manual" && r.paidBefore > 0 ? r.paid - r.paidBefore : r.paid, r.currency)}
                      {r.kind === "manual" && r.paidBefore > 0 && <div className="text-[11px] text-slate-500">{money(r.paid, r.currency)} of {money(r.total, r.currency)} so far</div>}
                      {r.canPay ? <div className="text-[11px] text-amber-300">Balance {money(r.balance, r.currency)}</div> : r.kind === "manual" && r.paidBefore > 0 && r.paid >= r.total - 0.005 ? <div className="text-[11px] text-teal-300">Paid in full</div> : null}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {r.emailStatus === "sent" && <span className="text-teal-300">Sent{r.emailedAt ? ` ${dateShort(r.emailedAt)}` : ""}{r.emailedAt && r.lastEditedAt && r.lastEditedAt > r.emailedAt ? <span className="block text-[11px] text-amber-300">Edited after sending</span> : null}</span>}
                      {r.emailStatus === "stubbed" && <span className="text-amber-300">Test only</span>}
                      {r.emailStatus === "failed" && <span className="text-red-300" title={r.emailError ?? ""}>Failed</span>}
                      {!r.emailStatus && <span className="text-slate-500">Not emailed</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <a className={`${ghost} px-2 py-1 text-xs`} href={`/api/admin/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer"><Eye className="size-3.5" /> View</a>
                        <a className={`${ghost} px-2 py-1 text-xs`} href={`/api/admin/receipts/${r.id}/pdf?download=1`}><Download className="size-3.5" /> PDF</a>
                        <button type="button" className={`${ghost} px-2 py-1 text-xs`} onClick={() => setResend({ id: r.id, to: r.toEmail ?? "" })}><Mail className="size-3.5" /> Email</button>
                        {r.editable !== "none" && <button type="button" className={`${ghost} px-2 py-1 text-xs`} onClick={() => startEdit(r)}><Pencil className="size-3.5" /> Edit</button>}
                        {r.editCount > 0 && <button type="button" className={`${ghost} px-2 py-1 text-xs`} onClick={() => openHistory(r.id)}><History className="size-3.5" /> History</button>}
                        {r.canPay && <button type="button" className={`${primary} px-2 py-1 text-xs`} onClick={() => { setPayError(""); setPay({ id: r.id, amount: String(r.balance), method: "Mobile Money", reference: "", sendTo: r.toEmail ?? "" }); }}><Receipt className="size-3.5" /> Record balance payment</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {edit && (
                  <tr className="bg-teal-500/5">
                    <td colSpan={7} className="px-5 py-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-100">Edit receipt {edit.number}</div>
                        <p className="text-xs text-slate-400">It keeps its number. What it looked like before is saved in its history. Download or email it again afterwards.</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div><label className={labelCls} htmlFor="re-name">Received from *</label><input id="re-name" className={input} value={edit.toName} maxLength={120} onChange={(e) => setEdit({ ...edit, toName: e.target.value })} /></div>
                        <div><label className={labelCls} htmlFor="re-org">Church or company</label><input id="re-org" className={input} value={edit.toOrg} maxLength={160} onChange={(e) => setEdit({ ...edit, toOrg: e.target.value })} /></div>
                        <div><label className={labelCls} htmlFor="re-date">Date paid (the date on the receipt)</label><input id="re-date" type="date" className={input} value={edit.issuedOn} onChange={(e) => setEdit({ ...edit, issuedOn: e.target.value })} /></div>
                        <div><label className={labelCls} htmlFor="re-email">Email</label><input id="re-email" type="email" className={input} value={edit.toEmail} onChange={(e) => setEdit({ ...edit, toEmail: e.target.value })} /></div>
                        <div><label className={labelCls} htmlFor="re-phone">Phone</label><input id="re-phone" className={input} value={edit.toPhone} maxLength={40} onChange={(e) => setEdit({ ...edit, toPhone: e.target.value })} /></div>
                        <div><label className={labelCls} htmlFor="re-addr">Address</label><input id="re-addr" className={input} value={edit.toAddress} maxLength={240} onChange={(e) => setEdit({ ...edit, toAddress: e.target.value })} /></div>
                        <div><label className={labelCls} htmlFor="re-method">Paid by</label><input id="re-method" className={input} value={edit.method} maxLength={60} onChange={(e) => setEdit({ ...edit, method: e.target.value })} placeholder="Cash, Mobile Money..." /></div>
                        <div><label className={labelCls} htmlFor="re-ref">Reference{edit.kind !== "manual" ? " (fixed, it links to the billing record)" : ""}</label><input id="re-ref" className={input} value={edit.reference} maxLength={120} disabled={edit.kind !== "manual"} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></div>
                        <div>
                          <label className={labelCls} htmlFor="re-sheet">Sheet</label>
                          <select id="re-sheet" className={input} value={edit.sheet} onChange={(e) => setEdit({ ...edit, sheet: e.target.value === "half" ? "half" : "a4" })}><option value="a4">Full A4</option><option value="half">Half A4</option></select>
                        </div>
                        <div className="sm:col-span-3"><label className={labelCls} htmlFor="re-notes">Note on the receipt</label><textarea id="re-notes" rows={2} className={input} value={edit.notes} maxLength={1200} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
                      </div>
                      {edit.editable === "full" ? (
                        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <span className={labelCls}>Lines</span>
                          <div className="space-y-2">
                            {edit.items.map((it, i) => (
                              <div key={i} className="grid grid-cols-[1fr_5rem_7rem_auto] gap-2">
                                <input aria-label={`Line ${i + 1} description`} className={input} value={it.description} maxLength={160} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x) })} placeholder="Description" />
                                <input aria-label={`Line ${i + 1} quantity`} className={input} type="number" min="0" value={it.qty} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x) })} />
                                <input aria-label={`Line ${i + 1} price of one`} className={input} type="number" min="0" step="0.01" value={it.unit} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, idx) => idx === i ? { ...x, unit: e.target.value } : x) })} />
                                <button type="button" aria-label={`Remove line ${i + 1}`} disabled={edit.items.length === 1} onClick={() => setEdit({ ...edit, items: edit.items.filter((_, idx) => idx !== i) })} className="rounded-md p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"><Trash2 className="size-4" /></button>
                              </div>
                            ))}
                          </div>
                          <button type="button" className={`${ghost} mt-2`} onClick={() => setEdit({ ...edit, items: [...edit.items, blankItem()] })} disabled={edit.items.length >= 30}><Plus className="size-4" /> Add a line</button>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div><label className={labelCls} htmlFor="re-disc">Discount ({CURRENCIES[edit.currency] ?? edit.currency})</label><input id="re-disc" className={input} type="number" min="0" step="0.01" value={edit.discount} onChange={(e) => setEdit({ ...edit, discount: e.target.value })} /></div>
                            <div><label className={labelCls} htmlFor="re-paid">Amount paid ({CURRENCIES[edit.currency] ?? edit.currency})</label><input id="re-paid" className={input} type="number" min="0" step="0.01" value={edit.paid} onChange={(e) => setEdit({ ...edit, paid: e.target.value })} /></div>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-500">The lines, discount and amounts of this receipt are tied to a church&apos;s billing history or to other receipts of the same sale, so they cannot be edited here. The name, date, how it was paid, reference and note can.</p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button type="button" className={primary} onClick={submitEdit} disabled={editing || !edit.toName.trim()}>{editing ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="size-4" /> Save changes</>}</button>
                        <button type="button" className={ghost} onClick={() => setEdit(null)} disabled={editing}>Cancel</button>
                        {editError && <span role="alert" className="flex items-center gap-1.5 text-sm text-red-300"><AlertTriangle className="size-4" /> {editError}</span>}
                      </div>
                    </td>
                  </tr>
                )}
                {history && (
                  <tr className="bg-slate-500/5">
                    <td colSpan={7} className="px-5 py-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-100">Edit history of {list.rows.find((x) => x.id === history.id)?.number}</div>
                        <button type="button" className={ghost} onClick={() => setHistory(null)}>Close</button>
                      </div>
                      {history.revisions === null ? (
                        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="size-4 animate-spin" /> Loading the history…</p>
                      ) : history.revisions.length === 0 ? (
                        <p className="text-sm text-slate-500">No edits yet.</p>
                      ) : (
                        <ol className="space-y-3">
                          {history.revisions.map((rv) => (
                            <li key={rv.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                                <span>Edit {rv.n} · {new Date(rv.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })}</span>
                                <a className={`${ghost} px-2 py-1 text-xs`} href={`/api/admin/receipts/${history.id}/pdf?rev=${rv.id}`} target="_blank" rel="noreferrer"><Eye className="size-3.5" /> See it before this edit</a>
                              </div>
                              <ul className="mt-2 space-y-1 text-sm">
                                {rv.changes.map((c, i) => (
                                  <li key={i} className="text-slate-300"><span className="text-slate-400">{c.label}:</span> <span className="text-red-300/80 line-through">{c.from}</span> <span className="text-slate-500">to</span> <span className="text-teal-300">{c.to}</span></li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ol>
                      )}
                    </td>
                  </tr>
                )}
                {pay && (() => {
                  const target = list.rows.find((x) => x.id === pay.id);
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
                        <label className="text-sm text-slate-300" htmlFor="rc-resend">Send {list.rows.find((x) => x.id === resend.id)?.number} to</label>
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
        {list.pages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3 text-xs text-slate-400">
            <span>Page {list.page} of {list.pages}</span>
            <div className="flex gap-1.5">
              <button type="button" className={`${ghost} px-2 py-1 text-xs`} disabled={list.page <= 1 || listing} onClick={() => { const next = { ...filter, page: list.page - 1 }; setFilter(next); void reload(next); }}><ChevronLeft className="size-3.5" /> Newer</button>
              <button type="button" className={`${ghost} px-2 py-1 text-xs`} disabled={list.page >= list.pages || listing} onClick={() => { const next = { ...filter, page: list.page + 1 }; setFilter(next); void reload(next); }}>Older <ChevronRight className="size-3.5" /></button>
            </div>
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
