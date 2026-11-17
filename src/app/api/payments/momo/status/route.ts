import type { NextRequest } from "next/server";
import { openMomoToken } from "@/lib/billing/momo-token";
import { rateLimit, ipFromRequest, MINUTE } from "@/lib/rate-limit";
import { checkPendingCharge, CHARGE_REFERENCE_RE } from "@/lib/integrations/paystack-charge";
import { confirmAndFulfil } from "@/lib/billing/momo-start";

// Every check must reach the server: never cached, never prerendered.
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * GET /api/payments/momo/status?ref=&t= : where a Mobile Money charge has got to.
 *
 * A Route Handler, not a server action: server actions from one page run one at a time, so a slow poll would hold up
 * the payer's voucher code. Only the signed token the payment sheet got when the charge started opens a reference.
 * A success is re-read from Paystack and applied here (idempotently) as well as by the webhook. It never returns
 * the charge's metadata.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") ?? "";
  const tok = openMomoToken(url.searchParams.get("t"));
  if (!CHARGE_REFERENCE_RE.test(ref) || !tok || tok.reference !== ref) return json({ status: "error", message: "This payment link has expired.", done: true }, 403);

  if (!(await rateLimit(`momo:status:ip:${ipFromRequest(request)}`, 120, 10 * MINUTE))) {
    return json({ status: "pending", message: "Checking too often. Please wait a moment.", done: false }, 429);
  }
  // Paystack asks for at least 10 seconds between checks of one charge. Inside that, just say "still waiting".
  if (!(await rateLimit(`momo:check:${ref}`, 1, 10_000))) return json({ status: "pending", done: false });

  const res = await checkPendingCharge(ref);
  if (res.status === "success") {
    const ok = await confirmAndFulfil(ref, tok.churchId, tok.kind);
    // Paystack's charge says success but the settled transaction isn't readable yet: keep waiting.
    if (!ok) return json({ status: "pending", done: false });
    return json({ status: "success", done: true });
  }
  // A reply we could not read is not a failed payment: keep waiting rather than tell the payer it failed.
  if (res.status === "error") return json({ status: "pending", done: false });
  return json({
    status: res.status,
    ...(res.displayText ? { displayText: res.displayText } : {}),
    ...(res.message ? { message: res.message } : {}),
    done: res.status === "failed",
  });
}
