"use client";

import { useRef, useState } from "react";
import { Paperclip, FileText, X, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";
import { compressImageFile } from "@/lib/image-compress";
import { recordLevyPayment, recordLevyPayments } from "@/app/actions/levies";
import { METHOD_LABELS } from "@/lib/levies/explain";
import type { RecordView } from "@/lib/levies/view-types";
import { BusyButton, ghs, inputCls, labelCls, selectCls, useLevyAction, dayMonthYear } from "./shared";

type Account = { id: string; name: string; isDefault: boolean; type: string };

/** Turn a data URL from the image compressor back into a file for upload. */
function dataUrlToFile(url: string, name: string): File {
  const [head, b64] = url.split(",");
  const type = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name.replace(/\.\w+$/, "") + (type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg"), { type });
}

/**
 * Record a payment for one period, or one payment split across several (oldest first).
 * Prefilled with what is left; the expense box is ticked so Accounts balance; a receipt photo or PDF can be attached.
 */
export function PaymentDialog({ open, onClose, records, accounts, todayYmd, r2Ready }: {
  open: boolean; onClose: () => void; records: RecordView[]; accounts: Account[]; todayYmd: string; r2Ready: boolean;
}) {
  const { toast } = useFeedback();
  const { pending, run } = useLevyAction();
  const several = records.length > 1;
  const left = Math.round(records.reduce((t, r) => t + Math.max(0, r.left), 0) * 100) / 100;
  const [amount, setAmount] = useState(left > 0 ? left.toFixed(2) : "");
  const [paidOn, setPaidOn] = useState(todayYmd);
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [accountId, setAccountId] = useState(accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "");
  const [expense, setExpense] = useState(true);
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<{ key: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickMethod = (m: string) => {
    setMethod(m);
    // Money the receiver took off (from a grant, say) never left an account, so it is not an expense by default.
    setExpense(m !== "deducted");
  };

  async function upload(file: File) {
    if (file.size > 4 * 1024 * 1024 && file.type === "application/pdf") { toast("That PDF is too big. Please keep it under 4 MB.", "error"); return; }
    setUploading(true);
    try {
      const send = file.type.startsWith("image/") ? dataUrlToFile(await compressImageFile(file, { maxDimension: 1800, quality: 0.85 }), file.name) : file;
      const fd = new FormData();
      fd.set("file", send);
      const res = await fetch("/api/levies/proof", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "The receipt could not be added.");
      setProof(j);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const n = Number(amount);
  const extra = n > left && left > 0 ? Math.round((n - left) * 100) / 100 : 0;
  const save = () => {
    const input = { amount: n, paidOnYmd: paidOn, method, reference, accountId: accountId || null, createExpense: expense, proof, note };
    run(
      () => (several ? recordLevyPayments(records.map((r) => r.id), input) : recordLevyPayment(records[0].id, input)),
      (r) => String(r.message ?? "Payment recorded."),
      onClose,
    );
  };

  if (!records.length) return null;
  return (
    <Modal open={open} onClose={onClose} title={several ? `Pay ${records.length} periods` : "Record payment"} description={several ? "One payment, split across the periods oldest first." : `${records[0].ruleName}, ${records[0].label}`}>
      <div className="space-y-4">
        {several ? (
          <ul className="divide-y divide-line-soft rounded-xl border border-line text-sm">
            {[...records].sort((a, b) => (a.startYmd < b.startYmd ? -1 : 1)).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{r.ruleName}, {r.label}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">{ghs(r.left)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <div className="flex justify-between"><span className="text-ink-muted">Due</span><span className="font-semibold tabular-nums">{ghs(records[0].due)}</span></div>
            {records[0].paid > 0 && <div className="flex justify-between"><span className="text-ink-muted">Already paid</span><span className="tabular-nums">{ghs(records[0].paid)}</span></div>}
            <div className="mt-1 flex justify-between border-t border-primary/15 pt-1"><span className="font-medium">Still to pay</span><span className="font-bold tabular-nums">{ghs(records[0].left)}</span></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="lp-amount">Amount paid</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">₵</span>
              <input id="lp-amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} pl-7 text-right font-semibold tabular-nums`} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="lp-date">Date paid</label>
            <input id="lp-date" type="date" max={todayYmd} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputCls} />
          </div>
        </div>
        {extra > 0 && <p className="-mt-2 text-xs text-ink-muted">That is {ghs(extra)} more than is owed. It shows as paid extra, and you can move it to the next period.</p>}

        <div>
          <span className={labelCls}>How it was paid</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(METHOD_LABELS).map(([k, l]) => (
              <button key={k} type="button" onClick={() => pickMethod(k)} className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${method === k ? "border-primary bg-primary text-white" : "border-line text-ink-muted hover:bg-surface-2"}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="lp-ref">Reference</label>
            <input id="lp-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} placeholder="Receipt or transfer number" className={inputCls} />
          </div>
          {accounts.length > 0 && method !== "deducted" && (
            <div>
              <label className={labelCls} htmlFor="lp-acct">From account</label>
              <select id="lp-acct" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isDefault ? " (default)" : ""}</option>)}
              </select>
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" checked={expense} onChange={(e) => setExpense(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
          <span><span className="font-medium">Also record this as an expense</span><span className="block text-xs text-ink-muted">So your accounts balance. It shows in Expenses as Levies &amp; remittances.</span></span>
        </label>

        <div>
          <span className={labelCls}>Receipt</span>
          {proof ? (
            <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-sm">
              <Check className="size-4 text-success" /> <span className="min-w-0 flex-1 truncate">{proof.name}</span>
              <button type="button" onClick={() => setProof(null)} aria-label="Remove the receipt" className="rounded p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
            </div>
          ) : (
            <button type="button" disabled={uploading || !r2Ready} onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-ink-muted hover:bg-surface-2 disabled:opacity-60">
              {uploading ? <><Spinner size="sm" /> Adding the receipt...</> : <><Paperclip className="size-4" /> {r2Ready ? "Add a photo or PDF of the receipt" : "Receipts cannot be stored on this server"}</>}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </div>

        <div>
          <label className={labelCls} htmlFor="lp-note">Note (optional)</label>
          <input id="lp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputCls} />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-medium text-ink-muted hover:bg-surface-2">Cancel</button>
          <BusyButton busy={pending} busyLabel="Saving payment..." disabled={uploading || !(n > 0)} onClick={save}>
            <FileText /> Save payment{n > 0 ? ` of ${ghs(n)}` : ""}
          </BusyButton>
        </div>
        {several && <p className="text-center text-[11px] text-ink-faint">Paid {dayMonthYear(paidOn)}. Each period gets its own payment line with the same reference.</p>}
      </div>
    </Modal>
  );
}
