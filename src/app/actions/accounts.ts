"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const ACCOUNT_TYPES = ["bank", "mobile-money", "cash"];

/** Create a financial account (like a bank account) money is tracked in. */
export async function createAccount(formData: FormData) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const typeRaw = String(formData.get("type") ?? "bank").trim();
  const type = ACCOUNT_TYPES.includes(typeRaw) ? typeRaw : "bank";
  const openingBalance = Math.max(0, parseFloat(String(formData.get("openingBalance") ?? "0")) || 0);
  const bankName = String(formData.get("bankName") ?? "").trim() || null;
  const accountNumber = String(formData.get("accountNumber") ?? "").trim() || null;

  // First account created becomes the default.
  const count = await db.churchAccount.count({ where: { churchId: session.churchId } });

  const account = await db.churchAccount.create({
    data: {
      churchId: session.churchId,
      name, type, openingBalance, bankName, accountNumber,
      isDefault: count === 0,
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "account", entityId: account.id, detail: `Created account "${name}"` });
  revalidatePath("/app/accounting");
}

export async function updateAccount(formData: FormData) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  const own = await db.churchAccount.findFirst({ where: { id, churchId: session.churchId }, select: { id: true } });
  if (!own) return;

  const typeRaw = String(formData.get("type") ?? "bank").trim();
  await db.churchAccount.update({
    where: { id },
    data: {
      name,
      type: ACCOUNT_TYPES.includes(typeRaw) ? typeRaw : "bank",
      openingBalance: Math.max(0, parseFloat(String(formData.get("openingBalance") ?? "0")) || 0),
      bankName: String(formData.get("bankName") ?? "").trim() || null,
      accountNumber: String(formData.get("accountNumber") ?? "").trim() || null,
    },
  });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "account", entityId: id, detail: `Updated account "${name}"` });
  revalidatePath("/app/accounting");
}

/** Make one account the default (single default per church). */
export async function setDefaultAccount(id: string) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;
  const own = await db.churchAccount.findFirst({ where: { id, churchId: session.churchId }, select: { id: true } });
  if (!own) return;

  await db.$transaction([
    db.churchAccount.updateMany({ where: { churchId: session.churchId }, data: { isDefault: false } }),
    db.churchAccount.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidatePath("/app/accounting");
}

export async function deleteAccount(id: string) {
  const session = await requireModule("accounting");
  if (session.isDemo) return;
  const acc = await db.churchAccount.findFirst({ where: { id, churchId: session.churchId }, select: { id: true, name: true } });
  if (!acc) return;
  // Money records keep their history; their accountId is set null on delete.
  await db.churchAccount.delete({ where: { id } });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "account", entityId: id, detail: `Deleted account "${acc.name}"` });
  revalidatePath("/app/accounting");
}

/** Move money between two accounts (records a paired out/in transaction). */
export async function transferBetweenAccounts(formData: FormData) {
  const session = await requireModule("accounting");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const fromId = String(formData.get("fromId") ?? "").trim();
  const toId = String(formData.get("toId") ?? "").trim();
  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  if (!fromId || !toId || fromId === toId) return { ok: false as const, error: "Choose two different accounts." };
  if (!amount || amount <= 0) return { ok: false as const, error: "Enter a valid amount." };

  const accounts = await db.churchAccount.findMany({
    where: { id: { in: [fromId, toId] }, churchId: session.churchId },
    select: { id: true, name: true },
  });
  if (accounts.length !== 2) return { ok: false as const, error: "Account not found." };
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "account";
  const note = String(formData.get("note") ?? "").trim();

  await db.transaction.createMany({
    data: [
      { churchId: session.churchId, accountId: fromId, description: `Transfer to ${nameOf(toId)}${note ? ` — ${note}` : ""}`, category: "Transfer", amount: -amount },
      { churchId: session.churchId, accountId: toId, description: `Transfer from ${nameOf(fromId)}${note ? ` — ${note}` : ""}`, category: "Transfer", amount: amount },
    ],
  });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "transfer", detail: `Transferred ${amount} from ${nameOf(fromId)} to ${nameOf(toId)}` });
  revalidatePath("/app/accounting");
  return { ok: true as const };
}
