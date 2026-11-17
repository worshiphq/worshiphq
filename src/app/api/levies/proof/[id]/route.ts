import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { hasSection } from "@/lib/permissions";
import { levyAccess } from "@/lib/levies/guards";

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/**
 * The receipt attached to a levy payment (id = the payment). Shown to the church that paid, or to its main church when
 * the payment is for a levy payable to it and the church still shares its levies.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getActiveSession();
  if (!session) return new NextResponse("Not allowed", { status: 403 });
  const { id } = await params;
  const pay = await db.levyPayment.findUnique({
    where: { id },
    select: {
      churchId: true, proofKey: true, proofType: true,
      record: { select: { rule: { select: { payeeChurchId: true } } } },
      church: { select: { parentChurchId: true, linkShare: true } },
    },
  });
  if (!pay?.proofKey) return new NextResponse("No receipt attached.", { status: 404 });

  const access = levyAccess(session);
  const own = pay.churchId === session.churchId && access.see && !access.lockedFeature;
  const asParent =
    !own &&
    pay.church.parentChurchId === session.churchId &&
    pay.church.linkShare.includes("levies") &&
    pay.record.rule.payeeChurchId === session.churchId &&
    hasSection(session, "levies") &&
    !(session.planLocked ?? []).includes("linked-churches");
  if (!own && !asParent) return new NextResponse("Not allowed", { status: 403 });
  if (!pay.proofKey.startsWith(`levy-proof/${pay.churchId}/`)) return new NextResponse("Not allowed", { status: 403 });

  const file = await getObject(pay.proofKey).catch(() => null);
  if (!file) return new NextResponse("The file could not be found.", { status: 404 });
  const type = pay.proofType && EXT[pay.proofType] ? pay.proofType : "application/octet-stream";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `inline; filename="levy-receipt.${EXT[type] ?? "bin"}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
