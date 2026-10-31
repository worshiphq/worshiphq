/**
 * Nalo Solutions bulk SMS (https://sms.nalosolutions.com), over its JSON endpoint.
 * Kept free of app imports so it can be tested on its own.
 *
 * Request:  POST /smsbackend/Resl_Nalo/send-message/  { key | username+password, msisdn, message, sender_id }
 * Response: "1701|<phone>|<message_id>" on success (plain text, pipe separated). Some accounts answer with
 *           JSON instead, so parseNaloResponse reads either. 1701 = accepted; see CODES for the rest.
 * Numbers go as digits with the country code and no "+", so Ghana and international numbers use the same call.
 */

export type NaloConfig = {
  /** The API key (auth key) from the Nalo dashboard. Preferred over username and password. */
  authKey?: string;
  username?: string;
  password?: string;
  /** Approved sender name, e.g. "WorshipHQ". */
  sender: string;
  /** Override only for testing. */
  baseUrl?: string;
  /** Give up on one message after this long. */
  timeoutMs?: number;
};

export type NaloOutcome = { ok: boolean; id?: string; code?: string; error?: string };

const DEFAULT_BASE = "https://sms.nalosolutions.com";
const ENDPOINT = "/smsbackend/Resl_Nalo/send-message/";

/** What the codes we know mean. Anything else is passed through with its number so it can be looked up with Nalo. */
const CODES: Record<string, string> = {
  "1701": "Accepted",
  "1702": "Nalo rejected the request (a required field was missing or wrong).",
  "1703": "Nalo rejected the login details (username, password or API key).",
  "1704": "Nalo rejected the message type.",
  "1705": "Nalo says the message content is not valid.",
  "1706": "Nalo says that phone number is not valid.",
  "1707": "Nalo says the sender name is not valid or not approved.",
  "1708": "Nalo rejected the delivery-report setting.",
  "1709": "Nalo could not validate the account. Check the API key.",
  "1710": "Nalo had an internal error. Try again shortly.",
  "1025": "The Nalo account is out of credit.",
  "1026": "The Nalo reseller account is out of credit.",
};

export const describeNaloCode = (code: string) => CODES[code] ?? `Nalo refused the message (code ${code}).`;

/** Reads Nalo's answer, which is normally JSON but can be "1701|233…|job" text. Never throws. */
export function parseNaloResponse(text: string): { code?: string; id?: string } {
  const raw = (text ?? "").trim();
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const code = j.status ?? j.code ?? j.Status;
    const id = j.job_id ?? j.jobId ?? j.message_id;
    return { code: code != null ? String(code) : undefined, id: id != null ? String(id) : undefined };
  } catch {
    const parts = raw.split("|");
    if (/^\d{3,5}$/.test(parts[0] ?? "")) return { code: parts[0], id: parts[2] };
    return {};
  }
}

export async function sendNaloOne(cfg: NaloConfig, to: string, message: string, doFetch: typeof fetch = fetch): Promise<NaloOutcome> {
  const auth = cfg.authKey ? { key: cfg.authKey } : { username: cfg.username, password: cfg.password };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 15_000);
  try {
    const res = await doFetch(`${cfg.baseUrl ?? DEFAULT_BASE}${ENDPOINT}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...auth, msisdn: to.replace(/\D/g, ""), message, sender_id: cfg.sender }),
      signal: ctrl.signal,
    });
    const { code, id } = parseNaloResponse(await res.text());
    if (code === "1701") return { ok: true, id, code };
    if (code) return { ok: false, code, error: describeNaloCode(code) };
    return { ok: false, error: `Nalo answered with HTTP ${res.status} and no status code.` };
  } catch (e) {
    const timedOut = (e as Error).name === "AbortError";
    return { ok: false, error: timedOut ? "Nalo took too long to answer." : "Could not reach Nalo." };
  } finally {
    clearTimeout(timer);
  }
}

/** One request per recipient (so each gets its own result), a few at a time so a big broadcast stays quick. */
export async function sendNaloBatch(
  cfg: NaloConfig,
  recipients: string[],
  message: string,
  { concurrency = 5, doFetch = fetch }: { concurrency?: number; doFetch?: typeof fetch } = {},
): Promise<NaloOutcome[]> {
  const out: NaloOutcome[] = new Array(recipients.length);
  let next = 0;
  const worker = async () => {
    while (next < recipients.length) {
      const i = next++;
      out[i] = await sendNaloOne(cfg, recipients[i]!, message, doFetch);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, recipients.length) }, worker));
  return out;
}
