import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "node:crypto";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-insecure-secret-change-me";

function verifyToken(authHeader: string | null): { uid: string; cid: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return { uid: payload.uid, cid: payload.cid };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const auth = verifyToken(req.headers.get("authorization"));
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
  const auth = verifyToken(req.headers.get("authorization"));
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
