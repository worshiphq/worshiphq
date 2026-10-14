import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { routeAutoSession } from "@/lib/attendance/service-times";
import { categoryForPerson } from "@/lib/data/attendance";
import { getAgeConfig } from "@/lib/data/age";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { personId, sessionId } = await req.json();
  if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });

  const person = await db.person.findFirst({
    where: { id: personId, churchId: session.churchId },
    select: { id: true, firstName: true, lastName: true, status: true, dateOfBirth: true, birthday: true, photoUrl: true, gender: true, ageGroup: true },
  });
  if (!person) return NextResponse.json({ ok: false, message: "Member not found" }, { status: 404 });

  const name = `${person.firstName} ${person.lastName}`;
  const who = { name, personId: person.id, photoUrl: person.photoUrl ?? null, gender: person.gender ?? null };

  if (!sessionId) {
    return NextResponse.json({ ok: true, ...who, message: "Identity verified" });
  }

  const opened = await db.attendanceSession.findFirst({ where: { id: sessionId, churchId: session.churchId } });
  if (!opened) return NextResponse.json({ ok: false, message: "Session not found" }, { status: 404 });
  // A scanner left running across services follows the service times.
  const sess = await routeAutoSession(opened);
  const moved = sess.id !== opened.id;

  const dup = await db.attendanceRecord.findFirst({ where: { sessionId: sess.id, personId: person.id } });
  if (dup) {
    return NextResponse.json({ ok: true, ...who, alreadyIn: true, sessionId: sess.id, serviceName: sess.serviceName, message: `Already checked in to ${sess.serviceName}` });
  }

  // Same age bands as every other check-in (set in Settings, Age groups).
  const category = categoryForPerson({ status: person.status, dateOfBirth: person.dateOfBirth, birthday: person.birthday, ageGroup: person.ageGroup }, await getAgeConfig(session.churchId));

  const catField: Record<string, string> = { adult: "adults", teen: "teens", child: "children", visitor: "visitors" };

  await db.attendanceRecord.create({
    data: {
      churchId: session.churchId,
      branchId: sess.branchId ?? undefined,
      personId: person.id,
      sessionId: sess.id,
      category,
      serviceName: sess.serviceName,
      date: new Date(),
      method: "biometric",
    },
  });
  await db.attendanceSession.update({
    where: { id: sess.id },
    data: { [catField[category] ?? "adults"]: { increment: 1 } },
  });

  if (person.status === "visitor") {
    const { recordVisitorCheckin } = await import("@/app/actions/visit");
    await recordVisitorCheckin(person.id, session.churchId).catch(() => {});
  }

  return NextResponse.json({
    ok: true, ...who, category, sessionId: sess.id, serviceName: sess.serviceName, moved,
    message: moved ? `Checked in to ${sess.serviceName}` : "Checked in via fingerprint",
  });
}
