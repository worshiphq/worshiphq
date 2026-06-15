import Link from "next/link";
import { MessageSquare, Mail, Users, BarChart3, Wallet, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Composer } from "@/components/app/composer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
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
  const [{ campaigns, stats }, people, smsBalance] = await Promise.all([
    getCommunications(session.churchId),
    getPeopleStats(session.churchId),
    getSmsBalance(session.churchId),
  ]);

  const segments = [
    `All members (${people.total})`,
    `Active members (${people.active})`,
    `Visitors (${people.visitors})`,
  ];

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
        <div className="lg:col-span-2"><Composer segments={segments} canWrite={!session.isDemo} /></div>

        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Campaign history</h3>
            <Badge variant="default"><BarChart3 className="size-3" /> Analytics</Badge>
          </div>
          {campaigns.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-muted">No broadcasts yet. Send your first from the composer.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <tr><th className="p-4 font-medium">Campaign</th><th className="p-4 font-medium">Channel</th><th className="p-4 font-medium">Delivered</th><th className="hidden p-4 font-medium sm:table-cell">Date</th><th className="p-4 font-medium">Status</th></tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-line-soft last:border-0">
                      <td className="p-4 font-medium">{c.name}</td>
                      <td className="p-4"><Badge variant={c.channel === "SMS" ? "primary" : "info"}>{c.channel}</Badge></td>
                      <td className="p-4 text-ink-muted">{c.sent > 0 ? `${c.delivered}/${c.sent}` : "—"}{c.channel === "Email" && c.opened > 0 && <span className="ml-1 text-xs text-ink-faint">({c.opened} opened)</span>}</td>
                      <td className="hidden p-4 text-ink-muted sm:table-cell">{formatDate(c.date)}</td>
                      <td className="p-4"><Badge variant={c.status === "Sent" ? "success" : "warning"}>{c.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
