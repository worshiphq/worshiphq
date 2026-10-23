import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-base">
      <SiteNav />
      <main id="main-content" tabIndex={-1} className="outline-none">{children}</main>
      <SiteFooter />
    </div>
  );
}
