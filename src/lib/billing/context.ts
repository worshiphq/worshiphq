import "server-only";
import { db } from "@/lib/db";
import { previewPlanChange, type PlanChangePreview } from "@/lib/billing/periods";

/**
 * Everything needed to price a plan change, worked out in one place.
 *
 * The preview the church sees ("you'll pay $X now") and the charge that is actually made both come from
 * this function, so the two cannot drift apart. They used to be two copies of the same maths in two
 * actions, and the copies had already started to differ.
 */
export interface PlanChangeContext {
  sub: Awaited<ReturnType<typeof db.subscription.findUnique>>;
  platformConfig: Awaited<ReturnType<typeof import("@/lib/data/platform-config").getPlatformConfig>>;
  planConfig: { id: string; name: string; monthly: number; yearly: number } | undefined;
  /** The interval this change is really priced on (see below), which may differ from the one asked for. */
  interval: "monthly" | "yearly";
  /** List price of the target plan on `interval`, in USD. 0 for Free. */
  listPrice: number;
  preview: PlanChangePreview;
}

export async function loadPlanChange(churchId: string, plan: string, requestedInterval: "monthly" | "yearly"): Promise<PlanChangeContext> {
  const { plans } = await import("@/config/pricing");
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const now = new Date();

  const [sub, platformConfig] = await Promise.all([
    db.subscription.findUnique({ where: { churchId } }),
    getPlatformConfig(),
  ]);

  const inPaidPeriod = !!sub && sub.plan !== "free" && !!sub.renewsAt && sub.renewsAt.getTime() > now.getTime();
  // An upgrade inside a paid period is priced on the interval the church is ON: the credit it holds is for
  // that period, so comparing it with a different interval's price makes no sense (a yearly church would be
  // credited a year's payment against a month's price). A renewal or a fresh purchase uses the one it picked.
  const interval: "monthly" | "yearly" = inPaidPeriod && sub!.plan !== plan
    ? (sub!.interval === "yearly" ? "yearly" : "monthly")
    : requestedInterval;

  const planConfig = plans.find((p) => p.id === plan);
  const dbPrice = platformConfig.prices[plan];
  const listPrice = plan === "free"
    ? 0
    : interval === "yearly"
      ? (dbPrice?.yearly ?? planConfig?.yearly ?? 0)
      : (dbPrice?.monthly ?? planConfig?.monthly ?? 0);

  // What was paid for THIS period: every paid payment that runs to its end. If none can be matched (an
  // older church, or a date set by hand), fall back to the last payment, as before.
  const payments = inPaidPeriod
    ? await db.planPayment.findMany({
        where: { churchId, status: "paid", periodEnd: sub!.renewsAt! },
        select: { amountUsd: true, periodStart: true, paidAt: true },
      })
    : [];
  const lastPayment = payments.length
    ? null
    : await db.planPayment.findFirst({ where: { churchId, status: "paid" }, orderBy: { paidAt: "desc" }, select: { amountUsd: true } });

  const preview = previewPlanChange({
    currentPlan: sub?.plan ?? "free",
    newPlan: plan,
    interval,
    periodEnd: sub?.renewsAt ?? null,
    amountPaidUsd: lastPayment?.amountUsd ?? 0,
    currentInterval: sub?.interval ?? undefined,
    paymentsThisPeriod: payments.length ? payments : undefined,
    newPlanPriceUsd: listPrice,
  });

  return { sub, platformConfig, planConfig, interval, listPrice, preview };
}
