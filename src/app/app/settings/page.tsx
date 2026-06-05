import { PageHeader } from "@/components/app/page-header";
import { SettingsClient } from "@/components/app/settings-client";
import { getSession } from "@/lib/auth";
import { features } from "@/lib/env";

export default async function SettingsPage() {
  const session = await getSession();
  // `features` is computed server-side from env so secret keys are never exposed.
  return (
    <div>
      <PageHeader title="Settings" description="Church profile, branding, team, billing and integrations." />
      <SettingsClient session={session} features={{ ...features }} />
    </div>
  );
}
