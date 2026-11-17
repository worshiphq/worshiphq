import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { hasSection } from "@/lib/permissions";
import { db } from "@/lib/db";

/** Where a scanned asset label lands: the item in the signed-in church, or a search for the tag. */
export default async function AssetTagRedirect({ params }: { params: Promise<{ tag: string }> }) {
  const session = await requireSession();
  const { tag } = await params;
  const code = decodeURIComponent(tag).trim().toUpperCase().slice(0, 20);
  const asset = await db.asset.findFirst({ where: { churchId: session.churchId, tagCode: code }, select: { id: true, vehicle: { select: { id: true } } } });
  if (asset?.vehicle && hasSection(session, "vehicles")) redirect(`/app/vehicles/${asset.vehicle.id}`);
  if (asset && hasSection(session, "assets")) redirect(`/app/assets/${asset.id}`);
  redirect(`/app/assets?q=${encodeURIComponent(code)}`);
}
