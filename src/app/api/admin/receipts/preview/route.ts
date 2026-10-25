import { NextResponse } from "next/server";
import { getSuperAdmin } from "@/lib/auth";
import { draftFromForm } from "@/lib/receipts/input";
import { ReceiptOverflowError, renderReceiptPdf } from "@/lib/receipts/pdf";
import { getReceiptSettings } from "@/lib/receipts/service";

export const dynamic = "force-dynamic";

/** The live preview on the Receipts page: draws the receipt as typed so far. Platform owner only. Saves nothing. */
export async function POST(req: Request) {
  if (!(await getSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const d = draftFromForm(body);
  try {
    const pdf = await renderReceiptPdf({
      brand: d.brand, sheet: d.sheet, kind: "manual", number: null, issuedAt: d.issuedAt,
      toName: d.toName, toOrg: d.toOrg, toEmail: d.toEmail, toPhone: d.toPhone, toAddress: d.toAddress, currency: d.currency,
      items: d.items, discount: d.discount, paid: d.paid, method: d.method, reference: d.reference, notes: d.notes,
      signatureLines: d.signatureLines, settings: await getReceiptSettings(),
    });
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="receipt-preview.pdf"', "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ReceiptOverflowError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[receipt preview]", (e as Error).message);
    return NextResponse.json({ error: "Could not draw the receipt." }, { status: 500 });
  }
}
