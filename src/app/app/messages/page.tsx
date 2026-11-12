import { requireModule } from "@/lib/auth";
import { canManage } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { MessageCenter } from "@/components/app/message-center";
import { loadMessageCenter } from "@/lib/messages/load";

export const metadata = { title: "Message templates" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const session = await requireModule("communications");
  const { focus } = await searchParams;
  const data = await loadMessageCenter(session.churchId);
  // Editing the wording is Starter and up. Without it the messages are shown as they are, read-only.
  const locked = !session.isDemo && !!session.planLocked?.includes("custom-messages");
  const canWrite = !session.isDemo && !locked && ["communications", "settings", "rosters", "reminders"].some((m) => canManage(session, m));
  return (
    <div>
      <PageHeader title="Message templates" description="Every text WorshipHQ sends for your church, in your own words." />
      {locked && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm text-ink-muted">
          <span>Writing your own message wording comes with the Starter plan and above. These are the messages WorshipHQ sends for you now.</span>
          <a href="/app/settings?tab=billing" className="font-semibold text-primary hover:underline">Unlock in Billing</a>
        </div>
      )}
      <MessageCenter values={data.values} automations={data.automations} canWrite={canWrite} focus={focus} />
    </div>
  );
}
