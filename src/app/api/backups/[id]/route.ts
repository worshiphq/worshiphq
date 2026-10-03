import type { NextRequest } from "next/server";
import { getSuperAdmin } from "@/lib/auth";
import { getBackupFile } from "@/lib/backups/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // The encrypted backup file exactly as stored. SuperAdmin only: churches restore
  // from Settings and get readable data from the Export page.
  if (!(await getSuperAdmin())) return new Response("Unauthorized", { status: 401 });

  const backup = await getBackupFile(id);
  if (!backup) return new Response("Backup unavailable", { status: 404 });

  const stamp = backup.createdAt.toISOString().slice(0, 10);
  return new Response(new Uint8Array(backup.sealed), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="worshiphq-backup-${backup.slug}-${stamp}.whqb"`,
      "cache-control": "no-store",
    },
  });
}
