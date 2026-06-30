import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "node:crypto";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-insecure-secret-change-me";

function verifyDesktopToken(token: string): { uid: string; cid: string } | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (mac !== expected) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const claims = verifyDesktopToken(token);
    if (!claims) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const sub = await db.subscription.findUnique({ where: { churchId: claims.cid } });
    const plan = sub?.plan ?? "free";
    const renewsAt = sub?.renewsAt?.toISOString() ?? null;
    const status = sub?.status ?? "active";

    const expiryPayload = JSON.stringify({ cid: claims.cid, plan, renewsAt, status, ts: Date.now() });
    const expiryBody = Buffer.from(expiryPayload).toString("base64url");
    const expirySig = crypto.createHmac("sha256", SECRET).update(expiryBody).digest("base64url");
    const signedExpiry = `${expiryBody}.${expirySig}`;

    return NextResponse.json({ plan, status, renewsAt, signedExpiry });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
