import { requireSuperAdmin } from "@/lib/auth";
import { listReleases } from "@/lib/live-release";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { AdminShell } from "@/components/admin/admin-shell";
import { LiveReleasesAdmin } from "@/components/admin/live-releases-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live versions" };

/** SuperAdmin › Live versions: upload an installer, publish or unpublish it, and see every version put out. */
export default async function Page() {
  const sa = await requireSuperAdmin();
  const [releases, config] = await Promise.all([listReleases(true).catch(() => null), getPlatformConfig()]);
  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mx-auto max-w-4xl text-white">
        <h1 className="text-2xl font-bold">Live versions</h1>
        <p className="mt-1 text-sm text-white/50">
          Installed copies of WorshipHQ Live look for a newer published version when they open and every 6 hours, download it
          quietly, and ask to restart. {config.promotions.launch.on ? "Launched: the website download gives the newest version too." : "Not launched: installed copies still update, but the website has no download."}
        </p>
        {releases
          ? <LiveReleasesAdmin releases={releases.map((r) => ({ version: r.version, notes: r.notes, bytes: r.bytes, status: r.status, audience: r.audience, log: r.log }))} testers={config.promotions.launch.testers.length} />
          : <p className="mt-6 text-sm text-amber-300">Storage didn&apos;t answer. Refresh the page.</p>}
      </div>
    </AdminShell>
  );
}
