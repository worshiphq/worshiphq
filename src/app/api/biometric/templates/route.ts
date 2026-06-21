import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await db.biometricCredential.findMany({
    where: { churchId: session.churchId, type: "scanner", templateData: { not: null } },
    select: {
      id: true,
      personId: true,
      templateData: true,
      finger: true,
      quality: true,
      format: true,
      person: { select: { firstName: true, lastName: true, memberId: true } },
    },
  });

  return NextResponse.json({
    count: templates.length,
    templates: templates.map((t) => ({
      id: t.id,
      personId: t.personId,
      personName: `${t.person.firstName} ${t.person.lastName}`,
      memberId: t.person.memberId,
      templateData: t.templateData,
      finger: t.finger,
      quality: t.quality,
      format: t.format,
    })),
  });
}
