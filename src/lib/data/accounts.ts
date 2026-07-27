import "server-only";
import { db } from "@/lib/db";

export interface AccountWithBalance {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  accountNumber: string | null;
  openingBalance: number;
  isDefault: boolean;
  /** opening + signed transactions + gifts banked here − expenses paid from here. */
  balance: number;
  inflow: number;   // gifts + positive transactions
  outflow: number;  // expenses + negative transactions
}

/**
 * Every account with its live balance. A church's money lives in one or more
 * accounts (bank / mobile-money / cash); giving is banked into an account and
 * expenses are paid out of one, so each shows what's actually in it.
 */
export async function getAccountsWithBalances(churchId: string): Promise<AccountWithBalance[]> {
  const [accounts, txns, gifts, expenses] = await Promise.all([
    db.churchAccount.findMany({
      where: { churchId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    db.transaction.groupBy({ by: ["accountId"], where: { churchId, accountId: { not: null } }, _sum: { amount: true } }),
    db.gift.groupBy({ by: ["accountId"], where: { churchId, accountId: { not: null } }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["accountId"], where: { churchId, accountId: { not: null } }, _sum: { amount: true } }),
  ]);

  const txnMap = new Map(txns.map((t) => [t.accountId, Number(t._sum.amount ?? 0)]));
  const giftMap = new Map(gifts.map((g) => [g.accountId, Number(g._sum.amount ?? 0)]));
  const expMap = new Map(expenses.map((e) => [e.accountId, Number(e._sum.amount ?? 0)]));

  return accounts.map((a) => {
    const txnSum = txnMap.get(a.id) ?? 0;       // signed
    const giftSum = giftMap.get(a.id) ?? 0;     // positive
    const expSum = expMap.get(a.id) ?? 0;       // positive (subtract)
    const inflow = giftSum + Math.max(0, txnSum);
    const outflow = expSum + Math.max(0, -txnSum);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      openingBalance: a.openingBalance,
      isDefault: a.isDefault,
      balance: a.openingBalance + txnSum + giftSum - expSum,
      inflow,
      outflow,
    };
  });
}

/** The church's default account id (money lands here unless another is chosen). */
export async function defaultAccountId(churchId: string): Promise<string | null> {
  const acc =
    (await db.churchAccount.findFirst({ where: { churchId, isDefault: true }, select: { id: true } })) ??
    (await db.churchAccount.findFirst({ where: { churchId }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  return acc?.id ?? null;
}

/** Resolve a chosen account for a church, falling back to the default. */
export async function resolveAccountId(churchId: string, chosen?: string | null): Promise<string | null> {
  if (chosen) {
    const own = await db.churchAccount.findFirst({ where: { id: chosen, churchId }, select: { id: true } });
    if (own) return own.id;
  }
  return defaultAccountId(churchId);
}

/** Lightweight account list for pickers (id, name, isDefault). */
export async function getAccountOptions(churchId: string) {
  return db.churchAccount.findMany({
    where: { churchId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true, type: true },
  });
}
