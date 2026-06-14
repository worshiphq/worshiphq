"use client";

import { useTransition } from "react";
import { Cake, Heart, Sparkles, Plus, Gift, Send, Zap } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useFeedback } from "@/components/ui/feedback";
import { toggleAutomation } from "@/app/actions/automations";
import { cn } from "@/lib/utils";

type Automation = { id: string; name: string; description: string; trigger: string; channel: string; active: boolean; runs: number };
type Upcoming = { person: string; type: string; when: string };

export function RemindersClient({
  automations,
  upcoming,
  activeCount,
  canWrite,
}: {
  automations: Automation[];
  upcoming: Upcoming[];
  activeCount: number;
  canWrite: boolean;
}) {
  const [pending, start] = useTransition();
  const { toast } = useFeedback();

  return (
    <div>
      <PageHeader title="Reminders & automations" description="Care that never forgets — birthdays, anniversaries and follow-ups, on autopilot.">
        <Button size="sm" disabled={!canWrite}><Plus /> New automation</Button>
      </PageHeader>

      <Card className="relative mb-4 overflow-hidden border-gold/30 bg-gradient-to-br from-gold-soft to-surface p-6">
        <Sparkles className="absolute right-6 top-6 size-16 text-gold/20" />
        <div className="relative max-w-lg">
          <Badge variant="gold" className="mb-3"><Zap className="size-3" /> {activeCount} automations running</Badge>
          <h3 className="font-display text-xl font-semibold">Every member feels seen</h3>
          <p className="mt-2 text-sm text-ink-muted">
            WorshipHQ automatically sends warm birthday and anniversary blessings, welcomes first-time visitors, and
            gently checks in on members who&rsquo;ve been away — all in your church&rsquo;s voice.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {automations.length === 0 && (
            <Card className="p-8 text-center text-sm text-ink-muted">No automations yet. Create one to start automatic birthday blessings and follow-ups.</Card>
          )}
          {automations.map((a) => (
            <Card key={a.id} className="flex items-center gap-4 p-5">
              <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl border", a.active ? "border-primary/30 bg-primary/10 text-primary-bright" : "border-line bg-surface-2 text-ink-faint")}>
                {a.channel.includes("Email") ? <Send className="size-5" /> : <Cake className="size-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><h4 className="font-medium">{a.name}</h4><Badge variant="default" className="text-[10px]">{a.channel}</Badge></div>
                <p className="mt-0.5 text-xs text-ink-muted">{a.description}</p>
                <p className="mt-1 text-[11px] text-ink-faint">Trigger: {a.trigger} · {a.runs} sent</p>
              </div>
              <button
                role="switch"
                aria-checked={a.active}
                disabled={!canWrite || pending}
                onClick={() =>
                  start(async () => {
                    await toggleAutomation(a.id, !a.active);
                    toast(a.active ? "Automation paused" : "Automation activated", "success");
                  })
                }
                className={cn("relative h-6 w-11 shrink-0 rounded-full border border-line transition-colors disabled:opacity-50", a.active ? "bg-primary" : "bg-surface-2")}
              >
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", a.active ? "left-[1.45rem]" : "left-0.5")} />
              </button>
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <div className="flex items-center gap-2 border-b border-line p-5"><Gift className="size-5 text-gold" /><h3 className="font-display text-lg font-semibold">This week</h3></div>
          <div className="divide-y divide-line-soft">
            {upcoming.length === 0 && <div className="p-6 text-sm text-ink-faint">No birthdays or anniversaries in the next 7 days.</div>}
            {upcoming.map((u, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={u.person} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.person}</div>
                  <div className="flex items-center gap-1 text-xs text-ink-faint">{u.type === "Birthday" ? <Cake className="size-3" /> : <Heart className="size-3 text-danger" />}{u.type}</div>
                </div>
                <Badge variant={u.when === "Today" ? "gold" : "default"}>{u.when}</Badge>
              </div>
            ))}
          </div>
          {upcoming.length > 0 && (
            <div className="p-4"><div className="rounded-xl bg-primary/10 px-3 py-2.5 text-xs text-primary-bright">✨ Each celebration has an SMS blessing scheduled automatically.</div></div>
          )}
        </Card>
      </div>
    </div>
  );
}
