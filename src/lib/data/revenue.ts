import "server-only";
import { db } from "@/lib/db";
import { SMS_RATE } from "@/config/sms";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

export type RevenueMonth = { key: string; label: string; subscriptions: number; sms: number; smsProfit: number };

export type RevenueOverview = {
  costPerCredit: number;
  /** All money actually received (Paystack and offline), in GHS. */
  subscriptions: { total: number; thisMonth: number; paidCount: number; offlineTotal: number; grantedCount: number; grantedValueGhs: number };
  sms: {
    revenue: number;
    thisMonth: number;
    creditsSold: number;
    creditsUsed: number;
    /** Revenue minus what the credits sold cost us at the provider price. */
    profit: number;
    profitThisMonth: number;
    /** Provider cost of the credits churches have actually sent. */
    costOfSent: number;
    /** Top-ups from before amounts were recorded: priced at the standard rate so the totals are not understated. */
    estimatedTopups: number;
    grantedCredits: number;
  };
  months: RevenueMonth[];
  recent: { id: string; at: string; church: string; kind: string; label: string; amountGhs: number; source: string }[];
};

/** Platform revenue: subscriptions plus SMS, and SMS profit against what the provider charges per credit. */
export async function getRevenueOverview(): Promise<RevenueOverview> {
  const [config, plans, topups, usageAgg, granted, churches] = await Promise.all([
    db.platformConfig.findUnique({ where: { id: "default" }, select: { smsCostPerCredit: true, usdToGhsRate: true } }),
    db.planPayment.findMany({
      where: { church: { isDemo: false } },
      select: { id: true, churchId: true, plan: true, interval: true, amountGhs: true, amountUsd: true, status: true, source: true, paidAt: true, termMonths: true, church: { select: { name: true } } },
      orderBy: { paidAt: "desc" },
    }),
    db.smsTransaction.findMany({
      where: { kind: "topup", church: { isDemo: false } },
      select: { id: true, credits: true, amountGhs: true, createdAt: true, church: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.smsTransaction.aggregate({ where: { kind: "usage", church: { isDemo: false } }, _sum: { credits: true } }),
    db.smsTransaction.aggregate({ where: { kind: "bonus", church: { isDemo: false } }, _sum: { credits: true } }),
    db.church.count({ where: { isDemo: false } }),
  ]);
  void churches;

  const cost = config?.smsCostPerCredit ?? 0.03;
  const rate = config?.usdToGhsRate ?? 12;
  const now = new Date();
  const thisKey = monthKey(now);

  const months = new Map<string, RevenueMonth>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.set(monthKey(d), { key: monthKey(d), label: monthLabel(d), subscriptions: 0, sms: 0, smsProfit: 0 });
  }

  const sub = { total: 0, thisMonth: 0, paidCount: 0, offlineTotal: 0, grantedCount: 0, grantedValueGhs: 0 };
  for (const p of plans) {
    if (p.source === "granted") {
      sub.grantedCount++;
      sub.grantedValueGhs += p.amountUsd * rate;
      continue;
    }
    if (p.status === "refunded") continue;
    sub.total += p.amountGhs;
    sub.paidCount++;
    if (p.source === "offline") sub.offlineTotal += p.amountGhs;
    const k = monthKey(p.paidAt);
    if (k === thisKey) sub.thisMonth += p.amountGhs;
    const m = months.get(k);
    if (m) m.subscriptions += p.amountGhs;
  }

  const sms = { revenue: 0, thisMonth: 0, creditsSold: 0, creditsUsed: Math.abs(usageAgg._sum.credits ?? 0), profit: 0, profitThisMonth: 0, costOfSent: 0, estimatedTopups: 0, grantedCredits: granted._sum.credits ?? 0 };
  for (const t of topups) {
    const amount = t.amountGhs ?? t.credits * SMS_RATE.D;
    if (t.amountGhs == null) sms.estimatedTopups++;
    const profit = amount - t.credits * cost;
    sms.revenue += amount;
    sms.creditsSold += t.credits;
    sms.profit += profit;
    const k = monthKey(t.createdAt);
    if (k === thisKey) { sms.thisMonth += amount; sms.profitThisMonth += profit; }
    const m = months.get(k);
    if (m) { m.sms += amount; m.smsProfit += profit; }
  }
  sms.costOfSent = sms.creditsUsed * cost;

  const recent = [
    ...plans.slice(0, 25).map((p) => ({
      id: `p-${p.id}`, at: p.paidAt.toISOString(), church: p.church.name, kind: "Plan",
      label: `${p.plan} ${p.termMonths ? `${p.termMonths} months` : p.interval}${p.status === "refunded" ? " (refunded)" : ""}`,
      amountGhs: p.source === "granted" ? 0 : p.amountGhs, source: p.source,
    })),
    ...topups.slice(0, 25).map((t) => ({
      id: `s-${t.id}`, at: t.createdAt.toISOString(), church: t.church.name, kind: "SMS",
      label: `${t.credits.toLocaleString()} credits`, amountGhs: t.amountGhs ?? t.credits * SMS_RATE.D, source: t.amountGhs == null ? "estimated" : "paystack",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);

  return { costPerCredit: cost, subscriptions: sub, sms, months: [...months.values()], recent };
}
