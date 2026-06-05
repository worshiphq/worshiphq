"use client";

import { useState } from "react";
import { Cake, Heart, Sparkles, Plus, Gift, Send, Zap } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { automations as seedAutomations, people, fullName } from "@/lib/demo/data";
import { cn } from "@/lib/utils";

// A few upcoming celebrations this week (demo).
const upcoming = people.slice(0, 6).map((p, i) => ({
  person: fullName(p),
  type: i % 3 === 0 ? "Anniversary" : "Birthday",
  when: ["Today", "Today", "Tomorrow", "Wed", "Thu", "Sat"][i],
}));

export default function RemindersPage() {
  const [automations, setAutomations] = useState(seedAutomations);

  const toggle = (id: string) =>
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));

  const activeCount = automations.filter((a) => a.active).length;

  return (
    <div>
      <PageHeader title="Reminders & automations" description="Care that never forgets — birthdays, anniversaries and follow-ups, on autopilot.">
        <Button size="sm"><Plus /> New automation</Button>
      </PageHeader>

      {/* Hero banner */}
      <Card className="relative mb-4 overflow-hidden border-gold/30 bg-gradient-to-br from-gold/10 to-surface p-6">
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
        {/* Automations list */}
        <div className="space-y-3 lg:col-span-2">
          {automations.map((a) => (
            <Card key={a.id} className="flex items-center gap-4 p-5">
              <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl border", a.active ? "border-primary/30 bg-primary/10 text-primary-bright" : "border-line bg-surface-2 text-ink-faint")}>
                {a.channel.includes("Email") ? <Send className="size-5" /> : <Cake className="size-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{a.name}</h4>
                  <Badge variant="default" className="text-[10px]">{a.channel}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{a.description}</p>
                <p className="mt-1 text-[11px] text-ink-faint">Trigger: {a.trigger} · {a.runs} sent</p>
              </div>
              <button
                role="switch"
                aria-checked={a.active}
                onClick={() => toggle(a.id)}
                className={cn("relative h-6 w-11 shrink-0 rounded-full border border-line transition-colors", a.active ? "bg-primary" : "bg-surface-2")}
              >
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", a.active ? "left-[1.45rem]" : "left-0.5")} />
              </button>
            </Card>
          ))}
        </div>

        {/* Upcoming celebrations */}
        <Card className="h-fit">
          <div className="flex items-center gap-2 border-b border-line p-5">
            <Gift className="size-5 text-gold" />
            <h3 className="font-display text-lg font-semibold">This week</h3>
          </div>
          <div className="divide-y divide-line-soft">
            {upcoming.map((u, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={u.person} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.person}</div>
                  <div className="flex items-center gap-1 text-xs text-ink-faint">
                    {u.type === "Birthday" ? <Cake className="size-3" /> : <Heart className="size-3 text-danger" />}
                    {u.type}
                  </div>
                </div>
                <Badge variant={u.when === "Today" ? "gold" : "default"}>{u.when}</Badge>
              </div>
            ))}
          </div>
          <div className="p-4">
            <div className="rounded-xl bg-primary/10 px-3 py-2.5 text-xs text-primary-bright">
              ✨ All celebrations have an SMS blessing scheduled automatically.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
