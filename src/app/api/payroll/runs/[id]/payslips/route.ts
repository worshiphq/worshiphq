import type { NextRequest } from "next/server";
import { getActiveSession, planLockFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { payslipData } from "@/lib/payroll/payslip-data";
import { renderPayslipsZip } from "@/lib/payroll/payslip-pdf";
import { writeEvent } from "@/lib/payroll/engine";
import { periodLabel } from "@/lib/payroll/calc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every payslip of a run in one zip (payroll holders only). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getActiveSession();
  if (!session || session.isDemo || session.impersonating || !session.payroll) return new Response("Not allowed", { status: 403 });
  if (planLockFor(session, "payroll")) return new Response("Payroll is part of the Max plan.", { status: 403 });
  const { id } = await ctx.params;
  const run = await db.payrollRun.findFirst({ where: { id, churchId: session.churchId }, select: { id: true, year: true, month: true, status: true, lines: { where: { excluded: false }, select: { id: true } } } });
  if (!run) return new Response("Not found", { status: 404 });
  if (!["approved", "paid", "reversed"].includes(run.status)) return new Response("Payslips are ready once the payroll is approved.", { status: 400 });
  const slips = await payslipData(session.churchId, run.lines.map((l) => l.id));
  const zip = await renderPayslipsZip(slips.map((s) => ({ fileName: s.fileName, data: s.data })));
  await writeEvent(db, { churchId: session.churchId, runId: run.id, action: "payslips.downloaded", actorId: session.userId, actorName: session.name, detail: `Downloaded all payslips (${slips.length})` });
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="payslips-${periodLabel(run.year, run.month).replace(" ", "-")}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
