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
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[snakeKey] = JSON.stringify(value);
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}

async function pullTable(
  model: any,
  table: string,
  churchId: string,
  sinceDate: Date,
  dateField: string | null = "createdAt"
) {
  const where: any = { churchId };
  if (dateField) {
    where[dateField] = { gte: sinceDate };
  }
  const rows = await model.findMany({ where });
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
      pullTable(db.auditLog, "audit_log", churchId, sinceDate),
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

    // Pull child tables that use parent FK, not churchId
    const budgetIds = changes.filter(c => c.table === "budget").map(c => c.recordId);
    if (budgetIds.length > 0) {
      const items = await db.budgetItem.findMany({ where: { churchId } });
      for (const i of items) {
        changes.push({ table: "budget_item", recordId: i.id, action: "upsert", data: toSnakeCase(i as any) });
      }
    }

    const rosterIds = changes.filter(c => c.table === "volunteer_roster").map(c => c.recordId);
    if (rosterIds.length > 0) {
      const slots = await db.volunteerSlot.findMany({ where: { churchId } });
      for (const s of slots) {
        changes.push({ table: "volunteer_slot", recordId: s.id, action: "upsert", data: toSnakeCase(s as any) });
      }
    }

    const weekIds = changes.filter(c => c.table === "day_born_week").map(c => c.recordId);
    if (weekIds.length > 0) {
      const entries = await db.dayBornEntry.findMany({ where: { weekId: { in: weekIds } } });
      for (const e of entries) {
        changes.push({ table: "day_born_entry", recordId: e.id, action: "upsert", data: toSnakeCase(e as any) });
      }
    }

    return NextResponse.json({ changes, count: changes.length });
  } catch (err: any) {
    console.error("[sync:pull]", err?.message || err, err?.stack);
    return NextResponse.json({ error: "Pull failed", detail: err?.message || String(err) }, { status: 500 });
  }
}
