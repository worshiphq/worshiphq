"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite, assertCanDelete } from "@/lib/auth";

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function saveDayBornAmounts(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const weekOfStr = String(formData.get("weekOf") ?? "");
  if (!weekOfStr) return;
  const weekOf = getMonday(new Date(weekOfStr));

  const monday = Math.max(0, Number(formData.get("monday") ?? 0));
  const tuesday = Math.max(0, Number(formData.get("tuesday") ?? 0));
  const wednesday = Math.max(0, Number(formData.get("wednesday") ?? 0));
  const thursday = Math.max(0, Number(formData.get("thursday") ?? 0));
  const friday = Math.max(0, Number(formData.get("friday") ?? 0));
  const saturday = Math.max(0, Number(formData.get("saturday") ?? 0));
  const sunday = Math.max(0, Number(formData.get("sunday") ?? 0));

  await db.dayBornWeek.upsert({
    where: { churchId_weekOf: { churchId: session.churchId, weekOf } },
    create: {
      churchId: session.churchId,
      branchId: session.branchId ?? undefined,
      weekOf,
      monday, tuesday, wednesday, thursday, friday, saturday, sunday,
    },
    update: {
      monday, tuesday, wednesday, thursday, friday, saturday, sunday,
    },
  });

  revalidatePath("/app/dayborn");
  revalidatePath("/app/accounting");
}

export async function addDayBornEntry(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const weekOfStr = String(formData.get("weekOf") ?? "");
  const day = String(formData.get("day") ?? "");
  const method = String(formData.get("method") ?? "");
  const amount = Math.max(0, Number(formData.get("amount") ?? 0));
  const personName = String(formData.get("personName") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;

  if (!weekOfStr || !day || !method || !amount) return;

  const weekOf = getMonday(new Date(weekOfStr));

  const week = await db.dayBornWeek.upsert({
    where: { churchId_weekOf: { churchId: session.churchId, weekOf } },
    create: {
      churchId: session.churchId,
      branchId: session.branchId ?? undefined,
      weekOf,
    },
    update: {},
  });

  await db.dayBornEntry.create({
    data: {
      weekId: week.id,
      day,
      personName,
      method,
      amount,
      reference,
    },
  });

  revalidatePath("/app/dayborn");
  revalidatePath("/app/accounting");
}

export async function deleteDayBornEntry(entryId: string) {
  const session = await requireSession();
  assertCanWrite(session);

  const entry = await db.dayBornEntry.findUnique({
    where: { id: entryId },
    include: { week: { select: { churchId: true } } },
  });
  if (!entry || entry.week.churchId !== session.churchId) return;

  await db.dayBornEntry.delete({ where: { id: entryId } });
  revalidatePath("/app/dayborn");
}

export async function deleteDayBornWeek(weekId: string) {
  const session = await requireSession();
  assertCanDelete(session);

  const week = await db.dayBornWeek.findFirst({
    where: { id: weekId, churchId: session.churchId },
  });
  if (!week) return;

  await db.dayBornWeek.delete({ where: { id: weekId } });
  revalidatePath("/app/dayborn");
  revalidatePath("/app/accounting");
}

export async function postDayBornToAccounting(weekId: string) {
  const session = await requireSession();
  assertCanWrite(session);

  const week = await db.dayBornWeek.findFirst({
    where: { id: weekId, churchId: session.churchId },
    include: { entries: true },
  });
  if (!week || week.posted) return;

  const cashTotal =
    Number(week.monday) + Number(week.tuesday) + Number(week.wednesday) +
    Number(week.thursday) + Number(week.friday) + Number(week.saturday) + Number(week.sunday);
  const momoTotal = week.entries.reduce((s, e) => s + Number(e.amount), 0);
  const grandTotal = cashTotal + momoTotal;

  if (grandTotal <= 0) return;

  const weekDate = week.weekOf.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  await db.transaction.create({
    data: {
      churchId: session.churchId,
      description: `Day Born — week of ${weekDate}`,
      category: "Income",
      fund: "Day Born",
      amount: grandTotal,
      date: new Date(),
    },
  });

  await db.dayBornWeek.update({
    where: { id: weekId },
    data: { posted: true, postedAt: new Date() },
  });

  revalidatePath("/app/dayborn");
  revalidatePath("/app/accounting");
}
