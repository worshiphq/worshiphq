"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** Every ledger entry (all-time) with NO bank account attached, so the admin can
 *  assign each one. Newest first. */
export async function loadUnassignedEntries() {
  const session = await requireSession();
  const [txns, gifts, expenses] = await Promise.all([
    db.transaction.findMany({ where: { churchId: session.churchId, accountId: null }, select: { id: true, description: true, category: true, fund: true, amount: true, date: true } }),
    db.gift.findMany({ where: { churchId: session.churchId, accountId: null }, select: { id: true, donorName: true, amount: true, date: true, fund: { select: { name: true } } } }),
    db.expense.findMany({ where: { churchId: session.churchId, accountId: null }, select: { id: true, description: true, category: true, amount: true, date: true, vendor: true } }),
  ]);
  const rows = [
    ...txns.map((t) => ({ id: t.id, description: t.description, category: t.category, fund: t.fund ?? "General", amount: Number(t.amount), date: t.date.toISOString(), source: "manual" as const, accountId: null })),
    ...gifts.map((g) => ({ id: g.id, description: `${g.donorName ?? "Anonymous"} — ${g.fund?.name ?? "Gift"}`, category: g.fund?.name ?? "Giving", fund: g.fund?.name ?? "General", amount: Number(g.amount), date: g.date.toISOString(), source: "giving" as const, accountId: null })),
    ...expenses.map((e) => ({ id: e.id, description: `${e.description}${e.vendor ? ` (${e.vendor})` : ""}`, category: e.category, fund: "General", amount: -Number(e.amount), date: e.date.toISOString(), source: "expense" as const, accountId: null })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return { ok: true as const, rows };
}

/** Running-balance history for one account (for the accounting History tab). */
export async function loadAccountHistory(accountId: string) {
  const session = await requireSession();
  const { getAccountHistory } = await import("@/lib/data/accounts");
  const history = await getAccountHistory(session.churchId, accountId);
  if (!history) return { ok: false as const, error: "Account not found." };
  return { ok: true as const, history };
}

export async function createTransaction(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  const rawAmount = Math.abs(Number(formData.get("amount") ?? 0));
  if (!rawAmount) return;
  const type = String(formData.get("type") ?? "Income");
  const amount = type === "Expense" ? -rawAmount : rawAmount;

  const accountId = String(formData.get("accountId") ?? "").trim() || null;
  await db.transaction.create({
    data: {
      churchId: session.churchId,
      description,
      category: String(formData.get("category") ?? "General"),
      fund: String(formData.get("fund") ?? "General"),
      ...(accountId ? { accountId } : {}),
      amount,
      date: new Date(),
    },
  });

  await audit(session, "create", "transaction", `${amount >= 0 ? "Income" : "Expense"} ${Math.abs(amount)} — ${description}`);
  revalidatePath("/app/accounting");
}

/** Delete a transaction (admins only). */
export async function deleteTransaction(id: string) {
  const session = await requireSession();
  assertCanDelete(session);
  const tx = await db.transaction.findFirst({ where: { id, churchId: session.churchId }, select: { description: true } });
  await db.transaction.deleteMany({ where: { id, churchId: session.churchId } });
  if (tx) await audit(session, "delete", "transaction", `Deleted transaction "${tx.description}"`, id);
  revalidatePath("/app/accounting");
}

/**
 * Move a posted ledger entry from one account to another — fixes money that
 * was banked into the wrong account. Works for both manual transactions
 * (Day Born / harvest / pledge / welfare postings) and gifts (giving / tithe).
 */
export async function moveLedgerEntryAccount(source: "manual" | "giving" | "expense", id: string, accountId: string) {
  const session = await requireSession();
  assertCanWrite(session);
  if (session.isDemo) return { ok: false, error: "Read-only demo." };

  // Validate the target account belongs to this church.
  const account = await db.churchAccount.findFirst({
    where: { id: accountId, churchId: session.churchId },
    select: { id: true, name: true },
  });
  if (!account) return { ok: false, error: "Account not found." };

  if (source === "manual") {
    const tx = await db.transaction.findFirst({ where: { id, churchId: session.churchId }, select: { id: true, description: true } });
    if (!tx) return { ok: false, error: "Entry not found." };
    await db.transaction.update({ where: { id }, data: { accountId } });
    await audit(session, "update", "transaction", `Moved "${tx.description}" to ${account.name}`, id);
  } else if (source === "expense") {
    const exp = await db.expense.findFirst({ where: { id, churchId: session.churchId }, select: { id: true, description: true } });
    if (!exp) return { ok: false, error: "Entry not found." };
    await db.expense.update({ where: { id }, data: { accountId } });
    await audit(session, "update", "expense", `Moved "${exp.description}" to ${account.name}`, id);
  } else {
    const gift = await db.gift.findFirst({ where: { id, churchId: session.churchId }, select: { id: true, donorName: true } });
    if (!gift) return { ok: false, error: "Entry not found." };
    await db.gift.update({ where: { id }, data: { accountId } });
    await audit(session, "update", "gift", `Moved ${gift.donorName ?? "gift"} to ${account.name}`, id);
  }

  revalidatePath("/app/accounting");
  return { ok: true, accountName: account.name };
}

export async function editTransaction(id: string, formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const tx = await db.transaction.findFirst({
    where: { id, churchId: session.churchId },
  });
  if (!tx) return { ok: false, error: "Not found." };

  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const category = String(formData.get("category") ?? "").trim();
  const fund = String(formData.get("fund") ?? "").trim();

  if (!description) return { ok: false, error: "Description required." };

  await db.transaction.update({
    where: { id },
    data: { description, amount, category: category || undefined, fund: fund || undefined },
  });

  revalidatePath("/app/accounting");
  return { ok: true };
}
