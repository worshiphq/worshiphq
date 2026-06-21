"use client";

import { useState, useTransition } from "react";
import { Cake, Heart, Sparkles, Plus, Gift, Send, Zap, Pencil, Play, MessageSquare, UserPlus, Users, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Label } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { ActionDialog } from "@/components/app/action-dialog";
import { DeleteForm } from "@/components/app/delete-form";
import { toggleAutomation, createAutomation, deleteAutomation, updateAutomationTemplate, runAutomationNow } from "@/app/actions/automations";
import { cn } from "@/lib/utils";

type Automation = { id: string; name: string; description: string; trigger: string; channel: string; active: boolean; runs: number; messageTemplate: string | null; lastRunAt: string | null };
type Upcoming = { person: string; type: string; when: string };

const SELECT = "flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

const TRIGGER_ICONS: Record<string, typeof Cake> = {
  birthday: Cake,
  anniversary: Heart,
  visitor_followup: UserPlus,
  lapsed: Users,
  new_member: UserPlus,
  giving_thanks: Gift,
};

export function RemindersClient({
  automations,
  upcoming,
  activeCount,
  canWrite,
  canDelete = false,
}: {
  automations: Automation[];
  upcoming: Upcoming[];
  activeCount: number;
  canWrite: boolean;
  canDelete?: boolean;
}) {
  const [pending, start] = useTransition();
  const { toast } = useFeedback();

  return (
    <div>
      <PageHeader title="Reminders & automations" description="Care that never forgets — birthdays, anniversaries and follow-ups, on autopilot.">
        <ActionDialog
          triggerLabel="New automation"
          triggerIcon={<Plus />}
          title="New automation"
          description="Pick what triggers it. WorshipHQ sends the message automatically each day."
          submitLabel="Create automation"
          action={createAutomation}
          disabled={!canWrite}
          pendingLabel="Creating…"
          successMessage="Automation created"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">When</label>
            <select name="trigger" className={SELECT}>
              <option value="birthday">Birthday — wish the member on their birthday</option>
              <option value="anniversary">Anniversary — celebrate their anniversary</option>
              <option value="visitor_followup">New visitor — welcome them after they register</option>
              <option value="lapsed">Lapsed member — gently check in if inactive</option>
              <option value="new_member">New member — welcome newly registered members</option>
              <option value="giving_thanks">Giving thanks — thank members who gave recently</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">Channel</label>
            <select name="channel" className={SELECT}>
              <option value="SMS">SMS</option>
              <option value="Email">Email</option>
            </select>
          </div>
        </ActionDialog>
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
            <AutomationCard key={a.id} automation={a} canWrite={canWrite} canDelete={canDelete} />
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

function AutomationCard({ automation: a, canWrite, canDelete }: { automation: Automation & { messageTemplate: string | null; lastRunAt: string | null }; canWrite: boolean; canDelete: boolean }) {
  const [pending, start] = useTransition();
  const [showTemplate, setShowTemplate] = useState(false);
  const [template, setTemplate] = useState(a.messageTemplate ?? "");
  const [running, startRun] = useTransition();
  const { toast } = useFeedback();
  const Icon = TRIGGER_ICONS[a.trigger] ?? Cake;

  const handleSaveTemplate = () => {
    start(async () => {
      const res = await updateAutomationTemplate(a.id, template);
      if (res.ok) toast("Message template saved", "success");
      else toast(res.error ?? "Failed", "error");
    });
  };

  const handleRunNow = () => {
    startRun(async () => {
      const res = await runAutomationNow(a.id);
      if (res.ok) {
        toast(res.sent > 0 ? `Sent ${res.sent} message${res.sent !== 1 ? "s" : ""}` : (res.error ?? "No matching members right now"), res.sent > 0 ? "success" : "info");
      } else {
        toast(res.error ?? "Failed to run", "error");
      }
    });
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl border", a.active ? "border-primary/30 bg-primary/10 text-primary-bright" : "border-line bg-surface-2 text-ink-faint")}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{a.name}</h4>
            <Badge variant="default" className="text-[10px]">{a.channel}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">{a.description}</p>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-faint">
            <span>Trigger: {a.trigger}</span>
            <span>·</span>
            <span>{a.runs} sent</span>
            {a.lastRunAt && (
              <>
                <span>·</span>
                <span>Last run: {new Date(a.lastRunAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowTemplate(!showTemplate)}
              className={cn("grid size-8 place-items-center rounded-lg border border-line transition-colors", showTemplate ? "bg-primary/10 text-primary-bright border-primary/30" : "text-ink-faint hover:bg-surface-2")}
              title="Edit message"
            >
              <MessageSquare className="size-3.5" />
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={handleRunNow}
              disabled={running}
              className="grid size-8 place-items-center rounded-lg border border-line text-ink-faint hover:bg-surface-2 hover:text-primary-bright disabled:opacity-50 transition-colors"
              title="Run now"
            >
              {running ? <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <Play className="size-3.5" />}
            </button>
          )}
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
          {canDelete && (
            <DeleteForm action={deleteAutomation.bind(null, a.id)} confirm={`Delete the "${a.name}" automation?`} successMessage="Automation deleted" />
          )}
        </div>
      </div>

      {showTemplate && canWrite && (
        <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
          <div>
            <Label className="text-sm font-medium">Message template</Label>
            <p className="text-xs text-ink-faint mt-0.5">
              Use {"{name}"} for the member's first name and {"{church}"} for your church name.
            </p>
          </div>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25 resize-none"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSaveTemplate} disabled={pending}>
              {pending ? "Saving…" : "Save template"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowTemplate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
