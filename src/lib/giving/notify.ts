import "server-only";
import { sendSms } from "@/lib/integrations/sms";
import { sendEmail } from "@/lib/integrations/email";
import { renderEmailHtml, firstName } from "@/lib/outreach/templates";
import { outreachContact, outreachContactLine } from "@/lib/outreach/send";

export type PaymentRequestEvent =
  | { kind: "scheduled"; meetingDate: Date | null; meetingType: string | null }
  | { kind: "in_progress" }
  | { kind: "completed" }
  | { kind: "declined"; note?: string }
  | { kind: "change_approved" }
  | { kind: "change_declined" };

const MEETING_WORDS: Record<string, string> = { call: "phone call", video: "video call", in_person: "meeting in person" };

function when(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });
}

/** The words for each event. The church's own name and the contact's first name are filled in. */
function wording(e: PaymentRequestEvent, name: string, church: string, contact: string): { subject: string; sms: string; body: string } {
  const where = "Open Settings, then Online payments, to see the details.";
  switch (e.kind) {
    case "scheduled": {
      const what = MEETING_WORDS[e.meetingType ?? ""] ?? "chat";
      const at = e.meetingDate ? ` on ${when(e.meetingDate)}` : "";
      return {
        subject: `Online giving for ${church}: a ${what} is scheduled`,
        sms: `Hello ${name}, we have scheduled a ${what}${at} about online giving for ${church}. ${where}`,
        body: `Hello ${name},\n\nWe have scheduled a ${what}${at} about online giving for ${church}. We will confirm who owns the payout account and answer any questions about fees and payouts.\n\n${where}\n\nIf the time does not suit you, reach us on ${contact}.`,
      };
    }
    case "in_progress":
      return {
        subject: `We are setting up online giving for ${church}`,
        sms: `Hello ${name}, we are setting up online giving for ${church}. We will tell you as soon as it is live.`,
        body: `Hello ${name},\n\nWe are setting up online giving for ${church}. We will tell you as soon as it is live.\n\n${where}`,
      };
    case "completed":
      return {
        subject: `Online giving is live for ${church}`,
        sms: `Good news ${name}: online giving is now live for ${church}. Your givers can give by Mobile Money or card, and gifts go to your payout account. ${where}`,
        body: `Hello ${name},\n\nOnline giving is now live for ${church}. Your givers can give by Mobile Money or card, and every gift goes to your payout account.\n\nYou chose who pays the payment fee when you applied, and you can change that at any time under Settings, Online payments. A change applies to gifts from then on.\n\nThe giving link is on your Giving page. If you have any question, reach us on ${contact}.`,
      };
    case "declined": {
      const why = e.note?.trim() ? e.note.trim().replace(/\s+/g, " ") : "";
      return {
        subject: `About online giving for ${church}`,
        sms: `Hello ${name}, we could not approve online giving for ${church} yet.${why ? ` Reason: ${why.slice(0, 140)}.` : ""} ${where} You can also reach us on ${contact}.`,
        body: `Hello ${name},\n\nWe could not approve online giving for ${church} yet.${why ? `\n\nReason: ${why}` : ""}\n\n${where}\n\nYou are welcome to correct the details and apply again, or reach us on ${contact} and we will help.`,
      };
    }
    case "change_approved":
      return {
        subject: `Your new payout account for ${church} is approved`,
        sms: `Hello ${name}, the new payout account you asked for on ${church} has been approved. Gifts from now on go to it.`,
        body: `Hello ${name},\n\nThe new payout account you asked for on ${church} has been approved. Gifts from now on go to it.`,
      };
    case "change_declined":
      return {
        subject: `Your payout account change for ${church}`,
        sms: `Hello ${name}, we could not approve the payout account change for ${church}. Your current account keeps working. ${where}`,
        body: `Hello ${name},\n\nWe could not approve the payout account change for ${church}. Your current account keeps working.\n\n${where}\n\nReach us on ${contact} if you would like to talk it through.`,
      };
  }
}

/**
 * Tell the church's contact about a change to its online giving request, by text and by email.
 * Never throws: a failed message must not undo the change. Returns which channels were sent.
 */
export async function notifyPaymentRequest(opts: {
  event: PaymentRequestEvent;
  churchName: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}): Promise<{ sms: boolean; email: boolean }> {
  const out = { sms: false, email: false };
  const name = firstName(opts.contactName || "there");
  const contact = await outreachContactLine().catch(() => outreachContact());
  const text = wording(opts.event, name, opts.churchName, contact);
  if (opts.contactPhone?.trim()) {
    try { out.sms = (await sendSms(opts.contactPhone, text.sms, { heading: null })).ok; } catch (e) { console.error("[payment request sms]", (e as Error).message); }
  }
  if (opts.contactEmail?.trim()) {
    try {
      const r = await sendEmail({
        to: opts.contactEmail.trim(),
        subject: text.subject,
        html: renderEmailHtml({ subject: text.subject, body: text.body, church: opts.churchName, contact: outreachContact() }),
        replyTo: outreachContact(),
      });
      out.email = r.ok;
    } catch (e) { console.error("[payment request email]", (e as Error).message); }
  }
  return out;
}
