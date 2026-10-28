"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { churchInitials } from "@/lib/members/helpers";
import { phoneKey } from "@/lib/search";
import { audit } from "@/lib/audit";
import { getAgeConfig } from "@/lib/data/age";
import { ageOf, groupForAge } from "@/lib/age";
import {
  FIELD_OPTIONS, guessField, parseDateLoose, parseDelimited, splitList, splitFullName,
  normalizeGenderLoose, normalizeMarital, parseYesNo, statusFromText, type FieldKey,
} from "@/lib/import/smart";

const MAX_ROWS = 20000;
const MAX_BYTES = 12 * 1024 * 1024;

type Table = { headers: string[]; rows: string[][] };

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return cellText(o.result as ExcelJS.CellValue);
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text ?? "");
    if ("hyperlink" in o) return String(o.text ?? o.hyperlink ?? "");
    return "";
  }
  return String(v).trim();
};

/** Read a CSV, TSV, TXT or Excel file into a header row and data rows. Leading title rows are skipped. */
async function readTable(file: File): Promise<Table | { error: string }> {
  if (!file || !file.name) return { error: "Choose a file first." };
  if (file.size > MAX_BYTES) return { error: "That file is too large. Please keep it under 12 MB, or split it in two." };
  const name = file.name.toLowerCase();
  let grid: string[][] = [];

  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await file.arrayBuffer() as unknown as ArrayBuffer);
    } catch {
      return { error: "We could not open that Excel file. Try saving it again as .xlsx, or as a CSV." };
    }
    const sheet = wb.worksheets.find((w) => w.actualRowCount > 1) ?? wb.worksheets[0];
    if (!sheet) return { error: "That Excel file has no sheets." };
    const width = Math.min(sheet.actualColumnCount || sheet.columnCount || 1, 80);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
      grid.push(cells);
    });
  } else if (name.endsWith(".xls")) {
    return { error: "Old .xls files cannot be read. Open it in Excel and choose Save As, then .xlsx or .csv." };
  } else {
    grid = parseDelimited(await file.text());
  }

  grid = grid.filter((r) => r.some((c) => c !== ""));
  if (grid.length < 2) return { error: "The file is empty or has no rows under the headings." };
  // The real header row is the first one with at least two filled cells (skips a title line).
  const h = Math.max(0, grid.findIndex((r) => r.filter((c) => c !== "").length >= 2));
  const headers = grid[h].map((x, i) => x || `Column ${i + 1}`);
  const rows = grid.slice(h + 1).map((r) => headers.map((_, i) => (r[i] ?? "").trim()));
  return { headers, rows: rows.slice(0, MAX_ROWS) };
}

export type AnalysedFile = {
  ok: true;
  fileName: string;
  headers: string[];
  samples: string[][]; // per column, up to 4 example values
  guess: FieldKey[];
  totalRows: number;
  truncated: boolean;
} | { ok: false; error: string };

/** Open the file, show what is in it, and guess what each column is. */
export async function analyseImportFile(formData: FormData): Promise<AnalysedFile> {
  const session = await requireSession();
  assertCanWrite(session, "people");
  const t = await readTable(formData.get("file") as File);
  if ("error" in t) return { ok: false, error: t.error };
  const samples = t.headers.map((_, c) => t.rows.map((r) => r[c]).filter(Boolean).slice(0, 4));
  const guess = t.headers.map((h, c) => guessField(h, t.rows.slice(0, 25).map((r) => r[c] ?? "")));
  // Two columns should not both claim to be the same single-value field.
  const single = new Set<FieldKey>(["firstName", "lastName", "fullName", "dateOfBirth", "email", "gender", "maritalStatus", "title", "joinedAt", "weddingDate", "baptized", "memberStatus", "nationalId"]);
  const seen = new Set<FieldKey>();
  guess.forEach((g, i) => { if (single.has(g)) { if (seen.has(g)) guess[i] = "extra"; else seen.add(g); } });
  // A full name column makes separate first and last name columns unnecessary, and the other way round.
  if (guess.includes("firstName") && guess.includes("fullName")) guess[guess.indexOf("fullName")] = "extra";
  return { ok: true, fileName: (formData.get("file") as File).name, headers: t.headers, samples, guess, totalRows: t.rows.length, truncated: t.rows.length >= MAX_ROWS };
}

export type ImportOptions = { mapping: FieldKey[]; onDuplicate: "skip" | "fill" | "add"; dryRun: boolean; offset: number; limit: number };
export type ImportChunk = {
  ok: true;
  dryRun: boolean;
  processed: number;
  created: number;
  filled: number;
  duplicates: number;
  skipped: number;
  errors: string[];
  nextOffset: number | null;
} | { ok: false; error: string };

const clean = (v: string | undefined, max = 200) => (v ?? "").trim().slice(0, max);
const cleanPhone = (v: string) => v.replace(/[\s\-().]/g, "").slice(0, 20);

/**
 * Import a slice of the file (the screen calls this again and again for a big file). Nothing is written in a
 * practice run. People already in WorshipHQ are found by phone number, email, or name and date of birth.
 */
export async function importMembersChunk(formData: FormData): Promise<ImportChunk> {
  const session = await requireSession();
  assertCanWrite(session, "people");
  if (session.isDemo) return { ok: false, error: "Read-only demo." };
  let opts: ImportOptions;
  try { opts = JSON.parse(String(formData.get("options") ?? "{}")); } catch { return { ok: false, error: "Bad options." }; }
  const valid = new Set(FIELD_OPTIONS.map((f) => f.key));
  if (!Array.isArray(opts.mapping) || opts.mapping.some((m) => !valid.has(m))) return { ok: false, error: "The column match is not valid. Please start again." };

  const t = await readTable(formData.get("file") as File);
  if ("error" in t) return { ok: false, error: t.error };
  const has = (k: FieldKey) => opts.mapping.includes(k);
  if (!has("firstName") && !has("fullName")) return { ok: false, error: "Tell us which column holds the name (a full name, or a first name)." };

  const offset = Math.max(0, Math.floor(opts.offset) || 0);
  const limit = Math.min(500, Math.max(1, Math.floor(opts.limit) || 250));
  const slice = t.rows.slice(offset, offset + limit);
  const churchId = session.churchId;

  const [church, existing, departments, groups, ageCfg] = await Promise.all([
    db.church.findUnique({ where: { id: churchId }, select: { name: true, memberPrefix: true, memberSeq: true } }),
    db.person.findMany({ where: { churchId }, select: { id: true, firstName: true, lastName: true, phone: true, email: true, dateOfBirth: true } }),
    db.department.findMany({ where: { churchId }, select: { id: true, name: true } }),
    db.group.findMany({ where: { churchId }, select: { id: true, name: true } }),
    getAgeConfig(churchId),
  ]);
  const prefix = church?.memberPrefix || churchInitials(church?.name ?? "Church");
  let seq = church?.memberSeq ?? 0;

  const byPhone = new Map<string, string>(), byEmail = new Map<string, string>(), byName = new Map<string, string>();
  for (const p of existing) {
    if (p.phone) byPhone.set(phoneKey(p.phone), p.id);
    if (p.email) byEmail.set(p.email.toLowerCase(), p.id);
    if (p.dateOfBirth) byName.set(`${p.firstName} ${p.lastName}`.toLowerCase() + "|" + p.dateOfBirth.toISOString().slice(0, 10), p.id);
  }
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
  const groupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]));

  const res = { created: 0, filled: 0, duplicates: 0, skipped: 0, errors: [] as string[] };
  // The plan's member limit: add up to the places left, then stop adding members.
  const { memberRoom } = await import("@/lib/member-limit");
  let room = (await memberRoom(churchId)).left;
  let limitHit = 0;
  const plain: Prisma.PersonCreateManyInput[] = [];
  const fancy: { data: Prisma.PersonCreateInput; label: string }[] = [];
  const toFill: { id: string; data: Record<string, unknown>; deptIds: string[]; groupIds: string[] }[] = [];

  const resolve = async (kind: "department" | "group", names: string[]): Promise<string[]> => {
    const map = kind === "department" ? deptByName : groupByName;
    const ids: string[] = [];
    for (const n of names) {
      let id = map.get(n.toLowerCase());
      if (!id && !opts.dryRun) {
        const made = kind === "department"
          ? await db.department.create({ data: { churchId, name: n.slice(0, 80) } }).catch(() => db.department.findFirst({ where: { churchId, name: n } }))
          : await db.group.create({ data: { churchId, name: n.slice(0, 80), type: "small_group" } });
        id = made?.id;
        if (id) map.set(n.toLowerCase(), id);
      }
      if (id) ids.push(id);
    }
    return ids;
  };

  for (let i = 0; i < slice.length; i++) {
    const row = slice[i];
    const line = offset + i + 2;
    const get = (k: FieldKey) => { const idx = opts.mapping.indexOf(k); return idx >= 0 ? clean(row[idx], 500) : ""; };
    const all = (k: FieldKey) => opts.mapping.flatMap((m, idx) => (m === k && row[idx] ? [clean(row[idx], 500)] : []));

    let firstName = get("firstName"), lastName = get("lastName"), otherNames = get("otherNames");
    if (get("fullName")) {
      const s = splitFullName(get("fullName"));
      firstName = firstName || s.firstName; lastName = lastName || s.lastName; otherNames = otherNames || s.otherNames;
    }
    if (!firstName) { res.skipped++; if (row.some(Boolean)) res.errors.push(`Row ${line}: no name, skipped.`); continue; }

    const dob = parseDateLoose(get("dateOfBirth"));
    if (get("dateOfBirth") && !dob) res.errors.push(`Row ${line}: could not read the date of birth "${get("dateOfBirth")}", left blank.`);
    const wedding = parseDateLoose(get("weddingDate"));
    const joined = parseDateLoose(get("joinedAt"));
    const phone = get("phone") ? cleanPhone(get("phone")) : "";
    const email = get("email").toLowerCase();

    // Is this person already here?
    const dupId =
      (phone && phoneKey(phone).length >= 9 ? byPhone.get(phoneKey(phone)) : undefined) ??
      (email ? byEmail.get(email) : undefined) ??
      (dob ? byName.get(`${firstName} ${lastName}`.toLowerCase() + "|" + dob.toISOString().slice(0, 10)) : undefined);

    const extras: Record<string, string> = {};
    opts.mapping.forEach((m, idx) => { if (m === "extra" && row[idx]) extras[clean(t.headers[idx], 60)] = clean(row[idx], 300); });
    if (get("oldId")) extras["Old member number"] = get("oldId");

    const age = ageOf(dob);
    const base = {
      firstName: firstName.slice(0, 60), lastName: (lastName || "").slice(0, 60), otherNames: otherNames || null,
      title: get("title") || null, gender: get("gender") ? normalizeGenderLoose(get("gender")) : null,
      dateOfBirth: dob, birthday: dob ? `${String(dob.getUTCMonth() + 1).padStart(2, "0")}-${String(dob.getUTCDate()).padStart(2, "0")}` : null,
      maritalStatus: get("maritalStatus") ? normalizeMarital(get("maritalStatus")) : null,
      weddingDate: wedding, anniversary: wedding ? `${String(wedding.getUTCMonth() + 1).padStart(2, "0")}-${String(wedding.getUTCDate()).padStart(2, "0")}` : null,
      phone: phone || null, email: email || null, workPhone: get("workPhone") || null, homePhone: get("homePhone") || null,
      houseAddress: get("houseAddress") || null, town: get("town") || null, region: get("region") || null, district: get("district") || null,
      homeTown: get("homeTown") || null, postalAddress: get("postalAddress") || null, nationality: get("nationality") || null, nationalId: get("nationalId") || null,
      occupation: get("occupation") || null, employer: get("employer") || null, previousChurch: get("previousChurch") || null, specialInterest: get("specialInterest") || null,
      baptized: get("baptized") ? parseYesNo(get("baptized")) : null,
      emergencyName: get("emergencyName") || null, emergencyPhone: get("emergencyPhone") || null, emergencyRelation: get("emergencyRelation") || null,
      notes: get("notes") || null,
      location: get("town") || get("region") || null,
    };
    const deptNames = all("department").flatMap(splitList), groupNames = all("group").flatMap(splitList);

    if (dupId) {
      res.duplicates++;
      if (opts.onDuplicate === "skip") continue;
      if (opts.onDuplicate === "fill") {
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(base)) if (v !== null && v !== "" && k !== "firstName" && k !== "lastName") data[k] = v;
        toFill.push({ id: dupId, data, deptIds: await resolve("department", deptNames), groupIds: await resolve("group", groupNames) });
        continue;
      }
      // "add": create another record anyway
    }

    const status = get("memberStatus") ? statusFromText(get("memberStatus")) : "active";
    if (status !== "visitor") {
      if (room <= 0) { limitHit++; res.skipped++; continue; }
      room--;
    }
    const record = {
      ...base,
      status,
      ...(joined ? { joinedAt: joined, dateOfMembership: joined } : {}),
      ...(age !== null && age <= ageCfg.teenMax ? { ageGroup: groupForAge(age, ageCfg) } : {}),
      ...(Object.keys(extras).length ? { customFields: extras as unknown as Prisma.InputJsonValue } : {}),
    };

    seq++;
    const memberId = `${prefix}-${String(seq).padStart(4, "0")}`;
    if (deptNames.length || groupNames.length) {
      const deptIds = await resolve("department", deptNames), groupIds = await resolve("group", groupNames);
      fancy.push({
        label: `${firstName} ${lastName}`.trim(),
        data: {
          church: { connect: { id: churchId } }, memberId, ...record,
          ...(session.branchId ? { branch: { connect: { id: session.branchId } } } : {}),
          ...(deptIds.length ? { departments: { connect: deptIds.map((id) => ({ id })) } } : {}),
          ...(groupIds.length ? { groups: { connect: groupIds.map((id) => ({ id })) } } : {}),
        },
      });
    } else {
      plain.push({ churchId, branchId: session.branchId ?? undefined, memberId, ...record } as Prisma.PersonCreateManyInput);
    }
    // Remember them so a repeat later in the file is seen as a duplicate.
    const tempId = `new-${line}`;
    if (phone) byPhone.set(phoneKey(phone), tempId);
    if (email) byEmail.set(email, tempId);
    if (dob) byName.set(`${firstName} ${lastName}`.toLowerCase() + "|" + dob.toISOString().slice(0, 10), tempId);
  }

  if (limitHit) {
    res.errors.unshift(`${limitHit} ${limitHit === 1 ? "person was" : "people were"} not added because your plan's member limit was reached. Upgrade in Settings, Billing to add them.`);
  }
  res.created = plain.length + fancy.length;
  res.filled = toFill.length;

  if (!opts.dryRun) {
    if (plain.length) await db.person.createMany({ data: plain });
    for (let i = 0; i < fancy.length; i += 8) {
      await Promise.all(fancy.slice(i, i + 8).map((f) => db.person.create({ data: f.data }).catch(() => { res.created--; res.errors.push(`Could not add ${f.label}.`); })));
    }
    if (toFill.length) {
      // "Fill the gaps": only fields that are empty on the existing record are filled in; nothing is overwritten.
      const current = await db.person.findMany({ where: { id: { in: toFill.map((f) => f.id) }, churchId } });
      const byId = new Map(current.map((p) => [p.id, p as unknown as Record<string, unknown>]));
      for (const f of toFill) {
        const now = byId.get(f.id);
        if (!now) { res.filled--; continue; }
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(f.data)) {
          const have = now[k];
          if (have === null || have === undefined || have === "") data[k] = v;
        }
        await db.person.update({
          where: { id: f.id },
          data: {
            ...data,
            ...(f.deptIds.length ? { departments: { connect: f.deptIds.map((id) => ({ id })) } } : {}),
            ...(f.groupIds.length ? { groups: { connect: f.groupIds.map((id) => ({ id })) } } : {}),
          } as Prisma.PersonUpdateInput,
        }).catch(() => { res.filled--; });
      }
    }
    if (res.created > 0) await db.church.update({ where: { id: churchId }, data: { memberSeq: seq, memberPrefix: prefix } });
    revalidatePath("/app/people");
    revalidatePath("/app");
  }

  const done = offset + slice.length >= t.rows.length;
  if (done && !opts.dryRun) await audit(session, "create", "person", `Imported members from ${(formData.get("file") as File).name}`);
  return { ok: true, dryRun: opts.dryRun, processed: slice.length, ...res, errors: res.errors.slice(0, 30), nextOffset: done ? null : offset + slice.length };
}
