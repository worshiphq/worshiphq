import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { getSession } from "@/lib/auth";
import { hasSection } from "@/lib/permissions";
import { getChurchPlan } from "@/lib/plan-gate-server";
import { planRank } from "@/lib/plan-gate";
import { allowedDatasets, type Dataset } from "@/lib/export/datasets";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

function styleHeader(ws: ExcelJS.Worksheet, headers: string[]) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D7377" } };
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.max(12, h.length + 4);
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

async function sheetBook(
  sets: { ds: Dataset; data: { headers: string[]; rows: unknown[][] } }[],
  churchName: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WorshipHQ";
  wb.created = new Date();

  for (const { ds, data } of sets) {
    // Excel sheet names cap at 31 chars and disallow a few characters.
    const safe = ds.label.replace(/[\\/*?:[\]]/g, "").slice(0, 31);
    const ws = wb.addWorksheet(safe || ds.key);
    ws.addRow(data.headers);
    for (const r of data.rows) ws.addRow(r.map((v) => (v === null || v === undefined ? "" : v)));
    styleHeader(ws, data.headers);
  }

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet("Export");
    ws.addRow([`No data available for ${churchName}`]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function oneBook(ds: Dataset, data: { headers: string[]; rows: unknown[][] }): Promise<Buffer> {
  return sheetBook([{ ds, data }], "");
}

/**
 * Bundle export.
 *   ?format=xlsx            → one workbook, a sheet per dataset (all plans)
 *   ?format=zip[&as=csv]    → a zip of per-dataset files + the combined
 *                             workbook (Pro/Max only)
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.isDemo) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "xlsx";
  const as = url.searchParams.get("as") === "csv" ? "csv" : "xlsx";

  const plan = await getChurchPlan(session.churchId);
  const canBundle = planRank(plan) >= planRank("pro");
  if (format === "zip" && !canBundle) {
    return new Response("Separate/zipped downloads are available on Pro and Max.", { status: 403 });
  }

  const church = await db.church.findUnique({
    where: { id: session.churchId },
    select: { name: true },
  });
  const churchName = church?.name ?? "Church";
  const slug = churchName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "church";
  const stamp = new Date().toISOString().slice(0, 10);

  const sets = await Promise.all(
    allowedDatasets((key) => hasSection(session, key)).map(async (ds) => ({
      ds,
      data: await ds.fetch(session.churchId),
    })),
  );

  if (format === "zip") {
    const zip = new JSZip();
    for (const s of sets) {
      if (as === "csv") {
        zip.file(`${s.ds.key}.csv`, toCsv(s.data.headers, s.data.rows));
      } else {
        zip.file(`${s.ds.key}.xlsx`, await oneBook(s.ds, s.data));
      }
    }
    // Always include the everything-in-one workbook too.
    zip.file(`${slug}-all-data-${stamp}.xlsx`, await sheetBook(sets, churchName));
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${slug}-data-${stamp}.zip"`,
      },
    });
  }

  const buf = await sheetBook(sets, churchName);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${slug}-all-data-${stamp}.xlsx"`,
    },
  });
}
