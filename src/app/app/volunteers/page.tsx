import { Plus, Users, CalendarClock, Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { volunteerTeams } from "@/lib/demo/data";

const roster = [
  { day: "Sun · 1st Service", slots: [
    { role: "Worship lead", person: "Akosua Mensah", filled: true },
    { role: "Sound engineer", person: "Kojo Owusu", filled: true },
    { role: "Livestream", person: null, filled: false },
  ]},
  { day: "Sun · 2nd Service", slots: [
    { role: "Worship lead", person: "Yaa Sarpong", filled: true },
    { role: "Sound engineer", person: null, filled: false },
    { role: "Usher lead", person: "Yaw Boateng", filled: true },
  ]},
];

export default function VolunteersPage() {
  const totalScheduled = volunteerTeams.reduce((s, t) => s + t.scheduled, 0);
  const totalNeeded = volunteerTeams.reduce((s, t) => s + t.needed, 0);

  return (
    <div>
      <PageHeader title="Volunteers & scheduling" description="Build rosters, match skills and keep every team covered.">
        <Button variant="secondary" size="sm"><Bell /> Send reminders</Button>
        <Button size="sm"><Plus /> Schedule team</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active volunteers" value={148} change={7.8} icon={Users} />
        <StatCard label="Scheduled this week" value={totalScheduled} icon={CalendarClock} />
        <StatCard label="Open slots" value={totalNeeded - totalScheduled} icon={AlertCircle} />
        <StatCard label="Confirmation rate" value={91} suffix="%" change={2.3} icon={CheckCircle2} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Teams</h3>
          </div>
          <div className="divide-y divide-line-soft">
            {volunteerTeams.map((t) => {
              const full = t.scheduled >= t.needed;
              return (
                <div key={t.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.team}</div>
                    <div className="text-xs text-ink-faint">Lead: {t.lead} · {t.role}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{t.scheduled}/{t.needed}</div>
                    <Badge variant={full ? "success" : "warning"}>{full ? "Covered" : `${t.needed - t.scheduled} needed`}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">This Sunday&rsquo;s roster</h3>
          </div>
          <div className="space-y-5 p-5">
            {roster.map((block) => (
              <div key={block.day}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary-bright">{block.day}</div>
                <div className="space-y-2">
                  {block.slots.map((slot) => (
                    <div key={slot.role} className="flex items-center justify-between rounded-xl border border-line bg-surface-2/30 px-3 py-2.5">
                      <span className="text-sm text-ink-muted">{slot.role}</span>
                      {slot.filled && slot.person ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={slot.person} size="xs" />
                          <span className="text-sm font-medium">{slot.person}</span>
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs"><Plus className="size-3" /> Assign</Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
