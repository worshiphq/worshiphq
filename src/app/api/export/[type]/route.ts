import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFormDefinition } from "@/lib/forms/registration";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

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

async function toXlsx(title: string, headers: string[], rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WorshipHQ";
  const ws = wb.addWorksheet(title);
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (const row of rows) {
    if (row.length === 0) continue;
    ws.addRow(row.map((v) => (v === null || v === undefined ? "" : v)));
  }
  headers.forEach((_, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(12, headers[i].length + 4);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/export/[type]">) {
  const session = await getSession();
  if (!session || session.isDemo) return new Response("Unauthorized", { status: 401 });
  const { type } = await ctx.params;
  const churchId = session.churchId;
  const reqUrl = new URL(_req.url);
  const format = reqUrl.searchParams.get("format") ?? "csv";

  let baseName = "export";
  let headers: string[] = [];
  let rows: unknown[][] = [];
  let sheetTitle = "Export";

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
    baseName = "members";
    sheetTitle = "Members";

    const customLabels = getFormDefinition(church?.registrationFields ?? null)
      .filter((f) => !f.system && f.id !== "department")
      .map((f) => f.label);

    headers = [
      "Member ID", "First Name", "Last Name", "Other Names", "Email", "Phone", "Gender", "Title",
      "Date of Birth", "Marital Status", "Occupation", "Employer", "Previous Church", "Date of Membership",
      "Place of Birth", "Nationality", "Country", "Region", "District", "Town", "Home Town",
      "National ID", "House Address", "Postal Address", "Work Phone", "Home Phone", "Special Interest",
      "Baptized", "Departments", "Status",
      "Emergency Name", "Emergency Phone", "Emergency Relation", "Emergency Email", "Emergency Address",
      "Notes", "Joined",
      ...customLabels,
    ];
    rows = people.map((p) => {
      const cf = (p.customFields as Record<string, string> | null) ?? {};
      return [
        p.memberId, p.firstName, p.lastName, p.otherNames, p.email, p.phone, p.gender, p.title,
        p.dateOfBirth ? fmtDate(p.dateOfBirth) : "", p.maritalStatus, p.occupation, p.employer,
        p.previousChurch, p.dateOfMembership ? fmtDate(p.dateOfMembership) : "", p.placeOfBirth,
        p.nationality, p.country, p.region, p.district, p.town, p.homeTown, p.nationalId,
        p.houseAddress, p.postalAddress, p.workPhone, p.homePhone, p.specialInterest,
        p.baptized === true ? "Yes" : p.baptized === false ? "No" : "",
        p.departments.map((d) => d.name).join("; "), p.status,
        p.emergencyName, p.emergencyPhone, p.emergencyRelation, p.emergencyEmail, p.emergencyAddress,
        p.notes, fmtDate(p.joinedAt),
        ...customLabels.map((l) => cf[l] ?? ""),
      ];
    });
  } else if (type === "giving") {
    if (!session.sections.includes("giving")) return new Response("Forbidden", { status: 403 });
    const gifts = await db.gift.findMany({
      where: { churchId },
      orderBy: { date: "desc" },
      include: { fund: { select: { name: true } } },
    });
    baseName = "giving";
    sheetTitle = "Giving";
    headers = ["Date", "Donor", "Amount", "Currency", "Fund", "Method", "Recurring", "Reference"];
    rows = gifts.map((g) => [
      fmtDate(g.date), g.donorName, Number(g.amount).toFixed(2), g.currency, g.fund?.name,
      g.method, g.recurring ? "Yes" : "No", g.reference,
    ]);
  } else if (type === "tithes") {
    if (!session.sections.includes("giving") && !session.sections.includes("accounting"))
      return new Response("Forbidden", { status: 403 });
    const year = Number(reqUrl.searchParams.get("year") ?? new Date().getFullYear());
    const month = Number(reqUrl.searchParams.get("month") ?? new Date().getMonth());
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

    baseName = `tithes-${monthNames[month]}-${year}`;
    sheetTitle = `Tithes ${monthNames[month]} ${year}`;
    headers = ["Date", "Name", "Phone", "Amount (GHS)", "Method", "Receipt Sent"];
    const total = gifts.reduce((s, g) => s + Number(g.amount), 0);
    rows = [
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
    ];
  } else if (type === "transactions") {
    if (!session.sections.includes("accounting")) return new Response("Forbidden", { status: 403 });
    const txYear = Number(reqUrl.searchParams.get("year")) || undefined;
    const txMonth = reqUrl.searchParams.get("month") != null ? Number(reqUrl.searchParams.get("month")) : undefined;
    const txWhere: Record<string, unknown> = { churchId };
    if (txYear != null && txMonth != null) {
      txWhere.date = { gte: new Date(txYear, txMonth, 1), lte: new Date(txYear, txMonth + 1, 0, 23, 59, 59, 999) };
    }
    const txns = await db.transaction.findMany({ where: txWhere, orderBy: { date: "desc" } });
    const txGifts = (txYear != null && txMonth != null)
      ? await db.gift.findMany({
          where: { churchId, date: txWhere.date as object },
          orderBy: { date: "desc" },
          include: { fund: { select: { name: true } } },
        })
      : [];
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    baseName = txYear && txMonth != null ? `accounting-${monthNames[txMonth]}-${txYear}` : "transactions";
    sheetTitle = "Transactions";
    headers = ["Date", "Description", "Category", "Fund", "Amount", "Source"];
    rows = [
      ...txns.map((t) => [fmtDate(t.date), t.description, t.category, t.fund ?? "General", Number(t.amount).toFixed(2), "Manual"]),
      ...txGifts.map((g) => [fmtDate(g.date), `${g.donorName ?? "Anonymous"} — ${g.fund?.name ?? "Gift"}`, g.fund?.name ?? "Giving", g.fund?.name ?? "General", Number(g.amount).toFixed(2), "Giving"]),
    ];
  } else if (type === "harvest") {
    if (!session.sections.includes("harvest") && !session.sections.includes("giving"))
      return new Response("Forbidden", { status: 403 });
    const hYear = Number(reqUrl.searchParams.get("year") ?? new Date().getFullYear());
    const harvest = await db.harvest.findUnique({
      where: { churchId_year: { churchId, year: hYear } },
      include: {
        contributions: {
          orderBy: { date: "asc" },
          include: { person: { select: { firstName: true, lastName: true, phone: true } } },
        },
      },
    });
    baseName = `harvest-${hYear}`;
    sheetTitle = `Harvest ${hYear}`;
    headers = ["Date", "Name", "Type", "Phone", "Amount (GHS)", "Method"];
    if (!harvest || harvest.contributions.length === 0) {
      rows = [];
    } else {
      const total = harvest.contributions.reduce((s, c) => s + Number(c.amount), 0);
      rows = [
        ...harvest.contributions.map((c) => [
          fmtDate(c.date), c.donorName, c.donorType, c.donorPhone ?? "",
          Number(c.amount).toFixed(2), c.method,
        ]),
        [],
        ["", "", "", "TOTAL", total.toFixed(2), ""],
        ["", "", "", `${harvest.title} ${hYear}`, "", ""],
      ];
    }
  } else {
    return new Response("Unknown export type", { status: 404 });
  }

  if (format === "xlsx") {
    const buf = await toXlsx(sheetTitle, headers, rows);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${baseName}.xlsx"`,
      },
    });
  }

  const csv = toCsv(headers, rows);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${baseName}.csv"`,
    },
  });
}
