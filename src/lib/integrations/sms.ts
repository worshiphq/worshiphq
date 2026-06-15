import "server-only";
import { env, features } from "@/lib/env";

export type SmsResult = { ok: boolean; provider: string; stubbed: boolean; id?: string; error?: string };

// Approved sender IDs (e.g. Hubtel "HostHub") aren't our brand name, so we brand
// every message body with a heading so recipients know it's from WorshipHQ.
const SMS_HEADING = "WorshipHQ";

function withHeading(message: string): string {
  return message.startsWith(SMS_HEADING) ? message : `${SMS_HEADING}\n${message}`;
}

/**
 * Send an SMS. In stub mode (no provider key) it logs to the console and
 * succeeds, so the whole app works without real credentials. Drop in a key
 * (e.g. ARKESEL_API_KEY) and it will call the real Ghana provider.
 */
export async function sendSms(to: string | string[], rawMessage: string): Promise<SmsResult> {
  const recipients = Array.isArray(to) ? to : [to];
  const provider = env.SMS_PROVIDER;
  const message = withHeading(rawMessage);

  if (!features.sms) {
    console.info(
      `[SMS:stub] (${provider}) → ${recipients.join(", ")}\n  "${message}"\n  (set the provider key in .env.local to send for real)`,
    );
    return { ok: true, provider, stubbed: true, id: `stub_${Date.now()}` };
  }

  try {
    if (provider === "arkesel") {
      const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: { "api-key": env.ARKESEL_API_KEY!, "content-type": "application/json" },
        body: JSON.stringify({ sender: env.ARKESEL_SENDER_ID, message, recipients }),
      });
      const data = await res.json();
      return { ok: res.ok, provider, stubbed: false, id: data?.data?.[0]?.id };
    }

    if (provider === "hubtel") {
      // Hubtel sends one message per recipient via a simple GET endpoint.
      let lastId: string | undefined;
      let allOk = true;
      for (const to of recipients) {
        const url = new URL("https://smsc.hubtel.com/v1/messages/send");
        url.searchParams.set("clientsecret", env.HUBTEL_CLIENT_SECRET!);
        url.searchParams.set("clientid", env.HUBTEL_CLIENT_ID!);
        url.searchParams.set("from", env.HUBTEL_SENDER_ID);
        url.searchParams.set("to", to);
        url.searchParams.set("content", message);
        const res = await fetch(url.toString());
        const data = await res.json().catch(() => ({}));
        allOk = allOk && res.ok;
        lastId = data?.messageId ?? data?.MessageId ?? lastId;
      }
      return { ok: allOk, provider, stubbed: false, id: lastId };
    }

    // mnotify / twilio implementations follow the same shape.
    console.warn(`[SMS] provider "${provider}" not yet implemented — logging instead`);
    return { ok: true, provider, stubbed: true };
  } catch (e) {
    return { ok: false, provider, stubbed: false, error: (e as Error).message };
  }
}
