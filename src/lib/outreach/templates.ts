/**
 * Emails and texts the platform owner sends to church contacts, and the automatic welcome at signup.
 * Pure functions only, so the SuperAdmin preview and the real send produce the same thing.
 * Merge fields: {{name}} (first name), {{church}}, {{contact}} (how to reach us).
 */

export type OutreachChannel = "email" | "sms";
export type OutreachTemplate = { id: string; channel: OutreachChannel; label: string; hint: string; subject: string; body: string };

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: "welcome", channel: "email", label: "Welcome", hint: "Sent automatically when a church signs up",
    subject: "Welcome to WorshipHQ, {{name}}",
    body: `Hello {{name}},

Welcome to WorshipHQ, and thank you for choosing us for {{church}}. Your account is ready.

Here is a simple way to get started:
1. Add your members, or import them from a spreadsheet (People).
2. Set your service times so check-in goes to the right service (Settings).
3. Invite your leaders and choose what each of them can see (Settings, Users and roles).
4. Take attendance at your next service.

Our step by step manual is here: https://worshiphq.app/docs

We are here to help. If you have a question, would like a walkthrough, or something does not look right, just reply to this email or reach us on {{contact}}. We would love to hear how {{church}} is getting on.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "tips", channel: "email", label: "Tips to get more from it", hint: "A friendly nudge with what the app can do",
    subject: "Getting more out of WorshipHQ for {{church}}",
    body: `Hello {{name}},

A few things {{church}} can do with WorshipHQ that churches tell us they love:
- Check people in by name or QR code, and see who has not been around lately.
- Record tithes and offerings, and keep every record tidy and in one place.
- Follow up first time visitors so nobody slips through.
- Send birthday and anniversary wishes to your members automatically.

Some features depend on your plan. Our manual explains each one: https://worshiphq.app/docs

If you would like us to walk you through any of it, reply to this email or reach us on {{contact}}.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "check-in", channel: "email", label: "How are you getting on?", hint: "A personal check-in",
    subject: "How is {{church}} getting on with WorshipHQ?",
    body: `Hello {{name}},

I wanted to check in and ask how {{church}} is getting on with WorshipHQ.

Is there anything confusing, missing or slow? Tell us, and we will help you sort it out, or improve it. Your feedback shapes what we build next.

Just reply to this email or reach us on {{contact}}.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "upgrade", channel: "email", label: "More for your church", hint: "A gentle look at the paid plans",
    subject: "More for {{church}} with WorshipHQ",
    body: `Hello {{name}},

Thank you for using WorshipHQ for {{church}}. As your church grows, our paid plans add things like SMS to your members, birthday and anniversary reminders, member ID cards, custom forms and more.

You can compare the plans here: https://worshiphq.app/pricing

If you are not sure which one fits {{church}}, reply to this email or reach us on {{contact}} and we will gladly advise you.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "sms-trial", channel: "email", label: "Try bulk SMS free for a month", hint: "Tells free churches they can test Communications for 30 days",
    subject: "{{church}} can now try bulk SMS free for a month",
    body: `Hello {{name}},

Good news for {{church}}. Bulk SMS is normally part of our paid plans, but for the next month you can try it free on your account, with free credits to send your first messages.

To try it, sign in and open Communications. You can text your whole church, a department, a group, or just one person, for example a Sunday reminder, a prayer meeting, or a thank you to your visitors.

A few things to know:
- The free month runs for 30 days, and your credits never expire.
- Texts currently reach Ghana phone numbers.
- After the month, Communications is part of the Starter plan. You can compare the plans here: https://worshiphq.app/pricing

If you would like a quick walkthrough, reply to this email or reach us on {{contact}} and we will gladly help.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "giving-resubmit", channel: "email", label: "Online giving: please send your request again", hint: "For churches whose online giving request was declined because of the update",
    subject: "{{church}}: please send your online giving request again",
    body: `Hello {{name}},

We have updated how online giving works on WorshipHQ. Because of that update, your earlier online giving request for {{church}} had to be declined. This is not a problem with your church or your details.

Please send it again. Open Settings, then Online payments, and submit your payout account.

This time you will see everything before you submit:
- the fees: Paystack's fee and WorshipHQ's fee, with worked examples for a gift of GH₵500 and GH₵3,000
- who pays the fee: your givers or your church, and you choose
- when the money reaches you: normally the next working day after a gift
- the rules and terms for online giving

After you submit, we check that the payout account belongs to your church, and we may call you to confirm. Then we approve it and online giving goes live.

If you would like us to walk you through it, reach us on {{contact}}.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "custom-email", channel: "email", label: "Write my own", hint: "Start from a blank message",
    subject: "A message from WorshipHQ", body: `Hello {{name}},\n\n\n\nBlessings,\nThe WorshipHQ team`,
  },
  {
    id: "welcome-sms", channel: "sms", label: "Welcome text", hint: "A short welcome by SMS",
    subject: "",
    body: "Hello {{name}}, welcome! Your account for {{church}} is ready. Manual: worshiphq.app/docs. Questions? Reach us on {{contact}}.",
  },
  {
    id: "check-in-sms", channel: "sms", label: "Check-in text", hint: "A quick personal check-in",
    subject: "",
    body: "Hello {{name}}, how is {{church}} getting on with WorshipHQ? If you need any help, reach us on {{contact}} and we will gladly assist.",
  },
  {
    id: "sms-trial-sms", channel: "sms", label: "Try bulk SMS free for a month", hint: "Tells free churches they can test Communications for 30 days",
    subject: "",
    body: "Hello {{name}}, {{church}} can now try bulk SMS free for 1 month, with free credits. Sign in and open Communications to send. Questions? Reach us on {{contact}}.",
  },
  {
    id: "giving-resubmit-sms", channel: "sms", label: "Online giving: please send your request again", hint: "For churches whose online giving request was declined because of the update",
    subject: "",
    body: "Hello {{name}}, we updated online giving, so your earlier request for {{church}} had to be declined. Please send it again in Settings, Online payments. You will see all the fees, who pays them and the terms before you submit. Questions? Reach us on {{contact}}.",
  },
  {
    id: "custom-sms", channel: "sms", label: "Write my own", hint: "Start from a blank text",
    subject: "", body: "Hello {{name}}, ",
  },
];

export const templateById = (id: string) => OUTREACH_TEMPLATES.find((t) => t.id === id) ?? null;

export type MergeData = { name: string; church: string; contact: string };

/** Fill in {{name}}, {{church}} and {{contact}}. Unknown fields are left alone. */
export function mergeFields(text: string, d: MergeData): string {
  return text.replace(/\{\{\s*(name|church|contact)\s*\}\}/g, (_, k: keyof MergeData) => d[k]);
}

const TITLES = /^(ps\.?|pastor|rev\.?|reverend|dr\.?|apostle|bishop|prophet|elder|deacon|evangelist|mr\.?|mrs\.?|ms\.?)$/i;

/** How to greet someone: "Kofi", or "Ps. Bernard" when they gave a title, so it never reads as just "Ps.". */
export function firstName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "there";
  if (TITLES.test(parts[0]) && parts.length > 1) return `${parts[0]} ${parts[1]}`;
  return parts[0];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (s: string) => s.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (u) => `<a href="${u}" style="color:#0d7377;text-decoration:underline">${u}</a>`)
  .replace(/(^|[\s(])((?:[a-z0-9-]+\.)+(?:app|org|com)\/[^\s<]*[^\s<.,;:!?)])/gi, (m, pre, u) => (m.includes("href") ? m : `${pre}<a href="https://${u}" style="color:#0d7377;text-decoration:underline">${u}</a>`));
const mail = (s: string) => s.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (e, _a, off, whole: string) => (whole.slice(Math.max(0, off - 8), off).includes("href") ? e : `<a href="mailto:${e}" style="color:#0d7377">${e}</a>`));

/** Plain text (blank lines between paragraphs, "1." lists, "- " bullets) to the HTML inside the email card. */
function bodyToHtml(body: string): string {
  const blocks = body.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const p = "margin:0 0 16px;font-size:16px;line-height:1.6;color:#1f2937";
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const intro: string[] = [];
    const items: string[] = [];
    let ordered = false;
    for (const l of lines) {
      const num = /^\d+[.)]\s+(.*)$/.exec(l);
      const bul = /^[-*]\s+(.*)$/.exec(l);
      if (num) { ordered = true; items.push(num[1]); } else if (bul) items.push(bul[1]); else if (items.length === 0) intro.push(l); else items.push(l);
    }
    const render = (t: string) => mail(link(esc(t)));
    if (items.length === 0) return `<p style="${p}">${lines.map(render).join("<br>")}</p>`;
    const tag = ordered ? "ol" : "ul";
    return `${intro.length ? `<p style="${p}">${intro.map(render).join("<br>")}</p>` : ""}<${tag} style="margin:0 0 16px;padding-left:22px;font-size:16px;line-height:1.6;color:#1f2937">${items.map((i) => `<li style="margin-bottom:6px">${render(i)}</li>`).join("")}</${tag}>`;
  }).join("");
}

/** The full email, in a clean branded layout that works in Gmail, Outlook and phones. */
export function renderEmailHtml(opts: { subject: string; body: string; church: string; contact: string; appUrl?: string }): string {
  const url = opts.appUrl ?? "https://worshiphq.app";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#ffffff;padding:22px 28px 18px;border-bottom:3px solid #0d7377"><a href="${url}" style="text-decoration:none"><img src="${url}/email-logo.png" width="240" height="65" alt="WorshipHQ" style="display:block;width:240px;max-width:100%;height:auto;border:0;font-size:22px;font-weight:700;color:#12386f"></a></td></tr>
<tr><td style="padding:28px 28px 8px">${bodyToHtml(opts.body)}</td></tr>
<tr><td style="padding:0 28px 28px"><a href="${url}/sign-in" style="display:inline-block;background:#0d7377;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">Open WorshipHQ</a></td></tr>
<tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280">You are receiving this because ${esc(opts.church)} has an account on WorshipHQ. Questions? Reply to this email or write to <a href="mailto:${esc(opts.contact)}" style="color:#0d7377">${esc(opts.contact)}</a>.</td></tr>
</table></td></tr></table></body></html>`;
}
