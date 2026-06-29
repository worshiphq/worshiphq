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

// Prisma camelCase → SQLite snake_case for the desktop client
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

    // Pull all records updated after `since` for the church.
    // For tables without `updatedAt`, we use `createdAt`.
    // On first sync (since = epoch), this pulls everything.

    const people = await db.person.findMany({
      where: { churchId, joinedAt: { gte: sinceDate } },
    });
    for (const p of people) {
      changes.push({ table: "person", recordId: p.id, action: "upsert", data: toSnakeCase(p as any) });
    }

    const departments = await db.department.findMany({
      where: { churchId, createdAt: { gte: sinceDate } },
    });
    for (const d of departments) {
      changes.push({ table: "department", recordId: d.id, action: "upsert", data: toSnakeCase(d as any) });
    }

    const funds = await db.fund.findMany({ where: { churchId } });
    for (const f of funds) {
      changes.push({ table: "fund", recordId: f.id, action: "upsert", data: toSnakeCase(f as any) });
    }

    const gifts = await db.gift.findMany({
      where: { churchId, date: { gte: sinceDate } },
    });
    for (const g of gifts) {
      changes.push({ table: "gift", recordId: g.id, action: "upsert", data: toSnakeCase(g as any) });
    }

    const sessions = await db.attendanceSession.findMany({
      where: { churchId, createdAt: { gte: sinceDate } },
    });
    for (const s of sessions) {
      changes.push({ table: "attendance_session", recordId: s.id, action: "upsert", data: toSnakeCase(s as any) });
    }

    const records = await db.attendanceRecord.findMany({
      where: { churchId, date: { gte: sinceDate } },
    });
    for (const r of records) {
      changes.push({ table: "attendance_record", recordId: r.id, action: "upsert", data: toSnakeCase(r as any) });
    }

    const events = await db.event.findMany({
      where: { churchId, startsAt: { gte: sinceDate } },
    });
    for (const e of events) {
      changes.push({ table: "event", recordId: e.id, action: "upsert", data: toSnakeCase(e as any) });
    }

    const visitors = await db.visitor.findMany({
      where: { churchId, createdAt: { gte: sinceDate } },
    });
    for (const v of visitors) {
      changes.push({ table: "visitor", recordId: v.id, action: "upsert", data: toSnakeCase(v as any) });
    }

    const expenses = await db.expense.findMany({
      where: { churchId, createdAt: { gte: sinceDate } },
    });
    for (const e of expenses) {
      changes.push({ table: "expense", recordId: e.id, action: "upsert", data: toSnakeCase(e as any) });
    }

    const transactions = await db.transaction.findMany({
      where: { churchId, date: { gte: sinceDate } },
    });
    for (const t of transactions) {
      changes.push({ table: "transaction", recordId: t.id, action: "upsert", data: toSnakeCase(t as any) });
    }

    const branches = await db.branch.findMany({
      where: { churchId, createdAt: { gte: sinceDate } },
    });
    for (const b of branches) {
      changes.push({ table: "branch", recordId: b.id, action: "upsert", data: toSnakeCase(b as any) });
    }

    return NextResponse.json({ changes, count: changes.length });
  } catch (err: any) {
    console.error("[sync:pull]", err);
    return NextResponse.json({ error: "Pull failed" }, { status: 500 });
  }
}
