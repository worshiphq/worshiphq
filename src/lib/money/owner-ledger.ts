import "server-only";
import { db } from "@/lib/db";

/**
 * The owner's private money view.
 *
 * Two books. "site" is WorshipHQ's own money: what the platform earned and what it cost to run.
 * "personal" is everything else the owner tracks.
 *
 * Earned income is NEVER copied into the ledger table. It is read live from PlanPayment and
 * SmsTransaction every time, so the number here is always the same number the rest of the app
 * would give, and a corrected or refunded payment fixes itself without anyone remembering to
 * adjust a second copy.
 *
 * Everything in this file is owner-only. Callers must have passed requireSuperAdminOwner().
 */

export type Ledger = "site" | "personal";

export type EarnedRow = {
  id: string;
  when: Date;
  amountGhs: number;
  label: string;
  source: "plan" | "sms";
};

export type ManualRow = {
  id: string;
  when: Date;
  amountGhs: number;
  kind: "income" | "expense";
  category: string | null;
  note: string | null;
};

export type MoneyView = {
  earned: EarnedRow[];
  manual: ManualRow[];
  totals: {
    earnedGhs: number;
    manualIncomeGhs: number;
    incomeGhs: number;
    expenseGhs: number;
    leftGhs: number;
  };
};

/** Money the platform actually took in: plan payments and SMS top-ups that were really paid. */
async function earnedIncome(since?: Date): Promise<EarnedRow[]> {
  const [plans, topups] = await Promise.all([
    db.planPayment.findMany({
      // amountGhs > 0 keeps out ₵0 rows: gift grants, bypass redemptions and 100% coupons are not
      // money received, and counting them would quietly inflate every total on this page.
      where: { amountGhs: { gt: 0 }, ...(since ? { createdAt: { gte: since } } : {}) },
      select: { id: true, createdAt: true, amountGhs: true, plan: true, interval: true, church: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.smsTransaction.findMany({
      where: { kind: "topup", amountGhs: { gt: 0 }, ...(since ? { createdAt: { gte: since } } : {}) },
      select: { id: true, createdAt: true, amountGhs: true, credits: true, church: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const rows: EarnedRow[] = [
    ...plans.map((p) => ({
      id: `plan:${p.id}`,
      when: p.createdAt,
      amountGhs: p.amountGhs,
      label: `${p.church.name} - ${p.plan} (${p.interval})`,
      source: "plan" as const,
    })),
    ...topups.map((t) => ({
      id: `sms:${t.id}`,
      when: t.createdAt,
      amountGhs: t.amountGhs ?? 0,
      label: `${t.church.name} - ${t.credits.toLocaleString()} SMS credits`,
      source: "sms" as const,
    })),
  ];
  rows.sort((a, b) => b.when.getTime() - a.when.getTime());
  return rows;
}

export async function getMoneyView(ledger: Ledger, since?: Date): Promise<MoneyView> {
  // Only the site book has automatic income - the platform is the only thing that earns by itself.
  const [earned, manual] = await Promise.all([
    ledger === "site" ? earnedIncome(since) : Promise.resolve([] as EarnedRow[]),
    db.ownerLedgerEntry.findMany({
      where: { ledger, ...(since ? { occurredAt: { gte: since } } : {}) },
      orderBy: { occurredAt: "desc" },
      take: 500,
    }),
  ]);

  const manualRows: ManualRow[] = manual.map((m) => ({
    id: m.id,
    when: m.occurredAt,
    amountGhs: m.amountGhs,
    kind: m.kind === "expense" ? "expense" : "income",
    category: m.category,
    note: m.note,
  }));

  const earnedGhs = earned.reduce((t, r) => t + r.amountGhs, 0);
  const manualIncomeGhs = manualRows.filter((m) => m.kind === "income").reduce((t, m) => t + m.amountGhs, 0);
  const expenseGhs = manualRows.filter((m) => m.kind === "expense").reduce((t, m) => t + m.amountGhs, 0);
  const incomeGhs = earnedGhs + manualIncomeGhs;

  return {
    earned,
    manual: manualRows,
    totals: {
      earnedGhs,
      manualIncomeGhs,
      incomeGhs,
      expenseGhs,
      // "Should have left": everything that came in, minus everything recorded as going out.
      leftGhs: incomeGhs - expenseGhs,
    },
  };
}
