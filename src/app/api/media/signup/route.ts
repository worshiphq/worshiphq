import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sendOtp } from "@/lib/auth/otp";
import { rateLimitAll, ipFromRequest, MINUTE } from "@/lib/rate-limit";
import { MEDIA_CORS, NOT_YET, liveOpenTo } from "@/lib/media-license";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MEDIA_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: MEDIA_CORS });

/**
 * Step 1 of making an account from inside WorshipHQ Live (for churches that only want Media).
 * Body: { church, city, country, name, email, password, acceptedTerms }. Emails a 6-digit code; step 2 is ./verify.
 * The account is a normal WorshipHQ account on the Free plan, so the church can add more later if it wants.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const churchName = String(b.church ?? "").trim().slice(0, 120);
    const city = String(b.city ?? "").trim().slice(0, 80);
    const country = String(b.country ?? "Ghana").trim().slice(0, 60) || "Ghana";
    const name = String(b.name ?? "").trim().slice(0, 100);
    const email = String(b.email ?? "").toLowerCase().trim();
    const password = String(b.password ?? "");

    const ip = ipFromRequest(req);
    const allowed = await rateLimitAll([
      { key: `media-signup:ip:${ip}`, max: 10, windowMs: 60 * MINUTE },
      { key: `media-signup:email:${email}`, max: 5, windowMs: 60 * MINUTE },
    ]);
    if (!allowed) return json({ error: "Too many tries. Please wait a while and try again." }, 429);

    const { passwordMeetsPolicy } = await import("@/lib/password-policy");
    if (!churchName) return json({ error: "Enter your church's name." }, 400);
    if (city.length < 2) return json({ error: "Enter your town or city." }, 400);
    if (!name) return json({ error: "Enter your name." }, 400);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a real email address. We send a code to it." }, 400);
    if (!passwordMeetsPolicy(password)) return json({ error: "Choose a stronger password: at least 8 characters, with a capital letter, a number and a symbol (like ! or #)." }, 400);
    if (b.acceptedTerms !== true) return json({ error: "Please agree to the Terms and Privacy Policy." }, 400);
    if (!(await liveOpenTo(email))) return json(NOT_YET, 403);
    if (await db.user.findUnique({ where: { email } })) {
      return json({ error: "There's already a WorshipHQ account with that email. Sign in instead.", code: "exists" }, 409);
    }

    const payload = {
      churchName, city, country, name, email, phone: "", plan: "free", channel: "email",
      passwordHash: await hashPassword(password), heardFrom: "", heardDetail: "media-app",
    };
    const sent = await sendOtp({ channel: "email", email, purpose: "signup", payload });
    if (!sent.ok || !sent.verificationId) {
      return json({ error: sent.limited ? "Too many codes asked for. Please wait a while." : "We couldn't send the email. Check the address and try again." }, sent.limited ? 429 : 502);
    }
    return json({ verificationId: sent.verificationId, devCode: sent.devCode });
  } catch (e) {
    console.error("[media/signup]", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
