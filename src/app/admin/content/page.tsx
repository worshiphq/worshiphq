import { requireSuperAdmin } from "@/lib/auth";
import { getMarketingContent } from "@/lib/data/site-content";
import { getRealStats } from "@/lib/data/landing-stats";
import { AdminShell } from "@/components/admin/admin-shell";
import { MarketingEditor } from "@/components/admin/marketing-editor";

export default async function AdminContentPage() {
  const sa = await requireSuperAdmin();
  const [content, real] = await Promise.all([getMarketingContent(), getRealStats()]);

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Site content</h1>
        <p className="text-sm text-slate-400">
          Edit the marketing homepage: the subheading, the numbers and the testimonials. Changes show on the site within the hour.
        </p>
      </div>
      <MarketingEditor heroSubhead={content.heroSubhead} testimonials={content.testimonials} stats={content.stats} real={real} />
    </AdminShell>
  );
}
