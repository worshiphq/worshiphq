import type { NextRequest } from "next/server";
import { getSession, getSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { readBackup } from "@/lib/backups/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.churchBackup.findUnique({ where: { id }, select: { churchId: true } });
  if (!row) return new Response("Not found", { status: 404 });

  const sa = await getSuperAdmin();
  if (!sa) {
    const session = await getSession();
    const allowed =
      session && !session.isDemo && session.churchId === row.churchId && (session.role === "Owner" || session.role === "Admin");
    if (!allowed) return new Response("Unauthorized", { status: 401 });
  }

  const backup = await readBackup(id);
  if (!backup) return new Response("Backup unavailable", { status: 404 });

  const stamp = backup.createdAt.toISOString().slice(0, 10);
  return new Response(new Uint8Array(backup.json), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="worshiphq-backup-${backup.slug}-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
