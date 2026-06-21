import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const personId = url.searchParams.get("personId");
  if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });

  const templates = await db.biometricCredential.findMany({
    where: { personId, churchId: session.churchId },
    select: { id: true, finger: true, quality: true, format: true, registeredAt: true, deviceName: true },
    orderBy: { registeredAt: "desc" },
  });

  return NextResponse.json({ templates });
}
