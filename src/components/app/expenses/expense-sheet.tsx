"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Receipt, ArrowUpRight } from "lucide-react";
import { deleteExpense } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { PhotoLightbox } from "@/components/ui/photo-lightbox";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { Sheet, BusyButton, money, fmtDate } from "@/components/app/shared/kit";
import { methodLabel } from "@/lib/assets/categories";

export type ExpenseDetail = {
  id: string; description: string; vendor: string | null; receiptRef: string | null; receiptUrl: string | null; approvedBy: string | null; paymentMethod: string | null;
  notes: string | null; accountId: string | null; fundId: string | null; budgetId: string | null; budgetItemId: string | null; vendorId: string | null; source: string | null;
  createdByName: string | null; createdAt: string; date: string; amount: number; category: string; budgetName: string | null; budgetItemName: string | null;
  assetLink: { href: string; label: string } | null;
};

const SOURCE: Record<string, string> = { fuel: "Fuel for", maintenance: "Service or repair:", repair: "Repair", request: "Paid request", recurring: "Regular payment", asset: "Purchase of" };

export function ExpenseSheet({ d, accountName, fundName, canWrite, canDelete, onEdit, onClose }: {
  d: ExpenseDetail; accountName: string | null; fundName: string | null; canWrite: boolean; canDelete: boolean; onEdit: () => void; onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [zoom, setZoom] = useState(false);
  const [deleting, start] = useTransition();
  const remove = () => {
    if (!confirmBinDelete("Delete this expense? It goes to the recycle bin.")) return;
    const fd = new FormData();
    fd.set("id", d.id);
    start(async () => {
      const r = await deleteExpense(fd);
      if (r.ok) { binDeleted(); router.refresh(); onClose(); } else toast(r.error ?? "Could not delete it.", "error");
    });
  };
  const rows: [string, React.ReactNode][] = [
    ["Date", fmtDate(d.date)],
    ["Category", d.category],
    ["Payee", d.vendor],
    ["Paid how", methodLabel(d.paymentMethod)],
    ["Paid from", accountName],
    ["Fund", fundName],
    ["Budget", d.budgetName ? `${d.budgetName}${d.budgetItemName ? `: ${d.budgetItemName}` : ""}` : null],
    ["Receipt number", d.receiptRef],
    ["Approved by", d.approvedBy],
  ];
  return (
    <Sheet open onClose={onClose} busy={deleting} title={d.description} description={money(d.amount, true)}>
      <div className="space-y-4">
        {d.receiptUrl ? (
          <button onClick={() => setZoom(true)} className="block w-full overflow-hidden rounded-xl border border-line bg-surface-2" aria-label="View receipt">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.receiptUrl} alt="Receipt" className="max-h-64 w-full object-contain" />
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-ink-muted"><Receipt className="size-4" /> No receipt photo{canWrite ? ". Edit to add one." : "."}</div>
        )}
        {d.source && SOURCE[d.source] && (
          <p className="text-sm">
            {d.assetLink ? <Link href={d.assetLink.href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{SOURCE[d.source]} {d.assetLink.label} <ArrowUpRight className="size-3.5" /></Link> : <span className="text-ink-muted">{SOURCE[d.source]}</span>}
          </p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-muted">{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {d.notes && <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-sm text-ink-muted">{d.notes}</p>}
        <p className="text-xs text-ink-faint">Recorded{d.createdByName ? ` by ${d.createdByName}` : ""} on {fmtDate(d.createdAt)}</p>
        {canWrite && (
          <div className="flex gap-2 border-t border-line-soft pt-3">
            <Button variant="secondary" className="flex-1" onClick={onEdit}><Pencil /> Edit</Button>
            {canDelete && <BusyButton type="button" variant="ghost" busy={deleting} busyLabel="Deleting…" onClick={remove} className="text-danger"><Trash2 /> Delete</BusyButton>}
          </div>
        )}
      </div>
      {zoom && d.receiptUrl && <PhotoLightbox src={d.receiptUrl} alt="Receipt" onClose={() => setZoom(false)} />}
    </Sheet>
  );
}
