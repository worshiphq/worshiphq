import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { SiteAnalytics } from "@/components/marketing/site-analytics";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const live = (await getPlatformConfig()).promotions.launch.on;
  return (
    <div className="relative min-h-dvh bg-base">
      <SiteNav live={live} />
      <main id="main-content" tabIndex={-1} className="outline-none">{children}</main>
      <SiteFooter live={live} />
      <SiteAnalytics />
    </div>
  );
}
