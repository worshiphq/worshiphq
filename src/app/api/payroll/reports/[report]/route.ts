import type { NextRequest } from "next/server";
import { getActiveSession, planLockFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildWorkbook, loadLogo } from "@/lib/export/workbook";
import { buildReport, REPORTS, type ReportKey } from "@/lib/payroll/reports";
import { writeEvent } from "@/lib/payroll/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // A cell starting with = + - @ runs as a formula in Excel; text like that is prefixed so it shows as text.
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Payroll reports as Excel or CSV: ?run=<id> or ?year=2026, &format=csv, &ids=1 for full ID numbers (payroll manage
 * only, and recorded). The payment list (full account numbers) is manage only.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ report: string }> }) {
  const session = await getActiveSession();
  if (!session || session.isDemo || session.impersonating || !session.payroll) return new Response("Not allowed", { status: 403 });
  if (planLockFor(session, "payroll")) return new Response("Payroll is part of the Max plan.", { status: 403 });
  const { report } = await ctx.params;
  if (!Object.prototype.hasOwnProperty.call(REPORTS, report)) return new Response("Unknown report", { status: 404 });
  const key = report as ReportKey;
  const def = REPORTS[key];
  const manage = session.payroll === "manage";
  if ("manageOnly" in def && def.manageOnly && !manage) return new Response("Only payroll managers can download the payment list.", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const wantIds = sp.get("ids") === "1" && def.ids;
  if (wantIds && !manage) return new Response("Only payroll managers can download ID numbers.", { status: 403 });
  const runId = sp.get("run") ?? undefined;
  if (runId && !(await db.payrollRun.findFirst({ where: { id: runId, churchId: session.churchId }, select: { id: true } }))) return new Response("Not found", { status: 404 });

  let r;
  try {
    r = await buildReport(session.churchId, key, { runId, year: Number(sp.get("year")) || undefined, withIds: wantIds });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
  if (wantIds || key === "payments") {
    await writeEvent(db, { churchId: session.churchId, runId: runId ?? null, action: "report.sensitive", actorId: session.userId, actorName: session.name, detail: `Downloaded ${def.label}${wantIds ? " with ID numbers" : ""}` });
  }
  const base = `${key}-${r.title.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`.slice(0, 80);
  if (sp.get("format") === "csv") {
    const csv = "﻿" + [r.headers, ...r.rows].map((row) => row.map(cell).join(",")).join("\r\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "private, no-store" } });
  }
  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true, accentColor: true, logoUrl: true } });
  const buf = await buildWorkbook({
    churchName: church?.name ?? "Church", logo: await loadLogo(church?.logoUrl), color: church?.accentColor, preparedBy: session.name || undefined,
    sheets: [{ name: r.name.slice(0, 31), title: r.title, subtitle: r.subtitle, headers: r.headers, rows: r.rows }],
  });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
