"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function createCounselingSession(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const summary = String(formData.get("summary") ?? "").trim();
  if (!summary) return;

  const type = String(formData.get("type") ?? "general").trim();
  const personId = String(formData.get("personId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "open").trim();
  const confidential = formData.get("confidential") !== "off";
  const dateStr = String(formData.get("date") ?? "").trim();
  const followUpStr = String(formData.get("followUpDate") ?? "").trim();

  const cs = await db.counselingSession.create({
    data: {
      churchId: session.churchId,
      summary,
      type,
      personId,
      counselorId: session.userId === "demo" || session.userId === "superadmin" ? null : session.userId,
      notes,
      status,
      confidential,
      ...(dateStr ? { date: new Date(dateStr) } : {}),
      ...(followUpStr ? { followUpDate: new Date(followUpStr) } : {}),
    },
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "counseling", entityId: cs.id, detail: `Added counseling session (${type})` });
  revalidatePath("/app/counseling");
}

export async function deleteCounselingSession(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.counselingSession.deleteMany({ where: { id, churchId: session.churchId } });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: "counseling", entityId: id, detail: "Deleted counseling session" });
  revalidatePath("/app/counseling");
}

export async function updateCounselingStatus(formData: FormData) {
  const session = await requireModule("people");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  await db.counselingSession.updateMany({ where: { id, churchId: session.churchId }, data: { status } });
  revalidatePath("/app/counseling");
}
