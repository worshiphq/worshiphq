import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { rpName, getRpConfig } from "@/lib/biometric";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { personId, response, challenge, deviceName } = await req.json();
  if (!personId || !response || !challenge) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const person = await db.person.findFirst({
    where: { id: personId, churchId: session.churchId },
    select: { id: true },
  });
  if (!person) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const { rpID, origin } = await getRpConfig();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    return NextResponse.json({ error: "Verification failed", detail: String(err) }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;

  await db.biometricCredential.create({
    data: {
      personId: person.id,
      churchId: session.churchId,
      type: "webauthn",
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: BigInt(credential.counter),
      deviceName: deviceName || null,
      transports: response.response?.transports?.join(",") ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
