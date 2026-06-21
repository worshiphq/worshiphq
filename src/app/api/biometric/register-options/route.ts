import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { rpName, rpID } from "@/lib/biometric";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { personId } = await req.json();
  if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });

  const person = await db.person.findFirst({
    where: { id: personId, churchId: session.churchId },
    select: { id: true, firstName: true, lastName: true, memberId: true },
  });
  if (!person) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const existing = await db.biometricCredential.findMany({
    where: { personId: person.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: `${person.firstName} ${person.lastName}`,
    userID: new TextEncoder().encode(person.id),
    userDisplayName: `${person.firstName} ${person.lastName}`,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "discouraged",
      userVerification: "required",
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: (c.transports?.split(",") ?? []) as AuthenticatorTransport[],
    })),
  });

  return NextResponse.json({ options, personId: person.id });
}
