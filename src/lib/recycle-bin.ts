import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

export const ENTITY_TYPES = [
  "person",
  "visitor",
  "group",
  "gift",
  "pledge",
  "expense",
  "event",
  "followUp",
  "prayerRequest",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_LABELS: Record<EntityType, string> = {
  person: "Member",
  visitor: "Visitor",
  group: "Group",
  gift: "Gift",
  pledge: "Pledge",
  expense: "Expense",
  event: "Event",
  followUp: "Follow-up",
  prayerRequest: "Prayer request",
};

/** Round-trips a Prisma record through JSON so Decimal/Date become plain,
 *  restorable values (Decimal.toJSON() → string, Date → ISO string - both of
 *  which Prisma's create() accepts back just fine). */
function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function createDeletedItem(
  session: { churchId: string; userId: string; name?: string },
  opts: { entityType: EntityType; entityId: string; label: string; detail?: string | null; snapshot: unknown },
) {
  await db.deletedItem.create({
    data: {
      churchId: session.churchId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      label: opts.label,
      detail: opts.detail ?? null,
      snapshot: toJsonSafe(opts.snapshot) as Prisma.InputJsonValue,
      deletedById: session.userId,
      deletedByName: session.name ?? null,
    },
  });
}

/** Snapshot + capture helpers - one per entity type. Each fetches everything
 *  needed to fully recreate the record (including any rows that would
 *  otherwise cascade-delete with it), then writes the DeletedItem row.
 *  Call this BEFORE the actual delete in each action. Silently no-ops if the
 *  record is already gone. */
export const RecycleBin = {
  async capturePerson(session: { churchId: string; userId: string; name?: string }, id: string) {
    const person = await db.person.findFirst({ where: { id, churchId: session.churchId } });
    if (!person) return;
    const [departments, groups, tags, positions, welfareDues, biometrics] = await Promise.all([
      db.department.findMany({ where: { people: { some: { id } } }, select: { id: true } }),
      db.group.findMany({ where: { members: { some: { id } } }, select: { id: true } }),
      db.tag.findMany({ where: { people: { some: { id } } }, select: { id: true } }),
      db.departmentPosition.findMany({ where: { personId: id } }),
      db.welfareDue.findMany({ where: { personId: id } }),
      db.biometricCredential.findMany({ where: { personId: id } }),
    ]);
    await createDeletedItem(session, {
      entityType: "person",
      entityId: id,
      label: `${person.firstName} ${person.lastName}`.trim(),
      detail: person.status === "visitor" ? "Visitor record" : "Member",
      snapshot: {
        record: person,
        departmentIds: departments.map((d) => d.id),
        groupIds: groups.map((g) => g.id),
        tagIds: tags.map((t) => t.id),
        positions,
        welfareDues,
        biometrics,
      },
    });
  },

  async captureVisitor(session: { churchId: string; userId: string; name?: string }, id: string) {
    const visitor = await db.visitor.findFirst({ where: { id, churchId: session.churchId } });
    if (!visitor) return;
    const person = visitor.personId ? await db.person.findFirst({ where: { id: visitor.personId } }) : null;
    await createDeletedItem(session, {
      entityType: "visitor",
      entityId: id,
      label: `${visitor.firstName} ${visitor.lastName}`.trim(),
      detail: visitor.phone ?? visitor.email ?? null,
      snapshot: { record: visitor, person },
    });
  },

  async captureGroup(session: { churchId: string; userId: string; name?: string }, id: string) {
    const group = await db.group.findFirst({ where: { id, churchId: session.churchId }, include: { members: { select: { id: true } } } });
    if (!group) return;
    const { members, ...record } = group;
    await createDeletedItem(session, {
      entityType: "group",
      entityId: id,
      label: group.name,
      detail: `${members.length} member(s)`,
      snapshot: { record, memberIds: members.map((m) => m.id) },
    });
  },

  async captureGift(session: { churchId: string; userId: string; name?: string }, id: string) {
    const gift = await db.gift.findFirst({ where: { id, churchId: session.churchId } });
    if (!gift) return;
    await createDeletedItem(session, {
      entityType: "gift",
      entityId: id,
      label: gift.donorName ?? "Anonymous gift",
      detail: `GHS ${gift.amount}`,
      snapshot: { record: gift },
    });
  },

  async capturePledge(session: { churchId: string; userId: string; name?: string }, id: string) {
    const pledge = await db.pledge.findFirst({ where: { id, churchId: session.churchId } });
    if (!pledge) return;
    const payments = await db.pledgePayment.findMany({ where: { pledgeId: id } });
    await createDeletedItem(session, {
      entityType: "pledge",
      entityId: id,
      label: pledge.donorName,
      detail: `GHS ${pledge.amount}${payments.length ? ` - ${payments.length} payment(s)` : ""}`,
      snapshot: { record: pledge, payments },
    });
  },

  async captureExpense(session: { churchId: string; userId: string; name?: string }, id: string) {
    const expense = await db.expense.findFirst({ where: { id, churchId: session.churchId } });
    if (!expense) return;
    await createDeletedItem(session, {
      entityType: "expense",
      entityId: id,
      label: expense.description,
      detail: `GHS ${expense.amount}`,
      snapshot: { record: expense },
    });
  },

  async captureEvent(session: { churchId: string; userId: string; name?: string }, id: string) {
    const event = await db.event.findFirst({ where: { id, churchId: session.churchId } });
    if (!event) return;
    const registrations = await db.registration.findMany({ where: { eventId: id } });
    await createDeletedItem(session, {
      entityType: "event",
      entityId: id,
      label: event.title,
      detail: registrations.length ? `${registrations.length} registration(s)` : null,
      snapshot: { record: event, registrations },
    });
  },

  async captureFollowUp(session: { churchId: string; userId: string; name?: string }, id: string) {
    const followUp = await db.followUp.findFirst({ where: { id, churchId: session.churchId } });
    if (!followUp) return;
    await createDeletedItem(session, {
      entityType: "followUp",
      entityId: id,
      label: followUp.title,
      detail: followUp.type,
      snapshot: { record: followUp },
    });
  },

  async capturePrayerRequest(session: { churchId: string; userId: string; name?: string }, id: string) {
    const prayerRequest = await db.prayerRequest.findFirst({ where: { id, churchId: session.churchId } });
    if (!prayerRequest) return;
    await createDeletedItem(session, {
      entityType: "prayerRequest",
      entityId: id,
      label: prayerRequest.isAnonymous ? "Anonymous request" : prayerRequest.name,
      detail: prayerRequest.request.slice(0, 80),
      snapshot: { record: prayerRequest },
    });
  },
};

/** Best-effort reconnect for an implicit m-n relation - skips any id that no
 *  longer exists (e.g. a group member who was themselves deleted since). */
async function reconnectMany(model: { update: (args: unknown) => Promise<unknown> }, id: string, field: string, ids: string[]) {
  for (const targetId of ids) {
    await model.update({ where: { id }, data: { [field]: { connect: { id: targetId } } } }).catch(() => {});
  }
}

type RestoreResult = { ok: boolean; error?: string };

const RESTORERS: Record<EntityType, (churchId: string, snapshot: any) => Promise<RestoreResult>> = {
  async person(churchId, snap) {
    const { record, departmentIds, groupIds, tagIds, positions, welfareDues, biometrics } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.person.create({ data: record });
    await reconnectMany(db.person as any, record.id, "departments", departmentIds ?? []);
    await reconnectMany(db.person as any, record.id, "groups", groupIds ?? []);
    await reconnectMany(db.person as any, record.id, "tags", tagIds ?? []);
    if (positions?.length) await db.departmentPosition.createMany({ data: positions }).catch(() => {});
    if (welfareDues?.length) await db.welfareDue.createMany({ data: welfareDues }).catch(() => {});
    if (biometrics?.length) await db.biometricCredential.createMany({ data: biometrics }).catch(() => {});
    return { ok: true };
  },

  async visitor(churchId, snap) {
    const { record, person } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    if (person) await db.person.create({ data: person }).catch(() => {});
    await db.visitor.create({ data: record });
    return { ok: true };
  },

  async group(churchId, snap) {
    const { record, memberIds } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.group.create({ data: record });
    await reconnectMany(db.group as any, record.id, "members", memberIds ?? []);
    return { ok: true };
  },

  async gift(churchId, snap) {
    const { record } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.gift.create({ data: record });
    return { ok: true };
  },

  async pledge(churchId, snap) {
    const { record, payments } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.pledge.create({ data: record });
    if (payments?.length) await db.pledgePayment.createMany({ data: payments }).catch(() => {});
    return { ok: true };
  },

  async expense(churchId, snap) {
    const { record } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.expense.create({ data: record });
    return { ok: true };
  },

  async event(churchId, snap) {
    const { record, registrations } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.event.create({ data: record });
    if (registrations?.length) await db.registration.createMany({ data: registrations }).catch(() => {});
    return { ok: true };
  },

  async followUp(churchId, snap) {
    const { record } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.followUp.create({ data: record });
    return { ok: true };
  },

  async prayerRequest(churchId, snap) {
    const { record } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.prayerRequest.create({ data: record });
    return { ok: true };
  },
};

export async function restoreItem(session: { churchId: string; userId: string }, id: string): Promise<RestoreResult> {
  const item = await db.deletedItem.findFirst({ where: { id, churchId: session.churchId } });
  if (!item) return { ok: false, error: "Already gone." };

  const restorer = RESTORERS[item.entityType as EntityType];
  if (!restorer) return { ok: false, error: "Unknown record type." };

  try {
    const result = await restorer(session.churchId, item.snapshot as any);
    if (!result.ok) return result;
  } catch {
    return { ok: false, error: "Couldn't restore - it may depend on something that's also been deleted." };
  }

  await db.deletedItem.delete({ where: { id } });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "update", entity: item.entityType, entityId: item.entityId, detail: `Restored "${item.label}" from the recycle bin` });
  return { ok: true };
}

export async function purgeItem(session: { churchId: string; userId: string }, id: string): Promise<RestoreResult> {
  const item = await db.deletedItem.findFirst({ where: { id, churchId: session.churchId } });
  if (!item) return { ok: false, error: "Already gone." };
  await db.deletedItem.delete({ where: { id } });
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "delete", entity: item.entityType, entityId: item.entityId, detail: `Permanently deleted "${item.label}" from the recycle bin` });
  return { ok: true };
}
