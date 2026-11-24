import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { phoneVariants } from "@/lib/phone";
import { rateLimitAll, ipFromRequest, MINUTE } from "@/lib/rate-limit";
import { MEDIA_CORS, finishMediaSignIn } from "@/lib/media-license";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MEDIA_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: MEDIA_CORS });

/**
 * Sign in to WorshipHQ Live with a WorshipHQ account (email or phone + password).
 * Body: { login, password, deviceId, deviceName, replaceDeviceId? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "");
    const rawDevice = String(body.deviceId ?? "").trim();
    const deviceName = String(body.deviceName ?? "").trim().slice(0, 60) || "This computer";
    const replaceId = body.replaceDeviceId ? String(body.replaceDeviceId) : undefined;
    if (!login || !password) return json({ error: "Enter your email or phone number and your password." }, 400);
    if (!rawDevice) return json({ error: "This computer couldn't be identified. Please restart WorshipHQ Live." }, 400);

    const ip = ipFromRequest(req);
    const allowed = await rateLimitAll([
      { key: `media-signin:id:${login.toLowerCase()}`, max: 10, windowMs: 15 * MINUTE },
      { key: `media-signin:ip:${ip}`, max: 30, windowMs: 15 * MINUTE },
    ]);
    if (!allowed) return json({ error: "Too many attempts. Please wait a few minutes and try again." }, 429);

    const user = login.includes("@")
      ? await db.user.findUnique({ where: { email: login.toLowerCase() }, include: { church: true } })
      : await db.user.findFirst({ where: { phone: { in: phoneVariants(login) } }, include: { church: true } });
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return json({ error: "That email/phone and password don't match a WorshipHQ account." }, 401);
    }
    if (user.church.suspended) return json({ error: "This church's WorshipHQ account is suspended. Please contact WorshipHQ support." }, 403);

    const out = await finishMediaSignIn({ user, rawDevice, deviceName, replaceId });
    return json(out.body, out.status);
  } catch (e) {
    console.error("[media/auth]", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
