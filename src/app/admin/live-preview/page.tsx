import { requireSuperAdmin } from "@/lib/auth";
import { LivePage } from "@/components/marketing/live-page";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { liveInstallerReady } from "@/lib/live-release";

export const dynamic = "force-dynamic";
export const metadata = { title: "WorshipHQ Live page (preview)", robots: { index: false } };

/** SuperAdmin: what the WorshipHQ Live page will look like, before it is launched. */
export default async function Page() {
  await requireSuperAdmin();
  const { promotions } = await getPlatformConfig();
  return (
    <main className="bg-base">
      <p className="relative z-10 bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-black">
        Preview. {promotions.launch.on ? "Visitors see this at /live." : "Visitors can't see this until you tick Launched in Pricing › Promotions."}
      </p>
      <LivePage promotions={promotions} downloadReady={await liveInstallerReady()} />
    </main>
  );
}
