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

// Column name mapping: SQLite snake_case → Prisma camelCase
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
    church_id: "churchId",
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
};

const REVERSE_RENAMES: Record<string, string> = {
  trigger_type: "trigger",
};

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function mapColumns(table: string, data: Record<string, any>): Record<string, any> {
  const mapping = COLUMN_MAP[table] || {};
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "created_at" || key === "updated_at") continue;
    const renamed = REVERSE_RENAMES[key] || key;
    const mapped = mapping[renamed] || toCamelCase(renamed);
    result[mapped] = value;
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

    for (const change of changes) {
      const { table, recordId, action, data } = change;
      const model = TABLE_TO_MODEL[table];
      if (!model) continue;

      const prismaModel = (db as any)[model];
      if (!prismaModel) continue;

      try {
        if (action === "delete") {
          await prismaModel.delete({ where: { id: recordId } }).catch(() => {});
        } else if (action === "insert") {
          const mapped = mapColumns(table, data);
          mapped.churchId = mapped.churchId || auth.cid;
          await prismaModel.upsert({
            where: { id: recordId },
            create: mapped,
            update: mapped,
          });
        } else if (action === "update") {
          const mapped = mapColumns(table, data);
          delete mapped.id;
          await prismaModel.update({
            where: { id: recordId },
            data: mapped,
          }).catch(() => {});
        }
        applied++;
      } catch (err) {
        console.error(`[sync:push] Failed to apply ${action} on ${table}/${recordId}:`, err);
      }
    }

    return NextResponse.json({ applied, total: changes.length });
  } catch (err: any) {
    return NextResponse.json({ error: "Push failed" }, { status: 500 });
  }
}
