import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo/meta";
import { LivePage } from "@/components/marketing/live-page";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { liveInstallerReady } from "@/lib/live-release";

const META: Metadata = pageMeta({
  title: "WorshipHQ Live: church presentation software",
  description: "Songs, Bible verses, pictures, videos and sermon notes on your church screen, with a voice assistant that finds verses as they are preached. For Windows.",
  path: "/live",
});

/** Before the launch, not even the name shows. */
export async function generateMetadata(): Promise<Metadata> {
  return (await getPlatformConfig()).promotions.launch.on ? META : { title: "Page not found", robots: { index: false } };
}

/** The free dates and prices change with the calendar, not only when they are saved. */
export const revalidate = 300;

export default async function Page() {
  const { promotions } = await getPlatformConfig();
  if (!promotions.launch.on) notFound();
  return <LivePage promotions={promotions} downloadReady={await liveInstallerReady()} />;
}
