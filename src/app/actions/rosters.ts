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
  const service = String(formData.get("service") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();
  const shift = String(formData.get("shift") ?? "morning").trim();
  if (!rosterId || !role || !dateStr) return;

  // A person can be a member (personId) or a typed name/title (e.g. "Rev. Foster Odoi").
  let personName = String(formData.get("personName") ?? "").trim() || null;
  if (personId) {
    const member = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { firstName: true, lastName: true } });
    if (member) personName = `${member.firstName} ${member.lastName}`.trim();
  }

  await db.volunteerSlot.create({
    data: {
      churchId: session.churchId,
      rosterId,
      personId,
      personName,
      service,
      role,
      date: new Date(dateStr),
      shift,
    },
  });

  revalidatePath("/app/rosters");
}

/**
 * Save a whole "service sheet" at once — one service on one date with a person
 * for each role (the Pulpit Workers bulletin). Each sheet is stored as a
 * VolunteerRoster (name = service, startDate/endDate = the date) with a slot per
 * filled role. Creates a new sheet or replaces an existing one (sheetId).
 */
export async function saveServiceSheet(formData: FormData) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const sheetId = String(formData.get("sheetId") ?? "").trim() || null;
  const service = String(formData.get("service") ?? "").trim();
  const dateStr = String(formData.get("date") ?? "").trim();
  if (!service || !dateStr) return { ok: false as const, error: "Pick a date and a service." };
  const date = new Date(dateStr);

  type Assign = { role: string; personId?: string | null; personName?: string | null };
  let assignments: Assign[] = [];
  try { assignments = JSON.parse(String(formData.get("assignments") ?? "[]")); } catch { /* ignore */ }
  assignments = assignments.filter((a) => a.role && (a.personId || (a.personName && a.personName.trim())));
  if (assignments.length === 0) return { ok: false as const, error: "Assign at least one person." };

  // Resolve member names for any personIds in one query.
  const ids = assignments.map((a) => a.personId).filter((x): x is string => !!x);
  const members = ids.length
    ? await db.person.findMany({ where: { id: { in: ids }, churchId: session.churchId }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const nameById = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`.trim()]));

  // Get or create the sheet container.
  let rosterId = sheetId;
  if (rosterId) {
    const owned = await db.volunteerRoster.findFirst({ where: { id: rosterId, churchId: session.churchId }, select: { id: true } });
    if (!owned) return { ok: false as const, error: "Sheet not found." };
    await db.volunteerRoster.update({ where: { id: rosterId }, data: { name: service, startDate: date, endDate: date } });
    await db.volunteerSlot.deleteMany({ where: { rosterId, churchId: session.churchId } });
  } else {
    const roster = await db.volunteerRoster.create({
      data: { churchId: session.churchId, name: service, startDate: date, endDate: date },
      select: { id: true },
    });
    rosterId = roster.id;
  }

  await db.volunteerSlot.createMany({
    data: assignments.map((a) => ({
      churchId: session.churchId,
      rosterId: rosterId!,
      role: a.role,
      service,
      date,
      personId: a.personId || null,
      personName: a.personId ? (nameById.get(a.personId) ?? null) : (a.personName?.trim() || null),
    })),
  });

  await logAudit({ churchId: session.churchId, userId: session.userId, action: sheetId ? "update" : "create", entity: "roster", entityId: rosterId, detail: `${sheetId ? "Updated" : "Created"} ${service} sheet (${assignments.length} role(s))` });
  revalidatePath("/app/rosters");
  return { ok: true as const };
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

/* ── Service roles (editable preset: Word Ministration, Prayer Leader, …) ── */

export async function addServiceRole(formData: FormData) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const count = await db.serviceRole.count({ where: { churchId: session.churchId } });
  await db.serviceRole.upsert({
    where: { churchId_name: { churchId: session.churchId, name } },
    create: { churchId: session.churchId, name, sortOrder: count },
    update: {},
  });
  revalidatePath("/app/rosters");
}

export async function deleteServiceRole(formData: FormData) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return;
  const id = String(formData.get("id"));
  await db.serviceRole.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/rosters");
}

/** Build each assigned member's personal reminder text for a roster. */
async function buildRosterMessages(churchId: string, rosterId: string) {
  const [roster, church, slots] = await Promise.all([
    db.volunteerRoster.findFirst({ where: { id: rosterId, churchId }, select: { name: true } }),
    db.church.findUnique({ where: { id: churchId }, select: { name: true, messageTemplates: true } }),
    db.volunteerSlot.findMany({
      where: { rosterId, churchId, personId: { not: null } },
      include: { person: { select: { firstName: true, phone: true, title: true } } },
      orderBy: { date: "asc" },
    }),
  ]);
  const churchName = church?.name ?? "your church";
  const { templateFor, renderTemplate } = await import("@/lib/messages/registry");
  const tpl = templateFor(church?.messageTemplates, "roster_reminder");

  // Group slots by person (a person may have several roles/dates). ASCII only.
  const byPerson = new Map<string, { phone: string; firstName: string; title: string; lines: string[] }>();
  for (const s of slots) {
    if (!s.personId || !s.person?.phone) continue;
    const key = s.personId;
    const entry = byPerson.get(key) ?? { phone: s.person.phone, firstName: s.person.firstName, title: s.person.title ?? "", lines: [] };
    const d = s.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    entry.lines.push(`- ${d}${s.service ? ` ${s.service}` : ""}: ${s.role}`);
    byPerson.set(key, entry);
  }

  const messages = [...byPerson.values()].map((p) => ({
    phone: p.phone,
    text: renderTemplate(tpl, { title: p.title, name: p.firstName, church: churchName, duties: p.lines.join("\n") }),
  }));
  return { rosterName: roster?.name ?? "Roster", messages };
}

/* ── Group announcement (whole sheet to a group / the church) ── */

const fmtServiceDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Build the announcement text for a sheet and resolve its recipient phones. */
async function buildAnnouncement(churchId: string, rosterId: string) {
  const [church, roster] = await Promise.all([
    db.church.findUnique({
      where: { id: churchId },
      select: { name: true, messageTemplates: true, rosterAnnounceAudience: true, rosterAnnounceGroupId: true },
    }),
    db.volunteerRoster.findFirst({
      where: { id: rosterId, churchId },
      include: { slots: { orderBy: { createdAt: "asc" } } },
    }),
  ]);
  if (!roster) return { text: "", phones: [] as string[], service: "", date: new Date() };

  const lines = roster.slots.map((s) => `${s.role}: ${s.personName ?? "-"}`);
  const { templateFor, renderTemplate } = await import("@/lib/messages/registry");
  const text = renderTemplate(templateFor(church?.messageTemplates, "roster_announcement"), {
    church: church?.name ?? "your church",
    service: roster.name,
    date: fmtServiceDate(roster.startDate),
    list: lines.join("\n"),
  });

  // Recipients: a group's members, or the whole active church.
  let people: { phone: string | null }[] = [];
  if ((church?.rosterAnnounceAudience ?? "group") === "church") {
    people = await db.person.findMany({ where: { churchId, status: { not: "inactive" }, phone: { not: null } }, select: { phone: true } });
  } else if (church?.rosterAnnounceGroupId) {
    const group = await db.group.findFirst({
      where: { id: church.rosterAnnounceGroupId, churchId },
      select: { members: { where: { phone: { not: null } }, select: { phone: true } } },
    });
    people = group?.members ?? [];
  }
  const phones = people.map((p) => p.phone!).filter(Boolean);
  return { text, phones, service: roster.name, date: roster.startDate };
}

/** Cost preview before announcing a sheet to the group. */
export async function previewRosterAnnounce(rosterId: string) {
  const session = await requireModule("volunteers");
  const { segmentsFor } = await import("@/config/sms");
  const { getSmsBalance } = await import("@/lib/sms/credits");
  const [{ text, phones }, balance] = await Promise.all([
    buildAnnouncement(session.churchId, rosterId),
    getSmsBalance(session.churchId),
  ]);
  const cost = segmentsFor(text) * phones.length;
  return { ok: true as const, recipients: phones.length, cost, balance, remaining: balance - cost, enough: balance >= cost };
}

/** Send the sheet announcement to the group now (manual). */
export async function announceRoster(rosterId: string) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const { text, phones } = await buildAnnouncement(session.churchId, rosterId);
  if (phones.length === 0) return { ok: false as const, error: "No recipients — pick a group (with phones) in Announcement settings." };
  const { sendChurchSms } = await import("@/lib/sms/credits");
  const res = await sendChurchSms(session.churchId, phones, text, { note: "Roster announcement" });
  if (!res.ok && res.insufficient) return { ok: false as const, error: `Not enough SMS credits — need ${res.cost}, have ${res.balance}.` };
  await db.volunteerRoster.update({ where: { id: rosterId }, data: { announcedAt: new Date() } });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "send", entity: "roster", entityId: rosterId, detail: `Announced roster to ${res.sent} recipient(s)` });
  revalidatePath("/app/rosters");
  return { ok: true as const, sent: res.sent };
}

/** Save the roster-announcement schedule/recipient settings. */
export async function saveRosterAnnounceSettings(formData: FormData) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const audience = String(formData.get("audience") ?? "group") === "church" ? "church" : "group";
  const groupId = String(formData.get("groupId") ?? "").trim() || null;
  const leadDays = Math.min(30, Math.max(0, parseInt(String(formData.get("leadDays") ?? "2"), 10) || 0));
  const hour = Math.min(23, Math.max(0, parseInt(String(formData.get("hour") ?? "8"), 10) || 8));
  await db.church.update({
    where: { id: session.churchId },
    data: {
      rosterAnnounceOn: String(formData.get("on") ?? "") === "on",
      rosterAnnounceAudience: audience,
      rosterAnnounceGroupId: audience === "group" ? groupId : null,
      rosterAnnounceLeadDays: leadDays,
      rosterAnnounceHour: hour,
    },
  });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: "settings", detail: "Updated roster announcement settings" });
  revalidatePath("/app/rosters");
  return { ok: true as const };
}

/** Cost preview before texting a roster's assigned members. */
export async function previewRosterNotify(rosterId: string) {
  const session = await requireModule("volunteers");
  const { segmentsFor } = await import("@/config/sms");
  const { getSmsBalance } = await import("@/lib/sms/credits");
  const [{ messages }, balance] = await Promise.all([
    buildRosterMessages(session.churchId, rosterId),
    getSmsBalance(session.churchId),
  ]);
  const cost = messages.reduce((s, m) => s + segmentsFor(m.text), 0);
  return {
    ok: true as const,
    recipients: messages.length,
    cost,
    balance,
    remaining: balance - cost,
    enough: balance >= cost,
  };
}

/** Text each assigned member their duties for this roster (credit-checked). */
export async function notifyRoster(rosterId: string) {
  const session = await requireModule("volunteers");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const { messages, rosterName } = await buildRosterMessages(session.churchId, rosterId);
  if (messages.length === 0) return { ok: false as const, error: "No assigned members have a phone number on file." };

  const { sendChurchSms } = await import("@/lib/sms/credits");
  let sent = 0;
  for (const m of messages) {
    const res = await sendChurchSms(session.churchId, m.phone, m.text, { note: `Roster: ${rosterName}` });
    if (!res.ok && res.insufficient) {
      if (sent === 0) return { ok: false as const, error: `Not enough SMS credits — need ${res.cost}, have ${res.balance}.` };
      break; // ran out partway through
    }
    if (res.ok) sent += res.sent;
  }

  await db.volunteerSlot.updateMany({ where: { rosterId, churchId: session.churchId, personId: { not: null } }, data: { notifiedAt: new Date() } });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "send", entity: "roster", entityId: rosterId, detail: `Texted ${sent} member(s) their roster duties` });
  revalidatePath("/app/rosters");
  return { ok: true as const, sent };
}
