import Link from "@/components/ui/app-link";
import { canEdit } from "@/lib/permissions";
import { MessageSquare, Mail, Users, BarChart3, Wallet, AlertTriangle, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Composer } from "@/components/app/composer";
import { CampaignHistory } from "@/components/app/campaign-history";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCommunications } from "@/lib/data/modules";
import { getSmsUsage } from "@/lib/data/sms-audit";
import { checkDeliveries } from "@/lib/sms/delivery";
import { getPeopleStats } from "@/lib/data/people";
import { getSmsBalance } from "@/lib/sms/credits";
import { getChurchPlan } from "@/lib/plan-gate-server";
import { commsTrialOf, planRank, type PlanId } from "@/lib/plan-gate";
import { getChurchSub } from "@/lib/plan-gate-server";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { suggestSenderId } from "@/lib/sms/sender-suggestion";
import { MessageNameCard } from "@/components/app/message-name-card";
import { currentNameLine } from "@/lib/sms/message-name";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Communications" };
// A broadcast to a whole church runs inside this page's server action.
export const maxDuration = 60;

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; to?: string }>;
}) {
  const session = await requireModule("communications");
  const { error, to } = await searchParams;
  const initialTarget = to === "visitor" || to === "visitor-30" ? to : "all";
  // Ask the network about recent texts still waiting (briefly), so statuses are current.
  await checkDeliveries({ churchId: session.churchId, budgetMs: 3000, maxLookups: 60 });
  const [{ campaigns }, people, usage, smsBalance, departments, groups, plan, churchRow] = await Promise.all([
    getCommunications(session.churchId),
    getPeopleStats(session.churchId),
    getSmsUsage(session.churchId),
    getSmsBalance(session.churchId),
    db.department.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.group.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getChurchPlan(session.churchId),
    db.church.findUnique({ where: { id: session.churchId }, select: { createdAt: true, name: true, smsSenderIdStatus: true, smsPrefix: true } }),
  ]);
  // A quiet hint of what their own sender name could look like, for churches below Pro that do not have one.
  const suggestion = churchRow ? suggestSenderId(churchRow.name) : "";
  const senderTeaser = churchRow && suggestion && churchRow.smsSenderIdStatus !== "approved" && planRank(plan as PlanId) < planRank("max")
    ? { suggestion, churchName: churchRow.name }
    : null;
  const [subRow, platformCfg] = await Promise.all([getChurchSub(session.churchId), getPlatformConfig()]);
  const trial = plan === "free" ? commsTrialOf(subRow, platformCfg.trials.comms.enabled) : null;
  // A church with its own approved sender name needs no name line; every other church picks how its name shows.
  const ownSender = churchRow?.smsSenderIdStatus === "approved";
  const nameLine = !ownSender && churchRow ? currentNameLine(churchRow.smsPrefix, churchRow.name) : null;

  return (
    <div>
      <PageHeader title="Communications" description="Reach your whole church - or a smart segment - by SMS.">
        <Link href="/app/messages">
          <Button variant="secondary" size="sm"><MessageSquare className="size-4" /> Message templates</Button>
        </Link>
        {!session.planLocked?.includes("sms-audit") && (
          <Link href="/app/communications/log">
            <Button variant="secondary" size="sm"><ScrollText className="size-4" /> SMS records</Button>
          </Link>
        )}
        <Link href="/app/communications/credits">
          <Button variant="secondary" size="sm"><Wallet className="size-4" /> {smsBalance.toLocaleString()} credits · Buy</Button>
        </Link>
      </PageHeader>

      {trial?.active && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-ink">
          <MessageSquare className="size-4 shrink-0 text-brand" />
          <span>
            <b>Free Communications trial:</b> {trial.daysLeft} {trial.daysLeft === 1 ? "day" : "days"} left, with your {smsBalance.toLocaleString()} free credits. Your credits never expire. When the trial ends, upgrade to Starter to keep sending.
          </span>
        </div>
      )}

      {error === "credits" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          Not enough SMS credits to send that broadcast.
          <Link href="/app/communications/credits" className="font-semibold underline underline-offset-2">Buy more credits →</Link>
        </div>
      )}

      {!ownSender && churchRow && (
        <MessageNameCard churchName={churchRow.name} chosen={churchRow.smsPrefix} canWrite={canEdit(session, "communications")} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="SMS credits left" value={smsBalance} icon={Wallet} />
        <StatCard label="Credits used this month" value={usage.creditsMonth} icon={MessageSquare} note={`${usage.creditsAll.toLocaleString()} used all time`} />
        <StatCard label="Texts sent" value={usage.textsAll} icon={Mail} note={`${usage.textsMonth.toLocaleString()} this month${usage.failedAll ? ` · ${usage.failedAll.toLocaleString()} not delivered` : ""}`} />
        <StatCard label="People reached" value={usage.peopleReached} icon={Users} note={`of ${people.total.toLocaleString()} in your church`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2"><Composer initialTarget={initialTarget} departments={departments} groups={groups} canWrite={canEdit(session, "communications")} senderTeaser={senderTeaser} nameLine={nameLine} /></div>

        <CampaignHistory campaigns={campaigns} />
      </div>
    </div>
  );
}
