import { listCards } from "@/lib/billing/cards";
import { localPrices, isGhana } from "@/lib/billing/local-price";
import { PageHeader } from "@/components/app/page-header";
import { SettingsClient } from "@/components/app/settings-client";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { features } from "@/lib/env";
import { getTrialOffer } from "@/lib/trials";
import { churchHasFeature } from "@/lib/plan-gate-server";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { loadMessageCenter } from "@/lib/messages/load";

export const metadata = { title: "Settings" };
export const maxDuration = 60; // restoring a backup runs inside this page's server action

export default async function SettingsPage() {
  const session = await requireModule("settings");

  const [church, users, departments, customRoles, subscription, platformConfig, planPayments, messageCenter, memberCount, smsTopups] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId } }),
    db.user.findMany({
      where: { churchId: session.churchId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, phone: true, photoUrl: true, role: true, createdAt: true, inviteToken: true, inviteAcceptedAt: true, passwordHash: true, customRole: { select: { id: true, name: true } }, budgetDepartment: { select: { id: true, name: true } } },
    }),
    db.department.findMany({
      where: { churchId: session.churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.customRole.findMany({
      where: { churchId: session.churchId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sections: true, manageSections: true, manageSplit: true, canDelete: true },
    }),
    db.subscription.findUnique({
      where: { churchId: session.churchId },
      select: { plan: true, status: true, interval: true, renewsAt: true, bypassPlan: true, scheduledPlan: true, cancelAtPeriodEnd: true, autoRenew: true, cardId: true, renewalFailures: true },
    }),
    getPlatformConfig(),
    db.planPayment.findMany({
      where: { churchId: session.churchId },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
    loadMessageCenter(session.churchId),
    db.person.count({ where: { churchId: session.churchId } }),
    db.smsTransaction.findMany({ where: { churchId: session.churchId, kind: { in: ["topup", "bonus"] } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, createdAt: true, credits: true, amountGhs: true, kind: true, note: true } }),
  ]);

  // Auto-provision subscription for churches created before subscriptions existed
  let sub = subscription;
  if (!sub && church) {
    sub = await db.subscription.create({
      data: {
        churchId: church.id,
        plan: "free",
        interval: "monthly",
        status: "active",
      },
      select: { plan: true, status: true, interval: true, renewsAt: true, bypassPlan: true, scheduledPlan: true, cancelAtPeriodEnd: true, autoRenew: true, cardId: true, renewalFailures: true },
    });
  }

  const trialFull = await getTrialOffer(session.churchId);
  const trial = { phase: trialFull.phase, plan: trialFull.plan, endsAt: trialFull.endsAt, daysLeft: trialFull.daysLeft, canStart: trialFull.canStart, days: trialFull.settings.days };

  // Cards the church kept for renewals. listCards never selects the charge token.
  const cards = await listCards(session.churchId);

  // How many people are actually in each department. Counted as distinct people across both links:
  // `departments` is the many-to-many, `departmentId` the legacy single one, and somebody can sit on
  // both - so adding the two relation counts together would double-count them.
  // One query, not one per department, which ran on every open of this page whatever tab was showing.
  const peopleInDepts = departments.length
    ? await db.person.findMany({
      where: { churchId: session.churchId, OR: [{ departmentId: { not: null } }, { departments: { some: {} } }] },
      select: { departmentId: true, departments: { select: { id: true } } },
    })
    : [];
  const deptTally = new Map<string, number>();
  for (const p of peopleInDepts) {
    for (const id of new Set([p.departmentId, ...p.departments.map((d) => d.id)])) {
      if (id) deptTally.set(id, (deptTally.get(id) ?? 0) + 1);
    }
  }
  const departmentsWithCounts = departments.map((d) => ({ ...d, memberCount: deptTally.get(d.id) ?? 0 }));

  const [birthdayLocked, childLinks] = await Promise.all([
    churchHasFeature(session.churchId, "birthday-automations").then((on) => !on),
    db.church.count({ where: { parentChurchId: session.churchId } }),
  ]);
  // A church already linked (as a branch / teens chapel, or with its own links) keeps the tab so it can see and undo the link.
  const hasLinks = !!church?.parentChurchId || childLinks > 0;
  const churchData = church
    ? {
      name: church.name,
      denomination: church.denomination ?? "",
      city: church.city ?? "",
      country: church.country ?? "Ghana",
      address: church.address ?? "",
      notifySubmissions: church.notifySubmissions ?? true,
      hideAmounts: church.hideAmounts ?? false,
      birthdayDigestOn: church.birthdayDigestOn ?? true,
      birthdayDigestDay: church.birthdayDigestDay ?? 1,
      birthdayLocked,
      hasLinks,
      accentColor: church.accentColor ?? "#0d7377",
      logoUrl: church.logoUrl ?? "",
      slug: church.slug,
      registrationFields: (church.registrationFields as Record<string, boolean> | null) ?? null,
      visitorFormFields: church.visitorFormFields ?? null,
      childrenFormFields: church.childrenFormFields ?? null,
      teensFormFields: church.teensFormFields ?? null,

      smsSenderId: church.smsSenderId,
      smsSenderIdStatus: church.smsSenderIdStatus,
      smsSenderIdRequestedAt: church.smsSenderIdRequestedAt,
      rolePermissions: (church.rolePermissions as Record<string, string[]> | null) ?? null,
    }
    : null;

  return (
    <div>
      <PageHeader title="Settings" description="Church profile, branding, team, billing and integrations." />
      <SettingsClient
        session={session}
        features={{ ...features }}
        church={churchData}
        users={users.map((u) => ({
          id: u.id, name: u.name, email: u.email, phone: u.phone, photoUrl: u.photoUrl, role: u.role,
          customRole: u.customRole, budgetDepartment: u.budgetDepartment,
          // Waiting = invited, never accepted and no password set. The token and hash themselves never leave the server.
          pending: !!u.inviteToken && !u.inviteAcceptedAt && !u.passwordHash,
          joinedAt: u.createdAt.toISOString(),
        }))}
        departments={departmentsWithCounts}
        customRoles={customRoles.map(({ manageSplit, ...r }) => ({ ...r, manageSections: manageSplit ? r.manageSections : r.sections }))}
        subscription={sub}
        trial={trial}
        cards={cards}
        autoInactive={{ on: church?.autoInactiveOn ?? false, weeks: church?.autoInactiveWeeks ?? 12, locked: !session.isDemo && !!session.planLocked?.includes("auto-inactive") }}
        messageCenter={messageCenter}
        platformPricing={{ ...platformConfig, ...(localPrices(platformConfig, isGhana(church?.country)) ?? {}) }}
        billingUsage={(() => {
          const limits = platformConfig.planTable[(sub?.plan ?? "free") as keyof typeof platformConfig.planTable];
          return {
            members: memberCount,
            memberLimit: limits && Number.isFinite(limits.members) ? limits.members : null,
            teamUsers: users.length,
            teamLimit: limits && Number.isFinite(limits.teamUsers) ? limits.teamUsers : null,
            smsCredits: church?.smsCredits ?? 0,
          };
        })()}
        smsTopups={smsTopups.map((t) => ({ id: t.id, at: t.createdAt.toISOString(), credits: t.credits, amountGhs: t.amountGhs, kind: t.kind, note: t.note }))}
        payments={planPayments.map((p) => ({
          id: p.id,
          reference: p.reference,
          plan: p.plan,
          interval: p.interval,
          amountUsd: p.amountUsd,
          amountGhs: p.amountGhs,
          discountUsd: p.discountUsd,
          status: p.status,
          paidAt: p.paidAt.toISOString(),
          periodEnd: p.periodEnd.toISOString(),
          source: p.source,
          note: p.note,
          termMonths: p.termMonths,
        }))}
      />
    </div>
  );
}
