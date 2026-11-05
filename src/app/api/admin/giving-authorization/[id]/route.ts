import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The signed, stamped letter a church uploaded for a payment request (platform owner only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = await db.givingAuthorization.findUnique({ where: { paymentRequestId: id } });
  if (!row?.letterBytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(row.letterBytes), {
    headers: {
      "Content-Type": row.letterType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(row.letterName ?? "authorization-letter").replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
