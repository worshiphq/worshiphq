"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function createWelfareRecord(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const kind = String(formData.get("kind") ?? "aid") === "dues" ? "dues" : "aid";
  const type = String(formData.get("type") ?? "financial");
  const amount = parseFloat(String(formData.get("amount") ?? "0")) || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();
  const personId = String(formData.get("personId") ?? "").trim() || null;

  // Dues are welfare income — only members pay them, so a member is required and
  // the name comes from that member. Aid is money out to any recipient (member,
  // visitor, or a typed name).
  let recipientName = String(formData.get("recipientName") ?? "").trim();
  if (kind === "dues") {
    if (!personId) return;
    const member = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { firstName: true, lastName: true } });
    if (!member) return;
    recipientName = `${member.firstName} ${member.lastName}`.trim();
  }
  if (!recipientName) return;

  const rec = await db.welfareRecord.create({
    data: {
      churchId: session.churchId,
      kind,
      recipientName,
      type: kind === "dues" ? "dues" : type,
      amount,
      description,
      personId,
      ...(dateStr ? { date: new Date(dateStr) } : {}),
    },
  });

  // Post to the account: dues add money, aid deducts it.
  if (amount && amount > 0) {
    const { postLedgerToAccount } = await import("@/lib/data/accounts");
    await postLedgerToAccount(session.churchId, {
      description: kind === "dues" ? `Welfare dues — ${recipientName}` : `Welfare aid — ${recipientName}`,
      category: kind === "dues" ? "Welfare Dues" : "Welfare",
      fund: "Welfare",
      amount: kind === "dues" ? amount : -amount,
      accountId: String(formData.get("accountId") ?? "").trim() || null,
    });
  }

  await audit(session, "create", "welfare", `Welfare ${kind === "dues" ? "dues from" : "aid for"} ${recipientName}${amount ? ` (${amount})` : ""}`, rec.id);
  revalidatePath("/app/welfare");
  revalidatePath("/app/accounting");
}

export async function deleteWelfareRecord(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const rec = await db.welfareRecord.findFirst({ where: { id, churchId: session.churchId }, select: { recipientName: true } });
  await db.welfareRecord.deleteMany({ where: { id, churchId: session.churchId } });
  if (rec) await audit(session, "delete", "welfare", `Deleted welfare for ${rec.recipientName}`, id);
  revalidatePath("/app/welfare");
}
