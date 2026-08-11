import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { personId, sessionId } = await req.json();
  if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });

  const person = await db.person.findFirst({
    where: { id: personId, churchId: session.churchId },
    select: { id: true, firstName: true, lastName: true, status: true, dateOfBirth: true, birthday: true, photoUrl: true, gender: true },
  });
  if (!person) return NextResponse.json({ ok: false, message: "Member not found" }, { status: 404 });

  const name = `${person.firstName} ${person.lastName}`;
  const who = { name, personId: person.id, photoUrl: person.photoUrl ?? null, gender: person.gender ?? null };

  if (!sessionId) {
    return NextResponse.json({ ok: true, ...who, message: "Identity verified" });
  }

  const sess = await db.attendanceSession.findFirst({ where: { id: sessionId, churchId: session.churchId } });
  if (!sess) return NextResponse.json({ ok: false, message: "Session not found" }, { status: 404 });

  const dup = await db.attendanceRecord.findFirst({ where: { sessionId, personId: person.id } });
  if (dup) {
    return NextResponse.json({ ok: true, ...who, alreadyIn: true, message: "Already checked in" });
  }

  let category = "adult";
  if (person.status === "visitor") category = "visitor";
  else if (person.dateOfBirth || person.birthday) {
    const dob = person.dateOfBirth ?? (person.birthday ? new Date(`2000-${person.birthday}`) : null);
    if (dob) {
      const age = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
      if (age < 13) category = "child";
      else if (age < 20) category = "teen";
    }
  }

  const catField: Record<string, string> = { adult: "adults", teen: "teens", child: "children", visitor: "visitors" };

  await db.attendanceRecord.create({
    data: {
      churchId: session.churchId,
      branchId: sess.branchId ?? undefined,
      personId: person.id,
      sessionId,
      category,
      serviceName: sess.serviceName,
      date: new Date(),
      method: "biometric",
    },
  });
  await db.attendanceSession.update({
    where: { id: sessionId },
    data: { [catField[category] ?? "adults"]: { increment: 1 } },
  });

  return NextResponse.json({ ok: true, ...who, category, message: "Checked in via fingerprint" });
}
