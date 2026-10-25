import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyDesktopToken, signPlanStamp } from "@/lib/desktop-auth";

export async function GET(req: Request) {
  try {
    const claims = await verifyDesktopToken(req.headers.get("authorization"));
    if (!claims) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const sub = await db.subscription.findUnique({ where: { churchId: claims.cid } });
    const plan = sub?.plan ?? "free";
    const renewsAt = sub?.renewsAt?.toISOString() ?? null;
    const status = sub?.status ?? "active";

    const signedExpiry = signPlanStamp({ cid: claims.cid, plan, renewsAt, status });

    return NextResponse.json({ plan, status, renewsAt, signedExpiry });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
