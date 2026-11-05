import "server-only";
import { db } from "@/lib/db";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { paidPlan } from "@/lib/plan-gate";
import { trialInfo } from "@/lib/trial-settings";
import { sendOutreach } from "@/lib/outreach/send";

const DAY = 86_400_000;

/** Tell the owner a trial is about to end (once, in its last two days) and that it has ended (once, within three days after). */
export async function runTrialNotices(now = new Date()): Promise<{ checked: number; ending: number; ended: number }> {
  const cfg = await getPlatformConfig();
  // Only churches whose trial ends soon or ended very recently: a handful of rows, never the whole list.
  const subs = await db.subscription.findMany({
    where: { trialPlan: { not: null }, trialEndsAt: { gte: new Date(now.getTime() - 3 * DAY), lte: new Date(now.getTime() + 2 * DAY) }, church: { isDemo: false } },
    select: { churchId: true, plan: true, status: true, renewsAt: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true, trialsUsed: true, trialNotified: true },
  });
  let ending = 0, ended = 0;
  for (const sub of subs) {
    const info = trialInfo(sub, paidPlan(sub), cfg.trials, now);
    const kind = info.phase === "active" ? "ending" : info.phase === "ended" ? "ended" : null; // converted: they upgraded, nothing to say
    if (!kind || sub.trialNotified.includes(kind)) continue;

    const owner = await db.user.findFirst({ where: { churchId: sub.churchId, role: "Owner" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, phone: true } });
    if (!owner) continue;
    // Claim it first, so a second run (or a slow send) can never message twice.
    const claimed = await db.subscription.updateMany({ where: { churchId: sub.churchId, NOT: { trialNotified: { has: kind } } }, data: { trialNotified: { push: kind } } });
    if (claimed.count === 0) continue;

    const template = kind === "ending" ? "trial-ending" : "trial-ended";
    if (owner.email) await sendOutreach({ churchId: sub.churchId, userId: owner.id, channel: "email", template, auto: true }).catch(() => {});
    if (owner.phone) await sendOutreach({ churchId: sub.churchId, userId: owner.id, channel: "sms", template: `${template}-sms`, auto: true }).catch(() => {});
    if (kind === "ending") ending++; else ended++;
  }
  return { checked: subs.length, ending, ended };
}
