/* eslint-disable @typescript-eslint/no-explicit-any -- rows and delegates are resolved dynamically from the Prisma schema */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { RECYCLE_BIN_DAYS } from "@/lib/recycle-bin-config";

/**
 * Recycle bin.
 *
 * Every delete in the app goes through `moveToBin()` first. It snapshots the
 * record AND everything that would disappear or come unlinked with it, read
 * straight from the Prisma schema so nothing is missed as models change:
 *   - rows that cascade-delete with it (e.g. a budget's lines and entries),
 *   - rows whose link to it would be set to null (e.g. gifts linked to a member),
 *   - many-to-many links (e.g. a member's departments and groups).
 * Restoring recreates the rows in dependency order inside one transaction,
 * then re-links. Items are permanently removed after RECYCLE_BIN_DAYS.
 */

export const ENTITY_LABELS: Record<string, string> = {
  person: "Member",
  baptism: "Baptism record",
  visitor: "Visitor",
  group: "Group",
  gift: "Gift",
  pledge: "Pledge",
  expense: "Expense",
  event: "Event",
  followUp: "Follow-up",
  followUpReport: "Follow-up report",
  prayerRequest: "Prayer request",
  transaction: "Transaction",
  account: "Account",
  asset: "Asset",
  attendanceSession: "Service attendance",
  automation: "Automation",
  facility: "Facility",
  booking: "Booking",
  bookingPayment: "Booking payment",
  branch: "Branch",
  budget: "Budget",
  budgetEntry: "Budget entry",
  budgetItem: "Budget line",
  counselingSession: "Counselling session",
  dayBornEntry: "Day-born entry",
  dayBornWeek: "Day-born week",
  department: "Department",
  devotional: "Devotional",
  fund: "Fund",
  harvest: "Harvest",
  harvestContribution: "Harvest contribution",
  memberCategory: "Member grouping",
  categoryOption: "Grouping option",
  notice: "Notice",
  campaign: "Pledge campaign",
  position: "Leadership position",
  volunteerSlot: "Roster slot",
  serviceRole: "Service role",
  sermon: "Sermon",
  serviceSlot: "Service time",
  customRole: "Custom role",
  teamMember: "Team member",
  testimony: "Testimony",
  volunteerAssignment: "Volunteer assignment",
  welfareDue: "Welfare dues",
  welfareRecord: "Welfare record",
};

export type BinKind = keyof typeof ENTITY_LABELS;
/** Kept for older callers. */
export type EntityType = BinKind;

type Session = { churchId: string; userId: string; name?: string };
type Row = Record<string, any>;

/* ── Schema map (built once from Prisma's runtime data model) ── */

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];
type Inbound = { child: string; from: string; to: string; onDelete: "Cascade" | "SetNull" | "Restrict" };

const MODELS = new Map<string, DmmfModel>(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const INBOUND = new Map<string, Inbound[]>();
const MANY_TO_MANY = new Map<string, string[]>();

for (const m of MODELS.values()) {
  for (const f of m.fields) {
    if (f.kind !== "object") continue;
    const from = f.relationFromFields ?? [];
    if (from.length === 1) {
      const fkField = m.fields.find((x) => x.name === from[0]);
      const action = f.relationOnDelete ?? (fkField?.isRequired ? "Restrict" : "SetNull");
      const onDelete = action === "Cascade" ? "Cascade" : action === "SetNull" ? "SetNull" : "Restrict";
      const list = INBOUND.get(f.type) ?? [];
      list.push({ child: m.name, from: from[0], to: f.relationToFields?.[0] ?? "id", onDelete });
      INBOUND.set(f.type, list);
    } else if (from.length === 0 && f.isList) {
      // Implicit many-to-many: the other side is also a list with no foreign key.
      const other = MODELS.get(f.type)?.fields.find((x) => x.relationName === f.relationName && x !== f);
      if (other?.isList && !(other.relationFromFields ?? []).length) {
        MANY_TO_MANY.set(m.name, [...(MANY_TO_MANY.get(m.name) ?? []), f.name]);
      }
    }
  }
}

function delegate(client: any, model: string) {
  return client[model.charAt(0).toLowerCase() + model.slice(1)];
}

/* ── Snapshot format ── */

type Snapshot = {
  v: 2;
  nodes: { model: string; rows: Row[] }[];
  /** Rows whose foreign key gets nulled by the delete: put the key back on restore. */
  links: { model: string; field: string; value: string; ids: string[] }[];
  /** Implicit many-to-many links (members of a group, a member's departments…). */
  m2n: { model: string; id: string; field: string; ids: string[] }[];
  extra?: Record<string, unknown>;
};

/** JSON-safe copy: Decimal → string, Date → ISO string, BigInt and bytes tagged. */
function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return { $bigint: v.toString() };
      if (v instanceof Uint8Array) return { $bytes: Buffer.from(v).toString("base64") };
      if (v && v.type === "Buffer" && Array.isArray(v.data)) return { $bytes: Buffer.from(v.data).toString("base64") };
      return v;
    }),
  );
}

/** Turn a snapshot row back into create() input for the CURRENT schema: drops
 *  columns that no longer exist, revives BigInt/bytes, and leaves null JSON
 *  columns out (Prisma won't take a bare null there). */
function revive(model: string, row: Row): Row {
  const out: Row = {};
  for (const f of MODELS.get(model)?.fields ?? []) {
    if (f.kind === "object" || !(f.name in row)) continue;
    let v = row[f.name];
    if (f.type === "Json" && v === null) continue;
    if (v && typeof v === "object" && "$bigint" in v) v = BigInt(v.$bigint);
    else if (v && typeof v === "object" && "$bytes" in v) v = Buffer.from(v.$bytes, "base64");
    out[f.name] = v;
  }
  return out;
}

const MAX_DEPTH = 5;

async function collect(model: string, where: Row, depth: number, snap: Snapshot, seen: Set<string>) {
  const found: Row[] = await delegate(db, model).findMany({ where });
  const rows = found.filter((r) => !seen.has(`${model}:${r.id}`));
  if (!rows.length) return;
  rows.forEach((r) => seen.add(`${model}:${r.id}`));
  snap.nodes.push({ model, rows });
  const ids = rows.map((r) => r.id);

  for (const field of MANY_TO_MANY.get(model) ?? []) {
    const linked: Row[] = await delegate(db, model).findMany({ where: { id: { in: ids } }, select: { id: true, [field]: { select: { id: true } } } });
    for (const r of linked) {
      if (r[field]?.length) snap.m2n.push({ model, id: r.id, field, ids: r[field].map((x: Row) => x.id) });
    }
  }

  for (const rel of INBOUND.get(model) ?? []) {
    const values = [...new Set(rows.map((r) => r[rel.to]).filter((v) => v != null))];
    if (!values.length) continue;
    if (rel.onDelete === "Cascade") {
      if (depth < MAX_DEPTH) await collect(rel.child, { [rel.from]: { in: values } }, depth + 1, snap, seen);
    } else if (rel.onDelete === "SetNull") {
      const linked: Row[] = await delegate(db, rel.child).findMany({ where: { [rel.from]: { in: values } }, select: { id: true, [rel.from]: true } });
      const byValue = new Map<string, string[]>();
      for (const r of linked) byValue.set(r[rel.from], [...(byValue.get(r[rel.from]) ?? []), r.id]);
      for (const [value, linkIds] of byValue) snap.links.push({ model: rel.child, field: rel.from, value, ids: linkIds });
    }
  }
}

function defaultDetail(row: Row, kind: string): string | null {
  const money = row.amount != null ? `GHS ${row.amount}` : null;
  switch (kind) {
    case "person": return row.status === "visitor" ? "Visitor record" : "Member";
    case "visitor": return row.phone ?? row.email ?? null;
    case "prayerRequest": return String(row.request ?? "").slice(0, 80) || null;
    case "followUp": return row.type ?? null;
    case "event": case "booking": return row.startTime ? new Date(row.startTime).toLocaleDateString("en-GB") : null;
    case "attendanceSession": return row.date ? new Date(row.date).toLocaleDateString("en-GB") : null;
    case "teamMember": return row.role ?? null;
    default: return money;
  }
}

function defaultLabel(row: Row, kind: string): string {
  if (kind === "prayerRequest" && row.isAnonymous) return "Anonymous request";
  if (kind === "gift" || kind === "pledge") return row.donorName ?? "Anonymous gift";
  if (kind === "teamMember") return row.name ?? row.email ?? row.phone ?? "Team member";
  if (row.firstName != null || row.lastName != null) return `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || ENTITY_LABELS[kind];
  return String(row.title ?? row.name ?? row.description ?? row.recipientName ?? row.donorName ?? row.position ?? row.service ?? ENTITY_LABELS[kind] ?? "Item").slice(0, 120);
}

/**
 * Snapshot a record (plus anything else the same action deletes, via
 * `alsoRoots`) into the recycle bin. Call it BEFORE the delete. Returns false
 * (and stores nothing) if the record is already gone. Never throws: a bin
 * failure must not block the delete the user asked for, so it's logged.
 */
export async function moveToBin(
  session: Session,
  kind: BinKind,
  model: Prisma.ModelName,
  id: string,
  opts: { label?: string; detail?: string | null; alsoRoots?: { model: Prisma.ModelName; id: string }[]; extra?: Record<string, unknown> } = {},
): Promise<boolean> {
  try {
    const root: Row | null = await delegate(db, model).findFirst({ where: { id } });
    if (!root) return false;
    if ("churchId" in root && root.churchId !== session.churchId) return false;

    const snap: Snapshot = { v: 2, nodes: [], links: [], m2n: [], extra: opts.extra };
    const seen = new Set<string>();
    await collect(model, { id }, 0, snap, seen);
    for (const r of opts.alsoRoots ?? []) await collect(r.model, { id: r.id }, 0, snap, seen);

    await db.deletedItem.create({
      data: {
        churchId: session.churchId,
        entityType: kind,
        entityId: id,
        label: (opts.label ?? defaultLabel(root, kind)).slice(0, 200),
        detail: (opts.detail !== undefined ? opts.detail : defaultDetail(root, kind))?.slice(0, 200) ?? null,
        snapshot: toJsonSafe(snap) as unknown as Prisma.InputJsonValue,
        deletedById: session.userId,
        deletedByName: session.name ?? null,
      },
    });
    return true;
  } catch (err) {
    console.error("[recycle-bin] capture failed", kind, id, err);
    return false;
  }
}

/** Order models so each one's parents are created first. */
function creationOrder(models: string[]): string[] {
  const set = new Set(models);
  const deps = new Map<string, Set<string>>();
  for (const m of models) deps.set(m, new Set());
  for (const parent of models) {
    for (const rel of INBOUND.get(parent) ?? []) {
      if (set.has(rel.child) && rel.child !== parent) deps.get(rel.child)!.add(parent);
    }
  }
  const out: string[] = [];
  const visiting = new Set<string>();
  const visit = (m: string) => {
    if (out.includes(m) || visiting.has(m)) return;
    visiting.add(m);
    deps.get(m)!.forEach(visit);
    visiting.delete(m);
    out.push(m);
  };
  models.forEach(visit);
  return out;
}

async function restoreSnapshot(snap: Snapshot) {
  const byModel = new Map<string, Row[]>();
  for (const n of snap.nodes) byModel.set(n.model, [...(byModel.get(n.model) ?? []), ...n.rows]);

  await db.$transaction(
    async (tx) => {
      for (const model of creationOrder([...byModel.keys()])) {
        let rows = byModel.get(model)!.map((r) => revive(model, r));
        // Self-links (e.g. a child under a parent in the same batch): create first, link after.
        const self = (INBOUND.get(model) ?? []).filter((rel) => rel.child === model);
        const pending: { id: string; field: string; value: unknown }[] = [];
        if (self.length) {
          rows = rows.map((r) => {
            const copy = { ...r };
            for (const rel of self) if (copy[rel.from] != null) { pending.push({ id: r.id, field: rel.from, value: copy[rel.from] }); copy[rel.from] = null; }
            return copy;
          });
        }
        // Skip rows that are already back (same id), but let a name/number clash
        // with a NEW row fail loudly, rather than silently skipping it.
        const existing: Row[] = await delegate(tx, model).findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true } });
        const have = new Set(existing.map((r) => r.id));
        rows = rows.filter((r) => !have.has(r.id));
        if (rows.length) await delegate(tx, model).createMany({ data: rows });
        for (const p of pending) await delegate(tx, model).updateMany({ where: { id: p.id }, data: { [p.field]: p.value } });
      }
      // Put back links that the delete set to null (only where still empty).
      for (const l of snap.links) {
        await delegate(tx, l.model).updateMany({ where: { id: { in: l.ids }, [l.field]: null }, data: { [l.field]: l.value } });
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  // Many-to-many links, one by one so a link to something since deleted is just skipped.
  for (const link of snap.m2n) {
    for (const targetId of link.ids) {
      await delegate(db, link.model).update({ where: { id: link.id }, data: { [link.field]: { connect: { id: targetId } } } }).catch(() => {});
    }
  }
}

/** Kind-specific follow-up after a restore (totals kept on parent rows etc.). */
const AFTER_RESTORE: Partial<Record<string, (churchId: string, snap: Snapshot) => Promise<void>>> = {
  async harvestContribution(_churchId, snap) {
    for (const c of snap.nodes.find((n) => n.model === "HarvestContribution")?.rows ?? []) {
      await db.harvest.update({ where: { id: c.harvestId }, data: { raised: { increment: Number(c.amount) } } }).catch(() => {});
    }
  },
  async serviceSlot(churchId, snap) {
    if (snap.extra?.turnedOffServiceTimes) await db.church.update({ where: { id: churchId }, data: { serviceTimesOn: true } });
  },
};

function friendlyRestoreError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === "P2002") return "Couldn't restore: something with the same name or number already exists. Rename or remove that one, then try again.";
  if (code === "P2003") return "Couldn't restore: it belongs to something that has also been deleted. Restore that first, then try again.";
  return "Couldn't restore - it may depend on something that's also been deleted.";
}

/* ── Older snapshots (taken before the generic engine) ── */

/** Kept so items deleted before this change can still be restored. */
export const RecycleBin = {
  capturePerson: (s: Session, id: string) => moveToBin(s, "person", "Person", id),
  captureGift: (s: Session, id: string) => moveToBin(s, "gift", "Gift", id),
  captureGroup: (s: Session, id: string) => moveToBin(s, "group", "Group", id),
  capturePledge: (s: Session, id: string) => moveToBin(s, "pledge", "Pledge", id),
  captureExpense: (s: Session, id: string) => moveToBin(s, "expense", "Expense", id),
  captureEvent: (s: Session, id: string) => moveToBin(s, "event", "Event", id),
  captureFollowUp: (s: Session, id: string) => moveToBin(s, "followUp", "FollowUp", id),
  capturePrayerRequest: (s: Session, id: string) => moveToBin(s, "prayerRequest", "PrayerRequest", id),
};

type RestoreResult = { ok: boolean; error?: string };

/** Best-effort reconnect for an implicit m-n relation - skips any id that no
 *  longer exists (e.g. a group member who was themselves deleted since). */
async function reconnectMany(model: { update: (args: unknown) => Promise<unknown> }, id: string, field: string, ids: string[]) {
  for (const targetId of ids) {
    await model.update({ where: { id }, data: { [field]: { connect: { id: targetId } } } }).catch(() => {});
  }
}


const LEGACY_RESTORERS: Record<string, (churchId: string, snapshot: any) => Promise<RestoreResult>> = {
  async person(churchId, snap) {
    const { record, departmentIds, groupIds, tagIds, positions, welfareDues, biometrics, categoryOptionIds } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.person.create({ data: record });
    await reconnectMany(db.person as any, record.id, "departments", departmentIds ?? []);
    await reconnectMany(db.person as any, record.id, "groups", groupIds ?? []);
    await reconnectMany(db.person as any, record.id, "tags", tagIds ?? []);
    await reconnectMany(db.person as any, record.id, "categoryOptions", categoryOptionIds ?? []);
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
    const { record, reports } = snap;
    if (record.churchId !== churchId) return { ok: false, error: "Church mismatch." };
    await db.followUp.create({ data: record });
    if (reports?.length) await db.followUpReport.createMany({ data: reports }).catch(() => {});
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
  const snap = item.snapshot as any;

  try {
    if (snap?.v === 2) {
      if (snap.nodes?.[0]?.rows?.[0]?.churchId && snap.nodes[0].rows[0].churchId !== session.churchId) return { ok: false, error: "Church mismatch." };
      await restoreSnapshot(snap as Snapshot);
      await AFTER_RESTORE[item.entityType]?.(session.churchId, snap as Snapshot);
    } else {
      const restorer = LEGACY_RESTORERS[item.entityType];
      if (!restorer) return { ok: false, error: "Unknown record type." };
      const result = await restorer(session.churchId, snap);
      if (!result.ok) return result;
    }
  } catch (err) {
    console.error("[recycle-bin] restore failed", item.entityType, item.entityId, err);
    return { ok: false, error: friendlyRestoreError(err) };
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

/** The moment before which anything in the bin is due to be removed. */
export function binCutoff(now = new Date()): Date {
  return new Date(now.getTime() - RECYCLE_BIN_DAYS * 24 * 60 * 60 * 1000);
}

/** Permanently remove everything that's been in the bin longer than
 *  RECYCLE_BIN_DAYS (one church, or all churches when run by the cron). */
export async function purgeExpiredBinItems(churchId?: string): Promise<{ items: number; rosters: number }> {
  const cutoff = binCutoff();
  const scope = churchId ? { churchId } : {};
  const [items, rosters] = await Promise.all([
    db.deletedItem.deleteMany({ where: { ...scope, deletedAt: { lt: cutoff } } }),
    // Roster sheets are soft-deleted in place; their slots cascade with them.
    db.volunteerRoster.deleteMany({ where: { ...scope, deletedAt: { lt: cutoff } } }),
  ]);
  return { items: items.count, rosters: rosters.count };
}
