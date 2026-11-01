/**
 * Hubtel Online Checkout (https://payproxyapi.hubtel.com) for receiving payments into WorshipHQ's own
 * Hubtel collection account. A backup to Paystack for our own collections (SMS top-ups, subscriptions).
 * Kept free of app imports so it can be tested on its own.
 *
 * Flow: initHubtelCheckout() creates an invoice and returns a checkoutUrl we send the payer to. Hubtel then
 * POSTs the final status to our callbackUrl (ResponseCode "0000" = paid). If that callback is ever missed,
 * checkHubtelStatus() is the fallback, but note its endpoint is IP-whitelisted (a problem on hosts without a
 * fixed outbound IP, e.g. Vercel), so it may answer `ipBlocked`.
 */

export type HubtelConfig = {
  /** API ID (username) from the Hubtel dashboard. */
  apiId: string;
  /** API Key (password) from the Hubtel dashboard. */
  apiKey: string;
  /** The Collection Account Number that receives the money (merchantAccountNumber), e.g. "2039265". */
  merchantAccount: string;
  /** Override only for testing. */
  baseUrl?: string;
  statusBaseUrl?: string;
  timeoutMs?: number;
};

const INITIATE_BASE = "https://payproxyapi.hubtel.com";
const STATUS_BASE = "https://api-txnstatus.hubtel.com";

function basicAuth(apiId: string, apiKey: string): string {
  return "Basic " + Buffer.from(`${apiId}:${apiKey}`).toString("base64");
}

/** Hubtel rejects special characters in the description, so keep it to plain words, digits and spaces. */
export function cleanDescription(text: string): string {
  return (text ?? "").replace(/[^A-Za-z0-9 .,]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Payment";
}

export type HubtelInit = {
  ok: boolean;
  checkoutUrl?: string;
  checkoutId?: string;
  clientReference: string;
  error?: string;
};

export async function initHubtelCheckout(
  cfg: HubtelConfig,
  opts: {
    amountGhs: number;
    description: string;
    clientReference: string;
    callbackUrl: string;
    returnUrl: string;
    cancellationUrl: string;
    payeeName?: string;
    payeeMobileNumber?: string;
    payeeEmail?: string;
  },
  doFetch: typeof fetch = fetch,
): Promise<HubtelInit> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 15_000);
  try {
    const res = await doFetch(`${cfg.baseUrl ?? INITIATE_BASE}/items/initiate`, {
      method: "POST",
      headers: { authorization: basicAuth(cfg.apiId, cfg.apiKey), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        totalAmount: Math.round(opts.amountGhs * 100) / 100, // 2 decimal places only
        description: cleanDescription(opts.description),
        callbackUrl: opts.callbackUrl,
        returnUrl: opts.returnUrl,
        cancellationUrl: opts.cancellationUrl,
        merchantAccountNumber: cfg.merchantAccount,
        clientReference: opts.clientReference,
        ...(opts.payeeName ? { payeeName: opts.payeeName } : {}),
        ...(opts.payeeMobileNumber ? { payeeMobileNumber: opts.payeeMobileNumber } : {}),
        ...(opts.payeeEmail ? { payeeEmail: opts.payeeEmail } : {}),
      }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const d = (data?.data ?? {}) as { checkoutUrl?: string; checkoutId?: string; clientReference?: string };
    if (res.ok && d.checkoutUrl) {
      return { ok: true, checkoutUrl: d.checkoutUrl, checkoutId: d.checkoutId, clientReference: d.clientReference ?? opts.clientReference };
    }
    const message = typeof data?.message === "string" && data.message ? data.message : `Hubtel answered with HTTP ${res.status}.`;
    return { ok: false, clientReference: opts.clientReference, error: message };
  } catch (e) {
    const timedOut = (e as Error).name === "AbortError";
    return { ok: false, clientReference: opts.clientReference, error: timedOut ? "Hubtel took too long to answer." : "Could not reach Hubtel." };
  } finally {
    clearTimeout(timer);
  }
}

export type HubtelStatus = {
  ok: boolean;
  /** Hubtel's transaction status when known. */
  status?: "Paid" | "Unpaid" | "Refunded";
  /** True when Hubtel refused us because our server IP is not whitelisted (403). */
  ipBlocked?: boolean;
  error?: string;
};

/**
 * Fallback status check for when a callback never arrives. The endpoint is IP-whitelisted, so on a host
 * without a fixed outbound IP it returns 403; callers should treat `ipBlocked` as "unknown", not "unpaid".
 */
export async function checkHubtelStatus(cfg: HubtelConfig, clientReference: string, doFetch: typeof fetch = fetch): Promise<HubtelStatus> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 15_000);
  try {
    const url = `${cfg.statusBaseUrl ?? STATUS_BASE}/transactions/${encodeURIComponent(cfg.merchantAccount)}/status?clientReference=${encodeURIComponent(clientReference)}`;
    const res = await doFetch(url, { method: "GET", headers: { authorization: basicAuth(cfg.apiId, cfg.apiKey), accept: "application/json" }, signal: ctrl.signal });
    if (res.status === 403) return { ok: false, ipBlocked: true, error: "Hubtel's status check needs this server's IP whitelisted." };
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const raw = String((data?.data as { status?: string } | undefined)?.status ?? "");
    const status = raw === "Paid" || raw === "Unpaid" || raw === "Refunded" ? raw : undefined;
    if (res.ok && status) return { ok: true, status };
    return { ok: false, error: typeof data?.message === "string" ? data.message : `Hubtel status check returned HTTP ${res.status}.` };
  } catch (e) {
    const timedOut = (e as Error).name === "AbortError";
    return { ok: false, error: timedOut ? "Hubtel took too long to answer." : "Could not reach Hubtel." };
  } finally {
    clearTimeout(timer);
  }
}

/** Hubtel's success callback carries ResponseCode "0000" and Status "Success". Reads either casing safely. */
export function isHubtelCallbackSuccess(body: unknown): boolean {
  const b = (body ?? {}) as Record<string, unknown>;
  const code = String(b.ResponseCode ?? b.responseCode ?? "");
  const status = String(b.Status ?? b.status ?? "").toLowerCase();
  return code === "0000" && status === "success";
}

/** Pulls our clientReference and the amount out of a Hubtel callback body, whatever the casing. */
export function readHubtelCallback(body: unknown): { clientReference: string | null; amountGhs: number | null; checkoutId: string | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data = (b.Data ?? b.data ?? {}) as Record<string, unknown>;
  const clientReference = (data.ClientReference ?? data.clientReference ?? null) as string | null;
  const checkoutId = (data.CheckoutId ?? data.checkoutId ?? null) as string | null;
  const amt = Number(data.Amount ?? data.amount);
  return { clientReference, amountGhs: Number.isFinite(amt) ? amt : null, checkoutId };
}
