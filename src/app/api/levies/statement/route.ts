import type { NextRequest } from "next/server";
import { getActiveSession } from "@/lib/auth";
import { levyAccess } from "@/lib/levies/guards";
import { statementData } from "@/lib/levies/exports";

export const dynamic = "force-dynamic";

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET ?from=YYYY-MM&to=YYYY-MM&payee=&format=pdf|csv : the remittance statement to hand to whoever receives the levies. */
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const a = levyAccess(session);
  if (!a.see) return new Response("Forbidden", { status: 403 });
  if (a.lockedFeature) return new Response("Levies are not part of your plan.", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/;
  const now = new Date().toISOString().slice(0, 7);
  let from = ym.test(sp.get("from") ?? "") ? (sp.get("from") as string) : now;
  let to = ym.test(sp.get("to") ?? "") ? (sp.get("to") as string) : from;
  if (from > to) [from, to] = [to, from];
  const payee = (sp.get("payee") ?? "").trim().slice(0, 80) || null;
  const data = await statementData(session.churchId, { fromYm: from, toYm: to, payee });
  const base = `remittance-statement-${from}${to !== from ? `-to-${to}` : ""}`;

  if (sp.get("format") === "csv") {
    const rows: unknown[][] = [["Levy", "Paid to", "Period", "Status", "Due", "Paid", "Left", "How it was worked out", "Payments"]];
    for (const g of data.groups) {
      for (const p of g.periods) {
        rows.push([
          g.ruleName, g.payee, p.label, p.status, p.due.toFixed(2), p.paid.toFixed(2), p.left.toFixed(2), p.lines.join("; "),
          p.payments.map((x) => `${x.date} ${x.amount.toFixed(2)} ${x.method}${x.reference ? ` ref ${x.reference}` : ""}`).join("; "),
        ]);
      }
      rows.push([`Total for ${g.ruleName}`, "", "", "", g.due.toFixed(2), g.paid.toFixed(2), g.left.toFixed(2), "", ""]);
    }
    rows.push([], ["TOTAL", "", "", "", data.totals.due.toFixed(2), data.totals.paid.toFixed(2), data.totals.left.toFixed(2), "", ""]);
    rows.push([`${data.churchName}, remittance statement${data.payee ? ` to ${data.payee}` : ""}, ${data.rangeLabel}`]);
    // Leading BOM so Excel reads the cedi sign and accents correctly.
    const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${base}.csv"` } });
  }

  const [{ renderStatementPdf }, { loadLogo }] = await Promise.all([import("@/lib/levies/statement-pdf"), import("@/lib/export/workbook")]);
  const logo = await loadLogo(data.logoUrl);
  const pdf = await renderStatementPdf(data, logo ? { buffer: logo.buffer } : null);
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${base}.pdf"`, "cache-control": "private, no-store" },
  });
}
