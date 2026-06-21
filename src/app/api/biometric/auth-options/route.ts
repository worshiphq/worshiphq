import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRpConfig } from "@/lib/biometric";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { churchId } = session;
  const { rpID } = await getRpConfig();

  const credentials = await db.biometricCredential.findMany({
    where: { churchId, type: "webauthn", credentialId: { not: null } },
    select: { credentialId: true, transports: true },
  });

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId!,
      transports: (c.transports?.split(",") ?? []) as AuthenticatorTransport[],
    })),
  });

  return NextResponse.json({ options });
}
