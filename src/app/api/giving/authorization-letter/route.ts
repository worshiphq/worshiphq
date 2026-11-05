import type { NextRequest } from "next/server";
import { getActiveSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { authorizationLetterHtml } from "@/lib/giving/authorization";

export const dynamic = "force-dynamic";

/** The printable authorization letter for the signed-in church, with its name (and payout account, if given) filled in. */
export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) return new Response("Not signed in", { status: 401 });
  if (session.role !== "Owner" && session.role !== "Admin") return new Response("Only the Main Admin or an Admin can do this.", { status: 403 });
  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true } });
  const q = req.nextUrl.searchParams;
  const clip = (k: string) => (q.get(k) ?? "").slice(0, 120);
  const html = authorizationLetterHtml({
    churchName: church?.name ?? "Our church",
    accountType: clip("type"),
    bankName: clip("bank"),
    accountNumber: clip("number"),
    accountName: clip("name"),
    date: new Date(),
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
