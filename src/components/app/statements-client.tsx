"use client";

import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, FileText, Printer, ChevronRight, ArrowLeft, HandCoins } from "lucide-react";

type GiftLine = {
  id: string;
  amount: number;
  date: string;
  method: string;
  fund: string;
};

type Donor = {
  id: string;
  name: string;
  memberId: string | null;
  phone: string | null;
  email: string | null;
  total: number;
  giftCount: number;
  byFund: { fund: string; amount: number }[];
  gifts: GiftLine[];
};

function formatGHS(n: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
}

export function StatementsClient({
  donors,
  year,
  churchName,
  churchAddress,
}: {
  donors: Donor[];
  year: number;
  churchName: string;
  churchAddress: string;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Donor | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const filtered = donors.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.memberId?.toLowerCase().includes(q);
  });

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Giving Statement - ${selected?.name}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 40px; max-width: 700px; margin: 0 auto; color: #1c1a16; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        h2 { font-size: 16px; margin-top: 24px; }
        .meta { color: #6b6560; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e0db; }
        th { background: #faf8f4; font-weight: 600; }
        .total { font-weight: 700; font-size: 15px; }
        .footer { margin-top: 40px; font-size: 11px; color: #a09890; border-top: 1px solid #e5e0db; padding-top: 16px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  if (selected) {
    return (
      <div className="mt-5">
        <button
          onClick={() => setSelected(null)}
          className="mb-4 flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to all donors
        </button>

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{selected.name} — {year} Statement</h2>
          <Button size="sm" variant="secondary" onClick={handlePrint}>
            <Printer className="size-4" /> Print
          </Button>
        </div>

        <div ref={printRef}>
          <div style={{ marginBottom: 24 }}>
            <h1>{churchName}</h1>
            <p className="meta">{churchAddress}</p>
            <h2>Giving Statement — {year}</h2>
            <p className="meta">
              Prepared for: <strong>{selected.name}</strong>
              {selected.memberId && <> (ID: {selected.memberId})</>}
            </p>
            {selected.email && <p className="meta">Email: {selected.email}</p>}
            {selected.phone && <p className="meta">Phone: {selected.phone}</p>}
          </div>

          <h2>Summary by fund</h2>
          <table>
            <thead>
              <tr><th>Fund</th><th style={{ textAlign: "right" }}>Amount</th></tr>
            </thead>
            <tbody>
              {selected.byFund.map((f) => (
                <tr key={f.fund}><td>{f.fund}</td><td style={{ textAlign: "right" }}>{formatGHS(f.amount)}</td></tr>
              ))}
              <tr style={{ borderTop: "2px solid #1c1a16" }}>
                <td className="total">Total</td>
                <td className="total" style={{ textAlign: "right" }}>{formatGHS(selected.total)}</td>
              </tr>
            </tbody>
          </table>

          <h2>Transaction details</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Fund</th><th>Method</th><th style={{ textAlign: "right" }}>Amount</th></tr>
            </thead>
            <tbody>
              {selected.gifts.map((g) => (
                <tr key={g.id}>
                  <td>{new Date(g.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td>{g.fund}</td>
                  <td>{g.method}</td>
                  <td style={{ textAlign: "right" }}>{formatGHS(g.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="footer">
            <p>This statement was generated by {churchName} using WorshipHQ.</p>
            <p>{selected.giftCount} transaction{selected.giftCount !== 1 ? "s" : ""} totalling {formatGHS(selected.total)} for the period Jan 1 — Dec 31, {year}.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="Search donors by name or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No donors match your search." : "No giving records for this year yet."}
          </p>
        </Card>
      ) : (
        <div className="space-y-1">
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10">
                <HandCoins className="size-5 text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{d.name}</p>
                <div className="flex flex-wrap gap-x-3 text-xs text-ink-muted">
                  {d.memberId && <span>{d.memberId}</span>}
                  <span>{d.giftCount} gift{d.giftCount !== 1 ? "s" : ""}</span>
                  {d.byFund.length > 1 && (
                    <span>{d.byFund.length} funds</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-brand">{formatGHS(d.total)}</p>
              </div>
              <ChevronRight className="size-4 text-ink-faint" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
