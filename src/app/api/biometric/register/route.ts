import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** List which fingers a member already has registered (for the picker). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const personId = req.nextUrl.searchParams.get("personId");
  if (!personId) return NextResponse.json({ fingers: [] });
  const creds = await db.biometricCredential.findMany({
    where: { personId, churchId: session.churchId, type: "scanner" },
    select: { finger: true },
  });
  const fingers = [...new Set(creds.map((c) => c.finger).filter((f): f is string => !!f))];
  return NextResponse.json({ fingers, count: creds.length });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { personId, templateData, quality, format, deviceName, finger } = await req.json();
  if (!personId || !templateData) {
    return NextResponse.json({ error: "personId and templateData required" }, { status: 400 });
  }

  const person = await db.person.findFirst({
    where: { id: personId, churchId: session.churchId },
    select: { id: true },
  });
  if (!person) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const fingerId = typeof finger === "string" && finger.trim() ? finger.trim() : null;

  // Re-registering the same finger replaces the old template for it.
  if (fingerId) {
    await db.biometricCredential.deleteMany({
      where: { personId: person.id, churchId: session.churchId, type: "scanner", finger: fingerId },
    });
  }

  await db.biometricCredential.create({
    data: {
      personId: person.id,
      churchId: session.churchId,
      type: "scanner",
      templateData,
      finger: fingerId,
      quality: quality ?? 0,
      format: format ?? "raw",
      deviceName: deviceName || "USB Scanner",
    },
  });

  return NextResponse.json({ ok: true });
}
