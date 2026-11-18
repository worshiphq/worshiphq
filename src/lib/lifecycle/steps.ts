/**
 * The automatic email sequence: what each email says and who it is for.
 *
 * The aim of every email: a church that signs up takes its first attendance (churches that run one Sunday on
 * WorshipHQ stay), then upgrades. Each email goes only while it still applies (an email about adding members never
 * goes to a church that has members), at most one every 2 days, never on a Sunday, and each address gets each email
 * once. Wording rules: lead with the door device for check-in, never quote device prices, never offer to move a
 * church's data for free, never invent numbers. Every number in an email is the church's own or a live plan setting.
 */

export type StepId =
  | "finish-signup"
  | "limit-near"
  | "sunday-report"
  | "ready-for-sunday"
  | "add-members"
  | "need-help"
  | "upgrade"
  | "door-device"
  | "last-check";

/** Everything an email can say about one church, worked out fresh each run. */
export type ChurchFacts = {
  ageDays: number;
  plan: string; // free | starter | pro | max
  members: number;
  attendanceEver: number;
  /** People checked in on the most recent Sunday, and active members who were not. */
  lastSunday: { present: number; absent: number; date: string } | null;
  /** Did anything in the last 14 days: an action, a check-in, a gift or a text. */
  activeRecently: boolean;
  weekday: number; // 0 = Sunday
};

export type LiveNumbers = {
  freeLimit: number; // -1 = unlimited
  starterLimit: number;
  starterMonthly: number; // GHS
  starterYearly: number; // GHS
  starterFeatures: string[];
  /** A free Starter trial a church can start by itself (SuperAdmin trials on, self-start on): its length and who qualifies. */
  trial: { days: number; minMembers: number; minDays: number } | null;
};

export type Step = {
  id: StepId;
  label: string;
  /** Who gets it, in plain words, for the SuperAdmin page. */
  when: string;
  subject: string;
  body: string;
  button: { label: string; path: string };
};

const SIGN = `Blessings,
Worship Odoi
WorshipHQ`;

export const STEPS: Step[] = [
  {
    id: "finish-signup",
    label: "Finish your sign-up",
    when: "Someone filled in the sign-up form but never entered the code. Sent once, 2 hours to 30 days later.",
    subject: "{{church}} is one step away on WorshipHQ",
    body: `Hello {{name}},

You started setting up {{church}} on WorshipHQ but did not reach the last step, so your church account was not created yet.

Your details are saved. Press the button below and you are about a minute from your dashboard.

Here is what {{church}} gets straight away, on the free plan:
- Every member in one place, with phone numbers, birthdays and departments
- Attendance for every service, taken on any phone
- A clear picture each week of who came and who was missing
- Free for up to {{freeLimit}} members, for as long as you like

If the code never reached you, you can now sign up with your Google account instead. There is no code to wait for.

And if something else stopped you, just reply to this email and tell me. I read every reply, and it helps us make WorshipHQ better.

${SIGN}`,
    button: { label: "Finish setting up {{church}}", path: "/sign-up?resume={{resume}}" },
  },
  {
    id: "limit-near",
    label: "Close to the free limit",
    when: "A Free church has reached 80% of the free member limit. Sent once.",
    subject: "{{limitSubject}}",
    body: `Hello {{name}},

{{limitPara}}

Starter takes {{church}} up to {{starterLimit}} members, and adds:
{{starterFeatures}}

Starter is GHS {{starterMonthly}} a month, or GHS {{starterYearly}} a year, which saves you GHS {{yearlySaving}}.{{trialLine}}

${SIGN}`,
    button: { label: "Upgrade to Starter", path: "/app/settings?tab=billing&upgrade=starter" },
  },
  {
    id: "sunday-report",
    label: "Your Sunday in numbers",
    when: "Monday or Tuesday after a Free church's first Sunday with attendance. Sent once.",
    subject: "{{present}} people at {{church}} on Sunday",
    body: `Hello {{name}},

On Sunday, {{present}} people were checked in at {{church}}. Well done: that is your first Sunday on WorshipHQ.

{{absentLine}}

People rarely leave a church all at once. They miss one Sunday, then two, and nobody notices until they are gone. The churches that keep their people are the ones that notice early and reach out.

On Starter, WorshipHQ does that reaching out for you, in your church's name:
- An absence text to members who missed church
- Visitor follow-ups, assigned to your team so no visitor is forgotten
- Birthday texts, and giving receipts sent automatically

Starter is GHS {{starterMonthly}} a month, or GHS {{starterYearly}} a year.{{trialLine}}

${SIGN}`,
    button: { label: "See who was missing", path: "/app/attendance" },
  },
  {
    id: "ready-for-sunday",
    label: "Ready for Sunday?",
    when: "Friday or Saturday, for a church that has never taken attendance. Sent once.",
    subject: "Ready for Sunday at {{church}}?",
    body: `Hello {{name}},

This Sunday is a good day to take {{church}}'s first attendance on WorshipHQ. It takes three steps:

1. Check your service times (Settings, Service times), so each check-in goes to the right service.
2. On Sunday, open Attendance on any phone and tick people as they arrive. Visitors can be added in seconds.
3. After the service, see who came, who was missing and how each department did.

On Monday, WorshipHQ will show you a clear picture of your Sunday.

When you want it to be hands-free: with a face, palm or fingerprint device at the door, members simply walk in and attendance is done. No sheets, no queue, no one counting. That comes with WorshipHQ Max, and we supply and set up the device for you. Just reply to this email to find out more.

${SIGN}`,
    button: { label: "Set up Sunday", path: "/app/attendance" },
  },
  {
    id: "add-members",
    label: "Add your members",
    when: "A day or more after sign-up, while the church has no members yet. Sent once, within 20 days of sign-up.",
    subject: "The quickest way to get {{church}}'s members in",
    body: `Hello {{name}},

{{church}} is set up on WorshipHQ. The next step is your members, and you do not have to type them all yourself.

The fastest way: share your church's registration link. Members open it on their phones and fill in their own details, and they appear in WorshipHQ straight away:
{{joinLink}}

Post it in your church WhatsApp group today, and many of your members can be in before Sunday.

You can also:
- Add members yourself in People, one at a time
- Import them all at once from an Excel sheet, on the Starter plan

Once your members are in, everything else follows: attendance, birthdays, follow-ups and reports.

${SIGN}`,
    button: { label: "Add members", path: "/app/people" },
  },
  {
    id: "need-help",
    label: "Can I help?",
    when: "14 to 40 days after sign-up, for a church that has added no members and taken no attendance. Sent once.",
    subject: "Can I help you set up {{church}}?",
    body: `Hello {{name}},

I noticed {{church}} has not added any members on WorshipHQ yet. That is very normal: church work is busy, and setting up something new is easy to put off.

I would like to help. Reply to this email with one line telling me what is in the way, and I will personally get back to you with what to do next.

Some things churches often ask:
- "How do members get in without me typing them?" Share your registration link, and they fill in their own details.
- "Can my secretary or leaders help?" Yes. Invite them in Settings, and choose what each one can see.
- "Is it really free?" Yes. The free plan is free for up to {{freeLimit}} members, for as long as you like.

${SIGN}`,
    button: { label: "Open WorshipHQ", path: "/app" },
  },
  {
    id: "upgrade",
    label: "What Starter adds",
    when: "21 days or more after sign-up, for an active Free church with at least 5 members. Sent once.",
    subject: "What Starter would do for {{church}}",
    body: `Hello {{name}},

{{church}} has been on WorshipHQ for a few weeks now, with {{members}} members. Thank you for trusting us with your church.

You have seen what the free plan does. Starter is where WorshipHQ starts doing the work for you:
{{starterFeatures}}

It also takes you up to {{starterLimit}} members, so there is room to grow.

Starter is GHS {{starterMonthly}} a month, or GHS {{starterYearly}} a year, which saves you GHS {{yearlySaving}}.{{trialLine}}

${SIGN}`,
    button: { label: "Upgrade to Starter", path: "/app/settings?tab=billing&upgrade=starter" },
  },
  {
    id: "door-device",
    label: "Members walk in, attendance is done",
    when: "10 days or more after sign-up, for a church that is using WorshipHQ (members added or attendance taken), not already on Max. Sent once.",
    subject: "Members walk in. Attendance is done.",
    body: `Hello {{name}},

What if nobody at {{church}} had to take attendance again?

With a WorshipHQ check-in device at the door, members look at it, or show their palm or finger, as they walk in. In about a second they are checked in, by name, into the service that is running. It shows straight away on your WorshipHQ dashboard.

- No sheets, no queue at a laptop, no one counting heads
- Only the person standing there can be checked in, so the numbers are honest
- Absentees and first-time visitors show up the same day, so your team can follow up

The devices come with WorshipHQ Max. We supply them, install them and train your team.

Reply to this email and I will tell you what it would take for {{church}}.

${SIGN}`,
    button: { label: "See how it works", path: "/devices" },
  },
  {
    id: "last-check",
    label: "Still planning to use it?",
    when: "30 to 50 days after sign-up, for a church that has added no members and taken no attendance. Sent once. The last email in the sequence.",
    subject: "Still planning to use WorshipHQ for {{church}}?",
    body: `Hello {{name}},

A month ago you set up {{church}} on WorshipHQ, but it has not been used yet.

Your account stays free and stays open. Whenever you are ready, everything is there.

If WorshipHQ is not right for {{church}}, would you reply and tell me why? Even one line helps us build something better for churches. This is the last email I will send about getting started.

${SIGN}`,
    button: { label: "Open WorshipHQ", path: "/app" },
  },
];

export const stepById = (id: string) => STEPS.find((s) => s.id === id) ?? null;

/** The church emails in priority order: when more than one applies, the first one wins. */
export const CHURCH_STEP_ORDER: StepId[] = ["limit-near", "sunday-report", "ready-for-sunday", "add-members", "need-help", "upgrade", "door-device", "last-check"];

/** Does this email apply to this church right now? Days of the week matter for the Sunday emails. */
export function stepApplies(id: StepId, f: ChurchFacts, live: LiveNumbers): boolean {
  const free = f.plan === "free";
  const used = f.members > 0 || f.attendanceEver > 0;
  switch (id) {
    case "limit-near":
      return free && live.freeLimit > 0 && f.members >= Math.ceil(live.freeLimit * 0.8);
    case "sunday-report":
      return free && (f.weekday === 1 || f.weekday === 2) && !!f.lastSunday && f.lastSunday.present > 0 && f.ageDays <= 60;
    case "ready-for-sunday":
      return (f.weekday === 5 || f.weekday === 6) && f.attendanceEver === 0 && f.ageDays >= 1 && f.ageDays <= 35;
    case "add-members":
      return f.members === 0 && f.ageDays >= 1 && f.ageDays <= 20;
    case "need-help":
      return !used && f.ageDays >= 14 && f.ageDays <= 40;
    case "upgrade":
      return free && f.ageDays >= 21 && f.activeRecently && f.members >= 5;
    case "door-device":
      return f.plan !== "max" && f.ageDays >= 10 && used && f.activeRecently;
    case "last-check":
      return !used && f.ageDays >= 30 && f.ageDays <= 50;
    default:
      return false;
  }
}

/** Fill {{fields}} in. Unknown fields become empty, so a missing value never shows as "{{...}}". */
export function fill(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => data[k] ?? "");
}
