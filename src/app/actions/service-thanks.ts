"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { renderTemplate, templateFor } from "@/lib/messages/registry";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type ServiceThanksData = {
  on: boolean;
  /** Services where "thank everyone" is ticked by default when the service is ended. */
  names: string[];
  other: boolean;
  /** Services the church has, to choose from (regular service times, plus names used recently). */
  services: { name: string; day: string | null }[];
  sample: string;
};

/** The "thank you for coming" settings, plus the services to choose from. */
export async function getServiceThanks(): Promise<ServiceThanksData> {
  const session = await requireSession();
  const since = new Date(Date.now() - 120 * 86400_000);
  const [church, slots, recent] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true, thankAfterService: true, thankServiceNames: true, thankOtherPrograms: true, messageTemplates: true } }),
    db.serviceSlot.findMany({ where: { churchId: session.churchId, active: true }, select: { name: true, weekday: true }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    db.attendanceSession.findMany({ where: { churchId: session.churchId, date: { gte: since } }, select: { serviceName: true }, distinct: ["serviceName"], take: 30 }),
  ]);
  const seen = new Set<string>();
  const services: ServiceThanksData["services"] = [];
  for (const s of slots) {
    const k = s.name.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    services.push({ name: s.name, day: DAYS[s.weekday] ?? null });
  }
  for (const r of recent) {
    const k = r.serviceName.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    services.push({ name: r.serviceName, day: null });
  }
  return {
    on: church?.thankAfterService ?? false,
    names: church?.thankServiceNames ?? [],
    other: church?.thankOtherPrograms ?? false,
    services,
    sample: renderTemplate(templateFor(church?.messageTemplates, "service_thanks"), { name: "Ama", church: church?.name ?? "Grace Chapel", service: "Sunday Service" }),
  };
}

export async function saveServiceThanks(input: { on: boolean; names: string[]; other: boolean }) {
  const session = await requireSession();
  assertCanWrite(session, "attendance");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const names = [...new Set(input.names.map((n) => n.trim()).filter(Boolean))].slice(0, 30);
  await db.church.update({
    where: { id: session.churchId },
    data: { thankAfterService: !!input.on, thankServiceNames: names, thankOtherPrograms: !!input.other },
  });
  await audit(session, "update", "settings", input.on ? `Switched on "thank you after service" for ${names.length} service(s)` : 'Switched off "thank you after service"');
  revalidatePath("/app/attendance");
  revalidatePath("/app/settings");
  return { ok: true as const };
}
