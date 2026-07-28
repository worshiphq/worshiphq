"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireModule } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * Funds are the "pots of money" a church tracks separately — General, Building,
 * Missions, Youth, etc. Every gift and pledge is tagged to a fund so you can see
 * how much each purpose has raised. These actions let admins manage the list.
 */

export async function createFund(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false as const, error: "Give the fund a name." };
  const color = String(formData.get("color") ?? "").trim() || "#6D5EF8";

  const existing = await db.fund.findFirst({ where: { churchId: session.churchId, name }, select: { id: true } });
  if (existing) return { ok: false as const, error: "A fund with that name already exists." };

  await db.fund.create({ data: { churchId: session.churchId, name, color } });
  await audit(session, "create", "fund", `Created fund "${name}"`);
  revalidatePath("/app/accounting");
  revalidatePath("/app/giving");
  return { ok: true as const };
}

export async function renameFund(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { ok: false as const, error: "Name required." };

  const fund = await db.fund.findFirst({ where: { id, churchId: session.churchId }, select: { id: true, name: true } });
  if (!fund) return { ok: false as const, error: "Fund not found." };
  const color = String(formData.get("color") ?? "").trim();

  await db.fund.update({ where: { id }, data: { name, ...(color ? { color } : {}) } });
  await audit(session, "update", "fund", `Renamed fund "${fund.name}" → "${name}"`, id);
  revalidatePath("/app/accounting");
  revalidatePath("/app/giving");
  return { ok: true as const };
}

/**
 * Delete a fund. Blocked while gifts or pledges are still tagged to it — those
 * must be moved to another fund first, so no giving history is orphaned.
 */
export async function deleteFund(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false as const, error: "Fund required." };

  const fund = await db.fund.findFirst({
    where: { id, churchId: session.churchId },
    select: { id: true, name: true, _count: { select: { gifts: true, pledges: true } } },
  });
  if (!fund) return { ok: false as const, error: "Fund not found." };
  if (fund._count.gifts > 0 || fund._count.pledges > 0) {
    return { ok: false as const, error: `“${fund.name}” still has giving recorded against it. Move those to another fund first.` };
  }

  await db.fund.delete({ where: { id } });
  await audit(session, "delete", "fund", `Deleted fund "${fund.name}"`, id);
  revalidatePath("/app/accounting");
  revalidatePath("/app/giving");
  return { ok: true as const };
}
