import type { NextRequest } from "next/server";
import JSZip from "jszip";
import { getSession } from "@/lib/auth";
import { hasSection } from "@/lib/permissions";
import { getChurchPlan } from "@/lib/plan-gate-server";
import { planRank } from "@/lib/plan-gate";
import { allowedDatasets, type Dataset } from "@/lib/export/datasets";
import { db } from "@/lib/db";
import { buildWorkbook } from "@/lib/export/workbook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers: string[], rows: unknown[][]): string {
  // Leading UTF-8 BOM so Excel renders accented names, the cedi sign, etc.
  // correctly instead of mojibake (it otherwise guesses the system codepage).
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

async function sheetBook(
  sets: { ds: Dataset; data: { headers: string[]; rows: unknown[][] } }[],
  church: { name: string; color?: string | null; preparedBy?: string },
): Promise<Buffer> {
  return buildWorkbook({
    churchName: church.name,
    color: church.color,
    preparedBy: church.preparedBy,
    contents: true,
    sheets: sets.map(({ ds, data }) => ({
      name: ds.label,
      title: ds.label,
      subtitle: `${data.rows.length} record${data.rows.length === 1 ? "" : "s"}`,
      headers: data.headers,
      rows: data.rows,
    })),
  });
}

async function oneBook(ds: Dataset, data: { headers: string[]; rows: unknown[][] }, church: { name: string; color?: string | null; preparedBy?: string }): Promise<Buffer> {
  return sheetBook([{ ds, data }], church);
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
    select: { name: true, accentColor: true },
  });
  const churchName = church?.name ?? "Church";
  const branding = { name: churchName, color: church?.accentColor, preparedBy: session.name || undefined };
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
        zip.file(`${s.ds.key}.xlsx`, await oneBook(s.ds, s.data, branding));
      }
    }
    // Always include the everything-in-one workbook too.
    zip.file(`${slug}-all-data-${stamp}.xlsx`, await sheetBook(sets, branding));
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${slug}-data-${stamp}.zip"`,
      },
    });
  }

  const buf = await sheetBook(sets, branding);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${slug}-all-data-${stamp}.xlsx"`,
    },
  });
}
