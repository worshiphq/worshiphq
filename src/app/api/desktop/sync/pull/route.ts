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

function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
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
  dateField: string = "createdAt"
) {
  const where: any = { churchId };
  where[dateField] = { gte: sinceDate };
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

    const batches = await Promise.all([
      pullTable(db.person, "person", churchId, sinceDate, "joinedAt"),
      pullTable(db.department, "department", churchId, sinceDate),
      pullTable(db.fund, "fund", churchId, sinceDate),
      pullTable(db.gift, "gift", churchId, sinceDate, "date"),
      pullTable(db.attendanceSession, "attendance_session", churchId, sinceDate),
      pullTable(db.attendanceRecord, "attendance_record", churchId, sinceDate, "date"),
      pullTable(db.event, "event", churchId, sinceDate, "startsAt"),
      pullTable(db.visitor, "visitor", churchId, sinceDate),
      pullTable(db.expense, "expense", churchId, sinceDate),
      pullTable(db.transaction, "transaction", churchId, sinceDate, "date"),
      pullTable(db.branch, "branch", churchId, sinceDate),
      pullTable(db.group, "group", churchId, sinceDate),
      pullTable(db.harvest, "harvest", churchId, sinceDate),
      pullTable(db.harvestContribution, "harvest_contribution", churchId, sinceDate),
      pullTable(db.followUp, "follow_up", churchId, sinceDate),
      pullTable(db.prayerRequest, "prayer_request", churchId, sinceDate),
      pullTable(db.churchNotice, "church_notice", churchId, sinceDate),
      pullTable(db.sermon, "sermon", churchId, sinceDate),
      pullTable(db.asset, "asset", churchId, sinceDate),
      pullTable(db.budget, "budget", churchId, sinceDate),
      pullTable(db.volunteerRoster, "volunteer_roster", churchId, sinceDate),
      pullTable(db.booking, "booking", churchId, sinceDate),
      pullTable(db.welfareRecord, "welfare_record", churchId, sinceDate),
      pullTable(db.devotional, "devotional", churchId, sinceDate),
      pullTable(db.testimony, "testimony", churchId, sinceDate),
      pullTable(db.counselingSession, "counseling_session", churchId, sinceDate),
      pullTable(db.pledge, "pledge", churchId, sinceDate),
      pullTable(db.communication, "communication", churchId, sinceDate),
      pullTable(db.automation, "automation", churchId, sinceDate),
      pullTable(db.auditLog, "audit_log", churchId, sinceDate),
    ]);

    for (const batch of batches) {
      changes.push(...batch);
    }

    // Also pull users for this church (needed for audit display, etc.)
    const users = await db.user.findMany({
      where: { churchId },
      select: { id: true, churchId: true, email: true, name: true, role: true, phone: true, photoUrl: true },
    });
    for (const u of users) {
      changes.push({ table: "user", recordId: u.id, action: "upsert", data: toSnakeCase(u as any) });
    }

    return NextResponse.json({ changes, count: changes.length });
  } catch (err: any) {
    console.error("[sync:pull]", err);
    return NextResponse.json({ error: "Pull failed" }, { status: 500 });
  }
}
