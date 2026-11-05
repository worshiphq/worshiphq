/**
 * Emails and texts the platform owner sends to church contacts, and the automatic welcome at signup.
 * Pure functions only, so the SuperAdmin preview and the real send produce the same thing.
 * Merge fields: {{name}} (first name), {{church}}, {{contact}} (how to reach us), {{senderId}} (the sender name the church asked for).
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
    id: "upgrade-yearly", channel: "email", label: "Upgrade, and pay yearly", hint: "More features on higher plans, and why yearly is the better deal. For Free and Starter churches",
    subject: "{{church}} can do more on WorshipHQ",
    body: `Hello {{name}},

Thank you for running {{church}} on WorshipHQ. As your church grows, a higher plan takes more of the work off your team:

- Starter: text your whole church, send birthday and absence texts, send giving receipts automatically, follow up visitors, and print member ID cards.
- Pro: everything in Starter, plus rosters and volunteers, harvest and pledges, church accounts and expenses, automations, and USB fingerprint check-in.
- Max: everything in Pro, plus face, palm and fingerprint devices at your door, budgets and assets, private counselling records, an audit log, and unlimited members.

Paying yearly is the better deal. You get about two months free, and you pay once and don't have to think about it again for 12 months:

- Starter: $99.99 a year instead of $9.99 a month, saving about $20
- Pro: $299.99 a year instead of $29.99 a month, saving about $60
- Max: $449.99 a year instead of $44.99 a month, saving about $90

To upgrade, sign in at worshiphq.app and open Settings, then Billing. You can compare the plans here: https://worshiphq.app/pricing

Not sure which plan fits? Reply to this email or write to {{contact}} and we will help you choose.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "devices", channel: "email", label: "Check-in devices", hint: "Sells the face, palm and fingerprint devices. Not needed for churches already using them",
    subject: "No more typing names on Sunday morning",
    body: `Hello {{name}},

How long does it take {{church}} to record attendance on a Sunday?

On Free and Starter, your team checks people in by name. On Pro and Max, nobody types names or counts heads. Put a device at your door and members check themselves in:

- Face: a member looks at the device and is checked in.
- Palm: they hold up a hand, with nothing to touch.
- Fingerprint: one touch on the reader.

Attendance records itself and shows live in WorshipHQ, so you can see who has come before the service even starts, and your ushers are free to greet people.

Which one do you need?

- USB fingerprint scanner: plugs into your check-in computer and works on the Pro plan.
- Face, palm or fingerprint terminal: goes at your door and works on the Max plan.

Devices are a separate purchase. Scan data stays on the device at your church, and members give their consent before enrolling. You can read more here: https://worshiphq.app/devices

Reply to this email or write to {{contact}} to enquire about devices and prices, and we will recommend the right one for your entrance.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "senderid-processing", channel: "email", label: "Sender name: in process", hint: "Tells a church its sender name request has gone to the networks. Texts go out automatically when you mark it in process; this is the email to send by hand",
    subject: "Your sender name {{senderId}} is being processed",
    body: `Hello {{name}},

A quick update for {{church}}. Your sender name "{{senderId}}" is now in process: we have submitted it to the mobile networks for approval.

What happens next:
- This usually takes a few working days. The networks decide, so we cannot speed it up, but we are following it.
- We will text you and email you the moment it is approved.
- Until then your messages still go out, under the WorshipHQ sender with your church name at the top, so nothing is held up.

You do not need to do anything. If you would like to change the name or have a question, reply to this email or reach us on {{contact}}.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "senderid-approved", channel: "email", label: "Sender name: approved", hint: "Tells a church its sender name is approved and how to use it. Texts go out automatically when you approve it; this is the email to send by hand",
    subject: "Your sender name {{senderId}} is approved",
    body: `Hello {{name}},

Good news for {{church}}. Your sender name "{{senderId}}" has been approved.

From now on your messages show "{{senderId}}" as the sender on your members' phones, instead of a number or a general name. It is used automatically for the texts you send from Communications, and for your automatic messages like birthdays and follow-ups. You do not need to turn anything on.

A good first step is to send yourself a text from Communications and see how it looks.

If anything looks wrong, reply to this email or reach us on {{contact}}.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "senderid-rejected", channel: "email", label: "Sender name: not approved", hint: "Tells a church its sender name was not approved and what to do next. Texts go out automatically when you reject it; this is the email to send by hand",
    subject: "About your sender name {{senderId}}",
    body: `Hello {{name}},

An update for {{church}}. Unfortunately your sender name "{{senderId}}" was not approved by the mobile networks this time.

This happens, and it is easy to fix. Networks often turn a name down because it is too close to another organisation's name, or because it does not clearly match your church.

What to do next:
- Choose another name, or a clearer version of it: 3 to 11 letters and numbers, no spaces, and not only numbers. Your full church name, shortened, usually works well.
- Open Settings in WorshipHQ and send the new request, or reply to this email with the name you would like and we will submit it for you.

Until a name is approved, your messages keep going out under the WorshipHQ sender with your church name at the top, so nothing stops working.

Reply to this email or reach us on {{contact}}, and we will help you choose.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "trial-invite", channel: "email", label: "Free trial of the next plan", hint: "Invites a church to try the plan above theirs free. Each church sees its own next plan and the trial length",
    subject: "Try {{nextPlan}} free for {{trialDays}} days, {{church}}",
    body: `Hello {{name}},

{{church}} can try the {{nextPlan}} plan free for {{trialDays}} days. No card and no payment, just switch it on and use everything {{nextPlan}} adds.

To start: sign in, open Settings, then Billing, and press the "Start my {{trialDays}}-day {{nextPlan}} trial" button. Only the Main Admin can do this.

When the {{trialDays}} days are up, {{church}} goes back to its current plan and the extra {{nextPlan}} features switch off again. Your data is never touched. If you love it, you can upgrade at any time to keep it.

Questions? Reply to this email or reach us on {{contact}}.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "trial-ending", channel: "email", label: "Trial ending soon", hint: "Sent automatically about 2 days before a trial ends. You can also send it by hand",
    subject: "Your {{trialPlan}} trial ends soon, {{church}}",
    body: `Hello {{name}},

{{church}}'s free {{trialPlan}} trial ends in {{daysLeft}}. After that the {{trialPlan}} features switch off and {{church}} goes back to its current plan.

To keep everything running, upgrade in Settings, then Billing. Your data and settings stay exactly as they are.

Need help choosing or paying? Reply to this email or reach us on {{contact}}.

Blessings,
The WorshipHQ team`,
  },
  {
    id: "trial-ended", channel: "email", label: "Trial ended", hint: "Sent automatically when a trial runs out. You can also send it by hand",
    subject: "Your {{trialPlan}} trial has ended, {{church}}",
    body: `Hello {{name}},

{{church}}'s free {{trialPlan}} trial has ended, so the {{trialPlan}} features are switched off for now. Nothing has been deleted: everything you set up is still there.

Upgrade to {{trialPlan}} in Settings, then Billing, and it all comes straight back.

If you would like us to walk you through it, reply to this email or reach us on {{contact}}.

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
    id: "upgrade-yearly-sms", channel: "sms", label: "Upgrade, and pay yearly", hint: "More features on higher plans, and why yearly is the better deal. For Free and Starter churches",
    subject: "",
    body: "Hello {{name}}, {{church}} can do more on WorshipHQ: automatic texts, receipts, rosters and accounts. Pay yearly and get about 2 months free. Upgrade at worshiphq.app",
  },
  {
    id: "devices-sms", channel: "sms", label: "Check-in devices", hint: "Sells the face, palm and fingerprint devices. Not needed for churches already using them",
    subject: "",
    body: "Hello {{name}}, on WorshipHQ Pro and Max nobody types names or counts heads. Members scan a face, palm or fingerprint at the door. Enquire: {{contact}}",
  },
  {
    id: "senderid-processing-sms", channel: "sms", label: "Sender name: in process", hint: "The same text that goes out automatically when you mark a sender name in process",
    subject: "",
    body: `Update on your Sender ID "{{senderId}}": we've submitted it to the mobile networks for approval. This usually takes a few working days. We'll text you the moment it's approved.`,
  },
  {
    id: "senderid-approved-sms", channel: "sms", label: "Sender name: approved", hint: "The same text that goes out automatically when you approve a sender name",
    subject: "",
    body: `Congratulations! Your Sender ID "{{senderId}}" has been approved. You can now use it for SMS broadcasts in WorshipHQ.`,
  },
  {
    id: "senderid-rejected-sms", channel: "sms", label: "Sender name: not approved", hint: "The same text that goes out automatically when you reject a sender name",
    subject: "",
    body: `Your Sender ID "{{senderId}}" was not approved. Please contact WorshipHQ for assistance. Email: {{contact}}`,
  },
  {
    id: "trial-invite-sms", channel: "sms", label: "Free trial of the next plan", hint: "Invites a church to try the plan above theirs free",
    subject: "",
    body: "Hello {{name}}, {{church}} can try {{nextPlan}} free for {{trialDays}} days. No card needed. Sign in, then Settings, Billing, Start my trial. Help: {{contact}}",
  },
  {
    id: "trial-ending-sms", channel: "sms", label: "Trial ending soon", hint: "The text that goes out automatically about 2 days before a trial ends",
    subject: "",
    body: "Hello {{name}}, {{church}}'s free {{trialPlan}} trial ends in {{daysLeft}}. Upgrade in Settings, Billing to keep it. Data stays safe. Help: {{contact}}",
  },
  {
    id: "trial-ended-sms", channel: "sms", label: "Trial ended", hint: "The text that goes out automatically when a trial runs out",
    subject: "",
    body: "Hello {{name}}, {{church}}'s {{trialPlan}} trial has ended and those features are off. Upgrade in Settings, Billing to switch them back on. Help: {{contact}}",
  },
  {
    id: "custom-sms", channel: "sms", label: "Write my own", hint: "Start from a blank text",
    subject: "", body: "Hello {{name}}, ",
  },
];

export const templateById = (id: string) => OUTREACH_TEMPLATES.find((t) => t.id === id) ?? null;

export type MergeData = { name: string; church: string; contact: string; senderId?: string; nextPlan?: string; trialDays?: string; trialPlan?: string; daysLeft?: string };

/** Fill in {{name}}, {{church}}, {{contact}}, {{senderId}} and the trial fields {{nextPlan}}, {{trialDays}}, {{trialPlan}}, {{daysLeft}}. Unknown fields are left alone. */
export function mergeFields(text: string, d: MergeData): string {
  return text.replace(/\{\{\s*(name|church|contact|senderId|nextPlan|trialDays|trialPlan|daysLeft)\s*\}\}/g, (_, k: keyof MergeData) => {
    if (d[k] !== undefined) return d[k] as string;
    if (k === "nextPlan" || k === "trialPlan") return "the next plan";
    if (k === "trialDays") return "7";
    if (k === "daysLeft") return "2 days";
    return "your sender name";
  });
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
