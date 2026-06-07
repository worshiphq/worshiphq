"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";

/** Record a service headcount. Creates one AttendanceRecord per person counted
 *  so trends and per-branch tallies stay accurate. Capped for safety. */
export async function recordService(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const serviceName = String(formData.get("serviceName") ?? "Service").trim() || "Service";
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const count = Math.min(Math.max(Number(formData.get("count") ?? 0), 0), 10000);
  if (!count) return;

  await db.attendanceRecord.createMany({
    data: Array.from({ length: count }, () => ({
      churchId: session.churchId,
      branchId: session.branchId ?? undefined,
      serviceName,
      date: isNaN(date.getTime()) ? new Date() : date,
      method: "manual",
    })),
  });

  revalidatePath("/app/attendance");
  revalidatePath("/app");
}
