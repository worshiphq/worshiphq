import Link from "next/link";
import { MessageSquare, Mail, Users, BarChart3, Wallet, AlertTriangle } from "lucide-react";
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
import { getPeopleStats } from "@/lib/data/people";
import { getSmsBalance } from "@/lib/sms/credits";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Communications" };

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireModule("communications");
  const { error } = await searchParams;
  const [{ campaigns, stats }, people, smsBalance, departments] = await Promise.all([
    getCommunications(session.churchId),
    getPeopleStats(session.churchId),
    getSmsBalance(session.churchId),
    db.department.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Communications" description="Reach your whole church — or a smart segment — by SMS and email.">
        <Link href="/app/communications/credits">
          <Button variant="secondary" size="sm"><Wallet className="size-4" /> {smsBalance.toLocaleString()} credits · Buy</Button>
        </Link>
      </PageHeader>

      {error === "credits" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          Not enough SMS credits to send that broadcast.
          <Link href="/app/communications/credits" className="font-semibold underline underline-offset-2">Buy more credits →</Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="SMS credits" value={smsBalance} icon={Wallet} />
        <StatCard label="Messages sent" value={stats.sent} icon={MessageSquare} />
        <StatCard label="People reached" value={stats.reach} icon={Users} />
        <StatCard label="Audience" value={people.total} icon={Mail} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2"><Composer departments={departments} canWrite={!session.isDemo} /></div>

        <CampaignHistory campaigns={campaigns} />
      </div>
    </div>
  );
}
