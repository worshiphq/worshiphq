import "server-only";
import { env, features } from "@/lib/env";
import { normalisePhone } from "@/lib/phone";
import { sendNaloBatch } from "@/lib/integrations/nalo";
import { providerForNumber, resolveRouting, type SmsProvider } from "@/lib/sms/routing";

export type SmsResult = {
  ok: boolean;
  provider: string;
  stubbed: boolean;
  id?: string;
  error?: string;
  /** How many of the requested recipients actually got the message. A batch is
   *  never all-or-nothing - e.g. one bad phone number shouldn't zero out the
   *  other 80 that went through. Callers that bill per-recipient (sendChurchSms)
   *  must charge against this, not against the size of the recipient list. */
  sentCount: number;
  /** Per-recipient outcome (normalised phone/email actually dialled), in the
   *  same order as the input list, so callers can log a detailed send audit. */
  results: { to: string; ok: boolean }[];
};

// Approved sender IDs (e.g. Hubtel "HostHub") aren't our brand name, so we brand
// every message body with a heading (default "WorshipHQ"; church messages pass
// their own church name) so recipients know who it's from.
const DEFAULT_HEADING = "WorshipHQ";

function withHeading(message: string, heading: string | null): string {
  if (!heading) return message;
  return message.startsWith(heading) ? message : `${heading}\n${message}`;
}

/** The platform's own approved sender name for a carrier (used when a church has no sender of its own on it). */
function platformSenderFor(provider: SmsProvider): string {
  if (provider === "hubtel") return env.HUBTEL_SENDER_ID;
  if (provider === "arkesel") return env.ARKESEL_SENDER_ID;
  if (provider === "nalo") return env.NALO_SENDER_ID;
  if (provider === "mnotify") return env.MNOTIFY_SENDER_ID;
  return DEFAULT_HEADING;
}

const HUBTEL_USAGE_URL = "https://camp-registry-zqm3.vercel.app/api/hubtel-usage";

/**
 * We share one Hubtel account with HostHub (camp-registry), which tracks the
 * shared balance. Report segments sent so its balance stays accurate. Never
 * awaited by the caller and never throws - a reporting outage must not affect
 * our own SMS sending.
 */
function reportHubtelUsage(segments: number) {
  if (!segments || !env.HUBTEL_USAGE_SECRET) return;
  fetch(HUBTEL_USAGE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-usage-key": env.HUBTEL_USAGE_SECRET },
    body: JSON.stringify({ segments, source: "worshiphq" }),
  }).catch(() => {});
}

type GroupResult = { perOk: boolean[]; id?: string; error?: string };

/** Send one already-normalised group of recipients through a single carrier, with the message and sender
 *  already decided for that carrier. Returns one ok per recipient, in order. Never throws. */
async function sendViaProvider(provider: SmsProvider, recipients: string[], message: string, sender: string): Promise<GroupResult> {
  try {
    if (provider === "arkesel") {
      const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: { "api-key": env.ARKESEL_API_KEY!, "content-type": "application/json" },
        body: JSON.stringify({ sender, message, recipients }),
      });
      const data = await res.json().catch(() => ({}));
      // Arkesel's batch endpoint doesn't return per-recipient status - the whole batch shares one outcome.
      return { perOk: recipients.map(() => res.ok), id: data?.data?.[0]?.id, error: res.ok ? undefined : `Arkesel said ${res.status}` };
    }

    if (provider === "hubtel") {
      let id: string | undefined;
      let error: string | undefined;
      const perOk: boolean[] = [];
      let sent = 0;
      for (const recipient of recipients) {
        const url = new URL("https://sms.hubtel.com/v1/messages/send");
        url.searchParams.set("clientsecret", env.HUBTEL_CLIENT_SECRET!);
        url.searchParams.set("clientid", env.HUBTEL_CLIENT_ID!);
        url.searchParams.set("from", sender);
        url.searchParams.set("to", recipient);
        url.searchParams.set("content", message);
        const res = await fetch(url.toString());
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error(`[SMS:hubtel] ${res.status} → ${recipient}:`, data);
          error = `Hubtel said ${res.status}: ${JSON.stringify(data).slice(0, 300)}`;
        } else {
          sent++;
        }
        perOk.push(res.ok);
        id = data?.messageId ?? data?.MessageId ?? id;
      }
      reportHubtelUsage(sent); // one usage report for the whole group, not per recipient.
      return { perOk, id, error };
    }

    if (provider === "nalo") {
      // Nalo takes one number per request and reaches Ghana and other countries the same way, so a church
      // abroad can text its own members. Every number already arrives as digits with the country code.
      const outcomes = await sendNaloBatch(
        { authKey: env.NALO_AUTH_KEY, username: env.NALO_USERNAME, password: env.NALO_PASSWORD, sender },
        recipients,
        message,
      );
      const firstFailure = outcomes.find((o) => !o.ok);
      if (firstFailure) {
        const failed = outcomes.filter((o) => !o.ok).length;
        console.error(`[SMS:nalo] ${failed} of ${outcomes.length} not sent (${firstFailure.code ?? "no code"}): ${firstFailure.error}`);
      }
      return { perOk: outcomes.map((o) => o.ok), id: outcomes.find((o) => o.ok)?.id, error: firstFailure?.error };
    }

    // mnotify / twilio implementations follow the same shape.
    console.warn(`[SMS] provider "${provider}" not yet implemented - logging instead`);
    return { perOk: recipients.map(() => true) };
  } catch (e) {
    return { perOk: recipients.map(() => false), error: (e as Error).message };
  }
}

/**
 * Send an SMS. In stub mode (no provider key) it logs to the console and succeeds, so the whole app works
 * without real credentials.
 *
 * Routing: Ghana numbers go to the primary carrier (Hubtel), and numbers outside Ghana go to Nalo once it is
 * configured. A mixed list is split automatically and each recipient's result is reported in the original order.
 *
 * `opts.senderId` is the church's own sender name; it is only used on the primary carrier (a custom sender is
 * approved per carrier, and in Phase 1 no church has one on Nalo). International messages therefore go out under
 * the platform sender, so `opts.platformHeading` (the church name line) is added there so members still know who
 * it is from. `opts.heading` brands the primary carrier's messages as before (pass null for none).
 */
export async function sendSms(
  to: string | string[],
  rawMessage: string,
  opts?: {
    heading?: string | null;
    senderId?: string | null;
    /** Name line to prepend when a message goes out under a platform sender (e.g. Nalo for international). */
    platformHeading?: string | null;
  },
): Promise<SmsResult> {
  // Normalise to the digits-only format providers require (Hubtel rejects "024…"). Keep this in the SAME
  // order/length as the caller's list (even invalid entries) so `results` maps back to callers' recipients 1:1.
  const rawList = Array.isArray(to) ? to : [to];
  // Call it explicitly: handing normalisePhone straight to map() would pass each position in as its country.
  const normalised = rawList.map((p) => normalisePhone(p));
  const validIdx: number[] = [];
  const recipients: string[] = [];
  normalised.forEach((p, i) => {
    if (p.length >= 11) { validIdx.push(i); recipients.push(p); }
  });
  const toFullResults = (perValidOk: boolean[]): { to: string; ok: boolean }[] => {
    const out = normalised.map((p) => ({ to: p, ok: false }));
    validIdx.forEach((origIdx, i) => { out[origIdx].ok = perValidOk[i]; });
    return out;
  };

  const routing = resolveRouting();

  if (recipients.length === 0) {
    return { ok: false, provider: routing.primary, stubbed: false, error: "No valid phone numbers", sentCount: 0, results: toFullResults([]) };
  }

  if (!features.sms) {
    console.info(`[SMS:stub] (${routing.primary}${routing.international ? ` +${routing.international} intl` : ""}) → ${recipients.join(", ")}\n  "${rawMessage}"\n  (set the provider key in .env.local to send for real)`);
    return { ok: true, provider: routing.primary, stubbed: true, id: `stub_${Date.now()}`, sentCount: recipients.length, results: toFullResults(recipients.map(() => true)) };
  }

  // Group the valid recipients by the carrier that will handle each one.
  const groups = new Map<SmsProvider, number[]>();
  recipients.forEach((num, i) => {
    const p = providerForNumber(num, routing);
    const bucket = groups.get(p);
    if (bucket) bucket.push(i); else groups.set(p, [i]);
  });

  const perValidOk = new Array<boolean>(recipients.length).fill(false);
  let id: string | undefined;
  let firstError: string | undefined;
  const used: SmsProvider[] = [];

  for (const [provider, idxs] of groups) {
    const nums = idxs.map((i) => recipients[i]!);
    // A church's own sender name only applies on the primary carrier; international uses the platform sender.
    const custom = provider === routing.primary ? (opts?.senderId ?? null) : null;
    const sender = (custom ?? platformSenderFor(provider)).trim();
    // No heading when the church's own sender is used; otherwise the church name line (platformHeading) if we
    // have it, then the caller's heading, then brand with "WorshipHQ" unless the sender already is that.
    const heading = custom
      ? (opts?.heading ?? null)
      : opts?.platformHeading !== undefined
        ? opts.platformHeading
        : opts?.heading !== undefined
          ? opts.heading
          : sender.toLowerCase().replace(/\s/g, "") === DEFAULT_HEADING.toLowerCase() ? null : DEFAULT_HEADING;
    const message = withHeading(rawMessage, heading);

    const r = await sendViaProvider(provider, nums, message, sender);
    idxs.forEach((origIdx, k) => { perValidOk[origIdx] = r.perOk[k] ?? false; });
    if (!id && r.id) id = r.id;
    if (!firstError && r.error) firstError = r.error;
    used.push(provider);
  }

  const sentCount = perValidOk.filter(Boolean).length;
  return {
    ok: sentCount > 0,
    provider: used.join("+") || routing.primary,
    stubbed: false,
    id,
    ...(sentCount === 0 && firstError ? { error: firstError } : {}),
    sentCount,
    results: toFullResults(perValidOk),
  };
}
