import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readToken } from "@/lib/auth/tokens";
import { mintResetToken } from "@/lib/auth";

/**
 * The password reset link the SuperAdmin sends a person. It proves the link is genuine and unused, then hands the
 * browser the same short-lived reset pass the emailed code gives, and opens the "new password" page.
 */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t");
  const data = readToken<{ rl?: string; sv?: number }>("reset-link", t);
  if (!data?.rl) redirect("/sign-in?error=expired");
  const user = await db.user.findUnique({ where: { id: data.rl }, select: { id: true, sessionVersion: true } });
  // The version moves on after any reset, so a link that has been used (or an old one) stops working.
  if (!user || user.sessionVersion !== data.sv) redirect("/sign-in?error=expired");
  await mintResetToken(user.id);
  redirect("/sign-in?reset=new-password");
}
