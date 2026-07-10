import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "node:crypto";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-insecure-secret-change-me";

function verifyToken(authHeader: string | null): { uid: string; cid: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return { uid: payload.uid, cid: payload.cid };
  } catch {
    return null;
  }
}

const COLUMN_RENAMES: Record<string, string> = {
  trigger: "trigger_type",
  is_h_q: "is_hq",
};

function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    let snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    if (COLUMN_RENAMES[snakeKey]) snakeKey = COLUMN_RENAMES[snakeKey];
    if (value instanceof Date) {
      result[snakeKey] = value.toISOString();
    } else if (typeof value === "bigint") {
      result[snakeKey] = Number(value);
    } else if (typeof value === "object" && value !== null && typeof (value as any).toNumber === "function") {
      // Prisma Decimal — JSON.stringify would produce a quoted string that
      // poisons SQLite numeric columns.
      result[snakeKey] = (value as any).toNumber();
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[snakeKey] = JSON.stringify(value);
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}

// Full-snapshot pull. Date filters were removed deliberately: they made
// updates to old rows (and backdated inserts) invisible to the desktop
// forever. Church-scale data is small enough to pull whole tables, and the
// client uses the snapshot to reconcile server-side deletions too.
async function pullTable(
  model: any,
  table: string,
  churchId: string,
  _sinceDate?: Date,
  _dateField?: string | null,
) {
  const rows = await model.findMany({ where: { churchId } });
  return rows.map((r: any) => ({
    table,
    recordId: r.id,
    action: "upsert" as const,
    data: toSnakeCase(r as any),
  }));
}

export async function GET(req: Request) {
  const auth = verifyToken(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since") || "1970-01-01T00:00:00Z";
  const sinceDate = new Date(since);
  const churchId = auth.cid;

  try {
    const changes: Array<{ table: string; recordId: string; action: string; data: any }> = [];

    // Always pull the church record (no date filter — settings can change anytime)
    const church = await db.church.findUnique({ where: { id: churchId } });
    if (church) {
      changes.push({ table: "church", recordId: church.id, action: "upsert", data: toSnakeCase(church as any) });
    }

    const batches = await Promise.all([
      pullTable(db.person, "person", churchId, sinceDate, null),
      pullTable(db.department, "department", churchId, sinceDate),
      pullTable(db.departmentPosition, "department_position", churchId, sinceDate),
      pullTable(db.customRole, "custom_role", churchId, sinceDate),
      pullTable(db.churchAccount, "church_account", churchId, sinceDate),
      pullTable(db.fund, "fund", churchId, sinceDate, null),
      pullTable(db.gift, "gift", churchId, sinceDate, "date"),
      pullTable(db.attendanceSession, "attendance_session", churchId, sinceDate, null),
      pullTable(db.attendanceRecord, "attendance_record", churchId, sinceDate, "date"),
      pullTable(db.event, "event", churchId, sinceDate, "startsAt"),
      pullTable(db.visitor, "visitor", churchId, sinceDate),
      pullTable(db.expense, "expense", churchId, sinceDate),
      pullTable(db.transaction, "transaction", churchId, sinceDate, "date"),
      pullTable(db.branch, "branch", churchId, sinceDate),
      pullTable(db.group, "group", churchId, sinceDate),
      pullTable(db.harvest, "harvest", churchId, sinceDate),
      pullTable(db.harvestContribution, "harvest_contribution", churchId, sinceDate, "date"),
      pullTable(db.dayBornWeek, "day_born_week", churchId, sinceDate),
      pullTable(db.followUp, "follow_up", churchId, sinceDate),
      pullTable(db.prayerRequest, "prayer_request", churchId, sinceDate),
      pullTable(db.churchNotice, "church_notice", churchId, sinceDate),
      pullTable(db.sermon, "sermon", churchId, sinceDate),
      pullTable(db.asset, "asset", churchId, sinceDate),
      pullTable(db.budget, "budget", churchId, sinceDate),
      pullTable(db.volunteerRoster, "volunteer_roster", churchId, sinceDate),
      pullTable(db.facility, "facility", churchId, sinceDate),
      pullTable(db.booking, "booking", churchId, sinceDate),
      pullTable(db.welfareRecord, "welfare_record", churchId, sinceDate),
      pullTable(db.devotional, "devotional", churchId, sinceDate),
      pullTable(db.testimony, "testimony", churchId, sinceDate),
      pullTable(db.counselingSession, "counseling_session", churchId, sinceDate),
      pullTable(db.pledge, "pledge", churchId, sinceDate, null),
      pullTable(db.campaign, "campaign", churchId, sinceDate, null),
      pullTable(db.communication, "communication", churchId, sinceDate),
      pullTable(db.automation, "automation", churchId, sinceDate, null),
      pullTable(db.auditLog, "audit_log", churchId, sinceDate).then(async (rows) => {
        const userMap = new Map<string, string>();
        const users = await db.user.findMany({ where: { churchId }, select: { id: true, name: true } });
        for (const u of users) userMap.set(u.id, u.name);
        return rows.map((r: any) => ({ ...r, data: { ...r.data, user_name: userMap.get(r.data.user_id) || null } }));
      }),
      pullTable(db.household, "household", churchId, sinceDate, null),
      pullTable(db.volunteerAssignment, "volunteer_assignment", churchId, sinceDate, null),
      pullTable(db.reminder, "reminder", churchId, sinceDate, null),
    ]);

    for (const batch of batches) {
      changes.push(...batch);
    }

    // Pull users (no password hash)
    const users = await db.user.findMany({
      where: { churchId },
      select: { id: true, churchId: true, email: true, name: true, role: true, phone: true, photoUrl: true, customRoleId: true, branchId: true, personId: true },
    });
    for (const u of users) {
      changes.push({ table: "user", recordId: u.id, action: "upsert", data: toSnakeCase(u as any) });
    }

    // Pull junction tables (no churchId filter — filter via parent)
    const personIds = changes.filter(c => c.table === "person").map(c => c.recordId);
    if (personIds.length > 0) {
      const personDepts = await db.person.findMany({
        where: { churchId },
        select: { id: true, departments: { select: { id: true } } },
      });
      for (const p of personDepts) {
        for (const d of p.departments) {
          changes.push({
            table: "person_department",
            recordId: `${p.id}_${d.id}`,
            action: "upsert",
            data: { person_id: p.id, department_id: d.id },
          });
        }
      }
    }

    // Pull group members
    const groups = await db.group.findMany({
      where: { churchId },
      select: { id: true, members: { select: { id: true } } },
    });
    for (const g of groups) {
      for (const m of g.members) {
        changes.push({
          table: "group_member",
          recordId: `${g.id}_${m.id}`,
          action: "upsert",
          data: { group_id: g.id, person_id: m.id },
        });
      }
    }

    // Child tables — always pulled in full so items added under old parents sync.
    const items = await db.budgetItem.findMany({ where: { churchId } });
    for (const i of items) {
      changes.push({ table: "budget_item", recordId: i.id, action: "upsert", data: toSnakeCase(i as any) });
    }

    const slots = await db.volunteerSlot.findMany({ where: { churchId } });
    for (const s of slots) {
      changes.push({ table: "volunteer_slot", recordId: s.id, action: "upsert", data: toSnakeCase(s as any) });
    }

    const entries = await db.dayBornEntry.findMany({ where: { week: { churchId } } });
    for (const e of entries) {
      changes.push({ table: "day_born_entry", recordId: e.id, action: "upsert", data: toSnakeCase(e as any) });
    }

    // Every table listed here was pulled as a COMPLETE snapshot: the client
    // may delete local rows that are absent from this pull (unless they have
    // pending unsynced changes). Junction tables are excluded — their rows
    // use synthetic ids.
    const fullTables = [
      "church", "person", "department", "department_position", "custom_role",
      "church_account", "fund", "gift", "attendance_session", "attendance_record",
      "event", "visitor", "expense", "transaction", "branch", "group", "harvest",
      "harvest_contribution", "day_born_week", "day_born_entry", "follow_up",
      "prayer_request", "church_notice", "sermon", "asset", "budget", "budget_item",
      "volunteer_roster", "volunteer_slot", "volunteer_assignment", "facility",
      "booking", "welfare_record", "devotional", "testimony", "counseling_session",
      "pledge", "campaign", "communication", "automation", "household", "reminder",
      "user",
    ];

    return NextResponse.json({ changes, count: changes.length, fullTables });
  } catch (err: any) {
    console.error("[sync:pull]", err?.message || err, err?.stack);
    return NextResponse.json({ error: "Pull failed", detail: err?.message || String(err) }, { status: 500 });
  }
}
