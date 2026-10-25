import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { signDesktopToken, signPlanStamp } from "@/lib/desktop-auth";
import { rateLimitAll, ipFromRequest, MINUTE } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Limit password guessing, per account and per address.
    const ip = ipFromRequest(req);
    const allowed = await rateLimitAll([
      { key: `desk-signin:id:${email}`, max: 10, windowMs: 15 * MINUTE },
      { key: `desk-signin:ip:${ip}`, max: 30, windowMs: 15 * MINUTE },
    ]);
    if (!allowed) {
      return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { church: true },
    });

    if (!user || !user.passwordHash || user.church.suspended) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = signDesktopToken(user.id, user.churchId, user.sessionVersion);

    // Fetch subscription for plan enforcement
    const sub = await db.subscription.findUnique({ where: { churchId: user.churchId } });
    const plan = sub?.plan ?? "free";
    const renewsAt = sub?.renewsAt?.toISOString() ?? null;
    const subStatus = sub?.status ?? "active";

    // Server-signed expiry payload to prevent client-side tampering
    const signedExpiry = signPlanStamp({ cid: user.churchId, plan, renewsAt, status: subStatus });

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
