"use client";

import { useState } from "react";
import { FileDown, Sheet } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { inputCls, labelCls, selectCls } from "./shared";

/** Download a remittance statement for a range of months: a signed-off PDF for head office, or a spreadsheet. */
export function StatementDialog({ open, onClose, year, payees, todayYmd }: { open: boolean; onClose: () => void; year: number; payees: string[]; todayYmd: string }) {
  const thisMonth = todayYmd.slice(0, 7);
  const [from, setFrom] = useState(`${year}-01`);
  const [to, setTo] = useState(String(year) === todayYmd.slice(0, 4) ? thisMonth : `${year}-12`);
  const [payee, setPayee] = useState("");
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);
  const url = (format: "pdf" | "csv") => `/api/levies/statement?${new URLSearchParams({ from, to, format, ...(payee ? { payee } : {}) }).toString()}`;
  const download = (format: "pdf" | "csv") => {
    setBusy(format);
    window.location.href = url(format);
    setTimeout(() => setBusy(null), 3000);
  };
  return (
    <Modal open={open} onClose={onClose} title="Remittance statement" description="Every period in these months: how each levy was worked out, what was paid, and what is left. With signature lines for the treasurer and pastor.">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls} htmlFor="st-from">From</label><input id="st-from" type="month" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="st-to">To</label><input id="st-to" type="month" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></div>
        </div>
        {payees.length > 1 && (
          <div>
            <label className={labelCls} htmlFor="st-payee">Paid to</label>
            <select id="st-payee" value={payee} onChange={(e) => setPayee(e.target.value)} className={selectCls}>
              <option value="">Everyone</option>
              {payees.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => download("pdf")} disabled={!!busy || !from || !to}>{busy === "pdf" ? <><Spinner size="sm" /> Preparing PDF...</> : <><FileDown /> Download PDF</>}</Button>
          <Button variant="secondary" onClick={() => download("csv")} disabled={!!busy || !from || !to}>{busy === "csv" ? <><Spinner size="sm" /> Preparing file...</> : <><Sheet /> Download spreadsheet</>}</Button>
        </div>
      </div>
    </Modal>
  );
}
