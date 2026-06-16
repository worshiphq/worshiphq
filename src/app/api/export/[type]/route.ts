import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** CSV-escape a single value. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Export church data as CSV. /api/export/people | giving | transactions
 * Auth required; scoped to the signed-in user's church.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/export/[type]">) {
  const session = await getSession();
  if (!session || session.isDemo) return new Response("Unauthorized", { status: 401 });
  const { type } = await ctx.params;
  const churchId = session.churchId;

  let filename = "export.csv";
  let csv = "";

  if (type === "people") {
    if (!session.sections.includes("people")) return new Response("Forbidden", { status: 403 });
    const people = await db.person.findMany({
      where: { churchId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: { departments: { select: { name: true } }, branch: { select: { name: true } } },
    });
    filename = "members.csv";
    csv = toCsv(
      ["Member ID", "First Name", "Last Name", "Other Names", "Email", "Phone", "Gender", "Status", "Departments", "Branch", "Date of Birth", "Town", "Region", "Marital Status", "Joined"],
      people.map((p) => [
        p.memberId, p.firstName, p.lastName, p.otherNames, p.email, p.phone, p.gender, p.status,
        p.departments.map((d) => d.name).join("; "), p.branch?.name, p.dateOfBirth ? fmtDate(p.dateOfBirth) : "",
        p.town, p.region, p.maritalStatus, fmtDate(p.joinedAt),
      ]),
    );
  } else if (type === "giving") {
    if (!session.sections.includes("giving")) return new Response("Forbidden", { status: 403 });
    const gifts = await db.gift.findMany({
      where: { churchId },
      orderBy: { date: "desc" },
      include: { fund: { select: { name: true } } },
    });
    filename = "giving.csv";
    csv = toCsv(
      ["Date", "Donor", "Amount", "Currency", "Fund", "Method", "Recurring", "Reference"],
      gifts.map((g) => [
        fmtDate(g.date), g.donorName, Number(g.amount).toFixed(2), g.currency, g.fund?.name,
        g.method, g.recurring ? "Yes" : "No", g.reference,
      ]),
    );
  } else if (type === "transactions") {
    if (!session.sections.includes("accounting")) return new Response("Forbidden", { status: 403 });
    const txns = await db.transaction.findMany({ where: { churchId }, orderBy: { date: "desc" } });
    filename = "transactions.csv";
    csv = toCsv(
      ["Date", "Description", "Category", "Fund", "Amount"],
      txns.map((t) => [fmtDate(t.date), t.description, t.category, t.fund, Number(t.amount).toFixed(2)]),
    );
  } else {
    return new Response("Unknown export type", { status: 404 });
  }

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
