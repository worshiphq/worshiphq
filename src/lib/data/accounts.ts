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
    db.transaction.groupBy({ by: ["accountId"], where: { churchId }, _sum: { amount: true } }),
    db.gift.groupBy({ by: ["accountId"], where: { churchId }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["accountId"], where: { churchId }, _sum: { amount: true } }),
  ]);

  // The default account (first by the ordering above) absorbs any money that was
  // recorded without an explicit account — e.g. giving entered before accounts
  // existed, or any path that didn't tag one. This keeps account balances
  // reconciled with the income/expense totals instead of silently dropping it.
  const defaultId = accounts[0]?.id ?? null;
  const key = (accountId: string | null) => accountId ?? defaultId;

  const sumInto = (rows: { accountId: string | null; _sum: { amount: unknown } }[]) => {
    const m = new Map<string | null, number>();
    for (const r of rows) {
      const k = key(r.accountId);
      m.set(k, (m.get(k) ?? 0) + Number(r._sum.amount ?? 0));
    }
    return m;
  };

  const txnMap = sumInto(txns);
  const giftMap = sumInto(gifts);
  const expMap = sumInto(expenses);

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

/**
 * The church's default account, creating a "Main Account" the first time any
 * money is recorded if none exists yet. Editable/renamable afterwards.
 */
export async function ensureDefaultAccount(churchId: string): Promise<string> {
  const existing = await defaultAccountId(churchId);
  if (existing) return existing;
  const created = await db.churchAccount.create({
    data: { churchId, name: "Main Account", type: "bank", isDefault: true },
    select: { id: true },
  });
  return created.id;
}

/** Resolve a chosen account for a church, else the default (auto-created). */
export async function resolveAccountId(churchId: string, chosen?: string | null): Promise<string> {
  if (chosen) {
    const own = await db.churchAccount.findFirst({ where: { id: chosen, churchId }, select: { id: true } });
    if (own) return own.id;
  }
  return ensureDefaultAccount(churchId);
}

/**
 * Post a money event into an account as a signed transaction so it shows in the
 * account balance and the unified accounting ledger. `amount` is positive for
 * income, negative for an outflow. Used by dayborn / harvest / pledge payments /
 * welfare, which don't carry an accountId of their own.
 */
export async function postLedgerToAccount(
  churchId: string,
  opts: { description: string; category: string; amount: number; accountId?: string | null; fund?: string | null },
): Promise<void> {
  if (!opts.amount) return;
  const accountId = await resolveAccountId(churchId, opts.accountId);
  await db.transaction.create({
    data: {
      churchId,
      accountId,
      description: opts.description,
      category: opts.category,
      fund: opts.fund ?? undefined,
      amount: opts.amount,
    },
  });
}

/** Lightweight account list for pickers (id, name, isDefault). */
export async function getAccountOptions(churchId: string) {
  return db.churchAccount.findMany({
    where: { churchId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true, type: true },
  });
}

export interface AccountHistoryRow {
  id: string;
  date: string;
  description: string;
  source: "manual" | "giving" | "expense";
  amount: number;        // signed: + income, − expense
  balanceBefore: number;
  balanceAfter: number;
}

export interface AccountHistory {
  account: { id: string; name: string; openingBalance: number };
  current: number;
  rows: AccountHistoryRow[]; // newest first
}

/**
 * A bank-statement style running-balance history for ONE account: every entry
 * (transactions, gifts banked here, expenses paid from here) in date order with
 * the balance before and after it. Starts from the account's opening balance.
 */
export async function getAccountHistory(churchId: string, accountId: string): Promise<AccountHistory | null> {
  const account = await db.churchAccount.findFirst({
    where: { id: accountId, churchId },
    select: { id: true, name: true, openingBalance: true },
  });
  if (!account) return null;

  const [txns, gifts, expenses] = await Promise.all([
    db.transaction.findMany({ where: { churchId, accountId }, select: { id: true, description: true, amount: true, date: true } }),
    db.gift.findMany({ where: { churchId, accountId }, select: { id: true, donorName: true, amount: true, date: true, fund: { select: { name: true } } } }),
    db.expense.findMany({ where: { churchId, accountId }, select: { id: true, description: true, amount: true, date: true, vendor: true } }),
  ]);

  type E = { id: string; date: Date; description: string; source: "manual" | "giving" | "expense"; amount: number };
  const entries: E[] = [
    ...txns.map((t) => ({ id: t.id, date: t.date, description: t.description, source: "manual" as const, amount: Number(t.amount) })),
    ...gifts.map((g) => ({ id: g.id, date: g.date, description: `${g.donorName ?? "Anonymous"} — ${g.fund?.name ?? "Gift"}`, source: "giving" as const, amount: Number(g.amount) })),
    ...expenses.map((e) => ({ id: e.id, date: e.date, description: `${e.description}${e.vendor ? ` (${e.vendor})` : ""}`, source: "expense" as const, amount: -Number(e.amount) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let bal = account.openingBalance;
  const rows: AccountHistoryRow[] = entries.map((e) => {
    const before = bal;
    bal += e.amount;
    return { id: e.id, date: e.date.toISOString(), description: e.description, source: e.source, amount: e.amount, balanceBefore: before, balanceAfter: bal };
  });
  rows.reverse(); // newest first

  return { account: { id: account.id, name: account.name, openingBalance: account.openingBalance }, current: bal, rows };
}
