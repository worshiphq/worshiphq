import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyOtp } from "@/lib/auth/otp";
import { MEDIA_CORS, finishMediaSignIn } from "@/lib/media-license";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MEDIA_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: MEDIA_CORS });

/**
 * Step 2 of making an account from inside WorshipHQ Live: the emailed code. Creates the church (Free plan) and its
 * owner, starts the 14-day Media trial and signs this computer in. Body: { verificationId, code, deviceId, deviceName }.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const rawDevice = String(b.deviceId ?? "").trim();
    const deviceName = String(b.deviceName ?? "").trim().slice(0, 60) || "This computer";
    if (!rawDevice) return json({ error: "This computer couldn't be identified. Please restart WorshipHQ Live." }, 400);

    const result = await verifyOtp(String(b.verificationId ?? ""), String(b.code ?? "").trim(), { purpose: "signup" });
    if (!result.ok || !result.payload) return json({ error: result.error ?? "That code isn't right." }, 400);

    const p = result.payload as {
      churchName: string; city?: string; country?: string; name: string; email: string; passwordHash: string;
      heardFrom?: string; heardDetail?: string;
    };
    if (await db.user.findUnique({ where: { email: p.email } })) {
      return json({ error: "There's already a WorshipHQ account with that email. Sign in instead.", code: "exists" }, 409);
    }

    const { createChurchWithOwner } = await import("@/lib/signup/create-church");
    const created = await createChurchWithOwner({
      churchName: p.churchName, city: p.city, country: p.country, name: p.name, email: p.email,
      passwordHash: p.passwordHash, phone: "", phoneVerified: false, emailVerified: true,
      heardFrom: p.heardFrom, heardDetail: p.heardDetail,
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: created.userId }, include: { church: true } });
    const out = await finishMediaSignIn({ user, rawDevice, deviceName });
    return json(out.body, out.status);
  } catch (e) {
    console.error("[media/signup/verify]", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
