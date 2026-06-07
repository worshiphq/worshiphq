import { Plus, Users, CalendarClock, Bell, CheckCircle2, HandHelping } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { requireSession } from "@/lib/auth";
import { getVolunteers } from "@/lib/data/modules";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Volunteers" };

export default async function VolunteersPage() {
  const session = await requireSession();
  const { teams, assignments } = await getVolunteers(session.churchId);
  const confirmed = assignments.filter((a) => a.confirmed).length;

  return (
    <div>
      <PageHeader title="Volunteers & scheduling" description="Build rosters, match skills and keep every team covered.">
        <Button variant="secondary" size="sm"><Bell /> Send reminders</Button>
        <Button size="sm" disabled={session.isDemo}><Plus /> Schedule team</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Teams" value={teams.length} icon={Users} />
        <StatCard label="Scheduled" value={assignments.length} icon={CalendarClock} />
        <StatCard label="Confirmed" value={confirmed} icon={CheckCircle2} />
        <StatCard label="Team members" value={teams.reduce((s, t) => s + t.members, 0)} icon={HandHelping} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Teams</h3></div>
          <div className="divide-y divide-line-soft">
            {teams.length === 0 && <div className="p-6 text-sm text-ink-faint">Create ministry groups in People to organise volunteer teams.</div>}
            {teams.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-4">
                <span className="font-medium">{t.name}</span>
                <Badge variant="default">{t.members} {t.members === 1 ? "member" : "members"}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Upcoming roster</h3></div>
          <div className="divide-y divide-line-soft">
            {assignments.length === 0 ? (
              <div className="p-6 text-sm text-ink-faint">No one scheduled yet. Schedule a team to build this Sunday&rsquo;s roster.</div>
            ) : (
              assignments.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Avatar name={a.person} size="sm" />
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{a.person}</div><div className="text-xs text-ink-faint">{a.team} · {a.role} · {formatDate(a.date)}</div></div>
                  <Badge variant={a.confirmed ? "success" : "warning"}>{a.confirmed ? "Confirmed" : "Pending"}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
