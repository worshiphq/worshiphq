import type { DocArticle } from "../types";

export const billing: DocArticle[] = [
  {
    slug: "plans",
    section: "billing",
    title: "Plans and what they include",
    summary: "Free, Starter, Pro and Max: how they differ and how to choose.",
    body: [
      { p: "Every plan includes the essentials: people, attendance, events, giving and reports. Higher plans add more members, more team members and more features." },
      { table: { head: ["Plan", "Best for", "Adds"], rows: [
        ["**Free**", "New and small fellowships", "The essentials, for a small number of members."],
        ["**Starter**", "Growing churches", "SMS, reminders, member IDs and QR codes, custom forms, import and export, automatic receipts, follow-ups."],
        ["**Pro**", "Established ministries", "Rosters, harvest, pledges, welfare, sermons, devotionals, testimonies, bookings and custom roles."],
        ["**Max**", "Large and multi-site churches", "Fingerprint, face and palm check-in, automations, full accounting (budgets, expenses, assets), counselling, the audit log and unlimited members."],
      ] } },
      { p: "See the current prices and member limits on the **Pricing** page. Every guide in this manual shows which plan it needs. A part of WorshipHQ your plan doesn't include shows as locked in the menu and opens **Billing**, where the Main Admin can upgrade." },
      { p: "**Free month of Communications.** A new church on the Free plan can send SMS from **Communications** for its first 30 days, with free credits to get started. Your credits never expire. When the month ends, Communications becomes part of the Starter plan, and your unused credits are waiting for you when you upgrade." },
      { tip: "Start on Free and upgrade when you need more. You only pay the difference when you upgrade mid-way through a period." },
    ],
  },
  {
    slug: "subscribe",
    section: "billing",
    title: "Subscribe or renew",
    summary: "Choose a plan, pay by Mobile Money or card, and keep track of payments.",
    who: "The Main Admin",
    appPath: "/app/settings",
    body: [
      { steps: [
        "Go to **Settings**, then **Billing**.",
        "Under **Choose a plan**, pick **Monthly** or **Yearly**. Yearly saves about 17%.",
        "Choose your plan.",
        "Have a discount code? Enter it under **Have a discount code?** to see your new price.",
        "Agree to the Terms of Service and pay by Mobile Money or card through Paystack.",
      ] },
      { list: [
        "Prices may be shown in US dollars and are charged in cedis at the day's exchange rate.",
        "We don't charge your card automatically. We remind you before your plan ends, and you choose to renew.",
        "At the top of **Billing** you see your plan, its price, when it renews and how much of the period is left, plus how many members, team logins and SMS credits you have against what your plan allows.",
        "**Payments and receipts** lists every plan payment, gift and SMS top-up with its date, amount, how it was paid (online, directly to us, or a gift) and a note. Filter it by **Plan** or **SMS credits**; it shows 8 at a time with **Newer** and **Older** buttons.",
      ] },
      { h: "Your PDF receipt" },
      { p: "Every time you upgrade, we email you a PDF receipt (full A4, from WODONA, the company behind WorshipHQ) with the plan, the period it covers, any discount and the amount paid, signed and dated by WODONA. Gifted upgrades and discount-code upgrades get one too, marked **Gift** or with the discount shown. Keep it for your church records. If you did not get it, check your spam folder and the email address on your account." },
      { h: "Gifted upgrades" },
      { p: "If WorshipHQ gives your church a free upgrade, you'll get a code by SMS. Enter it in **Billing** to activate it. Gifts, and payments made directly to WorshipHQ outside the app, are recorded in **Payments and receipts** too, marked **Gift** or **Paid directly**, for as long a term as was agreed (for example 3 or 5 years)." },
    ],
  },
  {
    slug: "change-plan",
    section: "billing",
    title: "Upgrade or downgrade",
    summary: "How changing plans works and what you pay.",
    who: "The Main Admin",
    appPath: "/app/settings",
    body: [
      { list: [
        "**Upgrades** take effect immediately. You pay only the difference for the days left in your current period.",
        "**Downgrades** take effect at the end of your current paid period. Nothing is refunded for the change, and you keep your current features until then. Moving down to a cheaper paid plan then needs paying for like a renewal: you have 7 days to pay before the church drops to Free.",
        "Changed your mind about a downgrade? Choose **Keep my current plan** before it takes effect.",
      ] },
      { note: "If you downgrade below what you use (e.g. more members than the new plan allows, or features it doesn't include), you won't lose any data, but you won't be able to add more or use those features until you upgrade again." },
    ],
  },
  {
    slug: "refunds",
    section: "billing",
    title: "Refunds",
    summary: "When you can get a refund and how to ask for one.",
    who: "The Main Admin",
    appPath: "/app/settings",
    body: [
      { steps: [
        "Go to **Settings**, then **Billing**, and find the payment under **Payments and receipts**.",
        "Choose **Request refund**. We check whether it's still within the refund window.",
        "Tell us briefly why, and choose **Submit refund request**.",
      ] },
      { p: "Refund requests are reviewed by WorshipHQ and, once approved, the money reaches you within a few working days. When the refunded payment is for your current period, your church moves back to the Free plan at the same time (your data stays). The full rules, including how long you have to ask, are in our **Refund Policy** (worshiphq.app/refund-policy)." },
      { tip: "Outside the refund window, you can still move to a cheaper plan at no cost. It takes effect when your current period ends." },
    ],
  },
];
