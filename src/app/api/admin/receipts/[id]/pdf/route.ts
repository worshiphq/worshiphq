import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSuperAdmin } from "@/lib/auth";
import { pdfForRow } from "@/lib/receipts/service";
import { receiptNumber } from "@/lib/receipts/types";

export const dynamic = "force-dynamic";

/** A saved receipt as a PDF (platform owner only). ?download=1 saves it instead of showing it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = await db.receipt.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const pdf = await pdfForRow(row);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="Receipt ${receiptNumber(row)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
