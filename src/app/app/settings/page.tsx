import { PageHeader } from "@/components/app/page-header";
import { SettingsClient } from "@/components/app/settings-client";
import { requireSession } from "@/lib/auth";
import { getChurchSettings } from "@/lib/data/modules";
import { features } from "@/lib/env";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession();
  const { church, users } = await getChurchSettings(session.churchId);
  // `features` is computed server-side from env so secret keys are never exposed.
  return (
    <div>
      <PageHeader title="Settings" description="Church profile, branding, team, billing and integrations." />
      <SettingsClient session={session} features={{ ...features }} church={church} users={users} />
    </div>
  );
}
