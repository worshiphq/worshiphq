import type { NextRequest } from "next/server";
import { getActiveSession, planLockFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { payslipData } from "@/lib/payroll/payslip-data";
import { renderPayslip } from "@/lib/payroll/payslip-pdf";

export const dynamic = "force-dynamic";

/**
 * One payslip as a PDF. Allowed for payroll holders, or for the staff member themselves once the run is paid.
 * Support (impersonation) and the demo never get payslips. A reversed run's payslip is watermarked.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ lineId: string }> }) {
  const session = await getActiveSession();
  if (!session || session.isDemo || session.impersonating) return new Response("Not allowed", { status: 403 });
  if (planLockFor(session, "payroll")) return new Response("Payroll is part of the Max plan.", { status: 403 });
  const { lineId } = await ctx.params;
  const line = await db.payrollLine.findFirst({ where: { id: lineId, churchId: session.churchId }, select: { id: true, staffId: true, run: { select: { status: true } } } });
  if (!line) return new Response("Not found", { status: 404 });
  const own = !!session.staffId && line.staffId === session.staffId && line.run.status === "paid";
  if (!session.payroll && !own) return new Response("Not allowed", { status: 403 });
  const [slip] = await payslipData(session.churchId, [line.id]);
  if (!slip) return new Response("Not found", { status: 404 });
  const pdf = await renderPayslip(slip.data);
  const download = req.nextUrl.searchParams.get("download") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${slip.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
