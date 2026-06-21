"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function createRoster(formData: FormData) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const ministry = String(formData.get("ministry") ?? "").trim() || null;
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!startDate || !endDate) return;

  const roster = await db.volunteerRoster.create({
    data: {
      churchId: session.churchId,
      name,
      ministry,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      notes,
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "roster", entityId: roster.id, detail: `Created roster "${name}"` });
  revalidatePath("/app/rosters");
}

export async function addSlot(formData: FormData) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return;

  const rosterId = String(formData.get("rosterId") ?? "").trim();
  const personId = String(formData.get("personId") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "").trim();
  const dateStr = String(formData.get("date") ?? "").trim();
  const shift = String(formData.get("shift") ?? "morning").trim();
  if (!rosterId || !role || !dateStr) return;

  await db.volunteerSlot.create({
    data: {
      churchId: session.churchId,
      rosterId,
      personId,
      role,
      date: new Date(dateStr),
      shift,
    },
  });

  revalidatePath("/app/rosters");
}

export async function deleteRoster(formData: FormData) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const r = await db.volunteerRoster.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
  await db.volunteerRoster.deleteMany({ where: { id, churchId: session.churchId } });
  if (r) await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "roster", entityId: id, detail: `Deleted roster "${r.name}"` });
  revalidatePath("/app/rosters");
}

export async function deleteSlot(formData: FormData) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.volunteerSlot.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/rosters");
}
