import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import crypto from "node:crypto";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-insecure-secret-change-me";

function signDesktopToken(userId: string, churchId: string): string {
  const payload = JSON.stringify({ uid: userId, cid: churchId, t: Date.now() });
  const body = Buffer.from(payload).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { church: true },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = signDesktopToken(user.id, user.churchId);

    // Fetch subscription for plan enforcement
    const sub = await db.subscription.findUnique({ where: { churchId: user.churchId } });
    const plan = sub?.plan ?? "free";
    const renewsAt = sub?.renewsAt?.toISOString() ?? null;
    const subStatus = sub?.status ?? "active";

    // Server-signed expiry payload to prevent client-side tampering
    const expiryPayload = JSON.stringify({ cid: user.churchId, plan, renewsAt, status: subStatus, ts: Date.now() });
    const expiryBody = Buffer.from(expiryPayload).toString("base64url");
    const expirySig = crypto.createHmac("sha256", SECRET).update(expiryBody).digest("base64url");
    const signedExpiry = `${expiryBody}.${expirySig}`;

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        churchId: user.churchId,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        photoUrl: user.photoUrl,
      },
      church: {
        id: user.church.id,
        slug: user.church.slug,
        name: user.church.name,
        denomination: user.church.denomination,
        city: user.church.city,
        country: user.church.country,
        address: user.church.address,
        accentColor: user.church.accentColor,
        logoUrl: user.church.logoUrl,
        memberPrefix: user.church.memberPrefix,
        memberSeq: user.church.memberSeq,
      },
      subscription: {
        plan,
        status: subStatus,
        renewsAt,
        signedExpiry,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
