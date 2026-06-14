import { requireSuperAdmin } from "@/lib/auth";
import { getMarketingContent } from "@/lib/data/site-content";
import { AdminShell } from "@/components/admin/admin-shell";
import { MarketingEditor } from "@/components/admin/marketing-editor";

export default async function AdminContentPage() {
  const sa = await requireSuperAdmin();
  const content = await getMarketingContent();

  return (
    <AdminShell email={sa.email}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Site content</h1>
        <p className="text-sm text-slate-400">
          Edit the marketing homepage. Changes go live immediately.
        </p>
      </div>
      <MarketingEditor heroSubhead={content.heroSubhead} testimonials={content.testimonials} />
    </AdminShell>
  );
}
