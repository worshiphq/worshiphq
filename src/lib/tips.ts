import "server-only";
import { db } from "@/lib/db";
import { hasSection, type Session } from "@/lib/permissions";

/**
 * "Did you know" tips: gentle prompts about features a church has but is not using, so it gets the full
 * value of what it pays for. Chosen from what the church has actually done (and not done), never at random,
 * and only for pages the person is allowed to open.
 *
 * Two kinds:
 *  - USAGE tips need the feature to be on the church's plan and point at something they have not tried.
 *  - UPSELL tips are for a feature the plan does NOT include. They are shown only to the Main Admin (the
 *    only person who can upgrade), at most one at a time, and always after the usage tips.
 */

export type Tip = { id: string; title: string; body: string; href: string; cta: string; kind: "usage" | "upsell" };

type Ctx = {
  plan: string;
  isOwner: boolean;
  people: number;
  visitors: number;
  followUps: number;
  groups: number;
  departments: number;
  accounts: number;
  broadcasts: number;
  hasLogo: boolean;
  birthdayWishOn: boolean;
  absenceOn: boolean;
  autoInactiveOn: boolean;
  autoRenew: boolean;
};

type Def = {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  /** Plan feature that must be ON for a usage tip, or OFF for an upsell. */
  feature?: string;
  /** Permission section the person needs to open the page. */
  section?: string;
  when: (c: Ctx) => boolean;
};

const USAGE: Def[] = [
  { id: "logo", title: "Add your logo and colours", body: "Your members see your church, not ours: your logo and colour on the dashboard, receipts, posters and ID cards.", href: "/app/settings?tab=branding", cta: "Set up branding", section: "settings", when: (c) => !c.hasLogo },
  { id: "join-form", title: "Let members register themselves", body: "Share your join link or QR code and members fill in their own details, which land in your list automatically.", href: "/app/people", cta: "Get your join link", section: "people", when: (c) => c.people < 25 },
  { id: "departments", title: "Organise your departments", body: "Group people into choir, ushers, youth and more. You can message, track and lead each one separately.", href: "/app/settings?tab=departments", cta: "Add departments", section: "settings", when: (c) => c.departments === 0 },
  { id: "groups", title: "Start a group", body: "Cell groups, prayer teams and classes each get their own members, leader and meeting reminders.", href: "/app/groups", cta: "Create a group", section: "groups", when: (c) => c.groups === 0 },
  { id: "first-sms", title: "Send your first SMS", body: "Text your whole church, one department or a single person in seconds, from the Communications page.", href: "/app/communications", cta: "Open Communications", feature: "sms", section: "communications", when: (c) => c.broadcasts === 0 },
  { id: "birthdays", title: "Never forget a birthday again", body: "Turn on birthday wishes and members get a warm text from the church on their day, automatically.", href: "/app/reminders", cta: "Turn it on", feature: "reminders", section: "reminders", when: (c) => !c.birthdayWishOn },
  { id: "absence", title: "Notice when someone goes quiet", body: "WorshipHQ can text members who have not been seen for a few weeks and tell your team, so nobody drifts away unnoticed.", href: "/app/reminders", cta: "Turn it on", feature: "reminders", section: "reminders", when: (c) => !c.absenceOn && c.people >= 10 },
  { id: "follow-ups", title: "Follow up every visitor", body: "Give each visitor a follow-up with a name and a date on it, so nobody is left to someone's memory.", href: "/app/follow-ups", cta: "See follow-ups", feature: "follow-ups", section: "follow-ups", when: (c) => c.visitors > 0 && c.followUps === 0 },
  { id: "id-cards", title: "Print member ID cards", body: "A card for every member with their photo, ID and a QR code your check-in scanner can read.", href: "/app/people/id-cards", cta: "Make ID cards", feature: "member-ids", section: "people", when: (c) => c.people >= 5 },
  { id: "poster", title: "Design a QR poster for your door", body: "A printed poster with your logo and colours that sends people straight to your join or check-in form.", href: "/app/settings?tab=registration", cta: "Make a poster", feature: "poster-maker", section: "settings", when: () => true },
  { id: "accounts", title: "Know where every cedi is", body: "Add your bank, Mobile Money and cash accounts so giving and expenses land in the right place.", href: "/app/accounting", cta: "Set up accounts", feature: "accounting", section: "accounting", when: (c) => c.accounts === 0 },
  { id: "sms-records", title: "See every text you have sent", body: "SMS records show what went out, who got it and who did not, so you can answer \"did that reach them?\".", href: "/app/communications/log", cta: "Open SMS records", feature: "sms-audit", section: "communications", when: (c) => c.broadcasts > 0 },
  { id: "auto-inactive", title: "Keep your member list honest", body: "Members who stop coming can be marked inactive automatically after a number of weeks, so your reports show who is really there.", href: "/app/settings?tab=age-groups", cta: "Set it up", feature: "auto-inactive", section: "settings", when: (c) => !c.autoInactiveOn && c.people >= 20 },
  { id: "auto-renew", title: "Never lose your plan by accident", body: "Keep a card on file and your plan renews by itself on the date. Turn it off whenever you like.", href: "/app/settings?tab=billing", cta: "Open Billing", section: "settings", when: (c) => c.plan !== "free" && !c.autoRenew },
];

const UPSELL: Def[] = [
  { id: "up-sms", title: "Text your whole church", body: "On Starter you can send SMS to everyone, a department or one person, plus birthday and absence texts.", href: "/app/settings?tab=billing", cta: "See Starter", feature: "sms", when: () => true },
  { id: "up-rosters", title: "Run your volunteer rosters", body: "On Pro, build service rosters, schedule volunteers and have them reminded automatically.", href: "/app/settings?tab=billing", cta: "See Pro", feature: "rosters", when: () => true },
  { id: "up-accounting", title: "Track church finances properly", body: "On Pro, keep accounts, income and expenses together so you always know where the money is.", href: "/app/settings?tab=billing", cta: "See Pro", feature: "accounting", when: () => true },
  { id: "up-devices", title: "Check in by fingerprint, face or palm", body: "On Max, fast queues and no double check-ins, plus restricted funds and automatic inactive members.", href: "/app/settings?tab=billing", cta: "See Max", feature: "biometric-devices", when: () => true },
];

/** Pick the tips worth showing this person, best first. The client shows them one at a time. */
export async function getTips(session: Session): Promise<Tip[]> {
  if (session.isDemo || session.impersonating) return [];
  const churchId = session.churchId;
  const locked = new Set(session.planLocked ?? []);

  const [church, sub, people, visitors, followUps, groups, departments, accounts, broadcasts] = await Promise.all([
    db.church.findUnique({ where: { id: churchId }, select: { logoUrl: true, birthdayWishOn: true, absenceOn: true, autoInactiveOn: true } }),
    db.subscription.findUnique({ where: { churchId }, select: { plan: true, autoRenew: true } }),
    db.person.count({ where: { churchId, status: { not: "visitor" } } }),
    db.visitor.count({ where: { churchId } }),
    db.followUp.count({ where: { churchId } }),
    db.group.count({ where: { churchId } }),
    db.department.count({ where: { churchId } }),
    db.churchAccount.count({ where: { churchId } }),
    db.communication.count({ where: { churchId } }),
  ]);

  const ctx: Ctx = {
    plan: sub?.plan ?? "free",
    isOwner: session.role === "Owner",
    people, visitors, followUps, groups, departments, accounts, broadcasts,
    hasLogo: !!church?.logoUrl,
    birthdayWishOn: church?.birthdayWishOn ?? false,
    absenceOn: church?.absenceOn ?? false,
    autoInactiveOn: church?.autoInactiveOn ?? false,
    autoRenew: sub?.autoRenew ?? false,
  };

  const usage = USAGE.filter((d) =>
    (!d.feature || !locked.has(d.feature)) &&
    (!d.section || hasSection(session, d.section)) &&
    // The renewal tip is about the plan, which only the Main Admin can change.
    (d.id !== "auto-renew" || ctx.isOwner) &&
    d.when(ctx),
  ).map((d): Tip => ({ id: d.id, title: d.title, body: d.body, href: d.href, cta: d.cta, kind: "usage" }));

  const upsell = ctx.isOwner
    ? UPSELL.filter((d) => d.feature && locked.has(d.feature) && d.when(ctx)).slice(0, 1).map((d): Tip => ({ id: d.id, title: d.title, body: d.body, href: d.href, cta: d.cta, kind: "upsell" }))
    : [];

  return [...usage.slice(0, 5), ...upsell];
}
