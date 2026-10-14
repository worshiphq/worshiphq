"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { churchInitials } from "@/lib/members/helpers";
import { phoneKey } from "@/lib/search";
import { ageOf, groupForAge } from "@/lib/age";
import { getAgeConfig } from "@/lib/data/age";

type Session = Awaited<ReturnType<typeof requireSession>>;
export type ShareKey = "headcount" | "attendance" | "finances";
const SHARE: ShareKey[] = ["headcount", "attendance", "finances"];
export const LINK_KINDS = { teens_chapel: "Teens Chapel", branch: "Branch church", partner: "Partner church" } as const;
type Kind = keyof typeof LINK_KINDS;

function requireOwnerOrAdmin(session: Session) {
  assertCanWrite(session, "settings");
  if (session.isDemo) throw new Error("Read-only demo.");
  if (session.role !== "Owner" && session.role !== "Admin") throw new Error("Only the Owner or an Admin can manage linked churches.");
}

const money = (n: number) => Math.round(n * 100) / 100;

export type LinkedChild = {
  id: string; name: string; kind: string; share: ShareKey[];
  members: number | null;
  attendance: { lastService: string | null; lastTotal: number; average4: number } | null;
  finances: { givingThisMonth: number; expensesThisMonth: number } | null;
};
export type TransferRow = { id: string; name: string; fromChurch: string; createdAt: string; note: string | null; departments: string[]; groups: string[]; zones: string[]; age: number | null; phone: string | null };
export type LinkedData = {
  churchName: string;
  isAdmin: boolean;
  parent: { id: string; name: string; kind: string; share: ShareKey[] } | null;
  invites: { id: string; code: string; kind: string; label: string | null; expiresAt: string }[];
  children: LinkedChild[];
  incoming: TransferRow[];
  sent: { id: string; name: string; status: string; createdAt: string }[];
  autoAccept: boolean;
};

/** Everything the Linked churches screen shows for this church, in both directions. */
export async function getLinkedChurches(): Promise<LinkedData> {
  const session = await requireSession();
  const churchId = session.churchId;
  const [me, invites, kids, incoming, sent] = await Promise.all([
    db.church.findUnique({ where: { id: churchId }, select: { name: true, linkKind: true, linkShare: true, autoAcceptTransfers: true, parentChurch: { select: { id: true, name: true } } } }),
    db.churchLinkInvite.findMany({ where: { parentChurchId: churchId, usedByChurchId: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    db.church.findMany({ where: { parentChurchId: churchId }, select: { id: true, name: true, linkKind: true, linkShare: true }, orderBy: { name: "asc" } }),
    db.personTransfer.findMany({ where: { toChurchId: churchId, status: "pending" }, orderBy: { createdAt: "asc" } }),
    db.personTransfer.findMany({ where: { fromChurchId: churchId }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const children: LinkedChild[] = [];
  for (const k of kids) {
    const share = k.linkShare.filter((s): s is ShareKey => (SHARE as string[]).includes(s));
    const row: LinkedChild = { id: k.id, name: k.name, kind: k.linkKind ?? "partner", share, members: null, attendance: null, finances: null };
    if (share.includes("headcount")) row.members = await db.person.count({ where: { churchId: k.id, status: "active" } });
    if (share.includes("attendance")) {
      const recent = await db.attendanceSession.findMany({ where: { churchId: k.id }, orderBy: { date: "desc" }, take: 4, select: { serviceName: true, date: true, adults: true, teens: true, children: true, visitors: true } });
      const totals = recent.map((s) => s.adults + s.teens + s.children + s.visitors);
      row.attendance = {
        lastService: recent[0] ? `${recent[0].serviceName}, ${recent[0].date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : null,
        lastTotal: totals[0] ?? 0,
        average4: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
      };
    }
    if (share.includes("finances")) {
      const [g, e] = await Promise.all([
        db.gift.aggregate({ where: { churchId: k.id, date: { gte: monthStart } }, _sum: { amount: true } }),
        db.expense.aggregate({ where: { churchId: k.id, date: { gte: monthStart } }, _sum: { amount: true } }),
      ]);
      row.finances = { givingThisMonth: money(Number(g._sum.amount ?? 0)), expensesThisMonth: money(e._sum.amount ?? 0) };
    }
    children.push(row);
  }

  const fromNames = new Map((await db.church.findMany({ where: { id: { in: [...new Set(incoming.map((t) => t.fromChurchId))] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  return {
    churchName: me?.name ?? "",
    isAdmin: session.role === "Owner" || session.role === "Admin",
    parent: me?.parentChurch ? { id: me.parentChurch.id, name: me.parentChurch.name, kind: me.linkKind ?? "partner", share: me.linkShare.filter((s): s is ShareKey => (SHARE as string[]).includes(s)) } : null,
    invites: invites.map((i) => ({ id: i.id, code: i.code, kind: i.kind, label: i.label, expiresAt: i.expiresAt.toISOString() })),
    children,
    incoming: incoming.map((t) => {
      const p = t.payload as Record<string, unknown>;
      return {
        id: t.id, name: t.name, fromChurch: fromNames.get(t.fromChurchId) ?? "Linked church", createdAt: t.createdAt.toISOString(), note: t.note,
        departments: (p.departments as string[]) ?? [], groups: (p.groups as string[]) ?? [],
        zones: ((p.zones as { category: string; name: string }[]) ?? []).map((z) => `${z.category}: ${z.name}`),
        age: ageOf(typeof p.dateOfBirth === "string" ? p.dateOfBirth : null), phone: typeof p.phone === "string" ? p.phone : null,
      };
    }),
    sent: sent.map((t) => ({ id: t.id, name: t.name, status: t.status, createdAt: t.createdAt.toISOString() })),
    autoAccept: me?.autoAcceptTransfers ?? false,
  };
}

/* ───────────── Linking two churches ───────────── */

/** The main church makes a code. The other church enters it in its own Settings to link the two accounts. */
export async function createLinkInvite(input: { kind: Kind; label?: string }) {
  const session = await requireSession();
  requireOwnerOrAdmin(session);
  if (!(input.kind in LINK_KINDS)) return { ok: false as const, error: "Choose what kind of church it is." };
  const open = await db.churchLinkInvite.count({ where: { parentChurchId: session.churchId, usedByChurchId: null, expiresAt: { gt: new Date() } } });
  if (open >= 5) return { ok: false as const, error: "You already have 5 open codes. Remove one first." };
  const code = `LINK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  await db.churchLinkInvite.create({ data: { parentChurchId: session.churchId, code, kind: input.kind, label: (input.label ?? "").trim().slice(0, 60) || null, expiresAt: new Date(Date.now() + 14 * 86400_000) } });
  revalidatePath("/app/settings");
  return { ok: true as const, code };
}

export async function deleteLinkInvite(id: string) {
  const session = await requireSession();
  requireOwnerOrAdmin(session);
  await db.churchLinkInvite.deleteMany({ where: { id, parentChurchId: session.churchId, usedByChurchId: null } });
  revalidatePath("/app/settings");
  return { ok: true as const };
}

/** Enter a code from the main church to link this account to it. */
export async function acceptLinkCode(rawCode: string) {
  const session = await requireSession();
  requireOwnerOrAdmin(session);
  const code = String(rawCode ?? "").trim().toUpperCase();
  const me = await db.church.findUnique({ where: { id: session.churchId }, select: { id: true, name: true, parentChurchId: true } });
  if (!me) return { ok: false as const, error: "Church not found." };
  if (me.parentChurchId) return { ok: false as const, error: "This church is already linked to another church. Unlink it first." };
  const invite = await db.churchLinkInvite.findUnique({ where: { code } });
  if (!invite || invite.usedByChurchId || invite.expiresAt < new Date()) return { ok: false as const, error: "That code is not valid, or it has expired. Ask the main church for a new one." };
  if (invite.parentChurchId === me.id) return { ok: false as const, error: "You cannot link a church to itself." };
  // A church can never be above itself: refuse a link that would make a loop.
  const above = await db.church.findUnique({ where: { id: invite.parentChurchId }, select: { parentChurchId: true, name: true } });
  if (!above) return { ok: false as const, error: "The main church could not be found." };
  if (above.parentChurchId === me.id) return { ok: false as const, error: "That church is already linked underneath yours." };

  await db.$transaction([
    db.church.update({ where: { id: me.id }, data: { parentChurchId: invite.parentChurchId, linkKind: invite.kind, linkShare: [] } }),
    db.churchLinkInvite.update({ where: { id: invite.id }, data: { usedByChurchId: me.id } }),
  ]);
  await audit(session, "update", "settings", `Linked to ${above.name} as a ${LINK_KINDS[invite.kind as Kind] ?? invite.kind}`);
  revalidatePath("/app/settings");
  return { ok: true as const, parentName: above.name };
}

/** What this church lets its main church see. Nothing is shared until it is switched on here. */
export async function setLinkShare(share: ShareKey[]) {
  const session = await requireSession();
  requireOwnerOrAdmin(session);
  const clean = [...new Set(share.filter((s) => SHARE.includes(s)))];
  await db.church.update({ where: { id: session.churchId }, data: { linkShare: clean } });
  await audit(session, "update", "settings", `Sharing with the main church: ${clean.join(", ") || "nothing"}`);
  revalidatePath("/app/settings");
  return { ok: true as const };
}

export async function setAutoAcceptTransfers(on: boolean) {
  const session = await requireSession();
  requireOwnerOrAdmin(session);
  await db.church.update({ where: { id: session.churchId }, data: { autoAcceptTransfers: !!on } });
  revalidatePath("/app/settings");
  return { ok: true as const };
}

/** Either side can end the link. People already moved stay where they are. */
export async function unlinkChurch(childId?: string) {
  const session = await requireSession();
  requireOwnerOrAdmin(session);
  const id = childId ?? session.churchId;
  const target = await db.church.findUnique({ where: { id }, select: { parentChurchId: true, name: true } });
  if (!target?.parentChurchId) return { ok: false as const, error: "Not linked." };
  if (id !== session.churchId && target.parentChurchId !== session.churchId) return { ok: false as const, error: "That church is not linked to yours." };
  await db.church.update({ where: { id }, data: { parentChurchId: null, linkKind: null, linkShare: [] } });
  await db.personTransfer.updateMany({ where: { fromChurchId: id, status: "pending" }, data: { status: "declined", handledAt: new Date() } });
  await audit(session, "update", "settings", `Unlinked ${target.name}`);
  revalidatePath("/app/settings");
  return { ok: true as const };
}

/* ───────────── Sending people to the main church ───────────── */

type Payload = Record<string, unknown> & { departments: string[]; groups: string[]; zones: { category: string; name: string }[] };

async function buildPayload(churchId: string, personId: string): Promise<{ name: string; payload: Payload } | null> {
  const p = await db.person.findFirst({
    where: { id: personId, churchId },
    include: {
      departments: { select: { name: true } },
      groups: { where: { isActive: true }, select: { name: true } },
      categoryOptions: { select: { name: true, category: { select: { name: true } } } },
    },
  });
  if (!p) return null;
  const photo = p.photoUrl && (p.photoUrl.startsWith("http") || p.photoUrl.length < 300_000) ? p.photoUrl : null;
  return {
    name: `${p.firstName} ${p.lastName}`.trim(),
    payload: {
      firstName: p.firstName, lastName: p.lastName, otherNames: p.otherNames, title: p.title, gender: p.gender,
      dateOfBirth: p.dateOfBirth?.toISOString() ?? null, maritalStatus: p.maritalStatus, phone: p.phone, email: p.email,
      houseAddress: p.houseAddress, town: p.town, region: p.region, district: p.district, homeTown: p.homeTown, postalAddress: p.postalAddress,
      nationality: p.nationality, nationalId: p.nationalId, occupation: p.occupation, employer: p.employer,
      emergencyName: p.emergencyName, emergencyPhone: p.emergencyPhone, emergencyRelation: p.emergencyRelation,
      baptized: p.baptized, notes: p.notes, photoUrl: photo, customFields: p.customFields ?? null, memberId: p.memberId,
      joinedAt: p.joinedAt.toISOString(),
      departments: p.departments.map((d) => d.name), groups: p.groups.map((g) => g.name),
      zones: p.categoryOptions.map((o) => ({ category: o.category.name, name: o.name })),
    },
  };
}

/** Send people (for example teens who are graduating) to the main church. The main church receives them and chooses where they go. */
export async function sendToParent(input: { personIds: string[]; note?: string }): Promise<{ ok: true; sent: number; accepted: number } | { ok: false; error: string }> {
  const session = await requireSession();
  assertCanWrite(session, "people");
  if (session.isDemo) return { ok: false, error: "Read-only demo." };
  const me = await db.church.findUnique({ where: { id: session.churchId }, select: { name: true, parentChurchId: true, parentChurch: { select: { name: true, autoAcceptTransfers: true } } } });
  if (!me?.parentChurchId || !me.parentChurch) return { ok: false, error: "This church is not linked to a main church yet." };
  const ids = [...new Set(input.personIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose at least one person." };

  const note = (input.note ?? "").trim().slice(0, 500) || null;
  let sent = 0, accepted = 0;
  for (const id of ids) {
    const built = await buildPayload(session.churchId, id);
    if (!built) continue;
    // Never send the same person twice while the first is still waiting.
    const waiting = await db.personTransfer.findFirst({ where: { fromChurchId: session.churchId, fromPersonId: id, status: "pending" }, select: { id: true } });
    if (waiting) continue;
    const t = await db.personTransfer.create({ data: { fromChurchId: session.churchId, toChurchId: me.parentChurchId, fromPersonId: id, name: built.name, payload: built.payload as unknown as Prisma.InputJsonValue, note, createdById: session.userId } });
    sent++;
    // They have moved up, so they leave this church's active list (their record stays here as history).
    await db.person.update({ where: { id }, data: { status: "inactive", notes: [`Sent to ${me.parentChurch.name} on ${new Date().toLocaleDateString("en-GB")}.`, built.payload.notes as string | null].filter(Boolean).join(" ") } });
    if (me.parentChurch.autoAcceptTransfers) {
      const r = await acceptInternal(t.id, me.parentChurchId, { createMissing: true });
      if (r.ok) accepted++;
    }
  }
  await audit(session, "update", "person", `Sent ${sent} ${sent === 1 ? "person" : "people"} to ${me.parentChurch.name}`);
  revalidatePath("/app/people");
  revalidatePath("/app/settings");
  return { ok: true, sent, accepted };
}

/* ───────────── Receiving them ───────────── */

async function acceptInternal(transferId: string, toChurchId: string, opts: { createMissing: boolean }): Promise<{ ok: true; personId: string; merged: boolean } | { ok: false; error: string }> {
  const t = await db.personTransfer.findFirst({ where: { id: transferId, toChurchId, status: "pending" } });
  if (!t) return { ok: false, error: "That person is no longer waiting." };
  const p = t.payload as Payload & Record<string, string | null | boolean | object>;
  const str = (k: string) => (typeof p[k] === "string" && p[k] ? (p[k] as string) : null);
  const churchId = toChurchId;

  const [church, depts, groups, cats, cfg] = await Promise.all([
    db.church.findUnique({ where: { id: churchId }, select: { name: true, memberPrefix: true, memberSeq: true } }),
    db.department.findMany({ where: { churchId }, select: { id: true, name: true } }),
    db.group.findMany({ where: { churchId }, select: { id: true, name: true } }),
    db.memberCategory.findMany({ where: { churchId }, select: { id: true, name: true, options: { select: { id: true, name: true } } } }),
    getAgeConfig(churchId),
  ]);

  const deptIds: string[] = [], groupIds: string[] = [], optionIds: string[] = [];
  for (const n of (p.departments as string[]) ?? []) {
    let id = depts.find((d) => d.name.toLowerCase() === n.toLowerCase())?.id;
    if (!id && opts.createMissing) id = (await db.department.create({ data: { churchId, name: n.slice(0, 80) } }).catch(() => null))?.id;
    if (id) deptIds.push(id);
  }
  for (const n of (p.groups as string[]) ?? []) {
    let id = groups.find((g) => g.name.toLowerCase() === n.toLowerCase())?.id;
    if (!id && opts.createMissing) id = (await db.group.create({ data: { churchId, name: n.slice(0, 80), type: "small_group" } })).id;
    if (id) groupIds.push(id);
  }
  for (const z of (p.zones as { category: string; name: string }[]) ?? []) {
    const cat = cats.find((c) => c.name.toLowerCase() === z.category.toLowerCase());
    const id = cat?.options.find((o) => o.name.toLowerCase() === z.name.toLowerCase())?.id;
    if (id) optionIds.push(id);
  }

  const dob = typeof p.dateOfBirth === "string" ? new Date(p.dateOfBirth) : null;
  const phone = str("phone"), email = str("email")?.toLowerCase() ?? null;
  const existing = await db.person.findFirst({
    where: { churchId, OR: [...(phone && phoneKey(phone).length >= 9 ? [{ phone: { contains: phoneKey(phone) } }] : []), ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])] },
    select: { id: true },
  });

  const links = {
    ...(deptIds.length ? { departments: { connect: deptIds.map((id) => ({ id })) } } : {}),
    ...(groupIds.length ? { groups: { connect: groupIds.map((id) => ({ id })) } } : {}),
    ...(optionIds.length ? { categoryOptions: { connect: optionIds.map((id) => ({ id })) } } : {}),
  };
  const fromName = (await db.church.findUnique({ where: { id: t.fromChurchId }, select: { name: true } }))?.name ?? "linked church";
  const age = ageOf(dob);
  let personId: string;
  let merged = false;

  if (existing) {
    // Already here: add what they are missing, and their departments and groups.
    merged = true;
    personId = existing.id;
    await db.person.update({ where: { id: existing.id }, data: { ...links, status: "active" } });
  } else {
    let seq = church?.memberSeq ?? 0;
    const prefix = church?.memberPrefix || churchInitials(church?.name ?? "Church");
    seq++;
    const custom = { ...((p.customFields as Record<string, string> | null) ?? {}), [`From ${fromName}`]: `Joined there ${typeof p.joinedAt === "string" ? p.joinedAt.slice(0, 10) : ""}`.trim() };
    const created = await db.person.create({
      data: {
        church: { connect: { id: churchId } }, memberId: `${prefix}-${String(seq).padStart(4, "0")}`,
        firstName: String(p.firstName ?? t.name).slice(0, 60), lastName: String(p.lastName ?? "").slice(0, 60), otherNames: str("otherNames"), title: str("title"), gender: str("gender"),
        dateOfBirth: dob, birthday: dob ? `${String(dob.getUTCMonth() + 1).padStart(2, "0")}-${String(dob.getUTCDate()).padStart(2, "0")}` : null,
        maritalStatus: str("maritalStatus"), phone, email, houseAddress: str("houseAddress"), town: str("town"), region: str("region"), district: str("district"), homeTown: str("homeTown"), postalAddress: str("postalAddress"),
        nationality: str("nationality"), nationalId: str("nationalId"), occupation: str("occupation"), employer: str("employer"),
        emergencyName: str("emergencyName"), emergencyPhone: str("emergencyPhone"), emergencyRelation: str("emergencyRelation"),
        baptized: typeof p.baptized === "boolean" ? p.baptized : null, notes: str("notes"), photoUrl: str("photoUrl"),
        customFields: custom as unknown as Prisma.InputJsonValue, status: "active",
        ...(age !== null ? { ageGroup: groupForAge(age, cfg) } : { ageGroup: "adult" }),
        ...links,
      },
    });
    personId = created.id;
    await db.church.update({ where: { id: churchId }, data: { memberSeq: seq, memberPrefix: prefix } });
  }
  await db.personTransfer.update({ where: { id: t.id }, data: { status: "accepted", handledAt: new Date(), createdPersonId: personId } });
  return { ok: true, personId, merged };
}

export async function acceptTransfer(id: string, opts: { createMissing: boolean }) {
  const session = await requireSession();
  requireOwnerOrAdmin(session);
  assertCanWrite(session, "people");
  const r = await acceptInternal(id, session.churchId, opts);
  if (r.ok) { await audit(session, "create", "person", `Accepted a person sent from a linked church`, r.personId); revalidatePath("/app/people"); revalidatePath("/app/settings"); }
  return r;
}

export async function acceptAllTransfers(opts: { createMissing: boolean }) {
  const session = await requireSession();
  requireOwnerOrAdmin(session);
  assertCanWrite(session, "people");
  const waiting = await db.personTransfer.findMany({ where: { toChurchId: session.churchId, status: "pending" }, select: { id: true } });
  let done = 0;
  for (const w of waiting) if ((await acceptInternal(w.id, session.churchId, opts)).ok) done++;
  await audit(session, "create", "person", `Accepted ${done} people sent from linked churches`);
  revalidatePath("/app/people");
  revalidatePath("/app/settings");
  return { ok: true as const, accepted: done };
}

export async function declineTransfer(id: string) {
  const session = await requireSession();
  requireOwnerOrAdmin(session);
  await db.personTransfer.updateMany({ where: { id, toChurchId: session.churchId, status: "pending" }, data: { status: "declined", handledAt: new Date() } });
  revalidatePath("/app/settings");
  return { ok: true as const };
}

/** People in this church who could be sent up: teens and adults, with their age, for the picker. */
export async function listSendable(): Promise<{ id: string; name: string; age: number | null; group: string }[]> {
  const session = await requireSession();
  const rows = await db.person.findMany({
    where: { churchId: session.churchId, status: "active" },
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true, ageGroup: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 3000,
  });
  return rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`.trim(), age: ageOf(r.dateOfBirth), group: r.ageGroup ?? "adult" }));
}
