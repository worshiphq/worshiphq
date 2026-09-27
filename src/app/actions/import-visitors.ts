"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { parseCSVLine, normalizeHeader, COLUMN_MAP } from "@/lib/import/csv";
import type { ImportResult } from "./import";

/**
 * Bulk-import visitors from a CSV (e.g. a contact list exported from another
 * SMS platform) - deliberately minimal compared to the member importer: just
 * name, phone and email. No purpose/notes/photo - those stay blank, same as
 * leaving them empty on the "Add visitor" form.
 */
export async function importVisitorsCSV(formData: FormData): Promise<ImportResult> {
  const session = await requireSession();
  assertCanWrite(session);

  const file = formData.get("file") as File | null;
  if (!file || !file.name) {
    return { imported: 0, skipped: 0, errors: ["No file uploaded."], total: 0 };
  }

  // The admin's one configurable requirement: whether a row without a phone
  // number should be skipped. Name is always required - there's no visitor
  // record without one.
  const requirePhone = String(formData.get("requirePhone") ?? "") === "on";

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    return { imported: 0, skipped: 0, errors: ["File is empty or has no data rows."], total: 0 };
  }

  const headers = parseCSVLine(lines[0]);
  const columnMapping: (string | null)[] = headers.map((h) => COLUMN_MAP[normalizeHeader(h)] ?? null);

  const hasFirstName = columnMapping.includes("firstName");
  const hasFullName = headers.some((h) => ["name", "fullname", "full name"].includes(normalizeHeader(h)));
  if (!hasFirstName && !hasFullName) {
    return {
      imported: 0,
      skipped: 0,
      errors: [`Could not find a "First Name" or "Name" column. Found columns: ${headers.join(", ")}`],
      total: lines.length - 1,
    };
  }

  const dataRows = lines.slice(1);
  const maxRows = Math.min(dataRows.length, 5000);
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  const now = new Date();

  for (let i = 0; i < maxRows; i++) {
    const row = parseCSVLine(dataRows[i]);
    if (row.every((c) => !c.trim())) {
      skipped++;
      continue;
    }

    const fields: Record<string, string> = {};
    for (let j = 0; j < row.length; j++) {
      const col = columnMapping[j];
      if (col && row[j]?.trim()) fields[col] = row[j].trim();
      const headerNorm = j < headers.length ? normalizeHeader(headers[j]) : "";
      if (["name", "fullname", "full name"].includes(headerNorm) && row[j]?.trim()) {
        const parts = row[j].trim().split(/\s+/);
        if (!fields.firstName) fields.firstName = parts[0] ?? "";
        if (!fields.lastName) fields.lastName = parts.slice(1).join(" ") || "";
      }
    }

    const firstName = fields.firstName?.trim();
    const lastName = fields.lastName?.trim() || "";
    const phone = fields.phone?.trim() || null;
    const email = fields.email?.trim() || null;

    if (!firstName) {
      errors.push(`Row ${i + 2}: Missing name, skipped.`);
      skipped++;
      continue;
    }
    if (requirePhone && !phone) {
      errors.push(`Row ${i + 2}: Missing phone number, skipped.`);
      skipped++;
      continue;
    }

    try {
      const person = await db.person.create({
        data: { churchId: session.churchId, firstName, lastName, phone, email, status: "visitor" },
      });
      await db.visitor.create({
        data: {
          churchId: session.churchId,
          personId: person.id,
          firstName,
          lastName,
          phone,
          email,
          // These are backfilled from elsewhere, not a fresh walk-in today -
          // mark them already-welcomed so the follow-up automation doesn't
          // text the whole imported list as if they all just visited.
          welcomeSmsSentAt: now,
        },
      });
      imported++;
    } catch {
      errors.push(`Row ${i + 2}: Failed to import ${firstName} ${lastName}.`);
      skipped++;
    }
  }

  if (dataRows.length > 5000) {
    errors.push(`Only the first 5,000 rows were imported. Your file had ${dataRows.length} rows.`);
  }

  revalidatePath("/app/visitors");
  revalidatePath("/app/people");

  return { imported, skipped, errors: errors.slice(0, 20), total: dataRows.length };
}
