import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { assignMissingTags } from "@/lib/assets/service";
import { AssetTagSheet } from "@/components/app/assets/asset-tag-sheet";

export const metadata = { title: "Asset tags" };

export default async function AssetTagsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireModule("assets");
  const sp = await searchParams;
  const ids = typeof sp.ids === "string" ? sp.ids.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500) : [];
  // Untagged items get their numbers before printing, so every label has one.
  if (canEdit(session, "assets")) await assignMissingTags(session.churchId, ids.length ? ids : undefined);
  const assets = await db.asset.findMany({
    where: { churchId: session.churchId, status: { not: "disposed" }, ...(ids.length ? { id: { in: ids } } : {}) },
    orderBy: { tagCode: "asc" },
    select: { id: true, name: true, tagCode: true },
    take: 500,
  });
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return (
    <AssetTagSheet
      churchName={session.churchName}
      labels={assets.filter((a) => a.tagCode).map((a) => ({ id: a.id, name: a.name, tag: a.tagCode!, url: `${base}/app/assets/t/${a.tagCode}` }))}
      untagged={assets.filter((a) => !a.tagCode).length}
    />
  );
}
