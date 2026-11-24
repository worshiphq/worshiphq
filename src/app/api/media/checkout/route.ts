import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { MEDIA_CORS, verifyMediaToken } from "@/lib/media-license";
import { mediaQuote, type MediaInterval } from "@/lib/media-billing";
import { initializePayment, newPaymentReference } from "@/lib/integrations/paystack";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MEDIA_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...MEDIA_CORS, "Cache-Control": "no-store" } });

/** The prices this church pays for WorshipHQ Live (dollars and cedis). */
export async function GET(req: Request) {
  const auth = await verifyMediaToken(req.headers.get("authorization"));
  if (!auth) return json({ error: "Please sign in again.", code: "signed_out" }, 401);
  const [monthly, yearly] = await Promise.all([mediaQuote(auth.cid, "monthly"), mediaQuote(auth.cid, "yearly")]);
  return json({ monthly, yearly });
}

/** Start paying for WorshipHQ Live. Body: { interval }. Returns the Paystack page to open in the browser. */
export async function POST(req: Request) {
  try {
    const auth = await verifyMediaToken(req.headers.get("authorization"));
    if (!auth) return json({ error: "Please sign in again.", code: "signed_out" }, 401);
    const b = await req.json().catch(() => ({}));
    const interval: MediaInterval = b.interval === "yearly" ? "yearly" : "monthly";

    const user = await db.user.findUnique({ where: { id: auth.uid }, select: { email: true } });
    if (!user?.email) return json({ error: "Add an email address to your WorshipHQ account first (Paystack sends the receipt there)." }, 400);

    const q = await mediaQuote(auth.cid, interval);
    if (!(q.ghs > 0)) return json({ error: "Payments are not set up yet. Please contact WorshipHQ." }, 503);

    const reference = newPaymentReference();
    const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const init = await initializePayment({
      email: user.email,
      amount: q.ghs,
      currency: "GHS",
      reference,
      metadata: { kind: "media", churchId: auth.cid, interval, usd: q.usd, rate: q.rate },
      callbackUrl: `${appUrl}/media/paid`,
      stubReturnUrl: `${appUrl}/media/paid?reference=${reference}`,
    });
    if (!init.ok || !init.authorizationUrl) return json({ error: init.error ?? "Paystack didn't answer. Please try again." }, 502);
    return json({ url: init.authorizationUrl, reference, amountGhs: q.ghs, usd: q.usd });
  } catch (e) {
    console.error("[media/checkout]", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
