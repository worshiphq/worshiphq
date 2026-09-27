/**
 * Shared CSV parsing helpers for the member and visitor importers. Plain
 * module (no "use server") - a "use server" file may only export async
 * functions, so these can't live alongside the actions that use them.
 */

/**
 * Column aliases - maps common CSV header names to our Person field names.
 * All keys are lowercased, trimmed, and stripped of spaces/underscores/hyphens.
 */
export const COLUMN_MAP: Record<string, string> = {
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

export function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]/g, "").replace(/\s+/g, " ");
}

export function parseCSVLine(line: string): string[] {
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
