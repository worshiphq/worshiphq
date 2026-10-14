import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { membersTable, parseAgeFilter, AGE_LABELS } from "@/lib/export/members";
import { hasSection } from "@/lib/permissions";
import { DATASETS } from "@/lib/export/datasets";
import { buildWorkbook, loadLogo } from "@/lib/export/workbook";

export const dynamic = "force-dynamic";

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  // Leading UTF-8 BOM so Excel (which otherwise guesses the system codepage)
  // renders accented names, the cedi sign, etc. correctly instead of mojibake.
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/export/[type]">) {
  const session = await getSession();
  if (!session || session.isDemo) return new Response("Unauthorized", { status: 401 });
  const { type } = await ctx.params;
  const churchId = session.churchId;
  const reqUrl = new URL(_req.url);
  const format = reqUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  let baseName = "export";
  let headers: string[] = [];
  let rows: unknown[][] = [];
  let sheetTitle = "Export";
  let reportTitle = "";
  let subtitle = "";

  if (type === "people" || type === "members") {
    if (!session.sections.includes("people")) return new Response("Forbidden", { status: 403 });
    const age = parseAgeFilter(reqUrl.searchParams.get("ageGroup"));
    const t = await membersTable(churchId, age);
    baseName = age === "all" ? "members" : `members-${age === "adult" ? "adults" : age === "teen" ? "teens" : "children"}`;
    sheetTitle = "Members";
    reportTitle = age === "all" ? "Members register" : `Members register: ${AGE_LABELS[age]}`;
    subtitle = `${t.rows.length} ${AGE_LABELS[age].toLowerCase()}`;
    headers = t.headers;
    rows = t.rows;
  } else if (type === "giving") {
    if (!session.sections.includes("giving")) return new Response("Forbidden", { status: 403 });
    const gifts = await db.gift.findMany({
      where: { churchId },
      orderBy: { date: "desc" },
      include: { fund: { select: { name: true } } },
    });
    baseName = "giving";
    sheetTitle = "Giving";
    reportTitle = "Giving records";
    subtitle = `${gifts.length} record${gifts.length === 1 ? "" : "s"}, ${gifts.reduce((t, g) => t + Number(g.amount), 0).toLocaleString("en-GH", { style: "currency", currency: "GHS" })}`;
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
    reportTitle = `Tithes: ${monthNames[month]} ${year}`;
    subtitle = `${gifts.length} payment${gifts.length === 1 ? "" : "s"} recorded`;
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
    // Same period + filters as the Accounting page, and every kind of money entry:
    // giving, expenses and manual entries (it used to leave expenses and old giving out).
    const { parseLedgerParams, getLedgerRows } = await import("@/lib/data/ledger");
    const parsed = parseLedgerParams(Object.fromEntries(reqUrl.searchParams.entries()));
    const ledger = await getLedgerRows(churchId, parsed.period, parsed.filters);
    baseName = `accounting-${ledger.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    sheetTitle = "Accounting";
    reportTitle = "Accounting statement";
    subtitle = `${ledger.label}, ${ledger.rows.length} entr${ledger.rows.length === 1 ? "y" : "ies"}`;
    headers = ["Date", "Description", "Type", "Category", "Fund", "Source", "Paid by", "Account", "Income", "Expense"];
    rows = ledger.rows.map((r) => [
      fmtDate(new Date(r.date)), r.description, r.amount >= 0 ? "Income" : "Expense", r.category, r.fund,
      r.source === "giving" ? "Giving" : r.source === "expense" ? "Expense record" : "Manual entry",
      r.method ?? "", r.accountId ? ledger.accounts.get(r.accountId) ?? "" : "",
      r.amount >= 0 ? r.amount.toFixed(2) : "", r.amount < 0 ? (-r.amount).toFixed(2) : "",
    ]);
    const income = ledger.rows.filter((r) => r.amount >= 0).reduce((t, r) => t + r.amount, 0);
    const spent = ledger.rows.filter((r) => r.amount < 0).reduce((t, r) => t - r.amount, 0);
    rows.push([], ["", "TOTAL", "", "", "", "", "", "", income.toFixed(2), spent.toFixed(2)], ["", "NET", "", "", "", "", "", "", (income - spent).toFixed(2), ""]);
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
    reportTitle = `Harvest ${hYear}`;
    subtitle = harvest ? harvest.title : "";
    headers = ["Date", "Name", "Type", "Phone", "Amount (GHS)", "Method"];
    if (!harvest || harvest.contributions.length === 0) {
      rows = [];
    } else {
      const total = harvest.contributions.reduce((s, c) => s + Number(c.amount), 0);
      rows = [
        ...harvest.contributions.map((c) => [
          fmtDate(c.date),
          c.envelopeCount ? `${c.donorName} (${c.envelopeCount} envelopes)` : c.donorName,
          c.donorType === "anonymous" ? "counted total" : c.donorType,
          c.donorPhone ?? "",
          Number(c.amount).toFixed(2), c.method,
        ]),
        [],
        ["", "", "", "TOTAL", total.toFixed(2), ""],
        ["", "", "", `${harvest.title} ${hYear}`, "", ""],
      ];
    }
  } else {
    // Fall back to the shared dataset registry so every tab can export without
    // duplicating query logic here.
    const ds = DATASETS.find((x) => x.key === type);
    if (!ds) return new Response("Unknown export type", { status: 404 });
    if (!hasSection(session, ds.section)) return new Response("Forbidden", { status: 403 });
    const data = await ds.fetch(churchId, { age: parseAgeFilter(reqUrl.searchParams.get("ageGroup")) });
    baseName = ds.key;
    sheetTitle = ds.label;
    reportTitle = ds.label;
    subtitle = `${data.rows.length} record${data.rows.length === 1 ? "" : "s"}`;
    headers = data.headers;
    rows = data.rows;
  }

  if (format === "xlsx") {
    const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true, accentColor: true, logoUrl: true } });
    const buf = await buildWorkbook({
      churchName: church?.name ?? "Church",
      logo: await loadLogo(church?.logoUrl),
      color: church?.accentColor,
      preparedBy: session.name || undefined,
      sheets: [{ name: sheetTitle, title: reportTitle || sheetTitle, subtitle, headers, rows }],
    });
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
