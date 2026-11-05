"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { startTrial } from "@/lib/trials";
import { logAudit } from "@/lib/audit";

/**
 * The Main Admin starts a free trial of the next plan up. The rules (switched on, one trial per plan, none already
 * running) are checked in startTrial, so this can't be used to get a second one.
 */
export async function startPlanTrial(): Promise<{ ok: true; plan: string; endsAt: string } | { ok: false; error: string }> {
  const session = await requireSession();
  if (session.isDemo || session.impersonating) return { ok: false, error: "Trials can't be started in the demo or while supporting a church." };
  if (session.role !== "Owner") return { ok: false, error: "Only the Main Admin can start a trial." };

  const res = await startTrial(session.churchId);
  if (!res.ok) return res;
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "Plan trial", detail: `Started a free ${res.plan} trial` }).catch(() => {});
  revalidatePath("/app", "layout");
  return { ok: true, plan: res.plan, endsAt: res.endsAt };
}
