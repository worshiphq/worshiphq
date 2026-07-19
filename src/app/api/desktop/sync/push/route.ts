import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
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

// Column name mapping: SQLite snake_case → Prisma camelCase (only where the
// naive snake→camel conversion is wrong).
const COLUMN_MAP: Record<string, Record<string, string>> = {
  person: {
    church_id: "churchId", branch_id: "branchId", member_id: "memberId",
    first_name: "firstName", last_name: "lastName", other_names: "otherNames",
    photo_url: "photoUrl", joined_at: "joinedAt", custom_fields: "customFields",
    leader_title: "leaderTitle", leader_sort_order: "leaderSortOrder",
    date_of_birth: "dateOfBirth", previous_church: "previousChurch",
    date_of_membership: "dateOfMembership", place_of_birth: "placeOfBirth",
    national_id: "nationalId", house_address: "houseAddress", home_town: "homeTown",
    work_phone: "workPhone", postal_address: "postalAddress", home_phone: "homePhone",
    special_interest: "specialInterest", marital_status: "maritalStatus",
    age_group: "ageGroup", parent_id: "parentId", guardian_name: "guardianName",
    guardian_phone: "guardianPhone", emergency_name: "emergencyName",
    emergency_phone: "emergencyPhone", emergency_relation: "emergencyRelation",
    emergency_email: "emergencyEmail", emergency_address: "emergencyAddress",
    department_id: "departmentId",
  },
  gift: {
    church_id: "churchId", branch_id: "branchId", person_id: "personId",
    donor_name: "donorName", fund_id: "fundId", receipt_sent: "receiptSent",
  },
  attendance_session: {
    church_id: "churchId", branch_id: "branchId", service_name: "serviceName",
    created_at: "createdAt",
  },
  attendance_record: {
    church_id: "churchId", branch_id: "branchId", person_id: "personId",
    session_id: "sessionId", guest_name: "guestName", service_name: "serviceName",
  },
  transaction: {
    church_id: "churchId", account_id: "accountId",
  },
  church_account: {
    church_id: "churchId", bank_name: "bankName", account_number: "accountNumber",
    is_default: "isDefault", created_at: "createdAt",
  },
  fund: {
    church_id: "churchId", account_id: "accountId",
  },
  branch: {
    church_id: "churchId", is_hq: "isHQ",
  },
};

// Map from SQLite table name → Prisma model name
const TABLE_TO_MODEL: Record<string, string> = {
  person: "person",
  gift: "gift",
  attendance_session: "attendanceSession",
  attendance_record: "attendanceRecord",
  transaction: "transaction",
  fund: "fund",
  department: "department",
  department_position: "departmentPosition",
  event: "event",
  visitor: "visitor",
  expense: "expense",
  harvest: "harvest",
  harvest_contribution: "harvestContribution",
  day_born_week: "dayBornWeek",
  day_born_entry: "dayBornEntry",
  follow_up: "followUp",
  prayer_request: "prayerRequest",
  church_notice: "churchNotice",
  sermon: "sermon",
  asset: "asset",
  budget: "budget",
  budget_item: "budgetItem",
  volunteer_roster: "volunteerRoster",
  volunteer_slot: "volunteerSlot",
  volunteer_assignment: "volunteerAssignment",
  facility: "facility",
  booking: "booking",
  custom_role: "customRole",
  welfare_record: "welfareRecord",
  devotional: "devotional",
  testimony: "testimony",
  counseling_session: "counselingSession",
  pledge: "pledge",
  campaign: "campaign",
  communication: "communication",
  automation: "automation",
  household: "household",
  group: "group",
  branch: "branch",
  reminder: "reminder",
  church_account: "churchAccount",
  church: "church",
  user: "user",
};

const REVERSE_RENAMES: Record<string, string> = {
  trigger_type: "trigger",
};

// Fields the desktop is never allowed to overwrite (server-managed).
const PROTECTED_FIELDS: Record<string, string[]> = {
  church: ["smsCredits", "isDemo", "suspended", "slug"],
  user: ["role"], // role changes for existing users go through the web; inserts keep their role below
};

/* ── Prisma schema metadata: field types per model, for coercion + stripping ── */
interface FieldMeta { type: string; isList: boolean }
const MODEL_FIELDS: Record<string, Map<string, FieldMeta>> = {};
for (const m of Prisma.dmmf.datamodel.models) {
  const name = m.name.charAt(0).toLowerCase() + m.name.slice(1);
  MODEL_FIELDS[name] = new Map(
    m.fields
      .filter((f) => f.kind === "scalar" || f.kind === "enum")
      .map((f) => [f.name, { type: f.type, isList: f.isList }]),
  );
}

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Coerce SQLite representations to what Prisma expects. */
function coerceValue(field: FieldMeta, value: any): any {
  if (value === null || value === undefined) return value;
  if (field.isList) {
    // SQLite stores lists as JSON strings (e.g. custom_role.sections)
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* fall through */ }
    }
    return value;
  }
  switch (field.type) {
    case "Json": {
      // SQLite holds Json columns as TEXT. Writing that raw string into a
      // Prisma Json column stores a JSON *string scalar* rather than the
      // object/array — which silently breaks every reader (this corrupted
      // the church form-builder definitions once). Always parse first.
      if (typeof value !== "string") return value;
      const s = value.trim();
      if (!s) return value;
      try {
        return JSON.parse(s);
      } catch {
        return value; // genuinely a plain string value
      }
    }
    case "Boolean":
      if (typeof value === "number") return value !== 0;
      if (typeof value === "string") return value === "1" || value === "true";
      return value;
    case "DateTime": {
      if (value instanceof Date) return value;
      const s = String(value);
      let iso = s;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = `${s}T00:00:00.000Z`; // date-only
      else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(s)) iso = s.replace(" ", "T") + "Z"; // SQLite datetime('now')
      const d = new Date(iso);
      return isNaN(d.getTime()) ? value : d;
    }
    case "Int":
    case "BigInt": {
      const n = typeof value === "string" ? parseInt(value, 10) : value;
      return Number.isFinite(n) ? Math.trunc(n as number) : value;
    }
    case "Float":
    case "Decimal": {
      const n = typeof value === "string" ? parseFloat(value) : value;
      return Number.isFinite(n) ? n : value;
    }
    default:
      return value;
  }
}

/**
 * Map a desktop row to Prisma data: rename columns, drop unknown fields
 * (e.g. desktop-only columns like volunteer_assignment.person_id), drop
 * server-managed fields, and coerce types (0/1 booleans, SQLite dates,
 * JSON-string lists).
 */
function mapColumns(table: string, model: string, data: Record<string, any>): Record<string, any> {
  const mapping = COLUMN_MAP[table] || {};
  const fields = MODEL_FIELDS[model];
  const protectedFields = new Set(PROTECTED_FIELDS[table] ?? []);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "created_at" || key === "updated_at") continue;
    const renamed = REVERSE_RENAMES[key] || key;
    const mapped = mapping[renamed] || toCamelCase(renamed);
    if (protectedFields.has(mapped)) continue;
    const field = fields?.get(mapped);
    if (!field) continue; // unknown to Prisma — desktop-only column, drop it
    result[mapped] = coerceValue(field, value);
  }
  return result;
}

export async function POST(req: Request) {
  const auth = verifyToken(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { changes } = await req.json();
    let applied = 0;
    // Per-change outcome, aligned with the input array, so the client only
    // marks successfully applied changes as synced.
    const results: { ok: boolean; error?: string }[] = [];

    for (const change of changes) {
      const { table, recordId, action, data } = change;
      const model = TABLE_TO_MODEL[table];
      const prismaModel = model ? (db as any)[model] : null;
      if (!model || !prismaModel) {
        results.push({ ok: false, error: `unknown table ${table}` });
        continue;
      }
      const hasChurchId = MODEL_FIELDS[model]?.has("churchId") ?? false;

      try {
        if (table === "church" && recordId !== auth.cid) {
          results.push({ ok: false, error: "cross-tenant church write rejected" });
          continue;
        }

        if (action === "delete") {
          // Tenant-scoped delete: never allow deleting another church's rows.
          if (table === "church") {
            results.push({ ok: false, error: "church delete not allowed" });
            continue;
          }
          if (hasChurchId) {
            await prismaModel.deleteMany({ where: { id: recordId, churchId: auth.cid } });
          } else {
            await prismaModel.deleteMany({ where: { id: recordId } });
          }
          applied++;
          results.push({ ok: true });
        } else if (action === "insert") {
          const mapped = mapColumns(table, model, data);
          if (hasChurchId) mapped.churchId = auth.cid; // enforce tenant, never trust client
          if (table === "user") await prepareUserWrite(mapped, true);
          await prismaModel.upsert({
            where: { id: recordId },
            create: { id: recordId, ...mapped },
            update: mapped,
          });
          applied++;
          results.push({ ok: true });
        } else if (action === "update") {
          const mapped = mapColumns(table, model, data);
          delete mapped.id;
          if (hasChurchId) delete mapped.churchId; // can't be moved between tenants
          if (table === "user") await prepareUserWrite(mapped, false);
          if (table === "church") {
            await db.church.update({ where: { id: auth.cid }, data: mapped });
          } else if (hasChurchId) {
            await prismaModel.updateMany({ where: { id: recordId, churchId: auth.cid }, data: mapped });
          } else {
            await prismaModel.update({ where: { id: recordId }, data: mapped });
          }
          applied++;
          results.push({ ok: true });
        } else {
          results.push({ ok: false, error: `unknown action ${action}` });
        }
      } catch (err: any) {
        console.error(`[sync:push] Failed to apply ${action} on ${table}/${recordId}:`, err?.message);
        results.push({ ok: false, error: err?.message?.slice(0, 200) ?? "unknown error" });
      }
    }

    return NextResponse.json({ applied, total: changes.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: "Push failed" }, { status: 500 });
  }
}

/**
 * Desktop "invite teammate" stores the raw temp password in password_hash.
 * Hash it properly before it touches the database; never accept an empty one.
 */
async function prepareUserWrite(mapped: Record<string, any>, isInsert: boolean) {
  const pw = mapped.passwordHash;
  if (typeof pw === "string" && pw.length > 0 && !pw.startsWith("$2")) {
    mapped.passwordHash = await hashPassword(pw);
  } else if (!isInsert) {
    // Never overwrite an existing hash with empty/unknown material on update.
    delete mapped.passwordHash;
  }
}
