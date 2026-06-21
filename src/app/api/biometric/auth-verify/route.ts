import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRpConfig } from "@/lib/biometric";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { response, challenge, sessionId } = await req.json();
  if (!response || !challenge) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { rpID, origin } = await getRpConfig();

  const credentialId = response.id;
  const cred = await db.biometricCredential.findFirst({
    where: { churchId: session.churchId, type: "webauthn", credentialId },
    include: { person: { select: { id: true, firstName: true, lastName: true, status: true, dateOfBirth: true, birthday: true } } },
  });

  if (!cred) {
    return NextResponse.json({ ok: false, message: "Fingerprint not recognized. Has this member registered their biometrics?" }, { status: 404 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId!,
        publicKey: Buffer.from(cred.publicKey!, "base64url"),
        counter: Number(cred.counter),
        transports: (cred.transports?.split(",") ?? []) as AuthenticatorTransport[],
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, message: "Fingerprint verification failed", detail: String(err) }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ ok: false, message: "Fingerprint verification failed" }, { status: 400 });
  }

  await db.biometricCredential.update({
    where: { id: cred.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter) },
  });

  if (sessionId) {
    const sess = await db.attendanceSession.findFirst({ where: { id: sessionId, churchId: session.churchId } });
    if (sess) {
      const dup = await db.attendanceRecord.findFirst({ where: { sessionId, personId: cred.person.id } });
      if (dup) {
        return NextResponse.json({
          ok: true,
          name: `${cred.person.firstName} ${cred.person.lastName}`,
          message: "Already checked in",
          personId: cred.person.id,
        });
      }

      const p = cred.person;
      let category = "adult";
      if (p.status === "visitor") category = "visitor";
      else if (p.dateOfBirth || p.birthday) {
        const dob = p.dateOfBirth ?? (p.birthday ? new Date(`2000-${p.birthday}`) : null);
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
          personId: cred.person.id,
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
    }
  }

  return NextResponse.json({
    ok: true,
    name: `${cred.person.firstName} ${cred.person.lastName}`,
    message: "Checked in via fingerprint",
    personId: cred.person.id,
  });
}
