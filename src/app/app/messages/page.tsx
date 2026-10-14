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
  const canWrite = !session.isDemo && ["communications", "settings", "rosters", "reminders"].some((m) => canManage(session, m));
  return (
    <div>
      <PageHeader title="Message templates" description="Every text WorshipHQ sends for your church, in your own words." />
      <MessageCenter values={data.values} automations={data.automations} canWrite={canWrite} focus={focus} />
    </div>
  );
}
