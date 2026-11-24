import "server-only";
import { env, features } from "@/lib/env";
import { normalisePhone } from "@/lib/phone";
import { sendNaloBatch } from "@/lib/integrations/nalo";
import { getPlatformCarrier } from "@/lib/sms/platform-carrier";
import { logPlatformSms } from "@/lib/admin-audit";
import { segmentsFor } from "@/config/sms";
import { getSmsRates, rateFor } from "@/lib/sms/cost";
import { providerForNumber, routingForChurch, isGhanaNumber, type SmsProvider } from "@/lib/sms/routing";

/**
 * Sample phone numbers used in teaching and demo churches: Ghana numbers starting 010 (233 10…). No real Ghana
 * number starts with 01, so blocking them can never stop a real person's text.
 */
export function isSamplePhone(normalised: string): boolean {
  return /^23310\d{7}$/.test(normalised);
}

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
  /** What this send cost us, summed over the carriers it used, at the price set for each. */
  costGhs?: number;
  /** Segments actually sent (segments in the message x recipients reached). */
  billedSegments?: number;
  /** The carrier's own summary of the send when it gives one, e.g. Africa's Talking's "Sent to 1/1 Total Cost: KES 0.8000". */
  providerCost?: string;
  /** Per-recipient outcome (normalised phone/email actually dialled), in the
   *  same order as the input list, so callers can log a detailed send audit. */
  results: SmsRecipientResult[];
};

/** One recipient's outcome. `id` is the carrier's message id, kept so delivery can be checked later. */
export type SmsRecipientResult = { to: string; ok: boolean; id?: string; error?: string; report?: boolean };

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
  // Empty until our sender name is registered with Africa's Talking: they then use their own default name.
  if (provider === "africastalking") return env.AFRICASTALKING_SENDER_ID;
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

type GroupResult = { perOk: boolean[]; reports?: boolean[]; ids?: (string | undefined)[]; errors?: (string | undefined)[]; id?: string; error?: string; providerCost?: string };

/** Africa's Talking status codes that mean it took the message: 100 processed, 101 sent, 102 queued. */
const AT_OK = new Set([100, 101, 102]);

/** Send through Africa's Talking, up to 100 numbers per request. They report each number's outcome and its cost. */
async function sendAfricasTalking(recipients: string[], message: string, sender: string): Promise<GroupResult> {
  const username = env.AFRICASTALKING_USERNAME!;
  const base = username === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
  const perOk: boolean[] = new Array(recipients.length).fill(false);
  const ids: (string | undefined)[] = new Array(recipients.length);
  const errors: (string | undefined)[] = new Array(recipients.length);
  let error: string | undefined;
  let providerCost: string | undefined;
  for (let start = 0; start < recipients.length; start += 100) {
    const chunk = recipients.slice(start, start + 100);
    const body = new URLSearchParams({ username, to: chunk.map((n) => `+${n}`).join(","), message });
    if (sender) body.set("from", sender);
    try {
      const res = await fetch(`${base}/version1/messaging`, {
        method: "POST",
        headers: { apiKey: env.AFRICASTALKING_API_KEY!, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      let data: { SMSMessageData?: { Message?: string; Recipients?: { number?: string; statusCode?: number; status?: string; cost?: string; messageId?: string }[] } } = {};
      try { data = JSON.parse(text); } catch { /* not JSON: an error page or a plain-text refusal */ }
      if (!res.ok || !data.SMSMessageData) {
        const err = `Africa's Talking said ${res.status}: ${text.slice(0, 200)}`;
        console.error(`[SMS:africastalking] ${err}`);
        error = error ?? err;
        chunk.forEach((_, k) => { errors[start + k] = err; });
        continue;
      }
      const list = data.SMSMessageData.Recipients ?? [];
      providerCost = data.SMSMessageData.Message ?? providerCost;
      chunk.forEach((num, k) => {
        const r = list.find((x) => (x.number ?? "").replace(/\D/g, "") === num);
        const i = start + k;
        if (r && AT_OK.has(Number(r.statusCode))) {
          perOk[i] = true;
          ids[i] = r.messageId;
        } else {
          errors[i] = r ? `Africa's Talking: ${r.status ?? "refused"} (code ${r.statusCode})` : `Africa's Talking did not take this number: ${data.SMSMessageData?.Message ?? ""}`;
          error = error ?? errors[i];
        }
      });
    } catch (e) {
      const err = `Could not reach Africa's Talking: ${(e as Error).message}`;
      error = error ?? err;
      chunk.forEach((_, k) => { errors[start + k] = err; });
    }
  }
  return { perOk, ids, errors, id: ids.find(Boolean), error, providerCost };
}

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
      const perOk: boolean[] = new Array(recipients.length).fill(false);
      const ids: (string | undefined)[] = new Array(recipients.length);
      const errors: (string | undefined)[] = new Array(recipients.length);
      let sent = 0;
      // A few at a time: one by one, a broadcast to a whole church could outlast the request.
      let next = 0;
      const one = async (k: number) => {
        const recipient = recipients[k]!;
        const url = new URL("https://sms.hubtel.com/v1/messages/send");
        url.searchParams.set("clientsecret", env.HUBTEL_CLIENT_SECRET!);
        url.searchParams.set("clientid", env.HUBTEL_CLIENT_ID!);
        url.searchParams.set("from", sender);
        url.searchParams.set("to", recipient);
        url.searchParams.set("content", message);
        try {
          const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
          const data = await res.json().catch(() => ({}));
          // Hubtel answers 200/201 with status 0 when it takes the message. Any other status is a refusal, even on a 2xx.
          const st = data?.status ?? data?.Status;
          const accepted = res.ok && !(typeof st === "number" && st !== 0);
          const mid = data?.messageId ?? data?.MessageId;
          if (!accepted) {
            console.error(`[SMS:hubtel] ${res.status} → ${recipient}:`, data);
            errors[k] = `Hubtel said ${res.status}${st != null ? ` (status ${st})` : ""}: ${JSON.stringify(data).slice(0, 200)}`;
            error = errors[k];
          } else {
            sent++;
          }
          perOk[k] = accepted;
          if (mid) { ids[k] = String(mid); id = id ?? String(mid); }
        } catch (e) {
          errors[k] = `Could not reach Hubtel: ${(e as Error).message}`;
          error = errors[k];
        }
      };
      await Promise.all(Array.from({ length: Math.min(5, recipients.length) }, async () => {
        while (next < recipients.length) await one(next++);
      }));
      reportHubtelUsage(sent); // one usage report for the whole group, not per recipient.
      return { perOk, ids, errors, id, error };
    }

    if (provider === "africastalking") return await sendAfricasTalking(recipients, message, sender);

    if (provider === "nalo") {
      // Nalo takes one number per request and reaches Ghana and other countries the same way, so a church
      // abroad can text its own members. Every number already arrives as digits with the country code.
      const reports = await import("@/lib/sms/nalo-reports");
      const mode = await reports.getNaloReportMode();
      const outcomes = await sendNaloBatch(
        { ...(mode !== "off" ? { report: { method: mode, next: reports.newNaloCallback } } : {}), authKey: env.NALO_AUTH_KEY, username: env.NALO_USERNAME, password: env.NALO_PASSWORD, sender },
        recipients,
        message,
      );
      // Reports are filed under the message id, so a text without one could never be matched.
      const watched = outcomes.flatMap((o, i) => (o.ok && o.ref && o.id ? [{ ref: o.ref, jobId: o.id, to: recipients[i]! }] : []));
      if (watched.length) await reports.rememberNaloSends(watched);
      const firstFailure = outcomes.find((o) => !o.ok);
      if (firstFailure) {
        const failed = outcomes.filter((o) => !o.ok).length;
        console.error(`[SMS:nalo] ${failed} of ${outcomes.length} not sent (${firstFailure.code ?? "no code"}): ${firstFailure.error}`);
      }
      return { perOk: outcomes.map((o) => o.ok), reports: outcomes.map((o) => !!(o.ok && o.ref && o.id)), ids: outcomes.map((o) => o.id), errors: outcomes.map((o) => o.error), id: outcomes.find((o) => o.ok)?.id, error: firstFailure?.error };
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
    /** The carrier this church is set to in SuperAdmin, with null meaning the default. Left out entirely, the text is
     *  one of WorshipHQ's own and follows the SuperAdmin setting for those. */
    carrier?: string | null;
    /** The carrier that approved `senderId`. Empty = the church's own carrier. */
    senderCarrier?: string | null;
    /** The caller records this send itself (church sends are written to SmsAuditLog), so it is not also logged here. */
    logged?: boolean;
    /** The text is on behalf of this church but not charged to its credits, such as a donor's gift receipt. */
    churchId?: string | null;
    /** Allow numbers outside Ghana on a text WorshipHQ pays for. Off by default: each costs about GHS 2, so only
     *  sends the owner chooses (outreach, a SuperAdmin test) set it. Church sends (`logged`) are paid by credits. */
    international?: boolean;
  },
): Promise<SmsResult> {
  // Normalise to the digits-only format providers require (Hubtel rejects "024…"). Keep this in the SAME
  // order/length as the caller's list (even invalid entries) so `results` maps back to callers' recipients 1:1.
  const rawList = Array.isArray(to) ? to : [to];
  // Call it explicitly: handing normalisePhone straight to map() would pass each position in as its country.
  const normalised = rawList.map((p) => normalisePhone(p));
  // A text WorshipHQ pays for (not billed to a church's credits) never goes to a number outside Ghana unless the
  // caller asks: each costs about GHS 2, and a sign-in code or notice there goes by email instead.
  const blockForeign = !opts?.logged && !opts?.international;
  const blocked = (p: string) => blockForeign && p.length >= 11 && !isGhanaNumber(p);
  const validIdx: number[] = [];
  const recipients: string[] = [];
  // Sample numbers (teaching and demo churches) are never sent to anyone: they are reported as sent, so the
  // screens behave normally, but no carrier ever sees them.
  const sampleIdx: number[] = [];
  normalised.forEach((p, i) => {
    if (isSamplePhone(p)) sampleIdx.push(i);
    else if (p.length >= 11 && !blocked(p)) { validIdx.push(i); recipients.push(p); }
  });
  const toFullResults = (perValidOk: boolean[], ids?: (string | undefined)[], errs?: (string | undefined)[], reps?: boolean[]): SmsRecipientResult[] => {
    const out: SmsRecipientResult[] = normalised.map((p) => ({
      to: p, ok: false,
      ...(p.length < 11 ? { error: "Not a valid phone number" } : blocked(p) ? { error: "Not sent: this message is not texted to numbers outside Ghana" } : {}),
    }));
    for (const i of sampleIdx) out[i] = { to: normalised[i]!, ok: true, id: "sample" };
    validIdx.forEach((origIdx, i) => {
      out[origIdx].ok = perValidOk[i];
      if (ids?.[i]) out[origIdx].id = ids[i];
      if (reps?.[i]) out[origIdx].report = true;
      if (!perValidOk[i] && errs?.[i]) out[origIdx].error = errs[i];
    });
    return out;
  };

  const platformCarrier = opts?.carrier === undefined ? await getPlatformCarrier() : null;
  const routing = routingForChurch(opts?.carrier === undefined ? platformCarrier : opts.carrier);

  if (recipients.length === 0 && sampleIdx.length > 0) {
    console.info(`[SMS:sample] ${sampleIdx.length} sample number(s), not sent: "${rawMessage.slice(0, 60)}"`);
    // Shown as a normal successful send (a dummy success), so a teaching church looks exactly like a real one.
    return { ok: true, provider: "sample", stubbed: false, id: `sample_${Date.now()}`, sentCount: sampleIdx.length, results: toFullResults([]) };
  }
  if (recipients.length === 0) {
    const onlyForeign = normalised.some((p) => blocked(p));
    return { ok: false, provider: routing.primary, stubbed: false, error: onlyForeign ? "Texts to numbers outside Ghana are not sent for this message" : "No valid phone numbers", sentCount: 0, results: toFullResults([]) };
  }

  // A text on behalf of the hidden internal QA church is never really sent.
  if (opts?.churchId) {
    const { isInternalChurchId } = await import("@/lib/internal-church");
    if (await isInternalChurchId(opts.churchId)) {
      console.info(`[SMS:qa-stub] ${opts.churchId} -> ${recipients.join(", ")}
  "${rawMessage}"`);
      return { ok: true, provider: "stub", stubbed: true, id: `stub_${Date.now()}`, sentCount: recipients.length, results: toFullResults(recipients.map(() => true)) };
    }
  }

  if (!features.sms) {
    console.info(`[SMS:stub] (${routing.primary}${routing.international ? ` +${routing.international} intl` : ""}) → ${recipients.join(", ")}\n  "${rawMessage}"\n  (set the provider key in .env.local to send for real)`);
    return { ok: true, provider: routing.primary, stubbed: true, id: `stub_${Date.now()}`, sentCount: recipients.length, results: toFullResults(recipients.map(() => true)) };
  }

  // Group the valid recipients by the carrier that will handle each one.
  // US and Canada (+1) don't show sender names: the text arrives from a plain number. Those numbers never use the
  // church's own sender, so they always carry the church name line instead.
  const groups = new Map<string, number[]>();
  recipients.forEach((num, i) => {
    const key = `${providerForNumber(num, routing)}|${num.startsWith("1") ? "nanp" : ""}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(i); else groups.set(key, [i]);
  });

  const perValidOk = new Array<boolean>(recipients.length).fill(false);
  const perValidId = new Array<string | undefined>(recipients.length);
  const perValidErr = new Array<string | undefined>(recipients.length);
  const perValidRep = new Array<boolean>(recipients.length).fill(false);
  let id: string | undefined;
  let firstError: string | undefined;
  let providerCost: string | undefined;
  const used: SmsProvider[] = [];
  const rates = await getSmsRates().catch(() => ({ hubtel: 0.03, nalo: 0.032, intl: 2 }));
  const groupLogs: { provider: SmsProvider; sender: string; to: string[]; sent: number; segments: number; cost: number; error?: string }[] = [];
  let costGhs = 0;
  let billedSegments = 0;

  for (const [key, idxs] of groups) {
    const [providerKey, nanp] = key.split("|");
    const provider = providerKey as SmsProvider;
    const nums = idxs.map((i) => recipients[i]!);
    // A church's own sender name only works on the carrier that approved it, and never in the US or Canada.
    // Anywhere else, the platform sender.
    const custom = !nanp && provider === (opts?.senderCarrier ?? routing.primary) ? (opts?.senderId ?? null) : null;
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
    idxs.forEach((origIdx, k) => {
      perValidOk[origIdx] = r.perOk[k] ?? false;
      perValidId[origIdx] = r.ids?.[k];
      perValidRep[origIdx] = r.reports?.[k] ?? false;
      perValidErr[origIdx] = r.errors?.[k] ?? (r.perOk[k] ? undefined : r.error);
    });
    if (!id && r.id) id = r.id;
    if (r.providerCost) providerCost = r.providerCost;
    if (!firstError && r.error) firstError = r.error;
    used.push(provider);

    // The carrier bills per segment per recipient reached. Recorded now, at today's price, so a later price change
    // never rewrites what an old text cost.
    const reached = r.perOk.filter(Boolean).length;
    const segments = segmentsFor(message);
    // Numbers outside Ghana are billed at the international price, whichever carrier sent them.
    const priced = nums.reduce((a, n, k) => a + (r.perOk[k] ? (isGhanaNumber(n) ? rateFor(rates, provider) : rates.intl) : 0), 0);
    const cost = Math.round(priced * segments * 10000) / 10000;
    costGhs += cost;
    billedSegments += reached * segments;
    groupLogs.push({ provider, sender, to: nums, sent: reached, segments, cost, error: r.error });
  }
  costGhs = Math.round(costGhs * 10000) / 10000;

  // Recorded before any retry below, so a failure at one carrier stays visible next to the retry that rescued it.
  if (!opts?.logged) {
    for (const g of groupLogs) {
      await logPlatformSms({ to: g.to, sent: g.sent, carrier: g.provider, sender: g.sender, body: rawMessage, error: g.sent === 0 ? g.error ?? firstError : null, segments: g.segments, billedSegments: g.sent * g.segments, costGhs: g.cost, churchId: opts?.churchId ?? null });
    }
  }

  const sentCount = perValidOk.filter(Boolean).length;
  // Sign-in codes travel this way, so a problem at Nalo must never lock people out: try Hubtel before giving up.
  if (sentCount === 0 && platformCarrier === "nalo") {
    console.error(`[SMS] WorshipHQ's own text failed on Nalo, retrying on Hubtel: ${firstError ?? "no error given"}`);
    return sendSms(to, rawMessage, { ...opts, carrier: "hubtel" });
  }
  return {
    ok: sentCount > 0,
    provider: used.join("+") || routing.primary,
    stubbed: false,
    id,
    ...(sentCount === 0 && firstError ? { error: firstError } : {}),
    sentCount,
    costGhs,
    billedSegments,
    ...(providerCost ? { providerCost } : {}),
    results: toFullResults(perValidOk, perValidId, perValidErr, perValidRep),
  };
}
