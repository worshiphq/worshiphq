"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { canManage } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { describeCurrentService } from "@/lib/attendance/service-times";

async function requireAttendanceManager() {
  const session = await requireSession();
  assertCanWrite(session);
  if (!canManage(session, "attendance")) throw new Error("Only people who manage attendance can change service times.");
  return session;
}

const toMinute = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

export type ServiceTimesData = {
  on: boolean;
  grace: number;
  slots: { id: string; name: string; weekday: number; startMinute: number; endMinute: number; branchId: string | null; branchName: string | null; active: boolean }[];
  branches: { id: string; name: string }[];
  now: { name: string; matched: boolean } | null;
};

export async function getServiceTimes(): Promise<ServiceTimesData> {
  const session = await requireSession();
  const [church, slots, branches] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId }, select: { serviceTimesOn: true, serviceGraceMinutes: true } }),
    db.serviceSlot.findMany({
      where: { churchId: session.churchId },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      include: { branch: { select: { name: true } } },
    }),
    db.branch.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const current = church?.serviceTimesOn ? await describeCurrentService(session.churchId, session.branchId ?? null) : null;
  return {
    on: church?.serviceTimesOn ?? false,
    grace: church?.serviceGraceMinutes ?? 60,
    slots: slots.map((s) => ({
      id: s.id, name: s.name, weekday: s.weekday, startMinute: s.startMinute, endMinute: s.endMinute,
      branchId: s.branchId, branchName: s.branch?.name ?? null, active: s.active,
    })),
    branches,
    now: current ? { name: current.name, matched: !!current.slot } : null,
  };
}

export async function setServiceTimesOptions(input: { on: boolean; grace: number }) {
  const session = await requireAttendanceManager();
  const grace = Math.min(Math.max(Math.round(Number(input.grace) || 0), 0), 240);
  if (input.on) {
    const count = await db.serviceSlot.count({ where: { churchId: session.churchId, active: true } });
    if (count === 0) return { ok: false as const, error: "Add at least one service before switching this on." };
  }
  await db.church.update({ where: { id: session.churchId }, data: { serviceTimesOn: input.on, serviceGraceMinutes: grace } });
  await audit(session, "update", "settings", `Service times ${input.on ? "on" : "off"} (grace ${grace} min)`);
  revalidatePath("/app/attendance");
  revalidatePath("/app/settings");
  return { ok: true as const };
}

export async function saveServiceSlot(input: { id?: string; name: string; weekday: number; start: string; end: string; branchId?: string | null; active?: boolean }) {
  const session = await requireAttendanceManager();
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false as const, error: "Give the service a name, e.g. \"1st Service\" or \"Twi Service\"." };
  const weekday = Math.floor(Number(input.weekday));
  if (!(weekday >= 0 && weekday <= 6)) return { ok: false as const, error: "Choose a day." };
  const startMinute = toMinute(input.start);
  const endMinute = toMinute(input.end);
  if (startMinute == null || endMinute == null) return { ok: false as const, error: "Enter start and end times." };
  if (endMinute <= startMinute) return { ok: false as const, error: "The service must end after it starts (same day)." };

  let branchId: string | null = null;
  if (input.branchId) {
    const b = await db.branch.findFirst({ where: { id: input.branchId, churchId: session.churchId }, select: { id: true } });
    if (!b) return { ok: false as const, error: "That branch was not found." };
    branchId = b.id;
  }

  const data = { name, weekday, startMinute, endMinute, branchId, active: input.active ?? true };
  let savedId = input.id;
  if (input.id) {
    const res = await db.serviceSlot.updateMany({ where: { id: input.id, churchId: session.churchId }, data });
    if (res.count === 0) return { ok: false as const, error: "Service not found." };
  } else {
    savedId = (await db.serviceSlot.create({ data: { ...data, churchId: session.churchId } })).id;
  }

  // Overlap is allowed (the later-starting service wins inside the overlap) but worth a heads-up.
  const overlaps = await db.serviceSlot.count({
    where: {
      churchId: session.churchId, weekday, active: true,
      id: { not: savedId },
      startMinute: { lt: endMinute }, endMinute: { gt: startMinute },
      OR: [{ branchId: null }, { branchId }],
    },
  });

  await audit(session, input.id ? "update" : "create", "settings", `Service time "${name}"`);
  revalidatePath("/app/settings");
  revalidatePath("/app/attendance");
  return { ok: true as const, overlaps };
}

export async function deleteServiceSlot(id: string) {
  const session = await requireAttendanceManager();
  await db.serviceSlot.deleteMany({ where: { id, churchId: session.churchId } });
  const left = await db.serviceSlot.count({ where: { churchId: session.churchId, active: true } });
  if (left === 0) await db.church.update({ where: { id: session.churchId }, data: { serviceTimesOn: false } });
  await audit(session, "delete", "settings", "Removed a service time");
  revalidatePath("/app/settings");
  revalidatePath("/app/attendance");
  return { ok: true as const, turnedOff: left === 0 };
}
