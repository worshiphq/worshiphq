/**
 * Helpers for bringing members in from another system. Pure functions (no database), so the same code can
 * guess the columns on the server and be unit tested.
 */
import { COLUMN_MAP, normalizeHeader } from "@/lib/import/csv";

export type FieldKey =
  | "ignore" | "extra"
  | "firstName" | "lastName" | "fullName" | "otherNames" | "title" | "gender" | "dateOfBirth" | "maritalStatus" | "weddingDate"
  | "phone" | "email" | "workPhone" | "homePhone"
  | "houseAddress" | "town" | "region" | "district" | "homeTown" | "postalAddress" | "nationality" | "nationalId"
  | "occupation" | "employer" | "previousChurch" | "specialInterest"
  | "joinedAt" | "baptized" | "memberStatus" | "department" | "group" | "oldId"
  | "emergencyName" | "emergencyPhone" | "emergencyRelation" | "notes";

export const FIELD_OPTIONS: { key: FieldKey; label: string; group: string }[] = [
  { key: "ignore", label: "Do not import", group: "Skip" },
  { key: "extra", label: "Keep as an extra detail (uses the column name)", group: "Skip" },
  { key: "fullName", label: "Full name (we split it)", group: "Name" },
  { key: "firstName", label: "First name", group: "Name" },
  { key: "lastName", label: "Last name", group: "Name" },
  { key: "otherNames", label: "Other / middle names", group: "Name" },
  { key: "title", label: "Title (Mr, Mrs, Pastor)", group: "Name" },
  { key: "gender", label: "Gender", group: "Personal" },
  { key: "dateOfBirth", label: "Date of birth", group: "Personal" },
  { key: "maritalStatus", label: "Marital status", group: "Personal" },
  { key: "weddingDate", label: "Wedding anniversary", group: "Personal" },
  { key: "nationality", label: "Nationality", group: "Personal" },
  { key: "nationalId", label: "National ID (Ghana Card)", group: "Personal" },
  { key: "phone", label: "Phone", group: "Contact" },
  { key: "email", label: "Email", group: "Contact" },
  { key: "workPhone", label: "Work phone", group: "Contact" },
  { key: "homePhone", label: "Home phone", group: "Contact" },
  { key: "houseAddress", label: "House address", group: "Address" },
  { key: "town", label: "Town / city", group: "Address" },
  { key: "region", label: "Region", group: "Address" },
  { key: "district", label: "District", group: "Address" },
  { key: "homeTown", label: "Home town", group: "Address" },
  { key: "postalAddress", label: "Postal address", group: "Address" },
  { key: "occupation", label: "Occupation", group: "Work" },
  { key: "employer", label: "Employer", group: "Work" },
  { key: "specialInterest", label: "Skills / special interest", group: "Work" },
  { key: "joinedAt", label: "Date joined the church", group: "Church" },
  { key: "memberStatus", label: "Member status (active, inactive, visitor)", group: "Church" },
  { key: "baptized", label: "Baptised (yes or no)", group: "Church" },
  { key: "department", label: "Department / ministry (several allowed)", group: "Church" },
  { key: "group", label: "Group, cell or zone (several allowed)", group: "Church" },
  { key: "previousChurch", label: "Previous church", group: "Church" },
  { key: "oldId", label: "Their old member number (kept as an extra detail)", group: "Church" },
  { key: "emergencyName", label: "Emergency contact name", group: "Emergency" },
  { key: "emergencyPhone", label: "Emergency contact phone", group: "Emergency" },
  { key: "emergencyRelation", label: "Emergency contact relationship", group: "Emergency" },
  { key: "notes", label: "Notes", group: "Other" },
];

/** More ways other systems label the same thing, on top of the standard aliases. */
const EXTRA_ALIASES: Record<string, FieldKey> = {
  name: "fullName", fullname: "fullName", "full name": "fullName", membername: "fullName", "member name": "fullName", "names": "fullName",
  "first names": "firstName", forename: "firstName", "christian name": "firstName",
  "sur name": "lastName", "last names": "lastName",
  contact: "phone", "contact number": "phone", "contact no": "phone", "phone no": "phone", "mobile no": "phone", "tel no": "phone", "tel": "phone", cellphone: "phone", whatsapp: "phone", "primary phone": "phone", "phone 1": "phone", momo: "phone",
  "e-mail": "email", mail: "email",
  sex: "gender", "d.o.b": "dateOfBirth", "d o b": "dateOfBirth", "date born": "dateOfBirth", "born": "dateOfBirth", "birth": "dateOfBirth",
  marital: "maritalStatus", "marital state": "maritalStatus", "civil status": "maritalStatus",
  "date of marriage": "weddingDate", "wedding date": "weddingDate", "marriage date": "weddingDate", anniversary: "weddingDate", "wedding anniversary": "weddingDate",
  residence: "houseAddress", "residential address": "houseAddress", "home address": "houseAddress", "street": "houseAddress", landmark: "houseAddress", "gps address": "houseAddress", "digital address": "houseAddress",
  area: "town", suburb: "town", community: "town", locality: "town",
  state: "region", province: "region",
  "date joined": "joinedAt", "joined": "joinedAt", "date of joining": "joinedAt", "member since": "joinedAt", "date of membership": "joinedAt", "membership date": "joinedAt", "registration date": "joinedAt", "date registered": "joinedAt", "date of registration": "joinedAt",
  baptised: "baptized", baptized: "baptized", "baptism": "baptized", "water baptism": "baptized", "baptised?": "baptized",
  "membership status": "memberStatus",
  dept: "department", departments: "department", "department/ministry": "department", "ministries": "department", "church department": "department", "service unit": "department",
  group: "group", groups: "group", cell: "group", "cell group": "group", "home cell": "group", zone: "group", fellowship: "group", "bible class": "group", class: "group",
  "member id": "oldId", "member no": "oldId", "member number": "oldId", "membership number": "oldId", "membership no": "oldId", "id": "oldId", "reg no": "oldId", "registration number": "oldId", "serial": "oldId", "s/n": "oldId", "no": "oldId", "no.": "oldId",
  "next of kin": "emergencyName", "next of kin name": "emergencyName", "next of kin phone": "emergencyPhone", "next of kin contact": "emergencyPhone", "next of kin relationship": "emergencyRelation", "kin": "emergencyName",
  remarks: "notes", comment: "notes", comments: "notes", note: "notes",
  "place of work": "employer", workplace: "employer", "work": "occupation", "job title": "occupation",
};

/** The best guess for what a column is, from its heading and a few of the values under it. */
export function guessField(header: string, samples: string[]): FieldKey {
  const norm = normalizeHeader(header);
  const fromStandard = COLUMN_MAP[norm] as FieldKey | undefined;
  // Our own standard names, but "status" there means member status.
  if (fromStandard) return (fromStandard as string) === "location" ? "town" : fromStandard;
  const alias = EXTRA_ALIASES[norm] ?? EXTRA_ALIASES[header.toLowerCase().trim()];
  if (alias) return alias;

  // Fall back to what the values look like.
  const vals = samples.map((s) => s.trim()).filter(Boolean);
  if (vals.length >= 2) {
    const share = (re: RegExp) => vals.filter((v) => re.test(v)).length / vals.length;
    if (share(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) >= 0.7) return "email";
    if (share(/^(\+?233|0)?[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}$/) >= 0.7) return "phone";
    if (share(/^(m|f|male|female)$/i) >= 0.8) return "gender";
    if (share(/^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})$/) >= 0.7) return "dateOfBirth";
    if (share(/^(single|married|divorced|widowed|widow|widower|separated)$/i) >= 0.7) return "maritalStatus";
    if (share(/^(yes|no|y|n|true|false)$/i) >= 0.8 && /bapt/i.test(header)) return "baptized";
  }
  return "extra";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Understands the ways people write dates, day first (as in Ghana) unless the day is obviously a month. */
export function parseDateLoose(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  // An Excel serial number (days since 1899-12-30).
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (n > 1000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000));
  }
  const ymd = raw.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (ymd) return valid(+ymd[1], +ymd[2], +ymd[3]);
  const text = raw.match(/^(\d{1,2})[\s\-\/.,]*([A-Za-z]{3,9})[\s\-\/.,]*(\d{2,4})$/);
  if (text) {
    const m = MONTHS.indexOf(text[2].slice(0, 3).toLowerCase());
    if (m >= 0) return valid(year(+text[3]), m + 1, +text[1]);
  }
  const textFirst = raw.match(/^([A-Za-z]{3,9})[\s\-\/.,]*(\d{1,2})(?:st|nd|rd|th)?[\s,\-\/.]*(\d{2,4})$/);
  if (textFirst) {
    const m = MONTHS.indexOf(textFirst[1].slice(0, 3).toLowerCase());
    if (m >= 0) return valid(year(+textFirst[3]), m + 1, +textFirst[2]);
  }
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const a = +dmy[1], b = +dmy[2], y = year(+dmy[3]);
    // Day first, unless that cannot be a day and month.
    if (b > 12 && a <= 12) return valid(y, a, b);
    return valid(y, b, a);
  }
  // A bare year: keep it as 1 July so the age comes out about right.
  if (/^(19|20)\d{2}$/.test(raw)) return valid(+raw, 7, 1);
  return null;
}

function year(y: number): number {
  if (y >= 100) return y;
  return y <= new Date().getFullYear() % 100 ? 2000 + y : 1900 + y;
}

function valid(y: number, m: number, d: number): Date | null {
  if (y < 1900 || y > new Date().getFullYear() + 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.getUTCMonth() === m - 1 ? date : null;
}

export function splitList(value: string): string[] {
  return [...new Set(value.split(/[,;\/|\n]+/).map((s) => s.trim()).filter(Boolean))];
}

export function normalizeGenderLoose(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (["m", "male", "man", "boy", "mr", "brother"].includes(t)) return "Male";
  if (["f", "female", "woman", "girl", "mrs", "miss", "ms", "sister"].includes(t)) return "Female";
  return v.trim();
}

export function normalizeMarital(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (/^s(ingle)?$|unmarried|never/.test(t)) return "Single";
  if (/^m(arried)?$|wed/.test(t)) return "Married";
  if (/divorc/.test(t)) return "Divorced";
  if (/widow/.test(t)) return "Widowed";
  if (/separat/.test(t)) return "Separated";
  return v.trim();
}

export function parseYesNo(v: string): boolean | null {
  const t = v.trim().toLowerCase();
  if (["yes", "y", "true", "1", "baptised", "baptized", "done"].includes(t)) return true;
  if (["no", "n", "false", "0", "not yet", "none"].includes(t)) return false;
  return null;
}

export function statusFromText(v: string): "active" | "visitor" | "inactive" {
  const t = v.trim().toLowerCase();
  if (/visitor|new|first/.test(t)) return "visitor";
  if (/inactive|lapsed|left|dormant|deceased|moved|transferred|backslid/.test(t)) return "inactive";
  return "active";
}

/** A full name split into first and last (the last word is the surname; everything between goes to other names). */
export function splitFullName(full: string): { firstName: string; lastName: string; otherNames: string } {
  // "Mensah, Kofi Asante" means surname first.
  if (full.includes(",")) {
    const [last, ...rest] = full.split(",");
    const given = rest.join(" ").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
    if (given.length) return { firstName: given[0], lastName: last.trim(), otherNames: given.slice(1).join(" ") };
  }
  const parts = full.trim().replace(/\s+/g, " ").replace(/^(mr|mrs|miss|ms|pastor|rev|dr|elder|deacon|bro|sis|apostle|prophet)\.?\s+/i, "").split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "", otherNames: "" };
  return { firstName: parts[0], lastName: parts[parts.length - 1], otherNames: parts.slice(1, -1).join(" ") };
}

/** A CSV that copes with quoted cells that hold commas and line breaks, and with comma, semicolon or tab separators. */
export function parseDelimited(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  // Work out the separator from the first few lines (the very first may be just a title).
  const counts = { ",": 0, ";": 0, "	": 0 } as Record<string, number>;
  for (const line of t.split(/\r?\n/).slice(0, 8)) {
    let q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
  }
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}
