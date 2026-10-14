import { requireManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { PendingLink } from "@/components/ui/pending-link";
import { OutcomePill } from "@/components/app/follow-up-reports";
import { REPORT_OUTCOMES, REACHED_OUTCOMES, methodLabel } from "@/lib/follow-ups/outcomes";
import { DownloadButton } from "@/components/ui/download-button";
import { ArrowLeft, ListChecks, CheckCircle2, AlarmClock, PhoneCall, Timer, UserRoundPlus } from "lucide-react";

export const metadata = { title: "Follow-up report" };

const RANGES = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "12 months", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const fmt = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function FollowUpReportPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await requireManage("follow-ups");
  const churchId = session.churchId;
  const { range: rangeParam } = await searchParams;
  const range = RANGES.find((r) => r.key === rangeParam) ?? RANGES[0];
  const since = range.days ? new Date(Date.now() - range.days * 86400000) : null;
  const inRange = since ? { gte: since } : undefined;
  const now = new Date();

  const [created, completedInRange, openNow, reports, users, visitorsInRange, visitorsReached] = await Promise.all([
    db.followUp.findMany({
      where: { churchId, ...(inRange ? { createdAt: inRange } : {}) },
      select: { createdAt: true, reports: { select: { outcome: true, createdAt: true } } },
    }),
    db.followUp.findMany({
      where: { churchId, status: "done", ...(inRange ? { completedAt: inRange } : {}) },
      select: { assignees: { select: { userId: true } } },
    }),
    db.followUp.findMany({ where: { churchId, status: { not: "done" } }, select: { assignees: { select: { userId: true } }, dueDate: true } }),
    db.followUpReport.findMany({
      where: { churchId, ...(inRange ? { createdAt: inRange } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        followUp: {
          select: {
            title: true,
            person: { select: { firstName: true, lastName: true } },
            visitor: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    db.user.findMany({ where: { churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.visitor.count({ where: { churchId, ...(inRange ? { createdAt: inRange } : {}) } }),
    db.visitor.count({
      where: {
        churchId,
        ...(inRange ? { createdAt: inRange } : {}),
        followUps: { some: { reports: { some: { outcome: { in: [...REACHED_OUTCOMES] } } } } },
      },
    }),
  ]);

  // Headline numbers.
  const reached = created.filter((f) => f.reports.some((r) => REACHED_OUTCOMES.includes(r.outcome))).length;
  const firstContactDays = created
    .filter((f) => f.reports.length > 0)
    .map((f) => (Math.min(...f.reports.map((r) => r.createdAt.getTime())) - f.createdAt.getTime()) / 86400000);
  const avgFirstContact = firstContactDays.length
    ? Math.round((firstContactDays.reduce((s, d) => s + d, 0) / firstContactDays.length) * 10) / 10
    : 0;
  const overdueNow = openNow.filter((f) => f.dueDate && f.dueDate < now).length;

  // Outcomes.
  const outcomeCounts = REPORT_OUTCOMES.map((o) => ({ ...o, count: reports.filter((r) => r.outcome === o.value).length })).filter((o) => o.count > 0);
  const maxOutcome = Math.max(1, ...outcomeCounts.map((o) => o.count));

  // Per team member.
  const team = [...users, { id: "", name: "Nobody assigned" }]
    .map((u) => {
      const open = openNow.filter((f) => (u.id ? f.assignees.some((a) => a.userId === u.id) : f.assignees.length === 0));
      return {
        id: u.id,
        name: u.name,
        open: open.length,
        overdue: open.filter((f) => f.dueDate && f.dueDate < now).length,
        done: completedInRange.filter((f) => (u.id ? f.assignees.some((a) => a.userId === u.id) : f.assignees.length === 0)).length,
        reports: u.id ? reports.filter((r) => r.authorId === u.id).length : 0,
        lastReport: u.id ? reports.find((r) => r.authorId === u.id)?.createdAt ?? null : null,
      };
    })
    .filter((t) => t.open + t.done + t.reports > 0)
    .sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : b.reports + b.done - (a.reports + a.done)));

  return (
    <div>
      <PageHeader title="Follow-up report" description="Who was reached, what happened, and how the team is keeping up.">
        <PendingLink href="/app/follow-ups" icon={<ArrowLeft />} pendingLabel="Going back…">
          Follow-ups
        </PendingLink>
        <DownloadButton url="/api/export/follow-up-reports?format=xlsx">Download reports</DownloadButton>
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <PendingLink
            key={r.key}
            href={`/app/follow-ups/report?range=${r.key}`}
            variant={r.key === range.key ? "primary" : "secondary"}
            size="sm"
            pendingLabel="Loading…"
          >
            {r.label}
          </PendingLink>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Follow-ups created" value={created.length} icon={ListChecks} />
        <StatCard label="Completed" value={completedInRange.length} icon={CheckCircle2} />
        <StatCard label="Reached" value={pct(reached, created.length)} suffix="%" icon={PhoneCall} />
        <StatCard label="Avg. days to first contact" value={avgFirstContact} decimals={1} icon={Timer} />
        <StatCard label="Overdue right now" value={overdueNow} icon={AlarmClock} />
        <StatCard label="New visitors reached" value={visitorsReached} suffix={` of ${visitorsInRange}`} icon={UserRoundPlus} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <h2 className="text-sm font-semibold">Team</h2>
          <p className="mt-0.5 text-xs text-ink-muted">Open and overdue are as of now; completed and reports are for the period.</p>
          {team.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">No follow-ups yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-faint">
                    <th className="py-2 pr-3 font-medium">Person</th>
                    <th className="px-2 py-2 text-right font-medium">Open</th>
                    <th className="px-2 py-2 text-right font-medium">Overdue</th>
                    <th className="px-2 py-2 text-right font-medium">Completed</th>
                    <th className="px-2 py-2 text-right font-medium">Reports</th>
                    <th className="py-2 pl-2 text-right font-medium">Last report</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((t) => (
                    <tr key={t.id || "none"} className="border-b border-line/60 last:border-0">
                      <td className={t.id ? "py-2 pr-3 font-medium" : "py-2 pr-3 italic text-ink-muted"}>{t.name}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{t.open}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${t.overdue > 0 ? "font-semibold text-danger" : ""}`}>{t.overdue}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{t.done}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{t.id ? t.reports : "-"}</td>
                      <td className="py-2 pl-2 text-right text-xs text-ink-muted">{t.lastReport ? fmt(t.lastReport) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Outcomes</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{reports.length} report{reports.length === 1 ? "" : "s"} in this period</p>
          {outcomeCounts.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">No reports given yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {outcomeCounts.map((o) => (
                <div key={o.value}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <OutcomePill outcome={o.value} />
                    <span className="tabular-nums text-ink-muted">{o.count} · {pct(o.count, reports.length)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${(o.count / maxOutcome) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <h2 className="text-sm font-semibold">Latest reports</h2>
        {reports.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">Reports appear here when your team taps &ldquo;Give report&rdquo; on a follow-up.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {reports.slice(0, 40).map((r) => {
              const who = r.followUp.visitor ?? r.followUp.person;
              return (
                <li key={r.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{who ? `${who.firstName} ${who.lastName}` : r.followUp.title}</span>
                    <OutcomePill outcome={r.outcome} />
                    <span className="text-xs text-ink-muted">{methodLabel(r.method)}</span>
                    <span className="ml-auto text-xs text-ink-faint">{r.authorName} · {fmt(r.createdAt)}</span>
                  </div>
                  {r.note && <p className="mt-1 whitespace-pre-line text-ink-muted">{r.note}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
