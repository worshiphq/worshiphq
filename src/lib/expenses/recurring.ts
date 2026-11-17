import "server-only";
import { db } from "@/lib/db";
import { advance } from "@/lib/expenses/recurrence";
import { postExpense, type Ctx } from "@/lib/expenses/post";

/**
 * Record one due payment of a recurring expense (rent, electricity, a salary...).
 * Claims the due date first (conditional updateMany on nextDue), so two clicks or two tabs record it once.
 * If posting fails (for example a restricted fund is short), the due date is put back.
 */
export async function recordRecurring(ctx: Ctx, id: string, today: Date = new Date()): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!ctx.canPostExpenses) return { ok: false, error: "Only people who manage Expenses can record payments." };
  const rec = await db.recurringExpense.findFirst({ where: { id, churchId: ctx.churchId } });
  if (!rec) return { ok: false, error: "That recurring expense was not found." };
  if (!rec.active) return { ok: false, error: "This recurring expense is paused." };
  if (rec.endsAt && rec.nextDue > rec.endsAt) return { ok: false, error: "This recurring expense has ended." };

  const old = rec.nextDue;
  const next = advance(old, rec.frequency, rec.anchorDay);
  const claim = await db.recurringExpense.updateMany({
    where: { id, churchId: ctx.churchId, nextDue: old },
    data: { nextDue: next, lastRecordedAt: today, ...(rec.endsAt && next > rec.endsAt ? { active: false } : {}) },
  });
  if (claim.count === 0) return { ok: false, error: "This payment was just recorded." };

  const res = await postExpense(ctx, {
    description: rec.description,
    amount: rec.amount,
    category: rec.category,
    vendor: rec.vendorName,
    vendorId: rec.vendorId,
    accountId: rec.accountId,
    fundId: rec.fundId,
    budgetId: rec.budgetId,
    budgetItemId: rec.budgetItemId,
    paymentMethod: rec.paymentMethod,
    date: old.getTime() <= today.getTime() ? old : today,
    source: "recurring",
    sourceId: rec.id,
  });
  if (!res.ok) {
    await db.recurringExpense.updateMany({ where: { id, churchId: ctx.churchId, nextDue: next }, data: { nextDue: old, lastRecordedAt: rec.lastRecordedAt, active: rec.active } });
  }
  return res.ok ? { ok: true, id: res.id } : { ok: false, error: res.error };
}
