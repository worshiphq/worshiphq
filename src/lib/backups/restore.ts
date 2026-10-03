import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { MODELS, BY_NAME, whereFor, readTable, replacer, type DModel } from "./snapshot";
import { readBackup, createBackup } from "./run";

type Row = Record<string, unknown>;
type Snap = { meta: { churchId: string; createdAt: string }; tables: Record<string, Row[]> };

// A restore never touches these: sign-in accounts, billing and money movement,
// SMS credits (on the Church row), message history and activity logs.
const NEVER_RESTORE = new Set([
  "Church", "User", "Subscription", "PlanPayment", "RefundRequest", "PaymentRequest", "Coupon",
  "SmsTransaction", "Transaction", "AuditLog", "DeletedItem", "Communication", "CommunicationRecipient",
  "ChurchBackup", "BiometricCredential", "PhoneVerification",
]);

const SUMMARY_LABELS: [string, string][] = [
  ["Person", "people"], ["Department", "departments"], ["Group", "groups"], ["Visitor", "visitors"],
  ["AttendanceSession", "services"], ["AttendanceRecord", "attendance records"], ["Gift", "gifts"],
  ["Fund", "funds"], ["Pledge", "pledges"], ["Event", "events"], ["Expense", "expenses"],
  ["PrayerRequest", "prayer requests"], ["FollowUp", "follow-ups"], ["Sermon", "sermons"], ["Automation", "automations"],
];

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Parents before children, so foreign keys line up. */
function insertOrder(names: string[]): string[] {
  const set = new Set(names);
  const deps = new Map<string, Set<string>>();
  for (const n of names) {
    const d = new Set<string>();
    for (const f of BY_NAME.get(n)!.fields) {
      if (f.kind === "object" && (f.relationFromFields?.length ?? 0) > 0 && f.type !== n && set.has(f.type)) d.add(f.type);
    }
    deps.set(n, d);
  }
  const out: string[] = [];
  const done = new Set<string>();
  while (out.length < names.length) {
    const ready = names.filter((n) => !done.has(n) && [...deps.get(n)!].every((p) => done.has(p)));
    for (const n of ready.length ? ready : names.filter((n) => !done.has(n))) { out.push(n); done.add(n); }
  }
  return out;
}

function revive(model: DModel, row: Row, forUpdate = false): Row {
  const out: Row = {};
  for (const f of model.fields) {
    if (f.kind === "object" || !(f.name in row)) continue;
    if (forUpdate && f.isId) continue;
    const v = row[f.name];
    if (v === null && f.type === "Json") {
      if (forUpdate) out[f.name] = Prisma.DbNull;
      continue;
    }
    out[f.name] = v && typeof v === "object" && "__bytes" in (v as Row) ? Buffer.from(String((v as Row).__bytes), "base64") : v;
  }
  return out;
}

async function load(backupId: string, churchId: string): Promise<Snap> {
  const b = await readBackup(backupId);
  if (!b || b.churchId !== churchId) throw new Error("Backup not found.");
  const snap = JSON.parse(b.json.toString("utf8")) as Snap;
  if (snap.meta.churchId !== churchId) throw new Error("This backup belongs to a different church.");
  return snap;
}

/** A short "what's in this backup" list, e.g. 90 people, 12 departments. */
export async function summarizeBackup(backupId: string, churchId: string) {
  const snap = await load(backupId, churchId);
  return SUMMARY_LABELS
    .map(([model, label]) => ({ label, count: snap.tables[model]?.length ?? 0 }))
    .filter((x) => x.count > 0);
}

type TableDiff = { name: string; missing: Row[]; changed: Row[]; extra: unknown[] };

/** Compare the backup to the church's data right now, table by table. */
async function diff(snap: Snap, churchId: string): Promise<TableDiff[]> {
  const jobs = MODELS.filter((m) => !NEVER_RESTORE.has(m.name) && m.fields.some((f) => f.isId) && whereFor(m, churchId));
  const out: TableDiff[] = [];
  await pool(jobs, 6, async (model) => {
    const idField = model.fields.find((f) => f.isId)!.name;
    const where = whereFor(model, churchId)!;
    const current = await readTable(model, where);
    const snapRows = snap.tables[model.name] ?? [];
    const curById = new Map(current.map((r) => [String(r[idField]), r]));
    const snapIds = new Set(snapRows.map((r) => String(r[idField])));

    const missing = snapRows.filter((r) => !curById.has(String(r[idField])));
    const extra = current.filter((r) => !snapIds.has(String(r[idField]))).map((r) => r[idField]);
    const changed = snapRows.filter((r) => {
      const c = curById.get(String(r[idField]));
      if (!c) return false;
      // Only compare columns the backup knows about, so a column added since doesn't flag every row.
      const cc = Object.fromEntries(Object.keys(r).map((k) => [k, c[k]]));
      return JSON.stringify(cc, replacer) !== JSON.stringify(r);
    });
    if (missing.length || changed.length || extra.length) out.push({ name: model.name, missing, changed, extra });
  });
  return out;
}

export async function planRestore(backupId: string, churchId: string) {
  const snap = await load(backupId, churchId);
  const d = await diff(snap, churchId);
  const sum = (k: "missing" | "changed" | "extra") => d.reduce((s, t) => s + t[k].length, 0);
  return {
    backupDate: snap.meta.createdAt,
    add: sum("missing"),
    revert: sum("changed"),
    remove: sum("extra"),
  };
}

/** Make the church's data exactly what it was in the backup. A safety backup of
 *  the current data is taken first, so the restore itself can be undone. */
export async function applyRestore(backupId: string, churchId: string) {
  const snap = await load(backupId, churchId);

  const safety = await createBackup(churchId, "pre-restore");
  if (!safety.ok) throw new Error(`Could not save a safety copy of your current data first, so nothing was changed. (${safety.error})`);

  const d = await diff(snap, churchId);
  const order = insertOrder(d.map((t) => t.name));
  const byName = new Map(d.map((t) => [t.name, t]));
  const del = (name: string) =>
    (db as unknown as Record<string, { deleteMany: (a: unknown) => Promise<{ count: number }> }>)[name.charAt(0).toLowerCase() + name.slice(1)];
  const add = (name: string) =>
    (db as unknown as Record<string, { createMany: (a: unknown) => Promise<{ count: number }>; create: (a: unknown) => Promise<unknown>; update: (a: unknown) => Promise<unknown> }>)[
      name.charAt(0).toLowerCase() + name.slice(1)
    ];

  let removed = 0, reverted = 0, added = 0, skipped = 0;

  // 1) Remove what was created since the backup, children first.
  for (const name of [...order].reverse()) {
    const t = byName.get(name)!;
    const idField = BY_NAME.get(name)!.fields.find((f) => f.isId)!.name;
    for (let i = 0; i < t.extra.length; i += 500) {
      const ids = t.extra.slice(i, i + 500);
      try {
        removed += (await del(name).deleteMany({ where: { [idField]: { in: ids } } })).count;
      } catch {
        for (const id of ids) {
          try { removed += (await del(name).deleteMany({ where: { [idField]: id } })).count; } catch { skipped++; }
        }
      }
    }
  }

  // 2) Put edited records back the way they were.
  for (const name of order) {
    const t = byName.get(name)!;
    const model = BY_NAME.get(name)!;
    const idField = model.fields.find((f) => f.isId)!.name;
    await pool(t.changed, 8, async (row) => {
      try {
        await add(name).update({ where: { [idField]: row[idField] }, data: revive(model, row, true) });
        reverted++;
      } catch { skipped++; }
    });
  }

  // 3) Bring back what was deleted, parents first.
  for (const name of order) {
    const t = byName.get(name)!;
    if (!t.missing.length) continue;
    const model = BY_NAME.get(name)!;
    const rows = t.missing.map((r) => revive(model, r));
    try {
      added += (await add(name).createMany({ data: rows, skipDuplicates: true })).count;
    } catch {
      for (const r of rows) {
        try { await add(name).create({ data: r }); added++; } catch { skipped++; }
      }
    }
  }

  return { removed, reverted, added, skipped };
}

