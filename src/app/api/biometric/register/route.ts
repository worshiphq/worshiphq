import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { personId, templateData, quality, format, deviceName } = await req.json();
  if (!personId || !templateData) {
    return NextResponse.json({ error: "personId and templateData required" }, { status: 400 });
  }

  const person = await db.person.findFirst({
    where: { id: personId, churchId: session.churchId },
    select: { id: true },
  });
  if (!person) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await db.biometricCredential.create({
    data: {
      personId: person.id,
      churchId: session.churchId,
      type: "scanner",
      templateData,
      quality: quality ?? 0,
      format: format ?? "raw",
      deviceName: deviceName || "USB Scanner",
    },
  });

  return NextResponse.json({ ok: true });
}
