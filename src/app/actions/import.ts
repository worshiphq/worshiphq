"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";

/**
 * Column aliases — maps common CSV header names to our Person field names.
 * All keys are lowercased, trimmed, and stripped of spaces/underscores/hyphens.
 */
const COLUMN_MAP: Record<string, string> = {
  // First name
  firstname: "firstName",
  "first name": "firstName",
  first: "firstName",
  givenname: "firstName",
  "given name": "firstName",
  // Last name
  lastname: "lastName",
  "last name": "lastName",
  surname: "lastName",
  last: "lastName",
  familyname: "lastName",
  "family name": "lastName",
  // Other names
  othernames: "otherNames",
  "other names": "otherNames",
  middlename: "otherNames",
  "middle name": "otherNames",
  // Contact
  email: "email",
  emailaddress: "email",
  "email address": "email",
  phone: "phone",
  mobile: "phone",
  mobilenumber: "phone",
  "mobile number": "phone",
  phonenumber: "phone",
  "phone number": "phone",
  telephone: "phone",
  tel: "phone",
  // Gender
  gender: "gender",
  sex: "gender",
  // Title
  title: "title",
  // Date of birth
  dateofbirth: "dateOfBirth",
  "date of birth": "dateOfBirth",
  dob: "dateOfBirth",
  birthday: "dateOfBirth",
  birthdate: "dateOfBirth",
  "birth date": "dateOfBirth",
  // Occupation
  occupation: "occupation",
  job: "occupation",
  profession: "occupation",
  // Employer
  employer: "employer",
  workplace: "employer",
  company: "employer",
  // Location fields
  region: "region",
  town: "town",
  city: "town",
  district: "district",
  hometown: "homeTown",
  "home town": "homeTown",
  houseaddress: "houseAddress",
  "house address": "houseAddress",
  address: "houseAddress",
  location: "location",
  postaladdress: "postalAddress",
  "postal address": "postalAddress",
  "p.o. box": "postalAddress",
  pobox: "postalAddress",
  // National identity
  nationality: "nationality",
  nationalid: "nationalId",
  "national id": "nationalId",
  ghanacard: "nationalId",
  "ghana card": "nationalId",
  idnumber: "nationalId",
  "id number": "nationalId",
  // Marital / church
  maritalstatus: "maritalStatus",
  "marital status": "maritalStatus",
  status: "memberStatus",
  memberstatus: "memberStatus",
  "member status": "memberStatus",
  previouschurch: "previousChurch",
  "previous church": "previousChurch",
  formerchurch: "previousChurch",
  "former church": "previousChurch",
  department: "department",
  ministry: "department",
  // Additional phones
  workphone: "workPhone",
  "work phone": "workPhone",
  officephone: "workPhone",
  "office phone": "workPhone",
  homephone: "homePhone",
  "home phone": "homePhone",
  // Special
  specialinterest: "specialInterest",
  "special interest": "specialInterest",
  skills: "specialInterest",
  interests: "specialInterest",
  // Emergency contact
  emergencyname: "emergencyName",
  "emergency name": "emergencyName",
  "emergency contact": "emergencyName",
  emergencyphone: "emergencyPhone",
  "emergency phone": "emergencyPhone",
  emergencyrelation: "emergencyRelation",
  "emergency relation": "emergencyRelation",
  "emergency relationship": "emergencyRelation",
  // Notes
  notes: "notes",
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]/g, "").replace(/\s+/g, " ");
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function tryParseDate(value: string): Date | null {
  if (!value) return null;
  // Try ISO first
  const d = new Date(value);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900) return d;
  // Try DD/MM/YYYY (common in Ghana)
  const parts = value.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    // If first part > 12, it's DD/MM/YYYY
    if (a > 12 && b <= 12) {
      const date = new Date(c < 100 ? c + 2000 : c, b - 1, a);
      if (!isNaN(date.getTime())) return date;
    }
    // Try MM/DD/YYYY
    if (a <= 12) {
      const date = new Date(c < 100 ? c + 2000 : c, a - 1, b);
      if (!isNaN(date.getTime())) return date;
    }
  }
  return null;
}

function normalizeGender(value: string): string | null {
  const v = value.toLowerCase().trim();
  if (v === "m" || v === "male") return "Male";
  if (v === "f" || v === "female") return "Female";
  return value || null;
}

function normalizeStatus(value: string): "active" | "visitor" | "inactive" {
  const v = value.toLowerCase().trim();
  if (v === "visitor" || v === "new" || v === "first timer" || v === "firsttimer") return "visitor";
  if (v === "inactive" || v === "lapsed" || v === "left") return "inactive";
  return "active";
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

export async function importCSV(formData: FormData): Promise<ImportResult> {
  const session = await requireSession();
  assertCanWrite(session);

  const file = formData.get("file") as File | null;
  if (!file || !file.name) {
    return { imported: 0, skipped: 0, errors: ["No file uploaded."], total: 0 };
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    return { imported: 0, skipped: 0, errors: ["File is empty or has no data rows."], total: 0 };
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]);
  const columnMapping: (string | null)[] = headers.map((h) => {
    const normalized = normalizeHeader(h);
    return COLUMN_MAP[normalized] ?? null;
  });

  // Check we have at least firstName or a "name" column
  const hasFirstName = columnMapping.includes("firstName");
  const hasFullName = headers.some((h) => normalizeHeader(h) === "name" || normalizeHeader(h) === "fullname" || normalizeHeader(h) === "full name");

  if (!hasFirstName && !hasFullName) {
    return {
      imported: 0,
      skipped: 0,
      errors: [`Could not find a "First Name" or "Name" column. Found columns: ${headers.join(", ")}`],
      total: lines.length - 1,
    };
  }

  // Load departments for this church (for matching by name)
  const departments = await db.department.findMany({
    where: { churchId: session.churchId },
    select: { id: true, name: true },
  });
  const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));

  // Parse data rows
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  const dataRows = lines.slice(1);

  // Cap at 5000 rows per import
  const maxRows = Math.min(dataRows.length, 5000);

  for (let i = 0; i < maxRows; i++) {
    const row = parseCSVLine(dataRows[i]);
    if (row.every((c) => !c.trim())) {
      skipped++;
      continue; // skip empty rows
    }

    // Build a field map from the row
    const fields: Record<string, string> = {};
    for (let j = 0; j < row.length; j++) {
      const col = columnMapping[j];
      if (col && row[j]?.trim()) {
        fields[col] = row[j].trim();
      }
      // Handle "name" / "full name" column — split into first/last
      const headerNorm = j < headers.length ? normalizeHeader(headers[j]) : "";
      if ((headerNorm === "name" || headerNorm === "fullname" || headerNorm === "full name") && row[j]?.trim()) {
        const parts = row[j].trim().split(/\s+/);
        if (!fields.firstName) fields.firstName = parts[0] ?? "";
        if (!fields.lastName) fields.lastName = parts.slice(1).join(" ") || (parts[0] ?? "");
      }
    }

    const firstName = fields.firstName?.trim();
    const lastName = fields.lastName?.trim();
    if (!firstName) {
      errors.push(`Row ${i + 2}: Missing first name, skipped.`);
      skipped++;
      continue;
    }

    // Resolve department
    let departmentId: string | null = null;
    if (fields.department) {
      departmentId = deptMap.get(fields.department.toLowerCase()) ?? null;
      // Create department on the fly if it doesn't exist
      if (!departmentId) {
        try {
          const newDept = await db.department.create({
            data: { churchId: session.churchId, name: fields.department },
          });
          departmentId = newDept.id;
          deptMap.set(fields.department.toLowerCase(), newDept.id);
        } catch {
          // Unique constraint — another row created it, fetch it
          const existing = await db.department.findUnique({
            where: { churchId_name: { churchId: session.churchId, name: fields.department } },
          });
          if (existing) {
            departmentId = existing.id;
            deptMap.set(fields.department.toLowerCase(), existing.id);
          }
        }
      }
    }

    // Parse dates
    const dateOfBirth = fields.dateOfBirth ? tryParseDate(fields.dateOfBirth) : null;
    let birthday: string | null = null;
    if (dateOfBirth) {
      birthday = `${String(dateOfBirth.getMonth() + 1).padStart(2, "0")}-${String(dateOfBirth.getDate()).padStart(2, "0")}`;
    }

    try {
      await db.person.create({
        data: {
          churchId: session.churchId,
          branchId: session.branchId ?? undefined,
          firstName: firstName,
          lastName: lastName || firstName,
          otherNames: fields.otherNames || null,
          email: fields.email || null,
          phone: fields.phone || null,
          gender: fields.gender ? normalizeGender(fields.gender) : null,
          title: fields.title || null,
          dateOfBirth,
          birthday,
          occupation: fields.occupation || null,
          employer: fields.employer || null,
          nationality: fields.nationality || null,
          nationalId: fields.nationalId || null,
          region: fields.region || null,
          town: fields.town || null,
          district: fields.district || null,
          homeTown: fields.homeTown || null,
          houseAddress: fields.houseAddress || null,
          postalAddress: fields.postalAddress || null,
          location: fields.location || fields.town || null,
          maritalStatus: fields.maritalStatus || null,
          previousChurch: fields.previousChurch || null,
          specialInterest: fields.specialInterest || null,
          workPhone: fields.workPhone || null,
          homePhone: fields.homePhone || null,
          emergencyName: fields.emergencyName || null,
          emergencyPhone: fields.emergencyPhone || null,
          emergencyRelation: fields.emergencyRelation || null,
          notes: fields.notes || null,
          departmentId,
          status: fields.memberStatus ? normalizeStatus(fields.memberStatus) : "active",
        },
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 2}: Failed to import ${firstName} ${lastName}.`);
      skipped++;
    }
  }

  if (dataRows.length > 5000) {
    errors.push(`Only the first 5,000 rows were imported. Your file had ${dataRows.length} rows.`);
  }

  revalidatePath("/app/people");
  revalidatePath("/app");

  return { imported, skipped, errors: errors.slice(0, 20), total: dataRows.length };
}
