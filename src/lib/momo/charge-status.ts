/**
 * Reading Paystack Charge API replies (POST /charge, POST /charge/submit_otp, GET /charge/:reference). Pure, so it
 * can be tested without a network and shared with the client for its types.
 */

export type MomoChargeStatus = "pay_offline" | "send_otp" | "pending" | "success" | "failed" | "error";

export type MappedCharge = { status: MomoChargeStatus; displayText?: string; message?: string };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined);

/**
 * pay_offline: the payer approves on their phone (display_text says how). send_otp: Telecel voucher code needed.
 * success / failed are final. Anything else Paystack may add (send_pin, open_url, send_phone...) is treated as
 * pending, with its display_text shown, so a new step never looks like a failure.
 */
export function mapChargeResponse(json: unknown): MappedCharge {
  const top = (json && typeof json === "object" ? json : {}) as { status?: unknown; message?: unknown; data?: unknown };
  const data = (top.data && typeof top.data === "object" ? top.data : {}) as {
    status?: unknown; display_text?: unknown; message?: unknown; gateway_response?: unknown;
  };
  const s = typeof data.status === "string" ? data.status.toLowerCase() : "";
  const displayText = str(data.display_text);
  const message = str(data.gateway_response) ?? str(data.message) ?? str(top.message);

  if (!s) {
    // No charge status at all: Paystack refused the request (bad phone, provider, amount...).
    return { status: top.status === false ? "failed" : "error", ...(message ? { message } : {}) };
  }
  switch (s) {
    case "success":
      return { status: "success" };
    case "failed":
    case "abandoned":
    case "reversed":
    case "timeout":
      return { status: "failed", ...(message ? { message } : {}) };
    case "pay_offline":
      return { status: "pay_offline", ...(displayText ? { displayText } : {}) };
    case "send_otp":
      return { status: "send_otp", ...(displayText ? { displayText } : {}) };
    case "pending":
    case "ongoing":
    case "processing":
      return { status: "pending", ...(displayText ? { displayText } : {}) };
    default:
      return { status: "pending", ...(displayText ? { displayText } : {}) };
  }
}

/** A status the sheet can stop waiting on. */
export const isFinalChargeStatus = (s: MomoChargeStatus) => s === "success" || s === "failed" || s === "error";
