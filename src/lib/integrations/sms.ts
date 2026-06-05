import "server-only";
import { env, features } from "@/lib/env";

export type SmsResult = { ok: boolean; provider: string; stubbed: boolean; id?: string; error?: string };

/**
 * Send an SMS. In stub mode (no provider key) it logs to the console and
 * succeeds, so the whole app works without real credentials. Drop in a key
 * (e.g. ARKESEL_API_KEY) and it will call the real Ghana provider.
 */
export async function sendSms(to: string | string[], message: string): Promise<SmsResult> {
  const recipients = Array.isArray(to) ? to : [to];
  const provider = env.SMS_PROVIDER;

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
    // hubtel / mnotify / twilio implementations follow the same shape.
    console.warn(`[SMS] provider "${provider}" not yet implemented — logging instead`);
    return { ok: true, provider, stubbed: true };
  } catch (e) {
    return { ok: false, provider, stubbed: false, error: (e as Error).message };
  }
}
