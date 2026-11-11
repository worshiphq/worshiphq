import Link from "@/components/ui/app-link";
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Wallet, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getSmsLog, getSmsLogTotals, SMS_LOG_PAGE_SIZE } from "@/lib/data/sms-audit";
import { checkDeliveries } from "@/lib/sms/delivery";
import { SmsLogList } from "@/components/app/sms-log-list";
import { cn } from "@/lib/utils";

export const metadata = { title: "SMS records" };

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "manual", label: "Sent by the team" },
  { key: "automatic", label: "Sent automatically" },
  { key: "failed", label: "Not delivered" },
] as const;

export default async function SmsLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string; q?: string }>;
}) {
  const session = await requireModule("communications");
  // Communications alone is not enough: the records are their own paid feature, so a church whose plan
  // does not include them goes to Billing, the same place a locked menu item sends them. The check lives
  // here and not only on the button, because a saved link must be refused too.
  if (!session.isDemo && session.planLocked?.includes("sms-audit")) redirect("/app/settings?tab=billing");

  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.key === sp.filter) ? sp.filter! : "all";
  // Ask the network about anything still waiting first (briefly), so the page shows the latest word.
  await checkDeliveries({ churchId: session.churchId, budgetMs: 4000, maxLookups: 80 });
  const [log, totals] = await Promise.all([
    getSmsLog({ churchId: session.churchId, page: parseInt(sp.page ?? "1", 10) || 1, filter, q: sp.q }),
    getSmsLogTotals(session.churchId),
  ]);

  const href = (p: number, f = filter) =>
    `/app/communications/log?${new URLSearchParams({
      ...(f !== "all" ? { filter: f } : {}),
      ...(sp.q ? { q: sp.q } : {}),
      ...(p > 1 ? { page: String(p) } : {}),
    }).toString()}`;

  return (
    <div>
      <Link href="/app/communications" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back to communications
      </Link>
      <PageHeader
        title="SMS records"
        description="Every text your church has sent - what it said, who got it, and what it cost. Kept for as long as your account is open."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Texts sent (all time)" value={totals.accepted} />
        <StatCard icon={CheckCircle2} label="Confirmed delivered" value={totals.delivered} />
        <StatCard icon={AlertTriangle} label="Not delivered" value={totals.failed} />
        <StatCard icon={Wallet} label="Credits used (all time)" value={totals.credits} />
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold">Send history</h3>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href(1, f.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.key ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-muted hover:bg-surface-2",
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        <form action="/app/communications/log" className="border-b border-line px-5 py-3">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search what was sent"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        </form>

        {!log.ready ? (
          <div className="p-8 text-center text-sm text-ink-muted">Send records are being set up. Check back shortly.</div>
        ) : (
          <SmsLogList
            rows={log.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
          />
        )}

        {log.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
            <span className="text-ink-faint">
              {(log.page - 1) * SMS_LOG_PAGE_SIZE + 1} to {Math.min(log.page * SMS_LOG_PAGE_SIZE, log.total)} of {log.total}
            </span>
            <div className="flex items-center gap-2">
              {log.page > 1 ? (
                <Link href={href(log.page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
                  <ChevronLeft className="size-3.5" /> Newer
                </Link>
              ) : <span />}
              <span className="text-xs text-ink-muted">Page {log.page} of {log.pages}</span>
              {log.page < log.pages ? (
                <Link href={href(log.page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
                  Older <ChevronRight className="size-3.5" />
                </Link>
              ) : <span />}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
