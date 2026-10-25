import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyDesktopToken } from "@/lib/desktop-auth";

export async function GET(req: Request) {
  const auth = await verifyDesktopToken(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await db.paymentRequest.findFirst({
    where: { churchId: auth.cid },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true, meetingDate: true, meetingType: true,
      adminNotes: true, ussdCode: true, portalUrl: true, createdAt: true,
    },
  });

  return NextResponse.json({ request });
}

export async function POST(req: Request) {
  const auth = await verifyDesktopToken(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const contactName = String(body.contactName ?? "").trim();
    const contactPhone = String(body.contactPhone ?? "").trim();
    const contactEmail = String(body.contactEmail ?? "").trim();
    const needs = String(body.needs ?? "").trim();

    if (!contactName) return NextResponse.json({ error: "Contact name is required" }, { status: 400 });

    const existing = await db.paymentRequest.findFirst({
      where: { churchId: auth.cid, status: { in: ["pending", "scheduled", "in_progress"] } },
    });
    if (existing) {
      return NextResponse.json({ error: "You already have an active payment request. Please wait for admin to process it." }, { status: 409 });
    }

    await db.paymentRequest.create({
      data: {
        churchId: auth.cid,
        requestedBy: auth.uid,
        contactName,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
        needs: needs || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
