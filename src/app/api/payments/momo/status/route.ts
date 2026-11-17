import type { NextRequest } from "next/server";
import { openMomoToken } from "@/lib/billing/momo-token";
import { rateLimit, ipFromRequest, MINUTE } from "@/lib/rate-limit";
import { checkPendingCharge, verifyTransaction, chargeReferenceTime, CHARGE_REFERENCE_RE } from "@/lib/integrations/paystack-charge";
import { confirmAndFulfil } from "@/lib/billing/momo-start";

// Every check must reach the server: never cached, never prerendered.
export const dynamic = "force-dynamic";

/** After this long still "waiting", also read the transaction itself: it can say failed while the charge still says pending. */
const SECOND_LOOK_MS = 40_000;

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
  // Failed is final: tell the payer at once (the sheet stops waiting). A charge still "waiting" for a while gets a
  // second look at the transaction, which often settles as failed first (a number that isn't on that network).
  const startedAt = chargeReferenceTime(ref) ?? Date.now();
  if ((res.status === "pending" || res.status === "pay_offline") && Date.now() - startedAt > SECOND_LOOK_MS) {
    const txn = await verifyTransaction(ref);
    if (txn?.reference === ref && String(txn.status ?? "").toLowerCase() === "failed") {
      const why = (txn as { gateway_response?: unknown }).gateway_response;
      return json({ status: "failed", ...(typeof why === "string" && why.trim() ? { message: why.trim().slice(0, 300) } : {}), done: true });
    }
  }
  return json({
    status: res.status,
    ...(res.displayText ? { displayText: res.displayText } : {}),
    ...(res.message ? { message: res.message } : {}),
    done: res.status === "failed",
  });
}
