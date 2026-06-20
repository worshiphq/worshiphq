import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFormDefinition } from "@/lib/forms/registration";

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
    const [people, church] = await Promise.all([
      db.person.findMany({
        where: { churchId },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        include: { departments: { select: { name: true } }, branch: { select: { name: true } } },
      }),
      db.church.findUnique({ where: { id: churchId }, select: { registrationFields: true } }),
    ]);
    filename = "members.csv";

    // Custom-field columns come from the church's form definition.
    const customLabels = getFormDefinition(church?.registrationFields ?? null)
      .filter((f) => !f.system && f.id !== "department")
      .map((f) => f.label);

    const headers = [
      "Member ID", "First Name", "Last Name", "Other Names", "Email", "Phone", "Gender", "Title",
      "Date of Birth", "Marital Status", "Occupation", "Employer", "Previous Church", "Date of Membership",
      "Place of Birth", "Nationality", "Country", "Region", "District", "Town", "Home Town",
      "National ID", "House Address", "Postal Address", "Work Phone", "Home Phone", "Special Interest",
      "Baptized", "Departments", "Branch", "Status",
      "Emergency Name", "Emergency Phone", "Emergency Relation", "Emergency Email", "Emergency Address",
      "Notes", "Joined",
      ...customLabels,
    ];
    csv = toCsv(
      headers,
      people.map((p) => {
        const cf = (p.customFields as Record<string, string> | null) ?? {};
        return [
          p.memberId, p.firstName, p.lastName, p.otherNames, p.email, p.phone, p.gender, p.title,
          p.dateOfBirth ? fmtDate(p.dateOfBirth) : "", p.maritalStatus, p.occupation, p.employer,
          p.previousChurch, p.dateOfMembership ? fmtDate(p.dateOfMembership) : "", p.placeOfBirth,
          p.nationality, p.country, p.region, p.district, p.town, p.homeTown, p.nationalId,
          p.houseAddress, p.postalAddress, p.workPhone, p.homePhone, p.specialInterest,
          p.baptized === true ? "Yes" : p.baptized === false ? "No" : "",
          p.departments.map((d) => d.name).join("; "), p.branch?.name, p.status,
          p.emergencyName, p.emergencyPhone, p.emergencyRelation, p.emergencyEmail, p.emergencyAddress,
          p.notes, fmtDate(p.joinedAt),
          ...customLabels.map((l) => cf[l] ?? ""),
        ];
      }),
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
  } else if (type === "tithes") {
    if (!session.sections.includes("giving") && !session.sections.includes("accounting"))
      return new Response("Forbidden", { status: 403 });
    const url = new URL(_req.url);
    const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
    const month = Number(url.searchParams.get("month") ?? new Date().getMonth());
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    const titheFund = await db.fund.findFirst({
      where: { churchId, name: { equals: "Tithes", mode: "insensitive" } },
    });
    const gifts = titheFund
      ? await db.gift.findMany({
          where: { churchId, fundId: titheFund.id, date: { gte: startOfMonth, lte: endOfMonth } },
          orderBy: { date: "asc" },
          include: { person: { select: { firstName: true, lastName: true, phone: true } } },
        })
      : [];

    filename = `tithes-${monthNames[month]}-${year}.csv`;

    const total = gifts.reduce((s, g) => s + Number(g.amount), 0);

    csv = toCsv(
      ["Date", "Name", "Phone", "Amount (GHS)", "Method", "Receipt Sent"],
      [
        ...gifts.map((g) => [
          fmtDate(g.date),
          g.person ? `${g.person.firstName} ${g.person.lastName}` : g.donorName,
          g.person?.phone ?? "",
          Number(g.amount).toFixed(2),
          g.method,
          g.receiptSent ? "Yes" : "No",
        ]),
        [],
        ["", "", "TOTAL", total.toFixed(2), "", ""],
        ["", "", `Report: ${monthNames[month]} ${year}`, "", "", ""],
      ],
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
